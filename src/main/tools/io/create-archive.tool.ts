import { createTool } from '../tool.factory';
import { z } from 'zod';
import { createArchive } from './utils';
import { createArchiveToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';

type Input = z.infer<typeof createArchiveToolSchema.inputSchema>;

export const createArchiveTool = createTool({
  ...createArchiveToolSchema,
  execute: async (inputData) => {
    const { sourcePath, archivePath, cleanupSource = true } = inputData as unknown as Input;

    // Register tool and wait for user approval
    const { approved, toolId } = await ToolStatusService.registerToolForApproval(
      'create-archive-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        path: archivePath,
        message: 'Tool execution declined by user',
        timestamp: new Date(),
        sourceCleanedUp: false,
      };
    }

    // Mark as executing
    ToolStatusService.markExecuting(toolId);

    try {
      const result = await createArchive({ sourcePath, archivePath, cleanupSource });

      const backupMsg = result.backupPath ? ` (backup: ${result.backupPath})` : '';
      const cleanupMsg = result.sourceCleanedUp ? ', source cleaned up' : ', source preserved';

      const output = {
        success: true,
        path: result.path,
        message: `Created archive: ${result.path}${backupMsg}${cleanupMsg}`,
        timestamp: new Date(),
        backupPath: result.backupPath,
        sourceCleanedUp: result.sourceCleanedUp,
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
        path: archivePath,
        message: `Failed to create archive: ${errorMessage}`,
        timestamp: new Date(),
        sourceCleanedUp: false,
      };
    }
  },
});
