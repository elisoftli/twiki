import type {
  ToolStatus,
  ToolLifecycleStatus,
  ToolApprovalResult,
  ToolStatusSnapshot,
} from '../../interfaces/tool-status.interface';
import type { DownloadProgressInfo, DownloadOperation } from '../../interfaces/tool-display.interface';
import { formatToolCall, formatToolCallStructured } from '../../utils/format-tool-call.utils';
import { SettingsService } from '../core/settings.service';
import { MainWindow } from '../../windows';
import { createLogger } from '../../utils/logger.utils';

const logger = createLogger('ToolStatusService');

/**
 * Tools that can be auto-approved when the setting is enabled.
 * These are read-only file operations that don't modify the system.
 */
const READ_ONLY_TOOLS = new Set([
  'read-file-tool',
  'read-file-around-pattern-tool',
  'list-directory-contents-tool',
]);

interface PendingApproval {
  resolve: (result: ToolApprovalResult) => void;
  reject: (error: Error) => void;
}

/**
 * Cleanup callback for aborting a running tool
 */
type ToolCleanupCallback = () => Promise<void> | void;

/**
 * Centralized service for tracking tool approval and execution status.
 * Single source of truth for all tool states during a tweak operation.
 */
export class ToolStatusService {
  /** All tools for the current session, keyed by toolId */
  private static toolStates: Map<string, ToolStatus> = new Map();

  /** Pending approval promises, keyed by toolId */
  private static pendingApprovals: Map<string, PendingApproval> = new Map();

  /** Cleanup callbacks for running tools, keyed by toolId */
  private static cleanupCallbacks: Map<string, ToolCleanupCallback> = new Map();

  /** Counter for generating unique tool IDs */
  private static toolCounter = 0;

  /** Flag indicating if session is being aborted */
  private static isAborting = false;

  /**
   * Reset all state - call when starting a new tweak operation
   */
  public static reset(): void {
    // Reject any pending approvals
    for (const [, pending] of this.pendingApprovals) {
      pending.reject(new Error('Session reset - tool approval cancelled'));
    }
    this.pendingApprovals.clear();
    this.cleanupCallbacks.clear();
    this.toolStates.clear();
    this.toolCounter = 0;
    this.isAborting = false;
  }

  /**
   * Generate a unique tool ID
   */
  private static generateToolId(): string {
    this.toolCounter++;
    return `tool-${Date.now()}-${this.toolCounter}`;
  }

  /**
   * Register a tool and wait for user approval.
   * Called by tools at the start of their execute() function.
   *
   * If auto-approve is enabled for read-only tools and the tool is read-only,
   * it will be approved immediately without waiting for user input.
   *
   * @returns Promise that resolves when user approves/declines (or immediately if auto-approved)
   */
  public static async registerToolForApproval(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolApprovalResult> {
    const toolId = this.generateToolId();
    const formattedDescription = formatToolCall(toolName, args);
    const displayInfo = formatToolCallStructured(toolName, args);
    const now = new Date().toISOString();

    // Check if this tool can be auto-approved
    const settings = SettingsService.settings;
    const shouldAutoApprove = settings.autoTweaker?.autoApproveReadOnly && READ_ONLY_TOOLS.has(toolName);

    if (shouldAutoApprove) {
      // Create tool status entry with auto-approved status
      const toolStatus: ToolStatus = {
        toolId,
        toolName,
        args,
        formattedDescription,
        displayInfo,
        status: 'approved',
        registeredAt: now,
        updatedAt: now,
      };
      this.toolStates.set(toolId, toolStatus);
      this.sendSnapshotToRenderer();

      // Return immediately as approved
      return { approved: true, toolId };
    }

    // Create tool status entry requiring manual approval
    const toolStatus: ToolStatus = {
      toolId,
      toolName,
      args,
      formattedDescription,
      displayInfo,
      status: 'pending-approval',
      registeredAt: now,
      updatedAt: now,
    };
    this.toolStates.set(toolId, toolStatus);
    this.sendSnapshotToRenderer();

    // Return a promise that waits for user approval
    return new Promise((resolve, reject) => {
      this.pendingApprovals.set(toolId, { resolve, reject });
    });
  }

  /**
   * Approve or decline a tool.
   * Called by IPC handler when user clicks approve/decline.
   * @param modifiedArgs - Optional modified args from user edits (e.g., edited content)
   */
  public static approveOrDeclineTool(
    toolId: string,
    approved: boolean,
    modifiedArgs?: Record<string, unknown>
  ): boolean {
    const pending = this.pendingApprovals.get(toolId);
    const toolStatus = this.toolStates.get(toolId);

    if (!pending || !toolStatus) {
      logger.warn(`No pending approval for toolId: ${toolId}`);
      return false;
    }

    // Update status
    const newStatus: ToolLifecycleStatus = approved ? 'approved' : 'declined';
    this.updateStatus(toolId, newStatus);

    // If modified args provided, update the tool's args and displayInfo
    if (modifiedArgs && approved) {
      toolStatus.initialArgs = { ...toolStatus.args };
      toolStatus.args = modifiedArgs;
      // Regenerate displayInfo with updated args
      toolStatus.displayInfo = formatToolCallStructured(toolStatus.toolName, modifiedArgs);
    }

    // Resolve the pending promise with optional modified args
    pending.resolve({ approved, toolId, modifiedArgs });
    this.pendingApprovals.delete(toolId);

    return true;
  }

  /**
   * Mark a tool as currently executing.
   * Called by tools after approval, before starting execution.
   */
  public static markExecuting(toolId: string): void {
    this.updateStatus(toolId, 'executing');
  }

  /**
   * Update tool status with execution result.
   * Called by tools after execution completes.
   */
  public static updateToolResult(toolId: string, result?: unknown, error?: string): void {
    const toolStatus = this.toolStates.get(toolId);
    if (!toolStatus) {
      logger.warn(`Unknown toolId: ${toolId}`);
      return;
    }

    const newStatus: ToolLifecycleStatus = error ? 'error' : 'completed';
    toolStatus.status = newStatus;
    toolStatus.result = result;
    toolStatus.error = error;
    toolStatus.updatedAt = new Date().toISOString();
    this.sendSnapshotToRenderer();
  }

  /**
   * Get a snapshot of all tool statuses for frontend polling.
   */
  public static getSnapshot(): ToolStatusSnapshot {
    const tools = Array.from(this.toolStates.values());

    // Find first pending tool (FIFO order by registeredAt)
    const pendingTools = tools
      .filter((t) => t.status === 'pending-approval')
      .sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));

    return {
      tools,
      hasAwaitingApproval: pendingTools.length > 0,
      firstPendingToolId: pendingTools[0]?.toolId ?? null,
    };
  }

  /**
   * Check if any modification (non-read-only) tools have completed successfully.
   * Used to determine if the agent actually made changes.
   */
  public static hasCompletedModificationTools(): boolean {
    for (const tool of this.toolStates.values()) {
      if (tool.status === 'completed' && !READ_ONLY_TOOLS.has(tool.toolName)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Update a tool's status
   */
  private static updateStatus(toolId: string, status: ToolLifecycleStatus): void {
    const toolStatus = this.toolStates.get(toolId);
    if (toolStatus) {
      toolStatus.status = status;
      toolStatus.updatedAt = new Date().toISOString();
      this.sendSnapshotToRenderer();
    }
  }

  /**
   * Send the current tool status snapshot to the renderer via IPC.
   * This enables push-based updates instead of polling.
   */
  private static sendSnapshotToRenderer(): void {
    try {
      const mainWindow = MainWindow.getWindow();
      mainWindow.webContents.send('agent:tool-status-update', this.getSnapshot());
    } catch {
      // Window may not be initialized yet during startup
    }
  }

  /**
   * Update download progress for a tool.
   * Called by the download tool during file download.
   */
  public static updateDownloadProgress(toolId: string, progress: DownloadProgressInfo): void {
    const toolStatus = this.toolStates.get(toolId);
    if (!toolStatus || !toolStatus.displayInfo) {
      return;
    }

    // Find the download operation in the tool's operations
    const downloadOp = toolStatus.displayInfo.operations.find(
      (op): op is DownloadOperation => op.type === 'download'
    );

    if (downloadOp) {
      downloadOp.progress = progress;
      toolStatus.updatedAt = new Date().toISOString();
      this.sendSnapshotToRenderer();
    }
  }

  /**
   * Register a cleanup callback for a tool.
   * Called by tools that need cleanup when aborted (e.g., download tool).
   */
  public static registerCleanup(toolId: string, callback: ToolCleanupCallback): void {
    this.cleanupCallbacks.set(toolId, callback);
  }

  /**
   * Unregister a cleanup callback for a tool.
   * Called when tool completes normally.
   */
  public static unregisterCleanup(toolId: string): void {
    this.cleanupCallbacks.delete(toolId);
  }

  /**
   * Check if the session is currently being aborted.
   * Tools can check this to exit early.
   */
  public static isSessionAborting(): boolean {
    return this.isAborting;
  }

  /**
   * Abort all running tools and call their cleanup callbacks.
   * Called when the agent session is aborted.
   */
  public static async abortAllTools(): Promise<void> {
    logger.info('Aborting all running tools...');
    this.isAborting = true;

    // Reject any pending approvals
    for (const [toolId, pending] of this.pendingApprovals) {
      logger.debug(`Rejecting pending approval for ${toolId}`);
      pending.reject(new Error('Session aborted'));
    }
    this.pendingApprovals.clear();

    // Call all cleanup callbacks
    const cleanupPromises: Promise<void>[] = [];
    for (const [toolId, cleanup] of this.cleanupCallbacks) {
      logger.debug(`Running cleanup for ${toolId}`);
      try {
        const result = cleanup();
        if (result instanceof Promise) {
          cleanupPromises.push(
            result.catch((err) => {
              logger.error(`Cleanup error for ${toolId}:`, err);
            })
          );
        }
      } catch (err) {
        logger.error(`Cleanup error for ${toolId}:`, err);
      }
    }

    // Wait for all cleanups to complete
    await Promise.all(cleanupPromises);

    this.cleanupCallbacks.clear();

    // Mark all executing tools as aborted
    for (const [, toolStatus] of this.toolStates) {
      if (toolStatus.status === 'executing') {
        toolStatus.status = 'error';
        toolStatus.error = 'Aborted by user';
        toolStatus.updatedAt = new Date().toISOString();
      }
    }

    this.sendSnapshotToRenderer();
    logger.info('All tools aborted');
  }
}
