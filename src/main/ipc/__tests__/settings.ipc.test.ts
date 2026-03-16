/**
 * Settings IPC Handler Tests
 *
 * Tests the settings IPC handlers including:
 * - Get settings
 * - Update settings
 * - Pick ReShade installer
 * - Relaunch app
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Settings } from '../../interfaces';

// Store registered handlers for testing
const registeredHandlers: Map<string, Function> = new Map();
const registeredListeners: Map<string, Function> = new Map();

// Mock ipc-handler.factory
vi.mock('../ipc-handler.factory', () => ({
  createIpcHandlers: (configs: Array<{ channel: string; handler: Function }>) => {
    for (const config of configs) {
      registeredHandlers.set(config.channel, config.handler);
    }
  },
  createIpcListeners: (configs: Array<{ channel: string; handler: Function }>) => {
    for (const config of configs) {
      registeredListeners.set(config.channel, config.handler);
    }
  },
}));

// Mock electron - use inline object to avoid hoisting issues
vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn(),
  },
  app: {
    relaunch: vi.fn(),
    exit: vi.fn(),
  },
}));

// Mock @electron-toolkit/utils
vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false },
}));

// Mock SettingsService
vi.mock('../../services/core/settings.service', () => ({
  SettingsService: {
    settings: {
      theme: 'dark',
      graphicsMods: {
        reshadeInstallerPath: null,
      },
    },
    updateSettings: vi.fn(),
  },
}));

// Mock validateReshadeInstaller
vi.mock('../../tools/graphics-mods/utils/install-reshade.utils', () => ({
  validateReshadeInstaller: vi.fn(),
}));

// Import after mocks
import { setupSettingsIpc } from '../settings.ipc';
import { SettingsService } from '../../services/core/settings.service';
import { validateReshadeInstaller } from '../../tools/graphics-mods/utils/install-reshade.utils';
import { dialog, app } from 'electron';

// Helper to invoke a registered handler
const invokeHandler = async (channel: string, args?: unknown) => {
  const handler = registeredHandlers.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  const mockEvent = { sender: {} };
  return handler(mockEvent, args);
};

// Helper to invoke a registered listener
const invokeListener = async (channel: string, args?: unknown) => {
  const handler = registeredListeners.get(channel);
  if (!handler) {
    throw new Error(`No listener registered for channel: ${channel}`);
  }
  const mockEvent = { sender: {} };
  return handler(mockEvent, args);
};

// =============================================================================
// Tests
// =============================================================================

describe('Settings IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers.clear();
    registeredListeners.clear();
    setupSettingsIpc();
  });

  describe('get-settings', () => {
    it('should return current settings', async () => {
      const result = await invokeHandler('get-settings');

      expect(result).toBe(SettingsService.settings);
    });
  });

  describe('settings:pick-reshade-installer', () => {
    it('should return success:false when dialog is canceled', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const result = await invokeHandler('settings:pick-reshade-installer');

      expect(result).toEqual({ success: false });
      expect(validateReshadeInstaller).not.toHaveBeenCalled();
    });

    it('should return success:false when no file selected', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: [],
      });

      const result = await invokeHandler('settings:pick-reshade-installer');

      expect(result).toEqual({ success: false });
    });

    it('should return error when validation fails', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['C:\\Downloads\\not-reshade.exe'],
      });
      vi.mocked(validateReshadeInstaller).mockResolvedValue({
        valid: false,
        error: 'Not a valid ReShade installer',
      });

      const result = await invokeHandler('settings:pick-reshade-installer');

      expect(result).toEqual({
        success: false,
        error: 'Not a valid ReShade installer',
      });
      expect(SettingsService.updateSettings).not.toHaveBeenCalled();
    });

    it('should save path and return success when validation passes', async () => {
      const installerPath = 'C:\\Downloads\\ReShade_Setup.exe';
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: [installerPath],
      });
      vi.mocked(validateReshadeInstaller).mockResolvedValue({ valid: true });

      const result = await invokeHandler('settings:pick-reshade-installer');

      expect(result).toEqual({ success: true, path: installerPath });
      expect(SettingsService.updateSettings).toHaveBeenCalledWith({
        graphicsMods: {
          ...SettingsService.settings.graphicsMods,
          reshadeInstallerPath: installerPath,
        },
      });
    });

    it('should show dialog with correct filters', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      await invokeHandler('settings:pick-reshade-installer');

      expect(dialog.showOpenDialog).toHaveBeenCalledWith({
        title: 'Select ReShade Installer',
        filters: [
          { name: 'ReShade Installer', extensions: ['exe'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
    });
  });

  describe('update-settings', () => {
    it('should call updateSettings with provided settings', async () => {
      const newSettings: Partial<Settings> = { theme: 'light' } as Partial<Settings>;

      await invokeListener('update-settings', newSettings);

      expect(SettingsService.updateSettings).toHaveBeenCalledWith(newSettings);
    });
  });

  describe('relaunch-app', () => {
    it('should relaunch and exit app in production', async () => {
      await invokeListener('relaunch-app');

      expect(app.relaunch).toHaveBeenCalled();
      expect(app.exit).toHaveBeenCalled();
    });
  });
});
