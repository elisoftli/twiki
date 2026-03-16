import { createTool } from '../tool.factory';
import { z } from 'zod';
import { readEditRegistry } from './utils';
import { readEditRegistryToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';

type Input = z.infer<typeof readEditRegistryToolSchema.inputSchema>;

export const readEditRegistryTool = createTool({
  ...readEditRegistryToolSchema,
  execute: async (inputData) => {
    const { operations } = inputData as unknown as Input;

    // Use the first operation's keyPath as the primary path for the response
    const primaryPath = operations[0]?.keyPath ?? '';

    // Register tool and wait for user approval
    const { approved, toolId } = await ToolStatusService.registerToolForApproval(
      'read-edit-registry-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        path: primaryPath,
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
      const result = await readEditRegistry({ operations });

      const summaryParts: string[] = [];
      for (const opResult of result.results) {
        if (opResult.success) {
          if (opResult.operationType === 'read') {
            const valueDisplay =
              opResult.value !== null && opResult.value !== undefined
                ? `"${opResult.value}" (${opResult.valueType})`
                : 'not found';
            summaryParts.push(`✓ Read ${opResult.valueName} from ${opResult.keyPath}: ${valueDisplay}`);
          } else if (opResult.operationType === 'set') {
            const prevDisplay =
              opResult.previousValue !== null && opResult.previousValue !== undefined
                ? ` (was: ${opResult.previousValue})`
                : opResult.previousValue === null
                  ? ' (new)'
                  : '';
            summaryParts.push(`✓ Set ${opResult.valueName} in ${opResult.keyPath}${prevDisplay}`);
          } else if (opResult.operationType === 'delete') {
            const prevDisplay =
              opResult.previousValue !== null && opResult.previousValue !== undefined
                ? ` (was: ${opResult.previousValue})`
                : '';
            summaryParts.push(`✓ Deleted ${opResult.valueName} from ${opResult.keyPath}${prevDisplay}`);
          }
        } else {
          summaryParts.push(`✗ Failed ${opResult.operationType} ${opResult.valueName}: ${opResult.error}`);
        }
      }

      // Check if any modifying operations were performed (set or delete, not read)
      const hasModifyingOperations = operations.some((op) => op.operationType !== 'read');

      const output = {
        success: result.failedOperations === 0,
        path: primaryPath,
        message: `${result.successfulOperations}/${operations.length} registry operations succeeded\n${summaryParts.join('\n')}`,
        timestamp: new Date(),
        isRevertible: hasModifyingOperations,
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
        path: primaryPath,
        message: `Failed registry operation: ${errorMessage}`,
        timestamp: new Date(),
        results: [],
        successfulOperations: 0,
        failedOperations: operations.length,
      };
    }
  },
});
