/**
 * Revert utilities - handles reverting tool operations and conflict detection
 *
 * This module combines:
 * - Revert operations: reverses tool operations performed by the tweak agent
 * - Utility functions: file path extraction, conflict detection, and verification
 *
 * Supports reverting:
 * - File edits (surgical or backup)
 * - File creations (delete)
 * - File moves (reverse)
 * - Archive extraction (delete extracted files, restore backups)
 * - File downloads (delete downloaded and extracted files)
 * - Registry changes (restore previous value)
 * - Launch options (restore backup)
 * - File attributes (reverse attribute changes)
 * - ReShade installations (delete installed files, restore backups)
 */

import { promises as fs } from 'fs';
import { expandWindowsEnvVars } from '../../../utils';
import { readEditRegistry, setFileAttributes } from '../../system/utils';
import { killSteam, waitForSteamTermination, startSteam } from '../../game-launcher/utils';
import { deleteShortcut, updateShortcutArgs } from '../../../utils/shortcut.utils';
import { GameLibraryService } from '../../../services/game/game-library.service';
import { moveCopyFileOrDirectory } from './move-copy-file-or-directory.utils';
import {
  readFileNormalized,
  writeFileWithLineEnding,
  unescapeString,
  normalizeLineEndings,
} from '../../tool.utils';
import type {
  TweakSummary,
  ToolCallEntry,
  ToolName,
  RevertResult,
  RevertSummary,
  EditOperation,
  AppliedTweak,
  ConflictingTweak,
  FileConflict,
  // Tool result types for type narrowing
  CreateFileToolResult,
  MoveCopyFileOrDirectoryToolResult,
  ReadEditRegistryToolResult,
  ModifyGameLaunchOptionsToolResult,
  AppendToFileToolResult,
  InsertAtPatternToolResult,
  EditFileToolResult,
  CreateArchiveToolResult,
  SetFileAttributesToolResult,
  ExtractArchiveToolResult,
  DownloadFileToolResult,
  InstallReshadeToolResult,
} from '../../../interfaces/tweak-agent.interface';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of verifying if changes still exist
 */
export interface VerifyChangesResult {
  /** Whether all expected changes were found */
  allFound: boolean;
  /** Operations whose changes were not found */
  notFound: Array<{
    filePath: string;
    operation: EditOperation;
  }>;
}

/**
 * Options for revert operation
 */
export interface RevertOptions {
  /**
   * If true, use backup restore for edit-file-tool instead of surgical revert.
   * This will overwrite the file with the backup, undoing ALL changes including
   * those made by other tweaks or external sources.
   */
  useFallback?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Truncates a string for display purposes
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

/**
 * Checks if a tweak has legacy operationsApplied format (number instead of array).
 */
function isLegacyEditFileTweak(toolCall: ToolCallEntry): boolean {
  if (toolCall.toolName !== 'edit-file-tool') return false;
  const result = toolCall.result as EditFileToolResult;
  return typeof result.operationsApplied === 'number';
}

/**
 * Applies an inverse replace operation: replaces newString with oldString.
 * This is the reverse of the original edit operation.
 *
 * Note: Line endings are normalized after unescaping to ensure CRLF sequences
 * in stored operations match LF-normalized file content.
 */
function applyInverseReplace(
  content: string,
  searchFor: string,
  replaceWith: string,
  replaceAll: boolean
): { success: boolean; content: string } {
  // Unescape and normalize line endings to match normalized file content
  const unescapedSearchFor = normalizeLineEndings(unescapeString(searchFor));
  const unescapedReplaceWith = normalizeLineEndings(unescapeString(replaceWith));

  // Count occurrences
  const occurrences = content.split(unescapedSearchFor).length - 1;

  if (occurrences === 0) {
    return { success: false, content };
  }

  // Apply replacement
  if (replaceAll) {
    return { success: true, content: content.split(unescapedSearchFor).join(unescapedReplaceWith) };
  }
  return { success: true, content: content.replace(unescapedSearchFor, unescapedReplaceWith) };
}

/**
 * Removes content that was appended to the end of a file.
 * Handles both cases where content was appended with or without a leading newline.
 *
 * Note: Line endings are normalized after unescaping to ensure CRLF sequences
 * in stored operations match LF-normalized file content.
 */
function removeAppendedContent(
  content: string,
  appendedContent: string
): { success: boolean; content: string } {
  // Unescape and normalize line endings to match normalized file content
  const unescapedAppendedContent = normalizeLineEndings(unescapeString(appendedContent));

  // Check if file ends with appended content (with leading newline)
  const withNewline = '\n' + unescapedAppendedContent;
  if (content.endsWith(withNewline)) {
    return { success: true, content: content.slice(0, -withNewline.length) };
  }

  // Check if file ends with appended content (without leading newline)
  if (content.endsWith(unescapedAppendedContent)) {
    return { success: true, content: content.slice(0, -unescapedAppendedContent.length) };
  }

  // Content not found at end - check if it exists elsewhere
  const lastIndex = content.lastIndexOf(unescapedAppendedContent);
  if (lastIndex !== -1) {
    // Found elsewhere - remove last occurrence
    const beforeMatch = content.slice(0, lastIndex);
    const afterMatch = content.slice(lastIndex + unescapedAppendedContent.length);
    return { success: true, content: beforeMatch + afterMatch };
  }

  // Content not found anywhere
  return { success: false, content };
}

/**
 * Check if a directory is empty
 */
async function isDirectoryEmpty(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length === 0;
  } catch {
    return false;
  }
}

/**
 * Remove a directory if it's empty
 */
async function removeIfEmpty(dirPath: string): Promise<void> {
  if (await isDirectoryEmpty(dirPath)) {
    try {
      await fs.rmdir(dirPath);
    } catch {
      // Ignore errors (directory might not exist or not be empty)
    }
  }
}

// =============================================================================
// Revert Handler Type
// =============================================================================

type RevertHandler = (toolCall: ToolCallEntry) => Promise<RevertResult>;

// =============================================================================
// Revert Functions for Different Tool Types
// =============================================================================

/**
 * Revert a file edit by restoring from backup
 * Works for: insert-at-pattern-tool, append-to-file-tool, edit-file-tool, create-archive-tool
 */
async function revertFromBackup(toolCall: ToolCallEntry): Promise<RevertResult> {
  const result = toolCall.result as
    | InsertAtPatternToolResult
    | AppendToFileToolResult
    | EditFileToolResult
    | CreateArchiveToolResult;

  const target = result.path ? expandWindowsEnvVars(result.path) : '';

  if (!('backupPath' in result) || !result.backupPath) {
    return {
      success: false,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
      error: 'No backup path available for this operation',
    };
  }

  const backupPath = expandWindowsEnvVars(result.backupPath);

  try {
    // Check if backup exists
    await fs.access(backupPath);

    // Remove read-only attribute from target if set (file may have been made read-only by agent)
    try {
      await setFileAttributes({ filePath: target, readOnly: false });
    } catch {
      // Target may not exist or attribute not set, which is fine
    }

    // Copy backup over the current file
    await fs.copyFile(backupPath, target);

    // Delete the backup after successful restore
    await fs.unlink(backupPath);

    return {
      success: true,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
    };
  } catch (error) {
    return {
      success: false,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Surgically revert edit-file operations by applying inverse replacements.
 * This allows reverting without affecting changes made by other tweaks.
 */
async function revertEditFileOperations(toolCall: ToolCallEntry): Promise<RevertResult> {
  const result = toolCall.result as EditFileToolResult;
  const target = result.path ? expandWindowsEnvVars(result.path) : '';

  // Check for legacy format (operationsApplied is a number instead of array)
  if (isLegacyEditFileTweak(toolCall)) {
    // Fall back to backup restore for legacy tweaks
    return revertFromBackup(toolCall);
  }

  const operations = result.operationsApplied as EditOperation[];

  // If no operations were applied, nothing to revert
  if (!operations || operations.length === 0) {
    // Still clean up backup if it exists
    if (result.backupPath) {
      try {
        await fs.unlink(expandWindowsEnvVars(result.backupPath));
      } catch {
        // Ignore - backup may not exist
      }
    }
    return {
      success: true,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
    };
  }

  try {
    // Read current file content with line ending preservation
    let content: string;
    let lineEnding: '\r\n' | '\n';
    try {
      const readResult = await readFileNormalized(target);
      content = readResult.content;
      lineEnding = readResult.lineEnding;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: false,
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          target,
          error: 'File no longer exists',
        };
      }
      throw error;
    }

    // Apply inverse operations in REVERSE order (newest first)
    const reversedOps = [...operations].reverse();

    for (const op of reversedOps) {
      if (op.appendToEnd) {
        // Remove appended content from end of file
        const removeResult = removeAppendedContent(content, op.newString);

        // Check if content was actually removed
        if (!removeResult.success) {
          return {
            success: false,
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            target,
            error: `Cannot revert: appended content "${truncate(unescapeString(op.newString), 50)}" not found in file. ` +
              `The change may have been modified by another tweak or external source.`,
          };
        }
        content = removeResult.content;
      } else {
        // Swap: replace newString → oldString
        const inverseResult = applyInverseReplace(
          content,
          op.newString, // What we're looking for (what we changed TO)
          op.oldString, // What we're restoring (what it was BEFORE)
          op.replaceAll ?? false
        );

        if (!inverseResult.success) {
          return {
            success: false,
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            target,
            error: `Cannot revert: "${truncate(unescapeString(op.newString), 50)}" not found in file. ` +
              `The change may have been modified by another tweak or external source.`,
          };
        }

        content = inverseResult.content;
      }
    }

    // Remove read-only attribute from target if set
    try {
      await setFileAttributes({ filePath: target, readOnly: false });
    } catch {
      // Target may not exist or attribute not set, which is fine
    }

    // Write modified content back to file (preserving line endings)
    await writeFileWithLineEnding(target, content, lineEnding);

    // Delete backup file if it exists (no longer needed for surgical revert)
    if (result.backupPath) {
      try {
        await fs.unlink(expandWindowsEnvVars(result.backupPath));
      } catch {
        // Ignore - backup may not exist
      }
    }

    return {
      success: true,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
    };
  } catch (error) {
    return {
      success: false,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Revert a file creation by deleting the created file
 */
async function revertFileCreation(toolCall: ToolCallEntry): Promise<RevertResult> {
  const result = toolCall.result as CreateFileToolResult;
  const target = result.path ? expandWindowsEnvVars(result.path) : '';

  try {
    // Check if file exists
    const stat = await fs.stat(target);

    if (stat.isDirectory()) {
      // If it's a directory, remove it recursively
      await fs.rm(target, { recursive: true });
    } else {
      // Delete the file
      await fs.unlink(target);
    }

    return {
      success: true,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
    };
  } catch (error) {
    // File not found is actually a success case (already deleted or never created)
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        success: true,
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        target,
      };
    }

    return {
      success: false,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Revert file moves using granular file transfer tracking
 * This handles the case where a directory was merged into an existing directory
 */
async function revertFileMovesGranular(
  moveResult: MoveCopyFileOrDirectoryToolResult['results'][0],
  errors: string[]
): Promise<void> {
  const fileTransfers = moveResult.fileTransfers || [];
  const directoriesCreated = moveResult.directoriesCreated || [];
  const wasCopy = moveResult.wasCopy ?? false;

  // Process file transfers in reverse order
  for (const transfer of [...fileTransfers].reverse()) {
    const destPath = expandWindowsEnvVars(transfer.destinationPath);
    const srcPath = expandWindowsEnvVars(transfer.sourcePath);

    try {
      if (transfer.wasOverwrite && transfer.backupPath) {
        // File was overwritten and we have a backup - restore from backup
        const backupPath = expandWindowsEnvVars(transfer.backupPath);
        try {
          await fs.access(backupPath);
          await fs.copyFile(backupPath, destPath);
          await fs.unlink(backupPath);

          // For moves, also recreate the source file
          if (!wasCopy) {
            // Ensure source directory exists
            const srcDir = destPath.substring(0, destPath.lastIndexOf('\\'));
            await fs.mkdir(srcDir, { recursive: true }).catch(() => {});
            // We can't fully restore because the original source is gone
            // The backup was for the destination, not the source
          }
        } catch {
          errors.push(`Backup not found: ${backupPath}`);
        }
      } else if (transfer.wasOverwrite) {
        // File was overwritten but no backup - we can only delete the current file
        // (this restores the "nothing there" state for moves, but loses data for copies)
        try {
          await fs.access(destPath);
          await fs.unlink(destPath);
        } catch {
          // File not found is OK
        }
      } else {
        // New file was created (no overwrite)
        if (wasCopy) {
          // COPY: Just delete the destination file
          try {
            await fs.access(destPath);
            await fs.unlink(destPath);
          } catch {
            // File not found is OK
          }
        } else {
          // MOVE: Move the file back to source
          try {
            await fs.access(destPath);

            // Ensure source directory exists
            const srcDir = srcPath.substring(0, srcPath.lastIndexOf('\\'));
            await fs.mkdir(srcDir, { recursive: true }).catch(() => {});

            // Move file back
            const moveBackResult = await moveCopyFileOrDirectory({
              operations: [
                {
                  sourcePath: destPath,
                  destinationPath: srcPath,
                  skipBackup: true,
                },
              ],
            });

            if (moveBackResult.failedOperations > 0) {
              errors.push(`Failed to move back ${destPath} -> ${srcPath}: ${moveBackResult.results[0]?.error}`);
            }
          } catch {
            // File not found at destination is OK
          }
        }
      }
    } catch (error) {
      errors.push(`Error reverting file ${destPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Clean up created directories (in reverse order, deepest first)
  // Sort by path length descending to delete deepest directories first
  const sortedDirs = [...directoriesCreated].sort((a, b) => b.path.length - a.path.length);
  for (const dir of sortedDirs) {
    const dirPath = expandWindowsEnvVars(dir.path);
    await removeIfEmpty(dirPath);
  }
}

/**
 * Revert file moves by reversing each move operation
 * Uses granular file tracking when available, falls back to legacy behavior otherwise
 * Reuses moveCopyFileOrDirectory utility for cross-drive support
 */
async function revertFileMoves(toolCall: ToolCallEntry): Promise<RevertResult> {
  const result = toolCall.result as MoveCopyFileOrDirectoryToolResult;
  const target = result.path ? expandWindowsEnvVars(result.path) : '';

  const errors: string[] = [];

  // Process each move result in reverse order
  for (const moveResult of [...result.results].reverse()) {
    if (!moveResult.success) continue; // Skip failed operations

    // Check if we have granular file tracking
    if (moveResult.fileTransfers && moveResult.fileTransfers.length > 0) {
      // Use granular reverting
      await revertFileMovesGranular(moveResult, errors);
      continue;
    }

    // Legacy fallback: no granular tracking available
    const destinationPath = expandWindowsEnvVars(moveResult.destinationPath);

    // Handle COPY operations differently from MOVE operations
    if (moveResult.wasCopy) {
      // COPY: Source was not deleted, so we just need to remove the destination
      // (or restore backup if destination existed before)
      if (moveResult.backupPath) {
        const backupPath = expandWindowsEnvVars(moveResult.backupPath);
        try {
          await fs.access(backupPath);
          // Move backup to destination (overwrites the copied file)
          const moveBackResult = await moveCopyFileOrDirectory({
            operations: [
              {
                sourcePath: backupPath,
                destinationPath: destinationPath,
                skipBackup: true,
              },
            ],
          });
          if (moveBackResult.failedOperations > 0) {
            errors.push(`Failed to restore backup: ${moveBackResult.results[0]?.error}`);
          }
        } catch {
          errors.push(`Backup not found: ${backupPath}`);
        }
      } else {
        // No backup means destination didn't exist before - just delete the copied file/directory
        try {
          await fs.access(destinationPath);
          const stat = await fs.stat(destinationPath);
          if (stat.isDirectory()) {
            await fs.rm(destinationPath, { recursive: true });
          } else {
            await fs.unlink(destinationPath);
          }
        } catch {
          // File not found is OK (already deleted or never existed)
        }
      }
      continue;
    }

    // MOVE operations - legacy behavior
    // If there's a backup path, restore from backup to the destination
    if (moveResult.backupPath) {
      const backupPath = expandWindowsEnvVars(moveResult.backupPath);

      try {
        await fs.access(backupPath);
        // Move backup to destination (overwrites the moved file, restoring original)
        const moveBackResult = await moveCopyFileOrDirectory({
          operations: [
            {
              sourcePath: backupPath,
              destinationPath: destinationPath,
              skipBackup: true,
            },
          ],
        });
        if (moveBackResult.failedOperations > 0) {
          errors.push(`Failed to restore backup: ${moveBackResult.results[0]?.error}`);
        }
      } catch {
        errors.push(`Backup not found: ${backupPath}`);
      }
      continue;
    }

    // No backup - reverse the move operation (destination -> source)
    const sourcePath = expandWindowsEnvVars(moveResult.sourcePath);

    try {
      await fs.access(destinationPath);
      const moveBackResult = await moveCopyFileOrDirectory({
        operations: [
          {
            sourcePath: destinationPath,
            destinationPath: sourcePath,
            skipBackup: true,
          },
        ],
      });
      if (moveBackResult.failedOperations > 0) {
        errors.push(`Failed to move ${destinationPath} -> ${sourcePath}: ${moveBackResult.results[0]?.error}`);
      }
    } catch {
      // File not found at destination is OK (already reverted or never existed)
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
      error: errors.join('; '),
    };
  }

  return {
    success: true,
    toolName: toolCall.toolName,
    toolCallId: toolCall.toolCallId,
    target,
  };
}

/**
 * Revert registry changes by restoring previous values
 * Uses the results array which contains previousValue and previousType for each operation
 */
async function revertRegistryChanges(toolCall: ToolCallEntry): Promise<RevertResult> {
  const result = toolCall.result as ReadEditRegistryToolResult;
  const target = result.path || '';

  const errors: string[] = [];

  // Process each registry operation in reverse order
  for (const regResult of [...result.results].reverse()) {
    // Skip read operations and failed operations
    if (regResult.operationType === 'read' || !regResult.success) continue;

    try {
      if (regResult.previousValue === null || regResult.previousValue === undefined) {
        // Value didn't exist before - delete it
        const deleteResult = await readEditRegistry({
          operations: [
            {
              operationType: 'delete',
              keyPath: regResult.keyPath,
              valueName: regResult.valueName,
            },
          ],
        });

        if (deleteResult.failedOperations > 0) {
          errors.push(`Failed to delete ${regResult.valueName}: ${deleteResult.results[0]?.error ?? 'Unknown error'}`);
        }
      } else {
        // Restore the previous value
        const setResult = await readEditRegistry({
          operations: [
            {
              operationType: 'set',
              keyPath: regResult.keyPath,
              valueName: regResult.valueName,
              valueType: (regResult.previousType as 'REG_SZ' | 'REG_DWORD') ?? 'REG_SZ',
              data: regResult.previousValue,
            },
          ],
        });

        if (setResult.failedOperations > 0) {
          errors.push(`Failed to restore ${regResult.valueName}: ${setResult.results[0]?.error ?? 'Unknown error'}`);
        }
      }
    } catch (error) {
      errors.push(`Registry error for ${regResult.valueName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
      error: errors.join('; '),
    };
  }

  return {
    success: true,
    toolName: toolCall.toolName,
    toolCallId: toolCall.toolCallId,
    target,
  };
}

/**
 * Revert Steam launch options by restoring from backup
 * Handles Steam lifecycle: kill Steam → restore backup → restart Steam
 */
async function revertSteamLaunchOptions(
  toolCall: ToolCallEntry,
  result: ModifyGameLaunchOptionsToolResult
): Promise<RevertResult> {
  const target = result.path || '';

  if (!result.backupPath) {
    return {
      success: false,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
      error: 'No backup path available for this operation',
    };
  }

  const backupPath = expandWindowsEnvVars(result.backupPath);

  try {
    // Check if backup exists
    await fs.access(backupPath);

    // Kill Steam to avoid locked file conflicts
    await killSteam();
    await waitForSteamTermination(10000);

    // The backup path points to the localconfig.vdf backup
    // We need to restore it to the original location (remove the backup suffix)
    // Backup format: localconfig.vdf.backup_<timestamp>
    const originalPath = backupPath.replace(/\.backup_\d+$/, '');

    // Copy backup over the current file
    await fs.copyFile(backupPath, originalPath);

    // Delete the backup after successful restore
    await fs.unlink(backupPath);

    // Restart Steam
    await startSteam();

    return {
      success: true,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
    };
  } catch (error) {
    // Try to restart Steam even if restore failed
    try {
      await startSteam();
    } catch {
      // Best effort
    }

    return {
      success: false,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Revert manual game launch options by deleting shortcut or restoring original args.
 * Also removes the internal Twiki launch config from GameLibraryService.
 */
async function revertManualLaunchOptions(
  toolCall: ToolCallEntry,
  result: ModifyGameLaunchOptionsToolResult
): Promise<RevertResult> {
  const target = result.path || '';

  try {
    if (result.shortcutCreated) {
      // Shortcut was created - delete it
      try {
        await deleteShortcut(target);
      } catch (error) {
        // Shortcut may already be deleted - check if ENOENT
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        // File not found is OK (already deleted)
      }
    } else {
      // Shortcut was modified - restore original args
      // originalArgs could be empty string (which is valid)
      const originalArgs = result.originalArgs ?? '';
      await updateShortcutArgs(target, originalArgs);
    }

    // Remove internal Twiki launch config if gameId is available
    if (result.gameId) {
      try {
        const gameLibrary = GameLibraryService.getInstance();
        await gameLibrary.removeTwikiLaunchConfig(result.gameId);
      } catch {
        // Best effort - don't fail revert if this fails
      }
    }

    return {
      success: true,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
    };
  } catch (error) {
    return {
      success: false,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Revert game launch options by dispatching to launcher-specific handler
 * Supports backwards compatibility for results without launcher field (defaults to steam)
 */
async function revertLaunchOptions(toolCall: ToolCallEntry): Promise<RevertResult> {
  const result = toolCall.result as ModifyGameLaunchOptionsToolResult;
  // Backwards compatibility: default to 'steam' if launcher field is missing
  const launcher = result.launcher ?? 'steam';

  switch (launcher) {
    case 'steam':
      return revertSteamLaunchOptions(toolCall, result);
    case 'manual':
      return revertManualLaunchOptions(toolCall, result);
    default:
      return {
        success: false,
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        target: result.path || '',
        error: `Unsupported launcher for revert: ${launcher}`,
      };
  }
}

/**
 * Revert file attributes by reversing the applied changes
 * If ReadOnly was set, remove it. If -ReadOnly was set, add it back.
 */
async function revertFileAttributes(toolCall: ToolCallEntry): Promise<RevertResult> {
  const result = toolCall.result as SetFileAttributesToolResult;
  const target = result.path ? expandWindowsEnvVars(result.path) : '';

  if (!result.attributes || result.attributes.length === 0) {
    return {
      success: true,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
    };
  }

  try {
    // Parse the attributes array and reverse each change
    // Format: "ReadOnly" means +R was applied, "-ReadOnly" means -R was applied
    const reverseParams: {
      filePath: string;
      readOnly?: boolean;
      hidden?: boolean;
      system?: boolean;
      archive?: boolean;
    } = { filePath: target };

    for (const attr of result.attributes) {
      if (attr === 'ReadOnly') reverseParams.readOnly = false;
      else if (attr === '-ReadOnly') reverseParams.readOnly = true;
      else if (attr === 'Hidden') reverseParams.hidden = false;
      else if (attr === '-Hidden') reverseParams.hidden = true;
      else if (attr === 'System') reverseParams.system = false;
      else if (attr === '-System') reverseParams.system = true;
      else if (attr === 'Archive') reverseParams.archive = false;
      else if (attr === '-Archive') reverseParams.archive = true;
    }

    await setFileAttributes(reverseParams);

    return {
      success: true,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
    };
  } catch (error) {
    return {
      success: false,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Revert a file download by deleting downloaded and extracted files
 */
async function revertDownloadFile(toolCall: ToolCallEntry): Promise<RevertResult> {
  const result = toolCall.result as DownloadFileToolResult;
  const target = result.downloadPath ? expandWindowsEnvVars(result.downloadPath) : '';

  const errors: string[] = [];

  // First, delete any extracted files (if extraction was performed)
  if (result.extractedFiles && result.extractedFiles.length > 0) {
    for (const filePath of result.extractedFiles) {
      const expandedPath = expandWindowsEnvVars(filePath);
      try {
        await fs.access(expandedPath);
        await fs.unlink(expandedPath);
      } catch {
        // File not found is OK (already deleted)
      }
    }
  }

  // Delete the extract directory if it exists and is empty
  if (result.extractPath) {
    const expandedExtractPath = expandWindowsEnvVars(result.extractPath);
    await removeIfEmpty(expandedExtractPath);
  }

  // Delete the downloaded file
  if (target) {
    try {
      await fs.access(target);
      await fs.unlink(target);
    } catch (error) {
      // File not found is OK (already deleted)
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        errors.push(`Failed to delete downloaded file: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
      error: errors.join('; '),
    };
  }

  return {
    success: true,
    toolName: toolCall.toolName,
    toolCallId: toolCall.toolCallId,
    target,
  };
}

/**
 * Revert an archive extraction by deleting extracted files and restoring backups
 * Uses granular file tracking (fileTransfers, directoriesCreated) when available
 */
async function revertExtractArchive(toolCall: ToolCallEntry): Promise<RevertResult> {
  const result = toolCall.result as ExtractArchiveToolResult;
  const target = result.extractPath ? expandWindowsEnvVars(result.extractPath) : '';

  const errors: string[] = [];

  // Check if we have granular tracking
  if (result.fileTransfers && result.fileTransfers.length > 0) {
    // Process file transfers in reverse order
    for (const transfer of [...result.fileTransfers].reverse()) {
      const destPath = expandWindowsEnvVars(transfer.destinationPath);

      try {
        if (transfer.wasOverwrite && transfer.backupPath) {
          // File was overwritten - restore from backup
          const backupPath = expandWindowsEnvVars(transfer.backupPath);
          try {
            await fs.access(backupPath);
            await fs.copyFile(backupPath, destPath);
            await fs.unlink(backupPath);
          } catch {
            errors.push(`Backup not found: ${backupPath}`);
          }
        } else {
          // New file was extracted (no overwrite) - delete it
          try {
            await fs.access(destPath);
            await fs.unlink(destPath);
          } catch {
            // File not found is OK (already deleted)
          }
        }
      } catch (error) {
        errors.push(`Error reverting file ${destPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Clean up created directories (in reverse order, deepest first)
    if (result.directoriesCreated && result.directoriesCreated.length > 0) {
      const sortedDirs = [...result.directoriesCreated].sort((a, b) => b.path.length - a.path.length);
      for (const dir of sortedDirs) {
        const dirPath = expandWindowsEnvVars(dir.path);
        await removeIfEmpty(dirPath);
      }
    }
  } else if (result.extractedFiles && result.extractedFiles.length > 0) {
    // Legacy fallback: no granular tracking, just delete extracted files
    for (const filePath of result.extractedFiles) {
      const expandedPath = expandWindowsEnvVars(filePath);
      try {
        await fs.access(expandedPath);
        await fs.unlink(expandedPath);
      } catch {
        // File not found is OK
      }
    }

    // Try to remove the extract directory if it's empty
    if (target) {
      await removeIfEmpty(target);
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
      error: errors.join('; '),
    };
  }

  return {
    success: true,
    toolName: toolCall.toolName,
    toolCallId: toolCall.toolCallId,
    target,
  };
}

/**
 * Revert a ReShade installation by deleting installed files or restoring backups
 * Uses the installedFiles array which tracks what was installed
 */
async function revertInstallReshade(toolCall: ToolCallEntry): Promise<RevertResult> {
  const result = toolCall.result as InstallReshadeToolResult;
  const target = result.gameDirectory ? expandWindowsEnvVars(result.gameDirectory) : '';

  const errors: string[] = [];

  // Process installed files in reverse order
  for (const fileRecord of [...result.installedFiles].reverse()) {
    const destPath = expandWindowsEnvVars(fileRecord.destPath);

    try {
      if (fileRecord.backupPath) {
        // File had a backup - restore it
        const backupPath = expandWindowsEnvVars(fileRecord.backupPath);
        try {
          await fs.access(backupPath);
          await fs.copyFile(backupPath, destPath);
          await fs.unlink(backupPath);
        } catch {
          errors.push(`Backup not found: ${backupPath}`);
        }
      } else if (fileRecord.wasNewFile) {
        // File was new (no backup) - delete it
        try {
          await fs.access(destPath);
          await fs.unlink(destPath);
        } catch {
          // File not found is OK (already deleted)
        }
      }
    } catch (error) {
      errors.push(`Error reverting file ${destPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      target,
      error: errors.join('; '),
    };
  }

  return {
    success: true,
    toolName: toolCall.toolName,
    toolCallId: toolCall.toolCallId,
    target,
  };
}

// =============================================================================
// Tool Name to Revert Handler Mapping
// =============================================================================

/**
 * Mapping of tool names to their revert handlers
 */
const REVERT_HANDLERS: Partial<Record<ToolName, RevertHandler>> = {
  // File editing tools
  'insert-at-pattern-tool': revertFromBackup,
  'append-to-file-tool': revertFromBackup,
  'edit-file-tool': revertEditFileOperations, // Surgical revert (falls back to backup for legacy)
  'create-archive-tool': revertFromBackup,

  // File creation - delete the file
  'create-file-tool': revertFileCreation,

  // Archive extraction - delete extracted files, restore backups
  'extract-archive-tool': revertExtractArchive,

  // File downloads - delete downloaded and extracted files
  'download-file-tool': revertDownloadFile,

  // File moves/copies - reverse the moves, delete copies
  'move-copy-file-or-directory-tool': revertFileMoves,

  // Registry changes - restore previous values
  'read-edit-registry-tool': revertRegistryChanges,

  // Launch options - restore backup with launcher lifecycle
  'modify-game-launch-options-tool': revertLaunchOptions,

  // File attributes - reverse the attribute changes
  'set-file-attributes-tool': revertFileAttributes,

  // Graphics mods - delete installed files, restore backups
  'install-reshade-tool': revertInstallReshade,
};

/**
 * Check if a tool call is revertible
 */
function isRevertible(toolCall: ToolCallEntry): boolean {
  return (
    toolCall.toolName in REVERT_HANDLERS &&
    toolCall.result.success &&
    (toolCall.status === 'success' || toolCall.status === 'warning')
  );
}

// =============================================================================
// Main Revert Function
// =============================================================================

/**
 * Revert all reversible tool calls from a tweak summary
 * Sorts by timestamp (newest first) to reverse operations in correct order
 * Continues on errors (skip and continue strategy)
 *
 * @param summary The tweak summary containing tool calls to revert
 * @param options Optional settings for the revert operation
 */
export async function revertTweak(
  summary: TweakSummary,
  options: RevertOptions = {}
): Promise<RevertSummary> {
  const { useFallback = false } = options;
  const results: RevertResult[] = [];

  // Filter to only revertible tool calls
  const revertibleToolCalls = summary.toolCalls.filter(isRevertible);

  // Sort by timestamp descending (newest first) to reverse operations in correct order
  revertibleToolCalls.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeB - timeA;
  });

  // Execute reverts in sorted order
  for (const toolCall of revertibleToolCalls) {
    // For edit-file-tool, use backup restore if useFallback is true
    let handler: RevertHandler | undefined;
    if (toolCall.toolName === 'edit-file-tool' && useFallback) {
      handler = revertFromBackup;
    } else {
      handler = REVERT_HANDLERS[toolCall.toolName];
    }

    if (!handler) {
      // This shouldn't happen due to the filter, but handle it gracefully
      results.push({
        success: false,
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        target: '',
        error: `No revert handler for tool: ${toolCall.toolName}`,
      });
      continue;
    }

    try {
      const result = await handler(toolCall);
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        target: '',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Determine overall status
  const successCount = results.filter((r) => r.success).length;
  const totalCount = results.length;

  let status: RevertSummary['status'];
  let message: string;

  if (totalCount === 0) {
    status = 'success';
    message = 'No operations to revert';
  } else if (successCount === totalCount) {
    status = 'success';
    message = `Successfully reverted ${successCount} operation${successCount !== 1 ? 's' : ''}`;
  } else if (successCount === 0) {
    status = 'error';
    message = `Failed to revert all ${totalCount} operation${totalCount !== 1 ? 's' : ''}`;
  } else {
    status = 'partial';
    message = `Reverted ${successCount} of ${totalCount} operations (${totalCount - successCount} failed)`;
  }

  return {
    status,
    results,
    message,
  };
}

// =============================================================================
// File Path Extraction
// =============================================================================

/**
 * Extracts all file paths modified by a tweak's tool calls.
 * Handles various tool types and expands environment variables.
 *
 * @param toolCalls - Array of tool call entries from a tweak
 * @returns Deduplicated array of expanded file paths
 */
export function extractModifiedFilePaths(toolCalls: ToolCallEntry[]): string[] {
  const paths = new Set<string>();

  for (const toolCall of toolCalls) {
    // Skip non-successful operations
    if (!toolCall.result.success) continue;

    switch (toolCall.toolName) {
      case 'edit-file-tool': {
        const result = toolCall.result as EditFileToolResult;
        if (result.path) {
          paths.add(expandWindowsEnvVars(result.path));
        }
        break;
      }

      case 'create-file-tool': {
        const result = toolCall.result as { path?: string };
        if (result.path) {
          paths.add(expandWindowsEnvVars(result.path));
        }
        break;
      }

      case 'move-copy-file-or-directory-tool': {
        const result = toolCall.result as MoveCopyFileOrDirectoryToolResult;
        for (const moveResult of result.results) {
          if (moveResult.success && moveResult.destinationPath) {
            paths.add(expandWindowsEnvVars(moveResult.destinationPath));
          }
        }
        break;
      }

      case 'extract-archive-tool': {
        const result = toolCall.result as ExtractArchiveToolResult;
        if (result.extractPath) {
          paths.add(expandWindowsEnvVars(result.extractPath));
        }
        if (result.extractedFiles) {
          for (const filePath of result.extractedFiles) {
            paths.add(expandWindowsEnvVars(filePath));
          }
        }
        break;
      }

      case 'download-file-tool': {
        const result = toolCall.result as DownloadFileToolResult;
        if (result.downloadPath) {
          paths.add(expandWindowsEnvVars(result.downloadPath));
        }
        if (result.extractedFiles) {
          for (const filePath of result.extractedFiles) {
            paths.add(expandWindowsEnvVars(filePath));
          }
        }
        break;
      }

      case 'modify-game-launch-options-tool': {
        const result = toolCall.result as ModifyGameLaunchOptionsToolResult;
        if (result.path) {
          paths.add(expandWindowsEnvVars(result.path));
        }
        break;
      }

      case 'install-reshade-tool': {
        const result = toolCall.result as InstallReshadeToolResult;
        for (const fileRecord of result.installedFiles) {
          if (fileRecord.destPath) {
            paths.add(expandWindowsEnvVars(fileRecord.destPath));
          }
        }
        break;
      }

      // append-to-file-tool, insert-at-pattern-tool, create-archive-tool use path from result
      case 'append-to-file-tool':
      case 'insert-at-pattern-tool':
      case 'create-archive-tool': {
        const result = toolCall.result as { path?: string };
        if (result.path) {
          paths.add(expandWindowsEnvVars(result.path));
        }
        break;
      }
    }
  }

  return Array.from(paths);
}

// =============================================================================
// Conflict Detection
// =============================================================================

/**
 * Detects file conflicts between a target tweak and other applied tweaks.
 * A conflict occurs when multiple tweaks have modified the same file.
 *
 * @param targetTweak - The tweak we want to check for conflicts
 * @param allAppliedTweaks - All currently applied tweaks
 * @returns Array of file conflicts found
 */
export function detectFileConflicts(
  targetTweak: AppliedTweak,
  allAppliedTweaks: AppliedTweak[]
): FileConflict[] {
  // Get file paths from target tweak
  const targetPaths = extractModifiedFilePaths(targetTweak.summary.toolCalls);

  // Normalize paths for comparison (lowercase on Windows)
  const normalizedTargetPaths = new Set(
    targetPaths.map((p) => p.toLowerCase())
  );

  // Map to group conflicts by file path
  const conflictsByPath = new Map<string, ConflictingTweak[]>();

  // Check each other tweak for conflicts
  for (const otherTweak of allAppliedTweaks) {
    // Skip the target tweak itself
    if (
      otherTweak.pcgwPageId === targetTweak.pcgwPageId &&
      otherTweak.tweak.hash === targetTweak.tweak.hash &&
      otherTweak.appliedAt === targetTweak.appliedAt
    ) {
      continue;
    }

    // Get file paths from other tweak
    const otherPaths = extractModifiedFilePaths(otherTweak.summary.toolCalls);

    // Check for overlapping paths
    for (const otherPath of otherPaths) {
      const normalizedOtherPath = otherPath.toLowerCase();
      if (normalizedTargetPaths.has(normalizedOtherPath)) {
        // Get or create the array for this file path
        if (!conflictsByPath.has(normalizedOtherPath)) {
          conflictsByPath.set(normalizedOtherPath, []);
        }
        conflictsByPath.get(normalizedOtherPath)!.push({
          hash: otherTweak.tweak.hash,
          title: otherTweak.tweak.title,
          appliedAt: otherTweak.appliedAt,
        });
      }
    }
  }

  // Convert map to array of FileConflict
  const conflicts: FileConflict[] = [];
  for (const [filePath, otherTweaks] of conflictsByPath) {
    conflicts.push({
      filePath,
      conflictType: 'content_modified', // Default to content_modified for file conflicts
      otherTweaks,
    });
  }

  return conflicts;
}

// =============================================================================
// Content Verification
// =============================================================================

/**
 * Verifies that changes made by a tweak still exist in the files.
 * This checks if the newString from each edit operation is still present.
 *
 * @param tweak - The applied tweak to verify
 * @returns Result indicating if all changes were found and which were not
 */
export async function verifyChangesExist(
  tweak: AppliedTweak
): Promise<VerifyChangesResult> {
  const notFound: Array<{ filePath: string; operation: EditOperation }> = [];

  for (const toolCall of tweak.summary.toolCalls) {
    // Only check edit-file-tool operations
    if (toolCall.toolName !== 'edit-file-tool') continue;
    if (!toolCall.result.success) continue;

    const result = toolCall.result as EditFileToolResult;
    if (!result.path) continue;

    const expandedPath = expandWindowsEnvVars(result.path);

    // Get the operations that were applied from the result
    // operationsApplied is EditOperation[] in the updated interface
    const operations = result.operationsApplied;
    if (!operations || !Array.isArray(operations) || operations.length === 0) continue;

    // Try to read the file (normalize line endings to match stored operations)
    let content: string;
    try {
      const rawContent = await fs.readFile(expandedPath, 'utf-8');
      content = normalizeLineEndings(rawContent);
    } catch {
      // File doesn't exist or can't be read - all operations are "not found"
      for (const operation of operations) {
        notFound.push({ filePath: expandedPath, operation });
      }
      continue;
    }

    for (const operation of operations) {
      // For append-to-end operations, check if newString is at the end
      if (operation.appendToEnd) {
        const unescapedNew = unescapeString(operation.newString);
        if (!content.endsWith(unescapedNew) && !content.endsWith('\n' + unescapedNew)) {
          notFound.push({ filePath: expandedPath, operation });
        }
        continue;
      }

      // For regular operations, check if newString exists in the file
      const unescapedNew = unescapeString(operation.newString);
      if (!content.includes(unescapedNew)) {
        notFound.push({ filePath: expandedPath, operation });
      }
    }
  }

  return {
    allFound: notFound.length === 0,
    notFound,
  };
}
