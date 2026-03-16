/**
 * SettingsService Tests
 *
 * Tests the settings service including:
 * - Settings persistence (read/write)
 * - Listener subscription/unsubscription
 * - Default values handling
 * - Settings updates
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Settings } from '../../../interfaces';

// Mock SettingsUtils
const mockReadSettings = vi.fn();
const mockWriteSettings = vi.fn();
vi.mock('../../../utils', () => ({
  SettingsUtils: {
    readSettings: () => mockReadSettings(),
    writeSettings: (settings: Settings) => mockWriteSettings(settings),
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

const createMockSettings = (overrides?: Partial<Settings>): Settings => ({
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
  integrations: { nexusMods: {} },
  gameLibrary: {
    launchers: {
      steam: { enabled: true },
      xbox: { enabled: true },
    },
  },
  useBuiltInEditor: true,
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

// Reset static state between tests
let SettingsService: typeof import('../settings.service').SettingsService;

describe('SettingsService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default mock responses
    mockReadSettings.mockResolvedValue(createMockSettings());
    mockWriteSettings.mockResolvedValue(undefined);

    const module = await import('../settings.service');
    SettingsService = module.SettingsService;
  });

  describe('initialize', () => {
    it('should load settings from disk', async () => {
      await SettingsService.initialize();

      expect(mockReadSettings).toHaveBeenCalledOnce();
    });

    it('should not reload settings if already initialized', async () => {
      await SettingsService.initialize();
      await SettingsService.initialize();

      expect(mockReadSettings).toHaveBeenCalledOnce();
    });

    it('should store loaded settings', async () => {
      const mockSettings = createMockSettings({ theme: 'dark-mode' });
      mockReadSettings.mockResolvedValue(mockSettings);

      await SettingsService.initialize();

      expect(SettingsService.settings.theme).toBe('dark-mode');
    });
  });

  describe('settings getter', () => {
    it('should throw error if accessed before initialization', () => {
      expect(() => SettingsService.settings).toThrow('SettingsService not initialized');
    });

    it('should return settings after initialization', async () => {
      const mockSettings = createMockSettings();
      mockReadSettings.mockResolvedValue(mockSettings);

      await SettingsService.initialize();

      expect(SettingsService.settings).toEqual(mockSettings);
    });
  });

  describe('updateSettings', () => {
    it('should update settings with partial values', async () => {
      await SettingsService.initialize();

      await SettingsService.updateSettings({ theme: 'new-theme' });

      expect(SettingsService.settings.theme).toBe('new-theme');
    });

    it('should persist updated settings to disk', async () => {
      await SettingsService.initialize();

      await SettingsService.updateSettings({ isAutoUpdateEnabled: false });

      expect(mockWriteSettings).toHaveBeenCalledWith(
        expect.objectContaining({ isAutoUpdateEnabled: false })
      );
    });

    it('should preserve existing settings when updating', async () => {
      const mockSettings = createMockSettings({ theme: 'original-theme' });
      mockReadSettings.mockResolvedValue(mockSettings);
      await SettingsService.initialize();

      await SettingsService.updateSettings({ isAutoUpdateEnabled: false });

      expect(SettingsService.settings.theme).toBe('original-theme');
      expect(SettingsService.settings.isAutoUpdateEnabled).toBe(false);
    });

    it('should notify listeners of settings changes', async () => {
      await SettingsService.initialize();
      const listener = vi.fn();
      SettingsService.addSettingsChangeListener(listener);

      await SettingsService.updateSettings({ theme: 'new-theme' });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'sunset-horizon' }),
        expect.objectContaining({ theme: 'new-theme' })
      );
    });

    it('should call all registered listeners', async () => {
      await SettingsService.initialize();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      SettingsService.addSettingsChangeListener(listener1);
      SettingsService.addSettingsChangeListener(listener2);

      await SettingsService.updateSettings({ useBuiltInEditor: false });

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
    });
  });

  describe('addSettingsChangeListener', () => {
    it('should register a listener', async () => {
      await SettingsService.initialize();
      const listener = vi.fn();

      SettingsService.addSettingsChangeListener(listener);
      await SettingsService.updateSettings({ theme: 'test' });

      expect(listener).toHaveBeenCalled();
    });

    it('should allow adding multiple listeners', async () => {
      await SettingsService.initialize();
      const listeners = [vi.fn(), vi.fn(), vi.fn()];

      listeners.forEach((l) => SettingsService.addSettingsChangeListener(l));
      await SettingsService.updateSettings({ theme: 'test' });

      listeners.forEach((l) => expect(l).toHaveBeenCalled());
    });
  });

  describe('removeSettingsChangeListener', () => {
    it('should unregister a listener', async () => {
      await SettingsService.initialize();
      const listener = vi.fn();
      SettingsService.addSettingsChangeListener(listener);

      SettingsService.removeSettingsChangeListener(listener);
      await SettingsService.updateSettings({ theme: 'test' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should only remove the specified listener', async () => {
      await SettingsService.initialize();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      SettingsService.addSettingsChangeListener(listener1);
      SettingsService.addSettingsChangeListener(listener2);

      SettingsService.removeSettingsChangeListener(listener1);
      await SettingsService.updateSettings({ theme: 'test' });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should handle removing non-existent listener gracefully', async () => {
      await SettingsService.initialize();
      const listener = vi.fn();

      // Should not throw
      expect(() => SettingsService.removeSettingsChangeListener(listener)).not.toThrow();
    });
  });

  describe('settings update edge cases', () => {
    it('should handle updating nested settings', async () => {
      await SettingsService.initialize();

      await SettingsService.updateSettings({
        specsVisibility: {
          showOs: false,
          showCpu: false,
          showGpu: true,
          showDisplay: true,
        },
      });

      expect(SettingsService.settings.specsVisibility.showOs).toBe(false);
      expect(SettingsService.settings.specsVisibility.showCpu).toBe(false);
    });

    it('should handle updating autoTweaker settings', async () => {
      await SettingsService.initialize();

      await SettingsService.updateSettings({
        autoTweaker: {
          autoApproveReadOnly: true,
          claudeApiKey: 'test-key',
        },
      });

      expect(SettingsService.settings.autoTweaker.autoApproveReadOnly).toBe(true);
      expect(SettingsService.settings.autoTweaker.claudeApiKey).toBe('test-key');
    });

    it('should handle updating gameLibrary settings', async () => {
      await SettingsService.initialize();

      await SettingsService.updateSettings({
        gameLibrary: {
          launchers: {
            steam: { enabled: false },
            xbox: { enabled: true },
          },
        },
      });

      expect(SettingsService.settings.gameLibrary.launchers.steam.enabled).toBe(false);
    });
  });
});
