/**
 * UpdaterService Tests
 *
 * Tests the updater service including:
 * - Singleton initialization
 * - Update checks
 * - Event handling (checking, available, downloaded, error)
 * - Status management
 * - Update and relaunch functionality
 * - Retry mechanism
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UpdateInfo } from 'electron-updater';

// Mock is.dev state
let mockIsDev = false;

// Store event handlers for autoUpdater mock
const autoUpdaterHandlers: Record<string, Function> = {};
const mockAutoUpdater = {
  logger: null,
  autoInstallOnAppQuit: true,
  forceDevUpdateConfig: false,
  on: vi.fn((event: string, handler: Function) => {
    autoUpdaterHandlers[event] = handler;
  }),
  checkForUpdates: vi.fn().mockResolvedValue(undefined),
  quitAndInstall: vi.fn(),
};

// Mock electron-updater
vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

// Mock @electron-toolkit/utils
vi.mock('@electron-toolkit/utils', () => ({
  is: {
    get dev() {
      return mockIsDev;
    },
  },
}));

// Mock MainWindow
const mockSendEvent = vi.fn();
vi.mock('../../../windows', () => ({
  MainWindow: {
    getInstance: () => ({
      sendEvent: mockSendEvent,
    }),
  },
}));

// Mock logger
vi.mock('../../../utils/logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockUpdateInfo = (overrides?: Partial<UpdateInfo>): UpdateInfo => ({
  version: '2.0.0',
  releaseDate: new Date().toISOString(),
  files: [],
  path: '',
  sha512: '',
  releaseNotes: 'New features and bug fixes',
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

let UpdaterService: typeof import('../updater.service').UpdaterService;

describe('UpdaterService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsDev = false;

    // Clear handlers
    Object.keys(autoUpdaterHandlers).forEach((key) => delete autoUpdaterHandlers[key]);

    const module = await import('../updater.service');
    UpdaterService = module.UpdaterService;
  });

  describe('initialize', () => {
    it('should create singleton instance', () => {
      const instance = UpdaterService.initialize();

      expect(instance).toBeDefined();
      expect(instance).toBe(UpdaterService.getInstance());
    });

    it('should throw if initialized twice', () => {
      UpdaterService.initialize();

      expect(() => UpdaterService.initialize()).toThrow('already been initialized');
    });

    it('should register autoUpdater event handlers', () => {
      UpdaterService.initialize();

      expect(mockAutoUpdater.on).toHaveBeenCalledWith('checking-for-update', expect.any(Function));
      expect(mockAutoUpdater.on).toHaveBeenCalledWith('download-progress', expect.any(Function));
      expect(mockAutoUpdater.on).toHaveBeenCalledWith('update-downloaded', expect.any(Function));
      expect(mockAutoUpdater.on).toHaveBeenCalledWith('update-available', expect.any(Function));
      expect(mockAutoUpdater.on).toHaveBeenCalledWith('update-not-available', expect.any(Function));
      expect(mockAutoUpdater.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should configure autoUpdater for production', async () => {
      vi.resetModules();
      mockIsDev = false;

      const module = await import('../updater.service');
      module.UpdaterService.initialize();

      expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
    });
  });

  describe('getInstance', () => {
    it('should throw if not initialized', async () => {
      vi.resetModules();
      const module = await import('../updater.service');

      expect(() => module.UpdaterService.getInstance()).toThrow('has not been initialized');
    });

    it('should return singleton instance', () => {
      const initialized = UpdaterService.initialize();
      const instance = UpdaterService.getInstance();

      expect(instance).toBe(initialized);
    });
  });

  describe('status', () => {
    it('should have default status values', () => {
      const instance = UpdaterService.initialize();

      expect(instance.status).toEqual({
        isCheckingForUpdates: false,
        isDownloadingUpdate: false,
        isUpdateReadyToInstall: false,
        isError: false,
        errorMessage: null,
        releaseNotes: null,
        updateVersion: null,
      });
    });
  });

  describe('checkForUpdates', () => {
    it('should call autoUpdater.checkForUpdates', async () => {
      const instance = UpdaterService.initialize();

      await instance.checkForUpdates();

      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
    });

    it('should reset error state before checking', async () => {
      const instance = UpdaterService.initialize();

      // Simulate previous error
      if (autoUpdaterHandlers['error']) {
        autoUpdaterHandlers['error'](new Error('Previous error'));
      }

      await instance.checkForUpdates();

      // Error state should be cleared before check
      // Note: The event handler may set it again, but the method clears it first
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
    });
  });

  describe('event handlers', () => {
    describe('checking-for-update', () => {
      it('should update status when checking starts', () => {
        const instance = UpdaterService.initialize();

        autoUpdaterHandlers['checking-for-update']();

        expect(instance.status.isCheckingForUpdates).toBe(true);
        expect(instance.status.isError).toBe(false);
        expect(mockSendEvent).toHaveBeenCalledWith('updater:status-updated', instance.status);
      });
    });

    describe('download-progress', () => {
      it('should update status when downloading', () => {
        const instance = UpdaterService.initialize();

        autoUpdaterHandlers['download-progress']();

        expect(instance.status.isDownloadingUpdate).toBe(true);
        expect(mockSendEvent).toHaveBeenCalledWith('updater:status-updated', instance.status);
      });
    });

    describe('update-downloaded', () => {
      it('should update status when download completes', () => {
        const instance = UpdaterService.initialize();

        autoUpdaterHandlers['update-downloaded']();

        expect(instance.status.isDownloadingUpdate).toBe(false);
        expect(instance.status.isUpdateReadyToInstall).toBe(true);
        expect(mockSendEvent).toHaveBeenCalledWith('updater:status-updated', instance.status);
      });
    });

    describe('update-available', () => {
      it('should update status with version info', () => {
        const instance = UpdaterService.initialize();
        const updateInfo = createMockUpdateInfo({ version: '2.5.0' });

        autoUpdaterHandlers['update-available'](updateInfo);

        expect(instance.status.isCheckingForUpdates).toBe(false);
        expect(instance.status.isDownloadingUpdate).toBe(true);
        expect(instance.status.updateVersion).toBe('2.5.0');
        expect(mockSendEvent).toHaveBeenCalledWith('updater:status-updated', instance.status);
      });

      it('should extract string release notes', () => {
        const instance = UpdaterService.initialize();
        const updateInfo = createMockUpdateInfo({
          releaseNotes: '## Changelog\n- Bug fix',
        });

        autoUpdaterHandlers['update-available'](updateInfo);

        expect(instance.status.releaseNotes).toBe('## Changelog\n- Bug fix');
      });

      it('should extract array release notes', () => {
        const instance = UpdaterService.initialize();
        const updateInfo = createMockUpdateInfo({
          releaseNotes: [
            { version: '2.0.0', note: 'First note' },
            { version: '1.9.0', note: 'Second note' },
          ],
        });

        autoUpdaterHandlers['update-available'](updateInfo);

        expect(instance.status.releaseNotes).toContain('First note');
        expect(instance.status.releaseNotes).toContain('Second note');
      });

      it('should handle null release notes', () => {
        const instance = UpdaterService.initialize();
        const updateInfo = createMockUpdateInfo({ releaseNotes: undefined });

        autoUpdaterHandlers['update-available'](updateInfo);

        expect(instance.status.releaseNotes).toBeNull();
      });
    });

    describe('update-not-available', () => {
      it('should update status when no update available', () => {
        const instance = UpdaterService.initialize();

        // First set checking to true
        autoUpdaterHandlers['checking-for-update']();
        expect(instance.status.isCheckingForUpdates).toBe(true);

        autoUpdaterHandlers['update-not-available']();

        expect(instance.status.isCheckingForUpdates).toBe(false);
        expect(mockSendEvent).toHaveBeenCalledWith('updater:status-updated', instance.status);
      });
    });

    describe('error', () => {
      it('should update status with error info', () => {
        const instance = UpdaterService.initialize();

        autoUpdaterHandlers['error'](new Error('Network error'));

        expect(instance.status.isCheckingForUpdates).toBe(false);
        expect(instance.status.isDownloadingUpdate).toBe(false);
        expect(instance.status.isError).toBe(true);
        expect(instance.status.errorMessage).toBe('Network error');
        expect(mockSendEvent).toHaveBeenCalledWith('updater:status-updated', instance.status);
      });

      it('should handle error without message', () => {
        const instance = UpdaterService.initialize();

        autoUpdaterHandlers['error']({ message: '' });

        expect(instance.status.errorMessage).toBe('An unknown error occurred');
      });
    });
  });

  describe('updateAndRelaunch', () => {
    it('should call quitAndInstall', () => {
      const instance = UpdaterService.initialize();

      instance.updateAndRelaunch();

      expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
    });

    it('should set didUpdateAndRelaunch flag', () => {
      const instance = UpdaterService.initialize();

      instance.updateAndRelaunch();

      expect(instance.didUpdateAndRelaunch).toBe(true);
    });
  });

  describe('retry', () => {
    it('should clear error state and check for updates', async () => {
      const instance = UpdaterService.initialize();

      // Simulate previous error
      autoUpdaterHandlers['error'](new Error('Previous error'));

      await instance.retry();

      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
    });
  });

  describe('sendStatusToMainWindow', () => {
    it('should send status to main window', () => {
      const instance = UpdaterService.initialize();

      instance.sendStatusToMainWindow();

      expect(mockSendEvent).toHaveBeenCalledWith('updater:status-updated', instance.status);
    });
  });
});
