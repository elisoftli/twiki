/**
 * Install ReShade Tool
 *
 * Automates ReShade + addon installation to game directories.
 * Supports architecture detection, DLL conflict resolution, and safe reversion.
 */

import { createTool } from '../tool.factory';
import { z } from 'zod';
import { installReshade } from './utils';
import { installReshadeToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';
import { SettingsService } from '../../services/core/settings.service';

type Input = z.infer<typeof installReshadeToolSchema.inputSchema>;

export const installReshadeTool = createTool({
  ...installReshadeToolSchema,
  execute: async (inputData) => {
    const { addonFilePath, gameExePath, graphicsApi } = inputData as unknown as Input;

    // Register tool and wait for user approval FIRST
    // This allows the pre-flight check system to detect missing configuration
    // and prompt the user to configure it before approval
    const { approved, toolId } = await ToolStatusService.registerToolForApproval(
      'install-reshade-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        path: gameExePath,
        message: 'Tool execution declined by user',
        timestamp: new Date(),
        gameDirectory: '',
        installedFiles: [],
        actualDllName: '',
        detectedArchitecture: '64' as const,
        graphicsApi: graphicsApi ?? 'd3d11',
      };
    }

    // Mark as executing
    ToolStatusService.markExecuting(toolId);

    // Check ReShade installer path AFTER approval
    // By this point, if it wasn't configured, the pre-flight check dialog
    // would have prompted the user to configure it
    const reshadeInstallerPath = SettingsService.settings.graphicsMods?.reshadeInstallerPath;

    if (!reshadeInstallerPath) {
      const errorMessage =
        'ReShade installer path not configured. Please set the path to ReShade_Setup.exe in app settings.';
      ToolStatusService.updateToolResult(toolId, undefined, errorMessage);
      return {
        success: false,
        path: gameExePath,
        message: errorMessage,
        timestamp: new Date(),
        gameDirectory: '',
        installedFiles: [],
        actualDllName: '',
        detectedArchitecture: '64' as const,
        graphicsApi: graphicsApi ?? 'd3d11',
      };
    }

    try {
      const result = await installReshade({
        addonFilePath,
        gameExePath,
        graphicsApi,
        reshadeInstallerPath,
      });

      const output = {
        success: true,
        path: result.gameDirectory,
        message: `Installed ReShade (${result.actualDllName}) for ${result.graphicsApi.toUpperCase()} to ${result.gameDirectory}`,
        timestamp: new Date(),
        isRevertible: true,
        gameDirectory: result.gameDirectory,
        installedFiles: result.installedFiles,
        actualDllName: result.actualDllName,
        detectedArchitecture: result.detectedArchitecture,
        graphicsApi: result.graphicsApi,
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
        path: gameExePath,
        message: `Failed to install ReShade: ${errorMessage}`,
        timestamp: new Date(),
        gameDirectory: '',
        installedFiles: [],
        actualDllName: '',
        detectedArchitecture: '64' as const,
        graphicsApi: graphicsApi ?? 'd3d11',
      };
    }
  },
});
