import { createTool } from '../tool.factory';
import { z } from 'zod';
import { readFile } from './utils';
import { readFileToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';

type Input = z.infer<typeof readFileToolSchema.inputSchema>;

export const readFileTool = createTool({
  ...readFileToolSchema,
  execute: async (inputData) => {
    const { path: filePath, startLine, endLine } = inputData as unknown as Input;

    // Register tool and wait for user approval
    const { approved, toolId } = await ToolStatusService.registerToolForApproval(
      'read-file-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        path: filePath,
        message: 'Tool execution declined by user',
        timestamp: new Date(),
        content: '',
        lineCount: 0,
        sizeBytes: 0,
      };
    }

    // Mark as executing
    ToolStatusService.markExecuting(toolId);

    try {
      const result = await readFile({ path: filePath, startLine, endLine });

      // Format content with line numbers for display
      // Line numbers start from startLine (or 1 if not specified)
      const startLineNum = result.startLine ?? 1;
      const numberedContent = result.content
        .split('\n')
        .map((line, index) => `${String(startLineNum + index).padStart(4, ' ')}: ${line}`)
        .join('\n');

      const output = {
        success: true,
        path: result.path,
        message: numberedContent,
        timestamp: new Date(),
        isRevertible: false,
        content: result.content,
        lineCount: result.lineCount,
        sizeBytes: result.sizeBytes,
        startLine: result.startLine,
        endLine: result.endLine,
        totalLines: result.totalLines,
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
        message: `Failed to read file: ${errorMessage}`,
        timestamp: new Date(),
        content: '',
        lineCount: 0,
        sizeBytes: 0,
      };
    }
  },
});
