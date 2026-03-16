import type { Settings } from '../../interfaces';
import { SettingsUtils } from '../../utils';
import { createLogger } from '../../utils/logger.utils';

const logger = createLogger('SettingsService');

export class SettingsService {
  private static _settings: Settings | null = null;
  private static listeners: ((prevSettings: Settings, updatedSettings: Settings) => void)[] = [];

  /**
   * Initialize the settings service by loading settings from disk.
   * Must be called before accessing settings.
   */
  public static async initialize(): Promise<void> {
    if (this._settings) {
      return; // Already initialized
    }
    this._settings = await SettingsUtils.readSettings();
    logger.info('Settings loaded');
  }

  public static get settings(): Settings {
    if (!this._settings) {
      throw new Error('SettingsService not initialized. Call initialize() first.');
    }
    return this._settings;
  }

  private static set settings(settings: Settings) {
    this._settings = settings;
  }

  public static async updateSettings(updatedSettings: Partial<Settings>): Promise<void> {
    const prevSettings = { ...this.settings };
    this.settings = { ...this.settings, ...updatedSettings };
    this.listeners.forEach((listener) => listener(prevSettings, this.settings));

    await SettingsUtils.writeSettings(this.settings);
    logger.debug('Settings updated');
  }

  public static addSettingsChangeListener(listener: (prevSettings: Settings, updatedSettings: Settings) => void): void {
    this.listeners.push(listener);
  }

  public static removeSettingsChangeListener(
    listener: (prevSettings: Settings, updatedSettings: Settings) => void
  ): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
}
