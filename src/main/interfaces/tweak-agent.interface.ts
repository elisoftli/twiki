import type { AgentResponseSchemaType } from '../schemas/tweak-summary.schema';
import type { Game } from './game-library.interface';
import type { Tweak, PCGWConfigPath, PCGWGameInfo } from '@twiki/shared';
import type { EditOperation, FailedOperation } from '../tools/io/utils/types';

// Re-export for consumers of this interface file
export type { EditOperation, FailedOperation } from '../tools/io/utils/types';

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

// =============================================================================
// Tool Result Types (discriminated union for each tool's output)
// =============================================================================

/**
 * Base properties shared by most tool results
 */
interface BaseToolResult {
  success: boolean;
  message: string;
  timestamp: string;
  path?: string;
}

/** read-file-tool result */
export interface ReadFileToolResult extends BaseToolResult {
  toolName: 'read-file-tool';
  content: string;
  lineCount: number;
  sizeBytes: number;
  startLine?: number;
  endLine?: number;
  totalLines?: number;
}

/** read-file-around-pattern-tool result */
export interface ReadFileAroundPatternToolResult extends BaseToolResult {
  toolName: 'read-file-around-pattern-tool';
  results: Array<{
    searchText: string;
    found: boolean;
    content: string;
    matchedLine: number;
    startLine: number;
    endLine: number;
    totalMatches: number;
    allMatchedLines: number[];
  }>;
}

/** list-directory-contents-tool result */
export interface ListDirectoryContentsToolResult extends BaseToolResult {
  toolName: 'list-directory-contents-tool';
  files: string[];
  totalFiles: number;
  totalDirectories: number;
}

/** create-file-tool result */
export interface CreateFileToolResult extends BaseToolResult {
  toolName: 'create-file-tool';
  bytesWritten: number;
}

/** append-to-file-tool result */
export interface AppendToFileToolResult extends BaseToolResult {
  toolName: 'append-to-file-tool';
  backupPath?: string;
  linesAppended: number;
}

/** Individual file transfer record for granular tracking */
export interface FileTransferRecord {
  sourcePath: string;
  destinationPath: string;
  wasOverwrite: boolean;
  backupPath?: string;
}

/** Directory created during move/copy operation */
export interface DirectoryCreatedRecord {
  path: string;
}

/** move-copy-file-or-directory-tool result */
export interface MoveCopyFileOrDirectoryToolResult extends BaseToolResult {
  toolName: 'move-copy-file-or-directory-tool';
  results: Array<{
    sourcePath: string;
    destinationPath: string;
    backupPath?: string;
    success: boolean;
    error?: string;
    wasCopy?: boolean;
    /** Individual file transfers for granular revert support */
    fileTransfers?: FileTransferRecord[];
    /** Directories created during operation for cleanup */
    directoriesCreated?: DirectoryCreatedRecord[];
  }>;
  successfulOperations: number;
  failedOperations: number;
}

/** insert-at-pattern-tool result */
export interface InsertAtPatternToolResult extends BaseToolResult {
  toolName: 'insert-at-pattern-tool';
  backupPath?: string;
  matchedLine: number;
}

/**
 * Hash record for tracking file content before/after edits.
 * Used for recipe validation and surgical revert verification.
 */
export interface FileHashRecord {
  filePath: string;
  beforeHash: string;
  afterHash: string;
}

/**
 * edit-file-tool result
 * Note: Legacy stored tweaks may have operationsApplied as a number instead of EditOperation[].
 * The interface was updated to match the actual tool output which returns detailed operation info.
 */
export interface EditFileToolResult extends BaseToolResult {
  toolName: 'edit-file-tool';
  backupPath?: string;
  /** Operations that were successfully applied */
  operationsApplied: EditOperation[];
  /** Operations that failed with error details */
  operationsFailed?: FailedOperation[];
  /** File hash information for recipe validation and revert verification */
  fileHashes?: FileHashRecord[];
  /** True if this was a dry run (no changes made) */
  wasDryRun?: boolean;
  /** True if agent modified the args before execution */
  argsWereModified?: boolean;
}

/** extract-archive-tool result */
export interface ExtractArchiveToolResult extends BaseToolResult {
  toolName: 'extract-archive-tool';
  extractPath: string;
  extractedFiles: string[];
  /** Individual file transfers for granular revert support */
  fileTransfers?: FileTransferRecord[];
  /** Directories created during extraction for cleanup during revert */
  directoriesCreated?: DirectoryCreatedRecord[];
}

/** create-archive-tool result */
export interface CreateArchiveToolResult extends BaseToolResult {
  toolName: 'create-archive-tool';
  backupPath?: string;
  sourceCleanedUp: boolean;
}

/** download-file-tool result (no path field, uses downloadPath instead) */
export interface DownloadFileToolResult {
  toolName: 'download-file-tool';
  success: boolean;
  message: string;
  timestamp: string;
  downloadPath: string;
  extractPath?: string;
  extractedFiles?: string[];
  resolvedUrl: string;
  hosterUsed: string;
  fileSize: number;
  opened?: boolean;
}

/** set-process-affinity-tool result (no path field) */
export interface SetProcessAffinityToolResult {
  toolName: 'set-process-affinity-tool';
  success: boolean;
  message: string;
  timestamp: string;
}

/** set-file-attributes-tool result */
export interface SetFileAttributesToolResult extends BaseToolResult {
  toolName: 'set-file-attributes-tool';
  attributes: string[];
}

/** read-edit-registry-tool result */
export interface ReadEditRegistryToolResult extends BaseToolResult {
  toolName: 'read-edit-registry-tool';
  results: Array<{
    keyPath: string;
    valueName: string;
    operationType: 'read' | 'set' | 'delete';
    valueType?: string;
    success: boolean;
    error?: string;
    value?: string | number | null;
    previousValue?: string | number | null;
    previousType?: string;
  }>;
  successfulOperations: number;
  failedOperations: number;
}

/** modify-game-launch-options-tool result */
export interface ModifyGameLaunchOptionsToolResult extends BaseToolResult {
  toolName: 'modify-game-launch-options-tool';
  launcher: 'steam' | 'manual';
  backupPath?: string;
  modificationDetails: string;
  /** Original launch arguments before modification (for manual games only, used for revert) */
  originalArgs?: string;
  /** Whether a new desktop shortcut was created (manual games only, used for revert) */
  shortcutCreated?: boolean;
  /** Game ID for internal launch config cleanup (manual games only) */
  gameId?: string;
}

/** get-user-input-tool result (no path field) */
export interface GetUserInputToolResult {
  toolName: 'get-user-input-tool';
  success: boolean;
  message: string;
  timestamp: string;
  userInput: string;
}

/** Record of an installed file for reversion tracking */
export interface InstallReshadeFileRecord {
  destPath: string;
  backupPath: string | null;
  wasNewFile: boolean;
}

/** install-reshade-tool result */
export interface InstallReshadeToolResult extends BaseToolResult {
  toolName: 'install-reshade-tool';
  gameDirectory: string;
  installedFiles: InstallReshadeFileRecord[];
  actualDllName: string;
  detectedArchitecture: '32' | '64';
  graphicsApi: 'd3d9' | 'd3d10' | 'd3d11' | 'd3d12' | 'opengl';
}

/**
 * Discriminated union of all tool result types
 */
export type ToolResultUnion =
  | ReadFileToolResult
  | ReadFileAroundPatternToolResult
  | ListDirectoryContentsToolResult
  | CreateFileToolResult
  | AppendToFileToolResult
  | MoveCopyFileOrDirectoryToolResult
  | InsertAtPatternToolResult
  | EditFileToolResult
  | ExtractArchiveToolResult
  | CreateArchiveToolResult
  | DownloadFileToolResult
  | SetProcessAffinityToolResult
  | SetFileAttributesToolResult
  | ReadEditRegistryToolResult
  | ModifyGameLaunchOptionsToolResult
  | GetUserInputToolResult
  | InstallReshadeToolResult;

/**
 * All tool names as a type
 */
export type ToolName = ToolResultUnion['toolName'];

/**
 * Tools that create backups and can be reverted by restoring from backup
 */
export const BACKUP_REVERTIBLE_TOOLS: ReadonlySet<ToolName> = new Set([
  'insert-at-pattern-tool',
  'append-to-file-tool',
  'edit-file-tool',
  'create-archive-tool',
  'modify-game-launch-options-tool',
]);

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
// Tweak Summary Types (JSON response from agent after completing operations)
// =============================================================================

/**
 * Severity/status level for operations
 */
export type TweakOperationStatus = 'success' | 'warning' | 'error';

/**
 * Skipped operation that couldn't be performed
 */
export interface TweakSkippedOperation {
  /** Why it was skipped */
  reason: string;
  /** What was supposed to be done */
  description: string;
}

/**
 * A single tool call entry in the tweak summary
 */
export interface ToolCallEntry {
  /** Unique identifier for this tool call */
  toolCallId: string;
  /** Name of the tool that was called */
  toolName: ToolName;
  /** Short description of what this tool call did */
  description: string;
  /** Status of this tool call */
  status: TweakOperationStatus;
  /** ISO timestamp when the tool was executed */
  timestamp: string;
  /** The result returned by the tool */
  result: ToolResultUnion;
}

/**
 * Structured JSON summary from the tweak agent after completing operations.
 * Contains an array of tool calls with their results.
 */
export interface TweakSummary {
  /** Overall severity: worst status across all tool calls */
  status: TweakOperationStatus;
  /** Human-readable summary message */
  message: string;
  /** Array of tool calls made during the tweak */
  toolCalls: ToolCallEntry[];
  /** Operations that couldn't be performed */
  // skipped?: TweakSkippedOperation[];
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
