import { createTool } from '../tool.factory';
import { z } from 'zod';
import { readFileAroundPattern } from './utils';
import { readFileAroundPatternToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';

type Input = z.infer<typeof readFileAroundPatternToolSchema.inputSchema>;

export const readFileAroundPatternTool = createTool({
  ...readFileAroundPatternToolSchema,
  execute: async (inputData) => {
    const { path: filePath, searches } = inputData as unknown as Input;

    // Register tool and wait for user approval
    const { approved, toolId } = await ToolStatusService.registerToolForApproval(
      'read-file-around-pattern-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        path: filePath,
        message: 'Tool execution declined by user',
        timestamp: new Date(),
        results: [],
      };
    }

    // Mark as executing
    ToolStatusService.markExecuting(toolId);

    try {
      const result = await readFileAroundPattern({ path: filePath, searches });

      // Format a summary message (full content is in results)
      const found = result.results.filter((r) => r.found).length;
      const total = result.results.length;
      const summary =
        total === 1
          ? result.results[0].found
            ? `Found "${result.results[0].searchText}" at line ${result.results[0].matchedLine}`
            : `Pattern "${result.results[0].searchText}" not found`
          : `Found ${found}/${total} patterns`;

      const output = {
        success: true,
        path: result.path,
        message: summary,
        timestamp: new Date(),
        isRevertible: false,
        results: result.results,
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
        message: `Failed to read around patterns: ${errorMessage}`,
        timestamp: new Date(),
        results: [],
      };
    }
  },
});
