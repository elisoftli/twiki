import { app } from 'electron';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { Settings } from '../interfaces';
import { ensureParentDirectoryExists, atomicWriteJson } from './json-store.utils';
import { createLogger } from './logger.utils';

const logger = createLogger('SettingsUtils');

/** Check if a path exists (async) */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class SettingsUtils {
  private static settingsPath: string;

  private static getSettingsPath(): string {
    if (!this.settingsPath) {
      const userDataPath = app.getPath('userData');
      this.settingsPath = join(userDataPath, 'settings.json');
    }
    return this.settingsPath;
  }

  private static getDefaultSettings(): Settings {
    return {
      isAutoUpdateEnabled: true,
      specsVisibility: {
        showOs: true,
        showCpu: true,
        showGpu: true,
        showDisplay: true,
      },
      theme: 'sunset-horizon',
      autoTweaker: {
        autoApproveReadOnly: false,
      },
      gamePage: {
        autoExpandTweaks: false,
      },
      graphicsMods: {},
      downloadBrowser: {},
      integrations: {
        nexusMods: {},
      },
      gameLibrary: {
        launchers: {
          steam: { enabled: true },
          xbox: { enabled: true },
        },
      },
      useBuiltInEditor: true,
      disableHardwareAcceleration: false,
    };
  }

  public static async readSettings(): Promise<Settings> {
    const settingsPath = this.getSettingsPath();

    try {
      if (!(await pathExists(settingsPath))) {
        // Create default settings if file doesn't exist
        const defaultSettings = this.getDefaultSettings();
        await this.writeSettings(defaultSettings);
        return defaultSettings;
      }

      const fileContent = await fs.readFile(settingsPath, 'utf-8');
      const loadedSettings = JSON.parse(fileContent) as Partial<Settings>;
      const defaults = this.getDefaultSettings();

      // Merge with defaults to ensure all properties exist
      // For gameLibrary.launchers, merge each launcher's settings individually
      const mergedLaunchers = { ...defaults.gameLibrary.launchers };
      if (loadedSettings.gameLibrary?.launchers) {
        for (const [launcher, settings] of Object.entries(loadedSettings.gameLibrary.launchers)) {
          mergedLaunchers[launcher] = {
            ...mergedLaunchers[launcher],
            ...settings,
          };
        }
      }

      return {
        ...defaults,
        ...loadedSettings,
        specsVisibility: {
          ...defaults.specsVisibility,
          ...loadedSettings.specsVisibility,
        },
        autoTweaker: {
          ...defaults.autoTweaker,
          ...loadedSettings.autoTweaker,
        },
        gamePage: {
          ...defaults.gamePage,
          ...loadedSettings.gamePage,
        },
        graphicsMods: {
          ...defaults.graphicsMods,
          ...loadedSettings.graphicsMods,
        },
        downloadBrowser: {
          ...defaults.downloadBrowser,
          ...loadedSettings.downloadBrowser,
        },
        integrations: {
          ...defaults.integrations,
          ...loadedSettings.integrations,
          nexusMods: {
            ...defaults.integrations.nexusMods,
            ...loadedSettings.integrations?.nexusMods,
          },
        },
        gameLibrary: {
          ...defaults.gameLibrary,
          ...loadedSettings.gameLibrary,
          launchers: mergedLaunchers,
        },
        windowBounds: loadedSettings.windowBounds,
      };
    } catch (error) {
      logger.error('Error reading settings file:', error);
      // Return default settings on error
      return this.getDefaultSettings();
    }
  }

  public static async writeSettings(settings: Settings): Promise<void> {
    try {
      const settingsPath = this.getSettingsPath();
      await ensureParentDirectoryExists(settingsPath);
      await atomicWriteJson(settingsPath, settings);
    } catch (error) {
      logger.error('Error writing settings file:', error);
      throw error;
    }
  }
}
