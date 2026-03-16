import { createTool } from '../tool.factory';
import { z } from 'zod';
import { editFile } from './utils';
import { editFileToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';

type Input = z.infer<typeof editFileToolSchema.inputSchema>;

export const editFileTool = createTool({
  ...editFileToolSchema,
  execute: async (inputData) => {
    const originalInput = inputData as unknown as Input;

    // Register tool and wait for user approval
    const { approved, toolId, modifiedArgs } = await ToolStatusService.registerToolForApproval(
      'edit-file-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        path: originalInput.path,
        message: 'Tool execution declined by user',
        timestamp: new Date(),
        backupPath: '',
        operationsApplied: [],
      };
    }

    // Use modified args if provided (user edited content), otherwise original
    const effectiveInput = modifiedArgs ? (modifiedArgs as unknown as Input) : originalInput;
    const { path: filePath, operations, dryRun, expectedFileHash } = effectiveInput;

    // Mark as executing
    ToolStatusService.markExecuting(toolId);

    try {
      const result = await editFile({ path: filePath, operations, dryRun, expectedFileHash });

      const argsWereModified = modifiedArgs !== null;
      const failedCount = result.operationsFailed?.length ?? 0;
      const appliedCount = result.operationsApplied.length;

      // Build message based on results
      let message: string;
      if (result.wasDryRun) {
        message = `Dry run: ${appliedCount} operation(s) would succeed`;
        if (failedCount > 0) {
          message += `, ${failedCount} would fail`;
        }
      } else {
        message = `Applied ${appliedCount} operation(s) to file`;
        if (result.backupPath) {
          message += ` (backup: ${result.backupPath})`;
        }
        if (failedCount > 0) {
          message += `. ${failedCount} operation(s) failed.`;
        }
      }

      const output = {
        success: failedCount === 0,
        path: result.path,
        message,
        timestamp: new Date(),
        backupPath: result.backupPath,
        operationsApplied: result.operationsApplied,
        operationsFailed: result.operationsFailed,
        wasDryRun: result.wasDryRun,
        // Pass through fileHashes from utility result for recipe storage
        fileHashes: result.fileHashes,
        // Inform agent if user modified the args during approval
        argsWereModified,
      };

      // Update with result
      ToolStatusService.updateToolResult(toolId, output);

      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update with error
      ToolStatusService.updateToolResult(toolId, undefined, errorMessage);

      return {
        success: false,
        path: filePath,
        message: `Failed to modify file: ${errorMessage}`,
        timestamp: new Date(),
        backupPath: '',
        operationsApplied: [],
      };
    }
  },
});
