/**
 * Agent-related types for the Tweak Agent system.
 * Extracted from tweak-agent.interface.ts and agent-availability.interface.ts
 */

import type { AgentResponseSchemaType } from '../../main/schemas/tweak-summary.schema';
import type { Game } from './game.types';
import type { Tweak, PCGWConfigPath, PCGWGameInfo, StatusEntry } from '@twiki/shared';
import type { TweakSummary, TweakOperationStatus, ToolName } from './tool.types';

/**
 * Request payload for processing a tweak via the agent
 */
export interface ProcessTweakRequest {
  /** Game context (id, name, installPath, launcherGameId) */
  game: Game;
  /** The tweak group title (e.g., "Skip intro videos") */
  groupTitle: string;
  /** The actual tweak with instructions */
  tweak: Tweak;
  /** Windows configuration file paths (e.g., ["%APPDATA%\\GameName\\config.ini"]) */
  configPaths: PCGWConfigPath[];
  /** Game metadata from PCGamingWiki (includes graphics API info, engine, etc.) */
  gameInfo?: PCGWGameInfo;
}

/**
 * Execution mode for tweak processing
 */
export type TweakExecutionMode = 'agent' | 'recipe';

/**
 * Rate limit information when quota is exceeded
 */
export interface RateLimitInfo {
  /** Number of requests used in current window */
  used: number;
  /** Maximum requests allowed per window */
  limit: number;
  /** Approximate minutes until window resets */
  retryAfterMinutes: number;
}

/**
 * Represents the current state of tweak agent execution
 */
export interface AgentStatus {
  /** Whether a task is currently running */
  isRunning: boolean;
  /** Parsed TweakSummary from the response (null if parsing failed or still running) */
  response: AgentResponseSchemaType | null;
  /** Any error that occurred during execution */
  error: string | null;
  /** Unique identifier for the current task/thread */
  threadId: string | null;
  /** Execution mode: 'agent' for full AI agent, 'recipe' for cached recipe replay */
  executionMode: TweakExecutionMode | null;
  /** Current agent activity text (thinking/reasoning output) for UI feedback */
  agentActivity: string | null;
  /** Rate limit info when quota exceeded (null if not rate limited) */
  rateLimitInfo: RateLimitInfo | null;
  /** Whether the client needs an update (contract version unsupported) */
  requiresUpdate?: boolean;
}

/**
 * Parameters for requesting user input from the agent
 */
export interface UserInputRequest {
  /** Title for the input dialog */
  title: string;
  /** Message/question to display to the user */
  message: string;
  /** Array of options for the user to choose from */
  options?: string[];
}

/**
 * Result from user input dialog
 */
export interface UserInputResponse {
  /** The user's selected input */
  userInput: string;
  /** Whether the user cancelled the dialog */
  cancelled: boolean;
}

/**
 * Result of processing a tweak
 */
export interface AgentResult {
  success: boolean;
  error?: string;
  /** Whether the client needs an update (contract version unsupported) */
  requiresUpdate?: boolean;
}

/**
 * Chunk types received during streaming
 */
export type StreamChunkType =
  | { type: 'text-delta'; payload: { text: string } }
  | { type: 'tool-call'; payload: { toolCallId: string; toolName: string; args: Record<string, unknown> } }
  | { type: 'error'; payload: { message: string } }
  | { type: 'finish'; payload: Record<string, unknown> };

// =============================================================================
// Tool Approval Types (for human-in-the-loop approval workflow)
// =============================================================================

/**
 * Status of an individual tool call in the approval workflow
 */
export type ToolCallStatus = 'pending-approval' | 'approved' | 'executing' | 'completed' | 'declined' | 'error';

/**
 * Information about a tool call for display in the stream dialog
 */
export interface ToolCallInfo {
  /** Unique identifier for this tool call */
  toolCallId: string;
  /** Name of the tool being called */
  toolName: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
  /** Current status of this tool call */
  status: ToolCallStatus;
  /** Result returned by the tool (if completed) */
  result?: unknown;
  /** Error message if the tool failed */
  error?: string;
  /** User-friendly description of what this tool call does */
  formattedDescription: string;
}

/**
 * Overall status of the tweak stream dialog
 */
export type TweakStreamStatus = 'idle' | 'running' | 'awaiting-approval' | 'completed' | 'error' | 'cancelled';

/**
 * State for the tweak stream dialog
 */
export interface TweakStreamState {
  /** The run ID for the current agent stream */
  runId: string | null;
  /** Whether the agent is currently processing */
  isRunning: boolean;
  /** List of tool calls made during this stream */
  toolCalls: ToolCallInfo[];
  /** Accumulated text output from the agent */
  textOutput: string;
  /** Error message if something went wrong */
  error: string | null;
  /** Overall status of the stream */
  status: TweakStreamStatus;
}

/**
 * Request sent to renderer when a tool call needs approval
 */
export interface ToolApprovalRequest {
  /** Unique identifier for this approval request (used to match response) */
  requestId: string;
  /** Name of the tool being called */
  toolName: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
  /** User-friendly description of what this tool call does */
  formattedDescription: string;
}

// =============================================================================
// Applied Tweak Types (for storing applied tweaks to disk)
// =============================================================================

/**
 * An applied tweak persisted to storage for later revert capability
 */
export interface AppliedTweak {
  /** PCGW Page ID (primary identifier for server) */
  pcgwPageId: number;
  /** Launcher-specific game ID (for local game lookup) */
  launcherGameId: string;
  /** The tweak */
  tweak: Tweak;
  /** Overall status of the tweak */
  status: TweakOperationStatus;
  /** Full summary with all operation details */
  summary: TweakSummary;
  /** ISO timestamp when the tweak was applied */
  appliedAt: string;
}

/**
 * Data structure for the applied-tweaks.json file
 */
export interface AppliedTweaksData {
  /** Schema version for future migrations */
  version: number;
  /** Array of applied tweaks */
  tweaks: AppliedTweak[];
}

// =============================================================================
// Revert Types (for undoing applied tweaks)
// =============================================================================

/**
 * Result of a single revert operation
 */
export interface RevertResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Name of the tool that was reverted */
  toolName: ToolName;
  /** Tool call ID that was reverted */
  toolCallId: string;
  /** Target file/path that was affected */
  target: string;
  /** Error message if operation failed */
  error?: string;
}

/**
 * Summary of an entire revert operation
 */
export interface RevertSummary {
  /** Overall status: success if all ops succeeded, partial if some failed, error if all failed */
  status: 'success' | 'partial' | 'error';
  /** Individual operation results */
  results: RevertResult[];
  /** Human-readable summary message */
  message: string;
}

// =============================================================================
// Pre-Revert Check Types (for surgical revert validation)
// =============================================================================

/**
 * Another tweak that has modified the same file
 */
export interface ConflictingTweak {
  /** Hash identifier of the conflicting tweak */
  hash: string;
  /** Title/name of the tweak */
  title: string;
  /** ISO timestamp when the tweak was applied */
  appliedAt: string;
}

/**
 * A file conflict detected during pre-revert validation
 */
export interface FileConflict {
  /** Path to the conflicting file */
  filePath: string;
  /** Type of conflict detected */
  conflictType: 'content_modified' | 'file_deleted' | 'file_moved';
  /** Other tweaks that also modified this file */
  otherTweaks: ConflictingTweak[];
}

/**
 * An operation that cannot be reverted
 */
export interface BlockedOperation {
  /** Description of the operation */
  description: string;
  /** Reason why it cannot be reverted */
  reason: string;
}

/**
 * Result of pre-revert validation check.
 * Determines if a surgical revert can proceed safely.
 */
export interface PreRevertCheckResult {
  /** Whether revert can proceed */
  canProceed: boolean;
  /** Reason if blocked */
  blockedReason?: string;
  /** Warning message if proceeding with caution */
  warning?: string;
  /** Files that have conflicts */
  fileConflicts: FileConflict[];
  /** Specific operations that cannot be reverted */
  blockedOperations: BlockedOperation[];
}

// =============================================================================
// Service Status Types
// =============================================================================

/**
 * Service Status State
 *
 * Represents the state of the service status system in the client.
 */
export interface ServiceStatusState {
  /** Status entries from the server */
  entries: StatusEntry[];
  /** Whether the server is reachable */
  isServerReachable: boolean;
  /** Timestamp of the last status check */
  lastChecked: number | null;
}
