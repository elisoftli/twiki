/**
 * IO utilities barrel export
 */

export { readFile } from './read-file.utils';
export { readFileAroundPattern } from './read-file-around-pattern.utils';
export { listDirectoryContents } from './list-directory-contents.utils';
export { createFile } from './create-file.utils';
export { editFile } from './edit-file.utils';
export { moveCopyFileOrDirectory } from './move-copy-file-or-directory.utils';
export { extractArchive } from './extract-archive.utils';
export { createArchive } from './create-archive.utils';
export { downloadFile } from './download-file.utils';
// Revert utilities (consolidated)
export {
  revertTweak,
  extractModifiedFilePaths,
  detectFileConflicts,
  verifyChangesExist,
} from './revert.utils';

// Re-export types
export type {
  ReadFileParams,
  ReadFileResult,
  ReadFileAroundPatternParams,
  ReadFileAroundPatternResult,
  ListDirectoryContentsParams,
  ListDirectoryContentsResult,
  CreateFileParams,
  CreateFileResult,
  AppendToFileParams,
  AppendToFileResult,
  InsertAtPatternParams,
  InsertAtPatternResult,
  EditOperation,
  FailedOperation,
  EditFileParams,
  EditFileResult,
  MoveCopyFileOrDirectoryParams,
  MoveCopyFileOrDirectoryResult,
  ExtractArchiveParams,
  ExtractArchiveResult,
  CreateArchiveParams,
  CreateArchiveResult,
  DownloadFileParams,
  DownloadFileResult,
} from './types';

// Revert utility types
export type { VerifyChangesResult, RevertOptions } from './revert.utils';

// Re-export conflict types from main interface
export type {
  FileConflict,
  ConflictingTweak,
} from '../../../interfaces/tweak-agent.interface';
