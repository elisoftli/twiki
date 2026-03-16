import { createTool } from '../tool.factory';
import { z } from 'zod';
import { listDirectoryContents } from './utils';
import { listDirectoryContentsToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';

type Input = z.infer<typeof listDirectoryContentsToolSchema.inputSchema>;

/**
 * Read-only tool - requires approval for testing
 */
export const listDirectoryContentsTool = createTool({
  ...listDirectoryContentsToolSchema,
  execute: async (inputData) => {
    // @mastra/client-js may wrap input in { context: <input> } or pass directly
    const { path: dirPath, depth = 5, fileNameSearch } = inputData as unknown as Input;

    // Register tool and wait for user approval
    const { approved, toolId } = await ToolStatusService.registerToolForApproval(
      'list-directory-contents-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        path: dirPath,
        message: 'Tool execution declined by user',
        timestamp: new Date(),
        files: [],
        totalFiles: 0,
        totalDirectories: 0,
        truncated: false,
      };
    }

    // Mark as executing
    ToolStatusService.markExecuting(toolId);

    try {
      const result = await listDirectoryContents({ path: dirPath, depth, fileNameSearch });

      const searchInfo = fileNameSearch ? ` (filtered by: "${fileNameSearch}")` : '';
      const truncatedInfo = result.truncated ? ' (truncated - use fileNameSearch to narrow results)' : '';

      const output = {
        success: true,
        path: result.path,
        message: `Found ${result.totalFiles} file(s) and ${result.totalDirectories} director(ies)${searchInfo}${truncatedInfo}`,
        timestamp: new Date(),
        isRevertible: false,
        files: result.files,
        totalFiles: result.totalFiles,
        totalDirectories: result.totalDirectories,
        truncated: result.truncated,
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
        path: dirPath,
        message: `Failed to list files: ${errorMessage}`,
        timestamp: new Date(),
        files: [],
        totalFiles: 0,
        totalDirectories: 0,
        truncated: false,
      };
    }
  },
});
