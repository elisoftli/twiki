import { promises as fs } from 'fs';
import { expandWindowsEnvVars } from '../../utils';
import {
  revertTweak,
  detectFileConflicts,
  verifyChangesExist,
} from '../../tools/io/utils/revert.utils';
import type {
  TweakSummary,
  RevertSummary,
  MoveCopyFileOrDirectoryToolResult,
  AppliedTweak,
  PreRevertCheckResult,
} from '../../interfaces/tweak-agent.interface';

/**
 * Service for reverting applied tweaks.
 * Orchestrates the revert process and handles cleanup.
 */
export class RevertService {
  /**
   * Pre-check for conflicts before attempting revert.
   * Returns information about potential conflicts and whether revert can proceed.
   *
   * @param tweak The applied tweak to check
   * @param allAppliedTweaks All currently applied tweaks (for conflict detection)
   * @returns PreRevertCheckResult with conflict info and proceed status
   */
  public static async preCheck(
    tweak: AppliedTweak,
    allAppliedTweaks: AppliedTweak[]
  ): Promise<PreRevertCheckResult> {
    // Step 1: Detect file conflicts with other applied tweaks
    const fileConflicts = detectFileConflicts(tweak, allAppliedTweaks);

    // Step 2: Verify our changes still exist in the files
    const contentCheck = await verifyChangesExist(tweak);

    // Step 3: Build blocked operations list
    const blockedOperations: Array<{ description: string; reason: string }> = [];
    for (const item of contentCheck.notFound) {
      const op = item.operation;
      const description = op.appendToEnd
        ? `Append "${op.newString.substring(0, 30)}${op.newString.length > 30 ? '...' : ''}"`
        : `Replace "${op.oldString.substring(0, 30)}${op.oldString.length > 30 ? '...' : ''}"`;
      blockedOperations.push({
        description,
        reason: `Content not found in ${item.filePath} - may have been modified externally`,
      });
    }

    // Step 4: Determine if revert can proceed
    if (!contentCheck.allFound) {
      return {
        canProceed: false,
        blockedReason: `Some changes were modified or removed after this tweak was applied.`,
        fileConflicts,
        blockedOperations,
      };
    }

    if (fileConflicts.length > 0) {
      return {
        canProceed: true,
        warning: `Other tweaks also modified these files, but your changes are intact and can be safely reverted.`,
        fileConflicts,
        blockedOperations: [],
      };
    }

    // No conflicts, proceed normally
    return {
      canProceed: true,
      fileConflicts: [],
      blockedOperations: [],
    };
  }

  /**
   * Execute a revert operation for a completed tweak
   * @param summary The TweakSummary from when the tweak was applied
   * @param cleanupBackups Whether to delete backup files after successful revert
   * @param useFallback If true, use backup restore instead of surgical revert for edit-file-tool
   * @returns RevertSummary with results of each operation
   */
  public static async execute(
    summary: TweakSummary,
    cleanupBackups = false,
    useFallback = false
  ): Promise<RevertSummary> {
    // Execute the revert operations
    const result = await revertTweak(summary, { useFallback });

    // Optionally clean up backup files after successful revert
    if (cleanupBackups && (result.status === 'success' || result.status === 'partial')) {
      await this.cleanupBackupFiles(summary);
    }

    return result;
  }

  /**
   * Clean up backup files created during the original tweak operation
   */
  private static async cleanupBackupFiles(summary: TweakSummary): Promise<void> {
    const backupPaths: string[] = [];

    // Collect all backup paths from tool calls
    for (const toolCall of summary.toolCalls) {
      const result = toolCall.result;

      // Check for backupPath in the result
      if ('backupPath' in result && result.backupPath) {
        backupPaths.push(result.backupPath);
      }

      // Handle move/copy operations which have results array with individual backupPaths
      if (toolCall.toolName === 'move-copy-file-or-directory-tool') {
        const moveResult = result as MoveCopyFileOrDirectoryToolResult;
        for (const r of moveResult.results) {
          if (r.backupPath) {
            backupPaths.push(r.backupPath);
          }
        }
      }
    }

    // Delete each backup file (ignore errors - best effort cleanup)
    for (const backupPath of backupPaths) {
      try {
        const expandedPath = expandWindowsEnvVars(backupPath);
        await fs.unlink(expandedPath);
      } catch {
        // Ignore errors - backup may already be deleted or inaccessible
      }
    }
  }
}
