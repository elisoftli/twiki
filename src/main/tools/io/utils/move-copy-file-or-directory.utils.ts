/**
 * Move file or directory utility - moves or renames files and folders
 * Supports batch operations for multiple moves in a single call
 * Handles cross-drive moves by copying then deleting
 * Tracks individual file transfers for granular revert support
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createBackup } from '../../tool.utils';
import { expandWindowsEnvVars } from '../../../utils';
import type {
  MoveCopyFileOrDirectoryParams,
  MoveCopyFileOrDirectoryResult,
  SingleMoveResult,
  FileTransferRecord,
  DirectoryCreatedRecord,
} from './types';

/**
 * Result of a recursive copy/move operation with tracking
 */
interface TransferTrackingResult {
  fileTransfers: FileTransferRecord[];
  directoriesCreated: DirectoryCreatedRecord[];
}

/**
 * Check if a path exists
 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path is a directory
 */
async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Copy a file or directory recursively with tracking of individual operations
 * @param source Source path
 * @param destination Destination path
 * @param skipBackup Whether to skip creating backups for overwritten files
 * @returns Tracking result with file transfers and directories created
 */
async function copyRecursiveWithTracking(
  source: string,
  destination: string,
  skipBackup: boolean
): Promise<TransferTrackingResult> {
  const fileTransfers: FileTransferRecord[] = [];
  const directoriesCreated: DirectoryCreatedRecord[] = [];

  const stat = await fs.stat(source);

  if (stat.isDirectory()) {
    // Check if destination directory exists
    const destExists = await pathExists(destination);

    if (!destExists) {
      // Create destination directory and track it
      await fs.mkdir(destination, { recursive: true });
      directoriesCreated.push({ path: destination });
    }

    // Copy all contents recursively
    const entries = await fs.readdir(source);
    for (const entry of entries) {
      const srcPath = path.join(source, entry);
      const destPath = path.join(destination, entry);
      const subResult = await copyRecursiveWithTracking(srcPath, destPath, skipBackup);
      fileTransfers.push(...subResult.fileTransfers);
      directoriesCreated.push(...subResult.directoriesCreated);
    }
  } else {
    // Single file - check if destination exists
    const destExists = await pathExists(destination);
    let backupPath: string | undefined;

    if (destExists && !skipBackup) {
      // Create backup of existing file before overwriting
      backupPath = await createBackup(destination);
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(destination);
    const parentExists = await pathExists(parentDir);
    if (!parentExists) {
      await fs.mkdir(parentDir, { recursive: true });
      directoriesCreated.push({ path: parentDir });
    }

    // Copy the file
    await fs.copyFile(source, destination);

    // Track this file transfer
    fileTransfers.push({
      sourcePath: source,
      destinationPath: destination,
      wasOverwrite: destExists,
      backupPath,
    });
  }

  return { fileTransfers, directoriesCreated };
}

/**
 * Delete a file or directory recursively
 */
async function removeRecursive(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath);

  if (stat.isDirectory()) {
    const entries = await fs.readdir(filePath);
    for (const entry of entries) {
      await removeRecursive(path.join(filePath, entry));
    }
    await fs.rmdir(filePath);
  } else {
    await fs.unlink(filePath);
  }
}

/**
 * Move a file or directory, handling cross-drive moves, with tracking
 * @param source Source path
 * @param destination Destination path
 * @param skipBackup Whether to skip creating backups
 * @returns Tracking result (empty for same-drive rename of non-directory, populated for cross-drive or directory merge)
 */
async function moveWithCrossDriveSupportAndTracking(
  source: string,
  destination: string,
  skipBackup: boolean
): Promise<TransferTrackingResult> {
  const sourceIsDir = await isDirectory(source);
  const destExists = await pathExists(destination);

  // For directory moves where destination exists, we need to merge (track individual files)
  if (sourceIsDir && destExists) {
    const result = await copyRecursiveWithTracking(source, destination, skipBackup);
    await removeRecursive(source);
    return result;
  }

  // Backup created before rename attempt — hoisted so EXDEV fallback can access it
  let preRenameBackupPath: string | undefined;

  // For single files or new directories, try rename first
  try {
    // For single file where destination exists, create backup and track
    if (!sourceIsDir && destExists) {
      if (!skipBackup) {
        preRenameBackupPath = await createBackup(destination);
      }
      await fs.rename(source, destination);
      return {
        fileTransfers: [
          {
            sourcePath: source,
            destinationPath: destination,
            wasOverwrite: true,
            backupPath: preRenameBackupPath,
          },
        ],
        directoriesCreated: [],
      };
    }

    // Simple rename (no destination conflict)
    await fs.rename(source, destination);

    // For single file moves, track the transfer
    if (!sourceIsDir) {
      return {
        fileTransfers: [
          {
            sourcePath: source,
            destinationPath: destination,
            wasOverwrite: false,
          },
        ],
        directoriesCreated: [],
      };
    }

    // For directory moves to new location, we don't have granular tracking
    // (the whole directory was moved atomically)
    return { fileTransfers: [], directoriesCreated: [] };
  } catch (error) {
    // Check if it's a cross-device error (EXDEV)
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EXDEV') {
      // Cross-drive move: copy with tracking then delete
      // Skip backup — if destination existed, backup was already created before the failed rename
      const result = await copyRecursiveWithTracking(source, destination, true);
      await removeRecursive(source);

      // Propagate the pre-rename backup path into the tracking result
      if (preRenameBackupPath && result.fileTransfers.length > 0) {
        result.fileTransfers[0].backupPath = preRenameBackupPath;
      }

      return result;
    } else {
      // Re-throw other errors
      throw error;
    }
  }
}

export async function moveCopyFileOrDirectory(params: MoveCopyFileOrDirectoryParams): Promise<MoveCopyFileOrDirectoryResult> {
  const { operations } = params;

  const results: SingleMoveResult[] = [];
  let successfulOperations = 0;
  let failedOperations = 0;

  for (const operation of operations) {
    const { sourcePath, destinationPath, skipBackup, copyOnly } = operation;

    try {
      const expandedSource = expandWindowsEnvVars(sourcePath);
      const expandedDest = destinationPath ? expandWindowsEnvVars(destinationPath) : '';

      // Check if source exists
      try {
        await fs.access(expandedSource);
      } catch {
        throw new Error(`Source path does not exist: ${expandedSource}`);
      }

      // Ensure parent directory exists for destination
      const parentDir = path.dirname(expandedDest);
      await fs.mkdir(parentDir, { recursive: true });

      // Perform copy or move with tracking
      let trackingResult: TransferTrackingResult;

      if (copyOnly) {
        trackingResult = await copyRecursiveWithTracking(expandedSource, expandedDest, skipBackup);
      } else {
        trackingResult = await moveWithCrossDriveSupportAndTracking(expandedSource, expandedDest, skipBackup);
      }

      results.push({
        sourcePath: expandedSource,
        destinationPath: expandedDest,
        success: true,
        wasCopy: copyOnly ?? false,
        fileTransfers: trackingResult.fileTransfers,
        directoriesCreated: trackingResult.directoriesCreated,
      });
      successfulOperations++;
    } catch (error) {
      results.push({
        sourcePath,
        destinationPath,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      failedOperations++;
    }
  }

  return {
    results,
    successfulOperations,
    failedOperations,
  };
}
