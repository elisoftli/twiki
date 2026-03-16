import { autoUpdater, type UpdateInfo } from 'electron-updater';
import { is } from '@electron-toolkit/utils';
import { UpdaterStatus } from '../../interfaces/updater-status.interface';
import { MainWindow } from '../../windows';
import { createLogger } from '../../utils/logger.utils';
import { EnvService } from '../core/env.service';

const logger = createLogger('UpdaterService');

const MOCK_UPDATE_INFO: UpdateInfo = {
  version: '99.0.0',
  releaseDate: new Date().toISOString(),
  files: [],
  path: '',
  sha512: '',
  releaseNotes: `- **Improved performance** - Faster loading times and smoother animations
- **Bug fixes** - Resolved various issues reported by users
- **New features** - Added support for more games

### Detailed Changes

1. Fixed crash when applying certain registry tweaks
2. Improved ReShade installation reliability
3. Added new settings for customization
4. Updated dependencies for better security
`,
};

/**
 * Extract release notes as a string from UpdateInfo.
 * Release notes can be a string, array of ReleaseNoteInfo, or null/undefined.
 */
function extractReleaseNotes(info: UpdateInfo): string | null {
  if (!info.releaseNotes) return null;

  // If it's a string, return directly
  if (typeof info.releaseNotes === 'string') {
    return info.releaseNotes;
  }

  // If it's an array of ReleaseNoteInfo objects, concatenate their notes
  if (Array.isArray(info.releaseNotes)) {
    return info.releaseNotes
      .map((note) => (typeof note === 'string' ? note : note.note))
      .filter(Boolean)
      .join('\n\n');
  }

  return null;
}

export class UpdaterService {
  private static _instance: UpdaterService | null = null;

  private readonly _status: UpdaterStatus = {
    isCheckingForUpdates: false,
    isDownloadingUpdate: false,
    isUpdateReadyToInstall: false,
    isError: false,
    errorMessage: null,
    releaseNotes: null,
    updateVersion: null,
  };
  public didUpdateAndRelaunch = false;

  public get status(): UpdaterStatus {
    return this._status;
  }

  private constructor() {
    autoUpdater.logger = logger;
    autoUpdater.autoInstallOnAppQuit = !is.dev;
    autoUpdater.forceDevUpdateConfig = is.dev;

    autoUpdater.on('checking-for-update', () => {
      this._status.isCheckingForUpdates = true;
      this._status.isError = false;
      this._status.errorMessage = null;
      this.sendStatusToMainWindow();
    });
    autoUpdater.on('download-progress', () => {
      this._status.isDownloadingUpdate = true;
      this.sendStatusToMainWindow();
    });
    autoUpdater.on('update-downloaded', () => {
      this._status.isDownloadingUpdate = false;
      this._status.isUpdateReadyToInstall = true;
      this.sendStatusToMainWindow();
    });
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this._status.isCheckingForUpdates = false;
      this._status.isDownloadingUpdate = true; // Download starts automatically (autoDownload is enabled)
      this._status.updateVersion = info.version;
      this._status.releaseNotes = extractReleaseNotes(info);
      logger.debug(`Update available: v${info.version}`);
      if (this._status.releaseNotes) {
        logger.debug('Release notes available');
      }
      this.sendStatusToMainWindow();
    });
    autoUpdater.on('update-not-available', () => {
      this._status.isCheckingForUpdates = false;
      this.sendStatusToMainWindow();
    });
    autoUpdater.on('error', (error: Error) => {
      this._status.isCheckingForUpdates = false;
      this._status.isDownloadingUpdate = false;
      this._status.isError = true;
      this._status.errorMessage = error.message || 'An unknown error occurred';
      logger.error('Update error:', error.message);
      this.sendStatusToMainWindow();
    });
  }

  /**
   * Initialize the UpdaterService singleton. Should only be called once during app startup.
   */
  public static initialize(): UpdaterService {
    if (UpdaterService._instance) {
      throw new Error('UpdaterService has already been initialized');
    }
    UpdaterService._instance = new UpdaterService();
    return UpdaterService._instance;
  }

  /**
   * Get the UpdaterService singleton instance.
   * @throws Error if UpdaterService has not been initialized
   */
  public static getInstance(): UpdaterService {
    if (!UpdaterService._instance) {
      throw new Error('UpdaterService has not been initialized. Call UpdaterService.initialize() first.');
    }
    return UpdaterService._instance;
  }

  public sendStatusToMainWindow(): void {
    try {
      MainWindow.getInstance().sendEvent('updater:status-updated', this.status);
    } catch {
      // Window may be destroyed during app update/restart — safe to ignore
    }
  }

  public async checkForUpdates(): Promise<void> {
    this._status.isError = false;
    this._status.errorMessage = null;

    // In development with mock update flag, simulate update flow
    if (is.dev && EnvService.get('MOCK_UPDATE')) {
      await this.simulateMockUpdate();
      return;
    }

    await autoUpdater.checkForUpdates();
  }

  /**
   * Simulate the update flow for development testing.
   */
  private async simulateMockUpdate(): Promise<void> {
    logger.info('Simulating mock update for development testing');

    // Simulate checking
    this._status.isCheckingForUpdates = true;
    this.sendStatusToMainWindow();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simulate update available + download starting (matches real autoDownload behavior)
    this._status.isCheckingForUpdates = false;
    this._status.isDownloadingUpdate = true;
    this._status.updateVersion = MOCK_UPDATE_INFO.version;
    this._status.releaseNotes = extractReleaseNotes(MOCK_UPDATE_INFO);
    this.sendStatusToMainWindow();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Simulate download complete
    this._status.isDownloadingUpdate = false;
    this._status.isUpdateReadyToInstall = true;
    this.sendStatusToMainWindow();

    logger.info('Mock update ready to install');
  }

  public updateAndRelaunch(): void {
    this.didUpdateAndRelaunch = true;
    autoUpdater.quitAndInstall(true, true);
  }

  /**
   * Retry checking for updates (after an error).
   */
  public async retry(): Promise<void> {
    this._status.isError = false;
    this._status.errorMessage = null;
    await this.checkForUpdates();
  }
}
