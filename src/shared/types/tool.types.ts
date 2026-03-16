/**
 * Tool-related types for the Tweak Agent system.
 * Extracted from tweak-agent.interface.ts, tool-status.interface.ts, and tool-display.interface.ts
 */

import type { EditOperation, FailedOperation } from '../../main/tools/io/utils/types';

// Re-export for consumers of this type file
export type { EditOperation, FailedOperation } from '../../main/tools/io/utils/types';

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
// Tool Status Types (from tool-status.interface.ts)
// =============================================================================

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

// =============================================================================
// Tool Display Types (from tool-display.interface.ts)
// =============================================================================

/**
 * Editable content metadata for operations that support user editing.
 * This provides a unified way to handle editable content across different operation types.
 */
export interface EditableContent {
  /** The current editable value */
  value: string;
  /** Display mode for the editor */
  mode: 'code' | 'text';
  /** Optional starting line number for code display */
  startLine?: number;
}

/**
 * Icon types mapping to Lucide icons for tool operations
 */
export type ToolIconType =
  | 'file'
  | 'file-text'
  | 'folder'
  | 'folder-input'
  | 'folder-output'
  | 'arrow-right-left'
  | 'database'
  | 'settings'
  | 'message-square'
  | 'gamepad'
  | 'download';

/**
 * Single path operation (read, create, list directory)
 */
export interface PathOperation {
  type: 'path';
  path: string;
  fileName: string;
  /** Additional detail like "lines 1-50" or "filter: *.ini" */
  detail?: string;
}

/**
 * Move/copy/rename operation (source -> destination)
 */
export interface MoveOperation {
  type: 'move';
  sourcePath: string;
  sourceFileName: string;
  destPath: string;
  destFileName: string;
  /** True if this is a copy operation rather than move */
  isCopy?: boolean;
}

/**
 * String-matching edit operation (oldString → newString)
 * Used by editFileTool
 */
export interface StringReplaceOperation {
  type: 'string-replace';
  path: string;
  fileName: string;
  /** The string to find */
  oldString: string;
  /** The replacement string (empty for delete) */
  newString: string;
  /** If true, all occurrences are replaced */
  replaceAll?: boolean;
  /** Editable content (newString value) */
  editable?: EditableContent;
}

/**
 * Registry operation
 */
export interface RegistryOperation {
  type: 'registry';
  action: 'read' | 'set' | 'delete';
  keyPath: string;
  /** Last segment of keyPath for display */
  keyName: string;
  valueName: string;
  value?: string | number;
}

/**
 * Text/content operation (insert, append, create)
 */
export interface ContentOperation {
  type: 'content';
  path: string;
  fileName: string;
  action: 'insert-after' | 'insert-before' | 'append' | 'create';
  pattern?: string;
  contentPreview: string;
  /** Editable content */
  editable?: EditableContent;
}

/**
 * System operation (affinity, compatibility, attributes)
 */
export interface SystemOperation {
  type: 'system';
  target: string;
  targetName: string;
  setting: string;
}

/**
 * User input operation
 */
export interface UserInputOperation {
  type: 'user-input';
  message: string;
  options?: string[];
}

/**
 * Launch options operation
 */
export interface LaunchOptionsOperation {
  type: 'launch-options';
  launcher: 'steam' | 'manual';
  /** Launcher-specific game identifier (e.g., Steam App ID) */
  gameId: string;
  options: string;
}

/**
 * Download progress information
 */
export interface DownloadProgressInfo {
  /** Bytes downloaded so far */
  downloadedBytes: number;
  /** Total bytes (if known from Content-Length header) */
  totalBytes?: number;
  /** Progress percentage (0-100) */
  percentage?: number;
}

/**
 * Download operation
 */
export interface DownloadOperation {
  type: 'download';
  url: string;
  /** Display-friendly URL (shortened if needed) */
  displayUrl: string;
  /** Whether extraction is requested */
  shouldExtract: boolean;
  /** Whether to open the file after download */
  openAfterDownload: boolean;
  /** Hoster identified (e.g., 'github', 'direct') */
  hoster?: string;
  /** Current download progress (updated during download) */
  progress?: DownloadProgressInfo;
}

/**
 * Union of all operation types
 */
export type ToolOperation =
  | PathOperation
  | MoveOperation
  | StringReplaceOperation
  | RegistryOperation
  | ContentOperation
  | SystemOperation
  | UserInputOperation
  | LaunchOptionsOperation
  | DownloadOperation;

/**
 * Complete structured display info for a tool call
 */
export interface ToolDisplayInfo {
  /** Human-readable tool name (e.g., "Read File", "Search & Replace") */
  displayName: string;
  /** Icon type for the tool */
  iconType: ToolIconType;
  /** One-line summary of the operation */
  summary: string;
  /** Detailed operations for expanded view */
  operations: ToolOperation[];
}
