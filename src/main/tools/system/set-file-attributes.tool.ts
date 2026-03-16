import { createTool } from '../tool.factory';
import { z } from 'zod';
import { setFileAttributes } from './utils';
import { setFileAttributesToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';

type Input = z.infer<typeof setFileAttributesToolSchema.inputSchema>;

export const setFileAttributesTool = createTool({
  ...setFileAttributesToolSchema,
  execute: async (inputData) => {
    const { filePath, readOnly, hidden, system, archive } = inputData as unknown as Input;

    // Register tool and wait for user approval
    const { approved, toolId } = await ToolStatusService.registerToolForApproval(
      'set-file-attributes-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        path: filePath,
        message: 'Tool execution declined by user',
        timestamp: new Date(),
        attributes: [],
      };
    }

    // Mark as executing
    ToolStatusService.markExecuting(toolId);

    try {
      const result = await setFileAttributes({
        filePath,
        readOnly,
        hidden,
        system,
        archive,
      });

      const output = {
        success: true,
        path: result.path,
        message: `Successfully set file attributes: ${result.attributes.join(', ')}`,
        timestamp: new Date(),
        attributes: result.attributes,
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
        message: `Failed to set file attributes: ${errorMessage}`,
        timestamp: new Date(),
        attributes: [],
      };
    }
  },
});
