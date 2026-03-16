import { createTool } from '../tool.factory';
import { z } from 'zod';
import { moveCopyFileOrDirectory } from './utils';
import { moveCopyFileOrDirectoryToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';

type Input = z.infer<typeof moveCopyFileOrDirectoryToolSchema.inputSchema>;

export const moveCopyFileOrDirectoryTool = createTool({
  ...moveCopyFileOrDirectoryToolSchema,
  execute: async (inputData) => {
    // @mastra/client-js may wrap input in { context: <input> } or pass directly
    const { operations } = inputData as unknown as Input;

    // Register tool and wait for user approval
    const { approved, toolId } = await ToolStatusService.registerToolForApproval(
      'move-copy-file-or-directory-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        path: operations[0]?.sourcePath || '',
        message: 'Tool execution declined by user',
        timestamp: new Date(),
        results: [],
        successfulOperations: 0,
        failedOperations: operations.length,
      };
    }

    // Mark as executing
    ToolStatusService.markExecuting(toolId);

    try {
      const result = await moveCopyFileOrDirectory({ operations });

      const summaryParts: string[] = [];

      for (let i = 0; i < result.results.length; i++) {
        const opResult = result.results[i];
        const wasCopy = operations[i]?.copyOnly === true;
        const action = wasCopy ? 'Copied' : 'Moved';
        if (opResult.success) {
          const backupNote = opResult.backupPath ? ` (backup: ${opResult.backupPath})` : '';
          summaryParts.push(`OK ${action}: ${opResult.sourcePath} -> ${opResult.destinationPath}${backupNote}`);
        } else {
          summaryParts.push(`FAIL: ${opResult.sourcePath} - ${opResult.error}`);
        }
      }

      const output = {
        success: result.failedOperations === 0,
        path: operations[0]?.sourcePath || '',
        message: `${result.successfulOperations}/${operations.length} operations succeeded\n${summaryParts.join('\n')}`,
        timestamp: new Date(),
        results: result.results,
        successfulOperations: result.successfulOperations,
        failedOperations: result.failedOperations,
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
        path: operations[0]?.sourcePath || '',
        message: `Failed to move: ${errorMessage}`,
        timestamp: new Date(),
        results: [],
        successfulOperations: 0,
        failedOperations: operations.length,
      };
    }
  },
});
