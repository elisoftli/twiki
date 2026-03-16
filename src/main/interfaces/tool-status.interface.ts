import type { ToolDisplayInfo } from './tool-display.interface';

/**
 * Status of a tool in the approval/execution lifecycle
 */
export type ToolLifecycleStatus =
  | 'pending-approval' // Tool registered, waiting for user approval
  | 'approved' // User approved, execution starting
  | 'executing' // Tool is currently executing
  | 'completed' // Tool finished successfully
  | 'declined' // User declined execution
  | 'error'; // Tool execution failed

/**
 * Complete state for a single tool invocation
 */
export interface ToolStatus {
  /** Unique identifier for this tool invocation */
  toolId: string;
  /** Name of the tool (e.g., 'list-directory-contents-tool') */
  toolName: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
  /** Initial unmodified arguments passed to the tool */
  initialArgs?: Record<string, unknown>;
  /** User-friendly description of what the tool does */
  formattedDescription: string;
  /** Structured display info for rich UI rendering */
  displayInfo?: ToolDisplayInfo;
  /** Current lifecycle status */
  status: ToolLifecycleStatus;
  /** Result returned by tool on success */
  result?: unknown;
  /** Error message if tool failed */
  error?: string;
  /** Timestamp when tool was registered */
  registeredAt: string;
  /** Timestamp when status last changed */
  updatedAt: string;
}

/**
 * Result returned when a tool registers for approval
 */
export interface ToolApprovalResult {
  /** Whether the user approved the tool */
  approved: boolean;
  /** The tool's unique ID for later status updates */
  toolId: string;
  /** Modified args from user edits (e.g., edited content in edit-file) */
  modifiedArgs?: Record<string, unknown>;
}

/**
 * Snapshot of all tool statuses for frontend polling
 */
export interface ToolStatusSnapshot {
  /** All tools for the current session */
  tools: ToolStatus[];
  /** Whether any tool is awaiting approval */
  hasAwaitingApproval: boolean;
  /** ID of the first tool awaiting approval (FIFO) */
  firstPendingToolId: string | null;
}
