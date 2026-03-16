import { createTool } from '../tool.factory';
import { z } from 'zod';
import { extractArchive } from './utils';
import { extractArchiveToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';

type Input = z.infer<typeof extractArchiveToolSchema.inputSchema>;

export const extractArchiveTool = createTool({
  ...extractArchiveToolSchema,
  execute: async (inputData) => {
    const { archivePath, extractPath: customExtractPath } = inputData as unknown as Input;

    // Register tool and wait for user approval
    const { approved, toolId } = await ToolStatusService.registerToolForApproval(
      'extract-archive-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        path: archivePath,
        message: 'Tool execution declined by user',
        timestamp: new Date(),
        extractPath: '',
        extractedFiles: [],
      };
    }

    // Mark as executing
    ToolStatusService.markExecuting(toolId);

    try {
      const result = await extractArchive({ archivePath, extractPath: customExtractPath });

      const output = {
        success: true,
        path: result.path,
        message: `Extracted archive: ${result.path} → ${result.extractPath}`,
        timestamp: new Date(),
        isRevertible: true,
        extractPath: result.extractPath,
        extractedFiles: result.extractedFiles,
        fileTransfers: result.fileTransfers,
        directoriesCreated: result.directoriesCreated,
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
        message: `Failed to extract archive: ${errorMessage}`,
        timestamp: new Date(),
        extractPath: '',
        extractedFiles: [],
      };
    }
  },
});
