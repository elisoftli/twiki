import { createTool } from '../tool.factory';
import { z } from 'zod';
import { createFile } from './utils';
import { createFileToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';

type Input = z.infer<typeof createFileToolSchema.inputSchema>;

export const createFileTool = createTool({
  ...createFileToolSchema,
  execute: async (inputData) => {
    const originalInput = inputData as unknown as Input;

    // Register tool and wait for user approval
    const { approved, toolId, modifiedArgs } = await ToolStatusService.registerToolForApproval(
      'create-file-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        path: originalInput.path,
        message: 'Tool execution declined by user',
        timestamp: new Date(),
        bytesWritten: 0,
      };
    }

    // Use modified args if provided (user edited content), otherwise original
    const effectiveInput = modifiedArgs ? (modifiedArgs as unknown as Input) : originalInput;
    const { path: filePath, content } = effectiveInput;

    const argsWereModified = modifiedArgs !== null;

    // Mark as executing
    ToolStatusService.markExecuting(toolId);

    try {
      const result = await createFile({ path: filePath, content });

      // Check if file already existed
      if (result.alreadyExists) {
        const output = {
          success: false,
          path: result.path,
          message: `File already exists. Use read tools to see its contents and then edit tools to modify the file.`,
          timestamp: new Date(),
          bytesWritten: 0,
        };

        ToolStatusService.updateToolResult(toolId, output, output.message);
        return output;
      }

      const output = {
        success: true,
        path: result.path,
        message: `Created file: ${result.path} (${result.bytesWritten} bytes)`,
        timestamp: new Date(),
        bytesWritten: result.bytesWritten,
        // Inform agent if user modified the args during approval
        argsWereModified,
        // Include the actual content used if user modified it
        ...(argsWereModified && { modifiedContent: content }),
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
        message: `Failed to create file: ${errorMessage}`,
        timestamp: new Date(),
        bytesWritten: 0,
      };
    }
  },
});
