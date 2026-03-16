/**
 * Type definitions for IO utility functions
 */

// Read operations
export interface ReadFileParams {
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface ReadFileResult {
  path: string;
  content: string;
  lineCount: number;
  sizeBytes: number;
  startLine?: number;
  endLine?: number;
  totalLines?: number;
}

export interface ReadFileRangeParams {
  path: string;
  startLine: number;
  endLine: number;
}

export interface ReadFileRangeResult {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
}

export interface SearchOperation {
  searchText: string;
  contextLines?: number;
  /** If true, searchText is treated as a regex pattern. Default: false (plain text search) */
  isRegex?: boolean;
  /** If true, match patterns case-insensitively. Default: false */
  caseInsensitive?: boolean;
}

export interface ReadFileAroundPatternParams {
  path: string;
  searches: SearchOperation[];
}

export interface SingleSearchResult {
  searchText: string;
  found: boolean;
  content: string;
  matchedLine: number;
  startLine: number;
  endLine: number;
  totalMatches: number;
  allMatchedLines: number[];
}

export interface ReadFileAroundPatternResult {
  path: string;
  results: SingleSearchResult[];
}

// Directory operations
export interface ListDirectoryContentsParams {
  path: string;
  depth?: number;
  fileNameSearch?: string;
  maxFilesPerDirectory?: number;
}

export interface ListDirectoryContentsResult {
  path: string;
  files: string[];
  totalFiles: number;
  totalDirectories: number;
  truncated: boolean;
}

// File creation/modification operations
export interface CreateFileParams {
  path: string;
  content: string;
}

export interface CreateFileResult {
  path: string;
  bytesWritten: number;
  alreadyExists?: boolean;
}

export interface AppendToFileParams {
  path: string;
  content: string;
}

export interface AppendToFileResult {
  path: string;
  backupPath?: string;
  linesAppended: number;
}

export interface InsertAfterPatternParams {
  path: string;
  searchText: string;
  contentToInsert: string;
}

export interface InsertAfterPatternResult {
  path: string;
  backupPath?: string;
  matchedLine: number;
}

export interface InsertBeforePatternParams {
  path: string;
  searchText: string;
  contentToInsert: string;
}

export interface InsertBeforePatternResult {
  path: string;
  backupPath?: string;
  matchedLine: number;
}

export interface InsertAtPatternParams {
  path: string;
  searchText: string;
  contentToInsert: string;
  position: 'before' | 'after';
}

export interface InsertAtPatternResult {
  path: string;
  backupPath?: string;
  matchedLine: number;
}

// Structured modification operations

/** String-matching edit operation (like Claude Code's Edit tool) */
export interface EditOperation {
  /** Exact string to find and replace. Ignored if appendToEnd=true. */
  oldString: string;
  /** Replacement string (use "" to delete, include oldString content to insert), or content to append if appendToEnd=true */
  newString: string;
  /** If true, replace all occurrences. If false (default), requires exactly one match. */
  replaceAll?: boolean;
  /** If true, append newString to end of file (oldString is ignored). Useful for adding new sections. */
  appendToEnd?: boolean;
}

/** Result of a failed operation */
export interface FailedOperation {
  operation: EditOperation;
  error: string;
}

export interface EditFileParams {
  path: string;
  operations: EditOperation[];
  /** If true, validate and return what would change without modifying the file */
  dryRun?: boolean;
  /** Hash from prior read - abort if file has changed since then */
  expectedFileHash?: string;
}

export interface EditFileResult {
  path: string;
  backupPath?: string;
  /** Operations that were successfully applied */
  operationsApplied: EditOperation[];
  /** Operations that failed with error details */
  operationsFailed?: FailedOperation[];
  /** True if this was a dry run (no changes made) */
  wasDryRun?: boolean;
  /** File hash information for recipe validation */
  fileHashes?: Array<{
    filePath: string;
    beforeHash: string;
    afterHash: string;
  }>;
}

// Move/Copy operations
export interface MoveOperation {
  sourcePath: string;
  destinationPath: string;
  skipBackup: boolean;
  /** If true, copy the file instead of moving it (source remains unchanged) */
  copyOnly?: boolean;
}

/**
 * Record of a single file transfer within a directory move/copy operation.
 * Used for granular tracking to enable precise reverting.
 */
export interface FileTransferRecord {
  /** Full path of the source file */
  sourcePath: string;
  /** Full path of the destination file */
  destinationPath: string;
  /** Whether the destination file existed before the transfer (was overwritten) */
  wasOverwrite: boolean;
  /** Backup path if the destination was backed up before overwrite */
  backupPath?: string;
}

/**
 * Record of a directory that was created during a move/copy operation.
 * Used for cleanup during revert.
 */
export interface DirectoryCreatedRecord {
  /** Full path of the created directory */
  path: string;
}

export interface SingleMoveResult {
  sourcePath: string;
  destinationPath: string;
  backupPath?: string;
  success: boolean;
  error?: string;
  /** Whether this was a copy operation (source remains unchanged) */
  wasCopy?: boolean;
  /** Individual file transfers when moving/copying directories (for granular revert) */
  fileTransfers?: FileTransferRecord[];
  /** Directories created during the operation (for cleanup during revert) */
  directoriesCreated?: DirectoryCreatedRecord[];
}

export interface MoveCopyFileOrDirectoryParams {
  operations: MoveOperation[];
}

export interface MoveCopyFileOrDirectoryResult {
  results: SingleMoveResult[];
  successfulOperations: number;
  failedOperations: number;
}

// Archive operations
export interface ExtractArchiveParams {
  archivePath: string;
  extractPath?: string;
}

export interface ExtractArchiveResult {
  path: string;
  extractPath: string;
  /** Absolute paths of all extracted files */
  extractedFiles: string[];
  /** Individual file transfers for granular revert support */
  fileTransfers: FileTransferRecord[];
  /** Directories created during extraction for cleanup during revert */
  directoriesCreated: DirectoryCreatedRecord[];
}

export interface CreateArchiveParams {
  sourcePath: string;
  archivePath: string;
  cleanupSource?: boolean;
}

export interface CreateArchiveResult {
  path: string;
  backupPath?: string;
  sourceCleanedUp: boolean;
}

// Download operations
export interface DownloadFileParams {
  /** URL to download (can be direct or hoster page like GitHub releases) */
  downloadUrl: string;
  /** Whether to extract archive after download */
  shouldExtract: boolean;
  /** Optional hint to help auto-select when multiple files are available (e.g., "x86", "win64") */
  selectionHint?: string;
}

/** Metadata scraped from the download source page */
export interface DownloadMetadata {
  /** Title of the downloaded content */
  title?: string;
  /** Installation instructions in markdown format */
  instructions?: string;
  /** Original page URL where metadata was scraped */
  sourceUrl?: string;
}

export interface DownloadFileResult {
  /** Path where the file was downloaded */
  downloadPath: string;
  /** Path where files were extracted (if shouldExtract=true) */
  extractPath?: string;
  /** Absolute paths of all extracted files (if shouldExtract=true) */
  extractedFiles?: string[];
  /** Original URL that was provided */
  originalUrl: string;
  /** Final download URL (after hoster resolution) */
  resolvedUrl: string;
  /** Which hoster resolver handled the URL */
  hosterUsed: string;
  /** Downloaded file size in bytes */
  fileSize: number;
  /** Scraped metadata from the download source (e.g., installation instructions from NexusMods) */
  metadata?: DownloadMetadata;
}
