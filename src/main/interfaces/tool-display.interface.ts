/**
 * Structured types for tool display in the tweak stream dialog.
 * These types enable rich UI rendering with icons and tooltips.
 */

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
