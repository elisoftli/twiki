import { createTool } from '../tool.factory';
import { z } from 'zod';
import { setProcessAffinity } from './utils';
import { setProcessAffinityToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';

type Input = z.infer<typeof setProcessAffinityToolSchema.inputSchema>;

export const setProcessAffinityTool = createTool({
  ...setProcessAffinityToolSchema,
  execute: async (inputData) => {
    const { processName, affinityMask, waitForProcess = true, maxWaitSeconds = 30 } = inputData as unknown as Input;

    // Register tool and wait for user approval
    const { approved, toolId } = await ToolStatusService.registerToolForApproval(
      'set-process-affinity-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        message: 'Tool execution declined by user',
        timestamp: new Date(),
      };
    }

    // Mark as executing
    ToolStatusService.markExecuting(toolId);

    try {
      const result = await setProcessAffinity({ processName, affinityMask, waitForProcess, maxWaitSeconds });
      const processNameWithExe = processName.endsWith('.exe') ? processName : `${processName}.exe`;
      const affinityDesc = affinityMask !== undefined
        ? `mask 0x${result.affinityMask.toString(16).toUpperCase()}`
        : `all ${result.numCPUs} cores`;

      const output = {
        success: true,
        message: `Successfully set processor affinity for ${processNameWithExe} to ${affinityDesc}`,
        timestamp: new Date(),
        isRevertible: false,
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
        message: `Failed to set process affinity: ${errorMessage}`,
        timestamp: new Date(),
      };
    }
  },
});
