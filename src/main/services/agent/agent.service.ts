/**
 * Agent Service - WebSocket-based implementation
 *
 * Communicates with the remote server via WebSocket for agent interactions.
 * Tools execute locally on the client.
 */

import os from 'node:os';
import { app } from 'electron';
import WebSocket from 'ws';
import type {
  AgentStatus,
  AgentResult,
  ProcessTweakRequest,
  TweakSummary,
} from '../../interfaces';
import type {
  TweakRecipe,
  Tweak,
  UserMessage,
  ToolResultMessage,
  AbortMessage,
  ServerMessage,
  TweakRequestParams,
  SystemSpecs as SharedSystemSpecs,
} from '@twiki/shared';
import { convertAllToolsToAnthropic, CURRENT_CONTRACT_VERSION } from '@twiki/shared';
import {
  SettingsService,
  ToolStatusService,
  ToolExecutorService,
  SystemSpecsService,
  AppliedTweaksService,
  RevertService,
  RecipeService,
  EnvService,
  AuthService,
} from '..';
import { MainWindow } from '../../windows';
import { buildAppliedTweak } from '../../utils/build-applied-tweak.utils';
import { normalizePathForComparison } from '../../utils/path-template.utils';
import { toolRegistry } from '../../tools';
import { detectArchitecture } from '../../tools/graphics-mods/utils/pe-utils';
import { createLogger } from '../../utils/logger.utils';

const logger = createLogger('AgentService');

// ============================================================================
// Types
// ============================================================================

type ExecutionMode = 'recipe' | 'agent';

/** Context for current tweak being processed */
interface TweakContext {
  launcherGameId: string;
  pcgwPageId: number;
  tweak: Tweak;
}

interface AgentServiceDeps {
  toolStatusService: typeof ToolStatusService;
  toolExecutorService: typeof ToolExecutorService;
  settingsService: typeof SettingsService;
  systemSpecsService: typeof SystemSpecsService;
  appliedTweaksService: typeof AppliedTweaksService;
  revertService: typeof RevertService;
  recipeService: typeof RecipeService;
  envService: typeof EnvService;
  authService: typeof AuthService;
}

function getDefaultDeps(): AgentServiceDeps {
  return {
    toolStatusService: ToolStatusService,
    toolExecutorService: ToolExecutorService,
    settingsService: SettingsService,
    systemSpecsService: SystemSpecsService,
    appliedTweaksService: AppliedTweaksService,
    revertService: RevertService,
    recipeService: RecipeService,
    envService: EnvService,
    authService: AuthService,
  };
}

// ============================================================================
// Agent Service
// ============================================================================

export class AgentService {
  private readonly deps: AgentServiceDeps;
  private ws: WebSocket | null = null;
  private currentTweakContext: TweakContext | null = null;
  private sessionResolve: ((value: AgentResult) => void) | null = null;
  private sessionReject: ((reason: unknown) => void) | null = null;
  private isAborting = false;

  private _status: AgentStatus = this.createIdleStatus();

  constructor(deps: Partial<AgentServiceDeps> = {}) {
    this.deps = { ...getDefaultDeps(), ...deps };
  }

  public get status(): AgentStatus {
    return { ...this._status };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Process a tweak request with the agent.
   * First checks for an approved recipe - if found, executes it directly.
   * Otherwise, uses the full agent via WebSocket.
   *
   * Always calls /recipes/lookup for metrics and replay count tracking,
   * even if metadata was prefetched for UI display.
   */
  public async processTweak(request: ProcessTweakRequest): Promise<AgentResult> {
    if (this._status.isRunning) {
      return { success: false, error: 'A task is already running' };
    }

    if (!request.game.pcgwPageId) {
      return { success: false, error: 'Cannot process tweak - game has no PCGW page linked' };
    }

    // Mark as running immediately and notify renderer before async lookup
    this._status.isRunning = true;
    this.sendStatusToRenderer();

    this.isAborting = false;
    this.currentTweakContext = {
      launcherGameId: request.game.launcherId,
      pcgwPageId: request.game.pcgwPageId,
      tweak: request.tweak,
    };

    // Always call lookup for metrics and replay count tracking
    const recipe = await this.deps.recipeService.lookupRecipe(
      request.tweak.hash,
      request.game.pcgwPageId,
      request.game.launcher
    );

    if (recipe) {
      logger.info('Executing approved recipe');
      return this.executeRecipe(recipe, request);
    }

    logger.info('No recipe found, using agent');
    return this.executeWithAgent(request);
  }

  /**
   * Abort the currently running task.
   */
  public async abortTask(): Promise<void> {
    this.isAborting = true;
    this.closeWebSocket(true);

    await this.deps.toolStatusService.abortAllTools();
    await this.revertPartialChanges();

    this.setError('Task was aborted by user');
    this.resolveSession({ success: false, error: 'Task was aborted by user' });
  }

  /**
   * Reset the current status.
   */
  public resetStatus(): void {
    this._status = this.createIdleStatus();
    this.deps.toolStatusService.reset();
    this.sendStatusToRenderer();
  }

  // ==========================================================================
  // Execution Methods
  // ==========================================================================

  private async executeRecipe(recipe: TweakRecipe, request: ProcessTweakRequest): Promise<AgentResult> {
    this.deps.toolStatusService.reset();
    this.setRunning(`recipe_${recipe.id}`, 'recipe');

    try {
      const result = await this.deps.recipeService.executeRecipe(recipe, request);

      if (result.success) {
        await this.saveAppliedTweak();
        this.setCompleted();
        return { success: true };
      }

      return this.handleRecipeFailure(result.error, request);
    } catch (error) {
      return this.handleRecipeFailure(this.extractErrorMessage(error), request);
    }
  }

  private async executeWithAgent(request: ProcessTweakRequest): Promise<AgentResult> {
    this.deps.toolStatusService.reset();
    this.setRunning(`agent_${Date.now()}`, 'agent');

    try {
      const result = await this.runWebSocketSession(request);
      return this.handleAgentResult(result);
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      this.setError(errorMessage);
      logger.error('Agent execution failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  private async handleRecipeFailure(
    errorMessage: string | undefined,
    request: ProcessTweakRequest
  ): Promise<AgentResult> {
    const wasDeclined = errorMessage?.includes('declined');

    if (wasDeclined || this.isAborting) {
      const error = errorMessage || (this.isAborting ? 'Task was aborted by user' : 'Recipe execution declined');
      this.setError(error);
      return { success: false, error };
    }

    logger.warn(`Recipe execution failed: ${errorMessage}, falling back to agent`);
    await this.revertPartialChanges();
    return this.executeWithAgent(request);
  }

  private async handleAgentResult(result: AgentResult): Promise<AgentResult> {
    const response = this._status.response;

    // If WebSocket session failed without receiving agent response (connection error, unexpected close)
    if (!result.success && !response) {
      this.setError(result.error || 'Agent session failed');
      return result;
    }

    // Handle error status - revert and return failure
    if (response?.status === 'error') {
      logger.warn('Agent returned error, reverting changes');
      await this.revertPartialChanges();
      this.setCompleted();
      return { success: false, error: response.message };
    }

    // Success - save applied tweak (server handles recipe storage)
    await this.saveAppliedTweak();
    this.setCompleted();
    return { success: true };
  }

  // ==========================================================================
  // WebSocket Methods
  // ==========================================================================

  private async runWebSocketSession(request: ProcessTweakRequest): Promise<AgentResult> {
    // Get user API key (if configured, bypasses auth)
    const userApiKey = this.deps.settingsService.settings.autoTweaker?.claudeApiKey;

    // Build WebSocket URL with auth token (if not using API key bypass)
    let serverUrl = this.deps.envService.get('AGENT_WEBSOCKET_URL');

    if (!userApiKey) {
      // Get valid access token (refreshes if needed)
      const accessToken = await this.deps.authService.getValidAccessToken();
      if (accessToken) {
        // Append token as query parameter
        const url = new URL(serverUrl);
        url.searchParams.set('token', accessToken);
        serverUrl = url.toString();
      }
    }

    return new Promise((resolve, reject) => {
      this.sessionResolve = resolve;
      this.sessionReject = reject;

      try {
        logger.info('Connecting to agent server...');
        this.ws = new WebSocket(serverUrl);

        this.ws.on('open', () => this.handleWebSocketOpen(request));
        this.ws.on('message', (data) => this.handleWebSocketMessage(data));
        this.ws.on('close', () => this.handleWebSocketClose());
        this.ws.on('error', (error) => this.handleWebSocketError(error));
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleWebSocketOpen(request: ProcessTweakRequest): void {
    logger.info('Connected to agent server');

    const anthropicTools = convertAllToolsToAnthropic(toolRegistry);

    // Build TweakRequestParams with filtered system specs and client env vars
    const params = this.buildTweakRequestParams(request);

    // Get user-provided API key and model from settings (if configured)
    const userApiKey = this.deps.settingsService.settings.autoTweaker?.claudeApiKey;
    const userModel = this.getUserModelId();

    const message: UserMessage = {
      type: 'user_message',
      params,
      tools: anthropicTools,
      clientVersion: app.getVersion(),
      contractVersion: CURRENT_CONTRACT_VERSION,
      ...(userApiKey && { userApiKey }),
      ...(userApiKey && userModel && { userModel }),
    };

    logger.debug(`Sending tweak request for game: ${params.game.name}`);
    logger.debug(`Sending ${anthropicTools.length} tool definitions to server`);
    if (userApiKey) {
      logger.debug('Using user-provided API key');
      if (userModel) {
        logger.debug(`Using user-selected model: ${userModel}`);
      }
    }
    this.ws?.send(JSON.stringify(message));
  }

  /**
   * Build TweakRequestParams from ProcessTweakRequest with filtered system specs.
   */
  private buildTweakRequestParams(request: ProcessTweakRequest): TweakRequestParams {
    const { game, groupTitle, tweak, configPaths, gameInfo } = request;

    // Map launchConfigs with architecture detection (PE header is authoritative, Steam metadata as fallback)
    const launchConfigs = game.launchConfigs
      ?.filter((c) => c.executable)
      .map((c) => ({
        type: c.type,
        executable: c.executable,
        osarch: this.detectExecutableArchitecture(c.executable) ?? c.osarch,
      }));

    // Filter out disabled config paths
    const filteredConfigPaths = this.filterDisabledConfigPaths(configPaths || [], game.disabledConfigPaths);

    return {
      game: {
        name: game.name,
        installPath: game.installPath,
        launcherId: game.launcher,
        launcherGameId: game.launcherId,
        launcherInstallPath: game.launcherInstallPath,
        launchConfigs,
        pcgwPageId: game.pcgwPageId,
      },
      groupTitle,
      tweak: {
        title: tweak.title,
        body: tweak.body ?? undefined,
        notes: tweak.notes,
      },
      configPaths: filteredConfigPaths,
      systemSpecs: this.buildFilteredSystemSpecs(),
      clientEnvVars: {
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        APPDATA: process.env.APPDATA,
        PROGRAMDATA: process.env.PROGRAMDATA,
        PUBLIC: process.env.PUBLIC,
        USERPROFILE: process.env.USERPROFILE,
      },
      clientUsername: os.userInfo().username,
      gameInfo,
    };
  }

  /**
   * Filter out disabled config paths from the list.
   * Uses case-insensitive matching for Windows path compatibility.
   */
  private filterDisabledConfigPaths<T extends { path: string }>(
    configPaths: T[],
    disabledPaths?: string[]
  ): T[] {
    if (!disabledPaths || disabledPaths.length === 0) {
      return configPaths;
    }

    const normalizedDisabled = new Set(
      disabledPaths.map((p) => normalizePathForComparison(p))
    );

    return configPaths.filter(
      (cp) => !normalizedDisabled.has(normalizePathForComparison(cp.path))
    );
  }

  /**
   * Build filtered system specs based on visibility settings.
   * Returns only the specs the user has opted to share.
   */
  private buildFilteredSystemSpecs(): SharedSystemSpecs | undefined {
    const specs = this.deps.systemSpecsService.specs;
    if (!specs) return undefined;

    const visibility = this.deps.settingsService.settings.specsVisibility;
    const vis = visibility ?? { showOs: true, showCpu: true, showGpu: true, showDisplay: true };

    const filtered: SharedSystemSpecs = {};

    if (vis.showOs && specs.os) {
      filtered.os = { distro: specs.os.distro, arch: specs.os.arch };
    }

    if (vis.showCpu && specs.cpu) {
      filtered.cpu = { brand: specs.cpu.brand };
    }

    if (vis.showGpu && specs.gpu?.length > 0) {
      filtered.gpu = specs.gpu.map((g) => g.model);
    }

    if (vis.showDisplay && specs.display?.displays?.length) {
      const primaryDisplay = specs.display.displays.find((d) => d.main) ?? specs.display.displays[0];
      if (primaryDisplay && primaryDisplay.resolutionX && primaryDisplay.resolutionY) {
        filtered.display = {
          resolution: `${primaryDisplay.resolutionX}x${primaryDisplay.resolutionY}`,
          refreshRate: primaryDisplay.currentRefreshRate ?? undefined,
        };
      }
    }

    // Return undefined if no specs were included
    return Object.keys(filtered).length > 0 ? filtered : undefined;
  }

  private async handleWebSocketMessage(data: WebSocket.RawData): Promise<void> {
    try {
      const message: ServerMessage = JSON.parse(data.toString());
      await this.processServerMessage(message);
    } catch (error) {
      logger.error('Error handling server message:', error);
    }
  }

  private handleWebSocketClose(): void {
    logger.debug('WebSocket closed');
    if (this.sessionResolve) {
      this.resolveSession({ success: false, error: 'WebSocket connection closed unexpectedly' });
    }
  }

  private handleWebSocketError(error: Error): void {
    logger.error('WebSocket error:', error);
    if (this.sessionReject) {
      this.sessionReject(error);
      this.clearSessionCallbacks();
    }
  }

  private async processServerMessage(message: ServerMessage): Promise<void> {
    switch (message.type) {
      case 'tool_call':
        await this.handleToolCall(message.callId, message.name, message.args);
        break;

      case 'agent_done':
        this.handleAgentDone(message.response);
        break;

      case 'error':
        this.handleServerError(message.message);
        break;

      case 'agent_thinking':
        // Activity signal from streaming - used as boolean check in UI
        this._status.agentActivity = message.content;
        this.sendStatusToRenderer();
        break;

      case 'rate_limit':
        this.handleRateLimit(message.used, message.limit, message.retryAfterMinutes);
        break;

      case 'version_error':
        this.handleVersionError(message.message);
        break;

      case 'auth_error':
        this.handleAuthError((message as { type: 'auth_error'; message: string }).message);
        break;
    }
  }

  private async handleToolCall(callId: string, name: string, args: unknown): Promise<void> {
    logger.debug(`Tool call: ${name}`);

    const result = await this.deps.toolExecutorService.execute(name, args);

    // Find the executed args from the tool status (user may have modified them)
    const snapshot = this.deps.toolStatusService.getSnapshot();
    const completedTool = snapshot.tools
      .filter((t) => t.toolName === name && (t.status === 'completed' || t.status === 'error'))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    // Include executedArgs if args were modified by user
    const executedArgs = completedTool?.initialArgs ? completedTool.args : undefined;

    const resultMessage: ToolResultMessage = {
      type: 'tool_result',
      callId,
      result: result.result,
      isError: !result.success,
      ...(executedArgs && { executedArgs }),
    };

    this.ws?.send(JSON.stringify(resultMessage));
  }

  private handleAgentDone(response: { status: string; message: string }): void {
    logger.info(`Agent completed with status: ${response.status}`);

    this._status.response = { status: response.status, message: response.message } as TweakSummary;

    // Only send status to renderer if session hasn't already been resolved
    // (e.g., by handleServerError). If it has, handleAgentResult will send
    // the final status via setCompleted/setError with the correct isRunning state.
    if (this.sessionResolve) {
      this.sendStatusToRenderer();
    }

    this.closeWebSocket();
    const success = response.status !== 'error';
    this.resolveSession({ success, error: success ? undefined : response.message });
  }

  private handleServerError(errorMessage: string): void {
    logger.error(`Server error: ${errorMessage}`);

    this._status.error = errorMessage;
    this._status.response = { status: 'error', message: errorMessage } as TweakSummary;
    this.sendStatusToRenderer();

    this.closeWebSocket();
    this.resolveSession({ success: false, error: errorMessage });
  }

  private handleRateLimit(used: number, limit: number, retryAfterMinutes: number): void {
    logger.warn(`Rate limited: ${used}/${limit}, retry after ~${retryAfterMinutes} minutes`);

    this._status.isRunning = false;
    this._status.rateLimitInfo = { used, limit, retryAfterMinutes };
    this.sendStatusToRenderer();

    this.closeWebSocket();
    this.resolveSession({ success: false, error: 'Rate limit exceeded' });
  }

  private handleVersionError(errorMessage: string): void {
    logger.warn(`Contract version unsupported: ${errorMessage}`);

    this._status.isRunning = false;
    this._status.error = errorMessage;
    this._status.requiresUpdate = true;
    this.sendStatusToRenderer();

    this.closeWebSocket();
    this.resolveSession({ success: false, error: errorMessage, requiresUpdate: true });
  }

  private handleAuthError(errorMessage: string): void {
    logger.warn(`Auth error: ${errorMessage}`);

    this._status.isRunning = false;
    this._status.error = errorMessage;
    this.sendStatusToRenderer();

    // Emit auth error event to trigger auth dialog in renderer
    MainWindow.getWindow().webContents.send('auth:error');

    this.closeWebSocket();
    this.resolveSession({ success: false, error: errorMessage });
  }

  private closeWebSocket(sendAbort = false): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (sendAbort) {
        const abortMessage: AbortMessage = { type: 'abort' };
        this.ws.send(JSON.stringify(abortMessage));
      }
      this.ws.close();
    }
    this.ws = null;
  }

  private resolveSession(result: AgentResult): void {
    if (this.sessionResolve) {
      this.sessionResolve(result);
      this.clearSessionCallbacks();
    }
  }

  private clearSessionCallbacks(): void {
    this.sessionResolve = null;
    this.sessionReject = null;
  }

  // ==========================================================================
  // Status Management
  // ==========================================================================

  private createIdleStatus(): AgentStatus {
    return {
      isRunning: false,
      response: null,
      error: null,
      threadId: null,
      executionMode: null,
      agentActivity: null,
      rateLimitInfo: null,
    };
  }

  private setRunning(threadId: string, executionMode: ExecutionMode): void {
    this._status = {
      isRunning: true,
      response: null,
      error: null,
      threadId,
      executionMode,
      agentActivity: null,
      rateLimitInfo: null,
    };
    this.sendStatusToRenderer();
  }

  private setCompleted(): void {
    this._status.isRunning = false;
    this.sendStatusToRenderer();
  }

  private setError(error: string): void {
    this._status.isRunning = false;
    this._status.error = error;
    this.sendStatusToRenderer();
  }

  private sendStatusToRenderer(): void {
    MainWindow.getWindow().webContents.send('agent:status-updated', this.status);
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async saveAppliedTweak(): Promise<void> {
    await this.deps.appliedTweaksService.captureAndSave(
      this.currentTweakContext!.launcherGameId,
      this.currentTweakContext!.pcgwPageId,
      this.currentTweakContext!.tweak,
      this._status.response
    );
  }

  private async revertPartialChanges(): Promise<void> {
    const snapshot = this.deps.toolStatusService.getSnapshot();
    const completedTools = snapshot.tools.filter((t) => t.status === 'completed');

    if (completedTools.length === 0) {
      logger.debug('No completed tools to revert');
      return;
    }

    const appliedTweak = buildAppliedTweak('', 0, { title: '' } as Tweak, completedTools, null);
    if (!appliedTweak) {
      logger.debug('No revertible tools to undo');
      return;
    }

    logger.info(`Reverting ${appliedTweak.summary.toolCalls.length} tool(s)...`);

    try {
      const result = await this.deps.revertService.execute(appliedTweak.summary, true);
      logger.info(`Revert completed: ${result.status}`);
    } catch (error) {
      logger.error('Revert failed:', error);
    }
  }

  /**
   * Detect executable architecture by reading PE header.
   * Returns '32' or '64', or undefined if detection fails.
   */
  private detectExecutableArchitecture(exePath: string): string | undefined {
    try {
      return detectArchitecture(exePath);
    } catch {
      logger.debug(`Could not detect architecture for: ${exePath}`);
      return undefined;
    }
  }

  private extractErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Get the user's selected model setting.
   * Returns undefined if no model is selected (let Twiki decide).
   * Server handles mapping to full model IDs.
   */
  private getUserModelId(): string | undefined {
    return this.deps.settingsService.settings.autoTweaker?.claudeModel;
  }
}
