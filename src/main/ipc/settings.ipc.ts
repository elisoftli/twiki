/**
 * Settings IPC Handlers
 *
 * Handles IPC operations for application settings:
 * - Getting and updating settings
 * - App relaunch
 * - ReShade installer file picker
 */

import { is } from '@electron-toolkit/utils';
import { app, dialog } from 'electron';
import type { Settings } from '../interfaces';
import { SettingsService } from '../services/core/settings.service';
import { validateReshadeInstaller } from '../tools/graphics-mods/utils/install-reshade.utils';
import { createIpcHandlers, createIpcListeners } from './ipc-handler.factory';

export interface PickReshadeInstallerResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Setup settings-related IPC handlers.
 */
export function setupSettingsIpc(): void {
  createIpcHandlers([
    { channel: 'get-settings', handler: () => SettingsService.settings },
    {
      channel: 'settings:pick-reshade-installer',
      handler: async (): Promise<PickReshadeInstallerResult> => {
        const result = await dialog.showOpenDialog({
          title: 'Select ReShade Installer',
          filters: [
            { name: 'ReShade Installer', extensions: ['exe'] },
            { name: 'All Files', extensions: ['*'] },
          ],
          properties: ['openFile'],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false };
        }

        const selectedPath = result.filePaths[0];

        // Validate that it's a valid ReShade installer
        const validation = await validateReshadeInstaller(selectedPath);
        if (!validation.valid) {
          return {
            success: false,
            error: validation.error,
          };
        }

        // Save to settings
        SettingsService.updateSettings({
          graphicsMods: {
            ...SettingsService.settings.graphicsMods,
            reshadeInstallerPath: selectedPath,
          },
        });

        return { success: true, path: selectedPath };
      },
    },
  ]);

  createIpcListeners([
    {
      channel: 'update-settings',
      handler: (_, settings: Partial<Settings>) => SettingsService.updateSettings(settings),
    },
    {
      channel: 'relaunch-app',
      handler: () => {
        if (!is.dev) {
          app.relaunch();
        }
        app.exit();
      },
    },
  ]);
}
