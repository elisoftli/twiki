import { createTool } from '../tool.factory';
import { z } from 'zod';
import { modifyGameLaunchOptions } from './utils';
import { modifyGameLaunchOptionsToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';

type Input = z.infer<typeof modifyGameLaunchOptionsToolSchema.inputSchema>;

export const modifyGameLaunchOptionsTool = createTool({
  ...modifyGameLaunchOptionsToolSchema,
  execute: async (inputData) => {
    // Cast to Input type - workaround for mastra client-js type mismatch
    const { launcher, gameId, launchOptions, skipBackup = false } = inputData as unknown as Input;

    // Register tool and wait for user approval
    const { approved, toolId } = await ToolStatusService.registerToolForApproval(
      'modify-game-launch-options-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        path: '',
        message: 'Tool execution declined by user',
        timestamp: new Date(),
        launcher,
        modificationDetails: '',
      };
    }

    // Mark as executing
    ToolStatusService.markExecuting(toolId);

    try {
      const result = await modifyGameLaunchOptions({
        launcher,
        gameId,
        launchOptions,
        skipBackup,
      });

      const backupMsg = result.backupPath ? ` (backup: ${result.backupPath})` : '';
      const output = {
        success: true,
        path: result.path,
        message: `Modified ${launcher} launch options for game ${gameId}: ${result.modificationDetails}${backupMsg}`,
        timestamp: new Date(),
        launcher: result.launcher,
        backupPath: result.backupPath,
        modificationDetails: result.modificationDetails,
        // Manual game specific fields for revert
        originalArgs: result.originalArgs,
        shortcutCreated: result.shortcutCreated,
        gameId: result.gameId,
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
        path: '',
        message: `Failed to modify ${launcher} launch options: ${errorMessage}`,
        timestamp: new Date(),
        launcher,
        modificationDetails: '',
      };
    }
  },
});
