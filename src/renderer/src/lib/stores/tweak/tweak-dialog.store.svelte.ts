/**
 * Tweak Dialog Store
 *
 * Unified store managing the tweak dialog lifecycle, tool approvals, and revert operations.
 * Uses Svelte 5 runes for reactive state management.
 */

import { toast } from 'svelte-sonner';
import { serviceStatusStore } from '../service-status.store.svelte';
import { settingsStore } from '../settings.store.svelte';
import { authStore } from '../auth';
import type { AgentStatus, AppliedTweak, PreRevertCheckResult } from '../../../../../main/interfaces/tweak-agent.interface';
import type { ToolStatusSnapshot } from '../../../../../main/interfaces/tool-status.interface';
import type { EditOperation } from '../../../../../main/tools/io/utils/types';
import { createLogger } from '$lib/utils/logger.utils';
import {
  type ConfigurationType,
  getMissingConfigurations,
} from '$lib/utils/preflight-checks.utils';
import type {
  StartTweakParams,
  OnCompleteCallback,
  OnRevertCallback,
} from './types';

const logger = createLogger('TweakDialogStore');

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_AGENT_STATUS: AgentStatus = {
  isRunning: false,
  response: null,
  error: null,
  threadId: null,
  executionMode: null,
  agentActivity: null,
  rateLimitInfo: null,
};

const DEFAULT_TOOL_SNAPSHOT: ToolStatusSnapshot = {
  tools: [],
  hasAwaitingApproval: false,
  firstPendingToolId: null,
};

// Fallback polling interval (push events are primary, polling is backup)
const FALLBACK_POLL_INTERVAL_MS = 5000;

// =============================================================================
// Store Implementation
// =============================================================================

function createTweakDialogStore() {
  // =========================================================================
  // Dialog State
  // =========================================================================
  let isOpen = $state(false);
  let isMinimized = $state(false);

  // =========================================================================
  // Tweak Context
  // =========================================================================
  let title = $state('');
  let gameName = $state('');
  let gameId = $state<string | null>(null);
  let hash = $state<string | null>(null);

  // =========================================================================
  // Agent Status (from IPC subscription)
  // =========================================================================
  let agentStatus = $state<AgentStatus>({ ...DEFAULT_AGENT_STATUS });

  // =========================================================================
  // Tool Status State (updated via push events, with fallback polling)
  // =========================================================================
  let toolSnapshot = $state<ToolStatusSnapshot>({ ...DEFAULT_TOOL_SNAPSHOT });
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  let unsubscribeToolStatus: (() => void) | null = null;

  // Tool modifications (keyed by toolId)
  let toolModifications = $state<Map<string, Record<string, unknown>>>(new Map());

  // =========================================================================
  // Revert State
  // =========================================================================
  // Stored applied tweak (fetched from storage after completion, used for revert)
  let storedAppliedTweak = $state<AppliedTweak | null>(null);

  // Revert confirmation state
  let revertConfirmation = $state<{
    isOpen: boolean;
    preCheck: PreRevertCheckResult | null;
  }>({
    isOpen: false,
    preCheck: null,
  });

  // =========================================================================
  // Configuration Required State (shown when user clicks Approve)
  // =========================================================================
  let configurationRequired = $state<{
    isOpen: boolean;
    toolId: string | null;
    toolName: string | null;
    configurationType: ConfigurationType | null;
  }>({
    isOpen: false,
    toolId: null,
    toolName: null,
    configurationType: null,
  });

  // =========================================================================
  // Callbacks
  // =========================================================================
  let onCompleteCallback: OnCompleteCallback | null = null;
  let onRevertCallback: OnRevertCallback | null = null;

  // =========================================================================
  // Tool Status Updates (Push events with fallback polling)
  // =========================================================================

  /**
   * Process a tool status snapshot, merging local modifications.
   */
  function processToolSnapshot(snapshot: ToolStatusSnapshot): void {
    // Merge local modifications back into data to preserve user edits.
    // Updates the editable.value field for operations that have editable content.
    for (const tool of snapshot.tools) {
      const modifications = toolModifications.get(tool.toolId);
      if (!modifications || !tool.displayInfo) continue;

      // Get the modified value for an operation based on tool type and index
      const getModifiedValue = (opIndex: number): string | undefined => {
        switch (tool.toolName) {
          case 'edit-file-tool': {
            const ops = modifications.operations as Array<EditOperation> | undefined;
            return ops?.[opIndex]?.newString;
          }
          case 'create-file-tool':
            return opIndex === 0 ? (modifications.content as string | undefined) : undefined;
          default:
            return undefined;
        }
      };

      // Update editable.value for each operation that has modifications
      for (let i = 0; i < tool.displayInfo.operations.length; i++) {
        const displayOp = tool.displayInfo.operations[i];
        const modifiedValue = getModifiedValue(i);
        if (modifiedValue !== undefined && 'editable' in displayOp && displayOp.editable) {
          displayOp.editable.value = modifiedValue;
        }
      }
    }

    toolSnapshot = snapshot;
  }

  /**
   * Handle push-based tool status updates from main process.
   */
  function handleToolStatusUpdate(snapshot: ToolStatusSnapshot): void {
    processToolSnapshot(snapshot);
  }

  /**
   * Fallback polling for tool statuses (used as backup to push events).
   */
  async function pollTools(): Promise<void> {
    try {
      const snapshot = await window.api.agent.getToolStatuses();
      processToolSnapshot(snapshot);
    } catch (err) {
      logger.error('Failed to poll tool statuses:', err);
    }
  }

  /**
   * Check if a tool has missing configuration requirements.
   * If so, show the pre-approval dialog and return true.
   * Called at approval time, not on every tool status snapshot.
   */
  function checkToolConfiguration(toolId: string, toolName: string): boolean {
    const currentSettings = settingsStore.value;
    const missingConfigs = getMissingConfigurations(toolName, currentSettings);

    if (missingConfigs.length > 0) {
      configurationRequired = {
        isOpen: true,
        toolId,
        toolName,
        configurationType: missingConfigs[0],
      };
      return true;
    }
    return false;
  }

  /**
   * Start listening for tool status updates.
   * Uses push events as primary mechanism, with fallback polling.
   */
  function startToolStatusUpdates(): void {
    if (unsubscribeToolStatus || pollingInterval) return;

    // Subscribe to push-based updates (primary)
    unsubscribeToolStatus = window.api.agent.onToolStatusUpdate(handleToolStatusUpdate);

    // Initial fetch
    pollTools();

    // Fallback polling at longer interval (backup for missed events)
    pollingInterval = setInterval(pollTools, FALLBACK_POLL_INTERVAL_MS);
  }

  /**
   * Stop listening for tool status updates.
   */
  function stopToolStatusUpdates(): void {
    if (unsubscribeToolStatus) {
      unsubscribeToolStatus();
      unsubscribeToolStatus = null;
    }
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  // =========================================================================
  // Agent Status Subscription
  // =========================================================================

  async function handleStatusUpdate(newStatus: AgentStatus): Promise<void> {
    const wasRunning = agentStatus.isRunning;
    agentStatus = newStatus;

    // When agent finishes, fetch the stored applied tweak and notify callback
    if (wasRunning && !newStatus.isRunning && gameId && hash) {
      // Only clear the pending tweak on successful completion.
      // If there's an error (including auth errors), keep the pending tweak
      // so it can be retried after re-authentication.
      if (!newStatus.error) {
        authStore.clearPendingTweak();
      }

      // Fetch the applied tweak that was saved by main process (if any)
      await fetchStoredAppliedTweak();

      if (onCompleteCallback) {
        onCompleteCallback({ gameId, hash });
      }
    }
  }

  /**
   * Fetch the stored applied tweak from storage (saved by main process).
   * This is the ground truth for what was actually executed, not the agent's response.
   */
  async function fetchStoredAppliedTweak(): Promise<void> {
    if (!gameId || !hash) {
      storedAppliedTweak = null;
      return;
    }

    try {
      const tweaks = await window.api.appliedTweaks.getByGame(gameId);
      storedAppliedTweak = tweaks.find((t) => t.tweak.hash === hash) ?? null;
    } catch (err) {
      logger.error('Failed to fetch stored applied tweak:', err);
      storedAppliedTweak = null;
    }
  }

  // =========================================================================
  // Lifecycle Actions
  // =========================================================================

  /**
   * Initialize the store - subscribe to agent status updates.
   * Should be called once in layout component.
   */
  async function init(): Promise<void> {
    // Get initial status
    agentStatus = await window.api.agent.getStatus();

    // Subscribe to status updates
    window.api.agent.onStatusUpdated(handleStatusUpdate);
  }

  /**
   * Cleanup IPC listeners. Call on layout destroy.
   */
  function cleanup(): void {
    stopToolStatusUpdates();
    window.api.agent.removeAllListeners();
  }

  // =========================================================================
  // Tweak Execution Actions
  // =========================================================================

  /**
   * Check if authentication is required for Auto Tweak.
   * Returns false if user has API key (bypass) or is authenticated.
   */
  function requiresAuth(): boolean {
    const currentSettings = settingsStore.value;
    // API key bypass: no auth needed if user has their own API key
    if (currentSettings?.autoTweaker?.claudeApiKey) {
      return false;
    }
    // Check if user is authenticated
    return !authStore.isAuthenticated;
  }

  /**
   * Start a new tweak process.
   * Aborts any existing running tweak first.
   * If auth is required, opens auth dialog and stores pending tweak.
   */
  async function startTweak(params: StartTweakParams): Promise<void> {
    // Guard: prevent starting tweak if agent is unavailable
    if (serviceStatusStore.isAgentUnavailable) {
      toast.error('Auto-tweak is currently unavailable');
      return;
    }

    // Check if authentication is required
    if (requiresAuth()) {
      logger.info('Auth required, opening dialog');
      authStore.setPendingTweak(params);
      authStore.openDialog('signin');
      return;
    }

    // Abort any existing tweak
    if (agentStatus.isRunning) {
      window.api.agent.abortTask();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Reset state
    toolSnapshot = { ...DEFAULT_TOOL_SNAPSHOT };
    toolModifications = new Map();
    storedAppliedTweak = null;
    isMinimized = false;

    // Set context
    title = params.groupTitle;
    gameName = params.game.name;
    gameId = params.game.id;
    hash = params.tweak.hash;

    // Open dialog
    isOpen = true;

    // Start listening for tool status updates
    startToolStatusUpdates();

    // Store params in authStore for potential auth error recovery
    // If the server rejects due to expired/invalid token, the auth dialog
    // will open and executePendingTweak() will use these params to retry
    authStore.setPendingTweak(params);

    // Start the tweak process
    await window.api.agent.processTweak({
      game: $state.snapshot(params.game),
      groupTitle: params.groupTitle,
      tweak: $state.snapshot(params.tweak),
      configPaths: $state.snapshot(params.configPaths),
      gameInfo: params.gameInfo ? $state.snapshot(params.gameInfo) : undefined,
    });
  }

  // =========================================================================
  // Dialog State Actions
  // =========================================================================

  /**
   * Minimize the dialog without aborting the agent.
   * The tweak continues running in the background.
   */
  function minimize(): void {
    if (!isOpen) return;
    isOpen = false;
    isMinimized = true;
  }

  /**
   * Restore the dialog from minimized state.
   */
  function restore(): void {
    if (!isMinimized) return;
    isMinimized = false;
    isOpen = true;
  }

  /**
   * Close the dialog and abort if running.
   */
  function close(): void {
    if (agentStatus.isRunning) {
      window.api.agent.abortTask();
    }
    // Clear pending tweak since user is explicitly closing/aborting
    authStore.clearPendingTweak();
    stopToolStatusUpdates();
    configurationRequired = { isOpen: false, toolId: null, toolName: null, configurationType: null };
    isOpen = false;
    isMinimized = false;
  }

  /**
   * Full reset - clears all state.
   */
  function reset(): void {
    close();
    window.api.agent.resetStatus();
    agentStatus = { ...DEFAULT_AGENT_STATUS };
    toolSnapshot = { ...DEFAULT_TOOL_SNAPSHOT };
    storedAppliedTweak = null;
    title = '';
    gameName = '';
    gameId = null;
    hash = null;
  }

  // =========================================================================
  // Tool Approval Actions
  // =========================================================================

  /**
   * Get current modifications for a specific tool.
   * Returns undefined if no modifications exist for this tool.
   */
  function getToolModifications(toolId: string): Record<string, unknown> | undefined {
    return toolModifications.get(toolId);
  }

  /**
   * Update modifications for a specific tool.
   * Called by UI when user edits tool parameters (e.g., content in edit-file).
   */
  function updateToolModifications(toolId: string, modifications: Record<string, unknown>): void {
    const newMap = new Map(toolModifications);
    newMap.set(toolId, modifications);
    toolModifications = newMap;
  }

  /**
   * Execute the actual approval IPC for a given tool ID.
   */
  async function executeApproval(toolId: string): Promise<void> {
    const modifications = toolModifications.get(toolId);
    await window.api.agent.approveTool(toolId, modifications);
    // Clear modifications for this tool after approval
    const newMap = new Map(toolModifications);
    newMap.delete(toolId);
    toolModifications = newMap;
    await pollTools();
  }

  /**
   * Approve the first pending tool call.
   * Checks for missing configuration requirements before executing the approval.
   */
  async function approve(): Promise<void> {
    if (!toolSnapshot.firstPendingToolId) return;
    const toolId = toolSnapshot.firstPendingToolId;
    const pendingTool = toolSnapshot.tools.find((t) => t.toolId === toolId);
    if (!pendingTool) return;

    // Check if tool has unsatisfied configuration requirements
    if (checkToolConfiguration(toolId, pendingTool.toolName)) {
      return;
    }

    await executeApproval(toolId);
  }

  /**
   * Decline the first pending tool call.
   */
  async function decline(): Promise<void> {
    if (!toolSnapshot.firstPendingToolId) return;
    await window.api.agent.declineTool(toolSnapshot.firstPendingToolId);
    await pollTools();
  }

  // =========================================================================
  // Configuration Actions
  // =========================================================================

  /**
   * Handle pre-approval dialog completion.
   * Re-checks for remaining requirements and proceeds with approval when all are satisfied.
   */
  async function handleConfigurationComplete(): Promise<void> {
    const toolId = configurationRequired.toolId;
    const toolName = configurationRequired.toolName;
    configurationRequired = {
      isOpen: false,
      toolId: null,
      toolName: null,
      configurationType: null,
    };

    if (!toolId || !toolName) return;

    // Re-check for remaining requirements
    if (checkToolConfiguration(toolId, toolName)) {
      return;
    }

    // All requirements satisfied — execute the approval
    await executeApproval(toolId);
  }

  /**
   * Cancel the configuration dialog.
   * Returns to the tool approval UI without declining the tool.
   */
  function cancelConfiguration(): void {
    configurationRequired = {
      isOpen: false,
      toolId: null,
      toolName: null,
      configurationType: null,
    };
  }

  // =========================================================================
  // Revert Actions
  // =========================================================================

  /**
   * Initiate revert of the last completed tweak.
   * Performs pre-check and either executes immediately or shows confirmation dialog.
   */
  async function revert(): Promise<{ success: boolean; message?: string }> {
    if (!storedAppliedTweak || !gameId || !hash) {
      return { success: false, message: 'No completed tweak to revert' };
    }

    try {
      // Step 1: Pre-check for conflicts
      const preCheck = await window.api.revert.preCheck($state.snapshot(storedAppliedTweak));

      if (preCheck.canProceed && preCheck.fileConflicts.length === 0) {
        // Clean revert - execute immediately
        return await executeRevert(false);
      }

      // Show confirmation dialog for conflicts or blocked state
      revertConfirmation = { isOpen: true, preCheck };
      return { success: false, message: 'Confirmation required' };
    } catch (err) {
      logger.error('Failed to check revert status:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to revert tweak';
      toast.error('Failed to revert tweak');
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Execute the revert after user confirmation.
   * @param useFallback If true, uses backup restore instead of surgical revert
   */
  async function executeRevert(useFallback: boolean): Promise<{ success: boolean; message?: string }> {
    if (!storedAppliedTweak || !gameId || !hash) {
      return { success: false, message: 'No completed tweak to revert' };
    }

    // Capture values before any state changes
    const revertGameId = gameId;
    const revertTweakId = hash;

    try {
      const result = await window.api.revert.executeWithFallback(
        $state.snapshot(storedAppliedTweak),
        useFallback
      );

      if (result.status === 'success' || result.status === 'partial') {
        // Remove from applied tweaks storage using hash
        await window.api.appliedTweaks.remove(revertTweakId);

        // Notify callback so game page can update its local state
        onRevertCallback?.({
          gameId: revertGameId,
          hash: revertTweakId,
        });

        if (useFallback) {
          toast.success('Reverted using backup');
        } else {
          toast.success('Reverted successfully');
        }

        return { success: true, message: result.message };
      }

      toast.error('Failed to revert tweak');
      return { success: false, message: result.message };
    } catch (err) {
      logger.error('Failed to revert tweak:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to revert tweak';
      toast.error('Failed to revert tweak');
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Confirm the revert action from the dialog.
   * @param useFallback If true, uses backup restore instead of surgical revert
   */
  async function confirmRevertAction(useFallback: boolean): Promise<void> {
    revertConfirmation = { isOpen: false, preCheck: null };
    await executeRevert(useFallback);
  }

  /**
   * Cancel the revert action from the dialog.
   */
  function cancelRevertAction(): void {
    revertConfirmation = { isOpen: false, preCheck: null };
  }

  // =========================================================================
  // Callback Setters
  // =========================================================================

  /**
   * Set callback for when a tweak completes successfully.
   */
  function setOnComplete(callback: OnCompleteCallback | null): void {
    onCompleteCallback = callback;
  }

  /**
   * Set callback for when a tweak is reverted.
   */
  function setOnRevert(callback: OnRevertCallback | null): void {
    onRevertCallback = callback;
  }

  // =========================================================================
  // Derived State
  // =========================================================================

  const isRunning = $derived(agentStatus.isRunning);
  const hasCompleted = $derived(
    !agentStatus.isRunning &&
    agentStatus.response !== null &&
    agentStatus.response.status === 'success'
  );
  const hasError = $derived(
    !agentStatus.isRunning &&
    (agentStatus.error !== null ||
      (agentStatus.response !== null && agentStatus.response.status === 'error'))
  );
  const hasWarning = $derived(
    !agentStatus.isRunning &&
    agentStatus.response !== null &&
    agentStatus.response.status === 'warning'
  );

  // Whether revert is available (based on actual stored tweak, not agent's response)
  const canRevert = $derived(
    !agentStatus.isRunning &&
    storedAppliedTweak !== null &&
    storedAppliedTweak.summary.toolCalls.length > 0
  );

  // The card should show when minimized AND there's something to show
  const showSidebarCard = $derived(
    isMinimized && (isRunning || hasCompleted || hasError || hasWarning)
  );

  // Card status for icon selection
  const cardStatus = $derived.by((): 'running' | 'success' | 'warning' | 'error' => {
    if (isRunning) return 'running';
    if (hasError) return 'error';
    if (hasWarning) return 'warning';
    return 'success';
  });

  // =========================================================================
  // Public API
  // =========================================================================

  return {
    // Dialog state
    get isOpen() { return isOpen; },
    set isOpen(value: boolean) { isOpen = value; },
    get isMinimized() { return isMinimized; },

    // Context
    get title() { return title; },
    get gameName() { return gameName; },
    get gameId() { return gameId; },
    get hash() { return hash; },

    // Agent status
    get agentStatus() { return agentStatus; },
    get isRunning() { return isRunning; },
    get hasCompleted() { return hasCompleted; },
    get hasError() { return hasError; },
    get hasWarning() { return hasWarning; },
    get canRevert() { return canRevert; },

    // Revert confirmation
    get revertConfirmation() { return revertConfirmation; },
    get storedAppliedTweak() { return storedAppliedTweak; },

    // Pre-approval configuration checks
    get configurationRequired() { return configurationRequired; },

    // Tool polling
    get tools() { return toolSnapshot.tools; },
    get firstPendingToolId() { return toolSnapshot.firstPendingToolId; },
    get hasAwaitingApproval() { return toolSnapshot.hasAwaitingApproval; },

    // Sidebar card
    get showSidebarCard() { return showSidebarCard; },
    get cardStatus() { return cardStatus; },

    // Actions
    init,
    cleanup,
    startTweak,
    minimize,
    restore,
    close,
    reset,
    approve,
    decline,
    revert,
    confirmRevertAction,
    cancelRevertAction,
    handleConfigurationComplete,
    cancelConfiguration,
    setOnComplete,
    setOnRevert,
    getToolModifications,
    updateToolModifications,
  };
}

// Singleton instance
export const tweakDialogStore = createTweakDialogStore();
