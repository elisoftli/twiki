/**
 * Tests for modify-launch-options utility
 *
 * Tests launcher-agnostic interface for modifying game launch options:
 * - Steam launch options modification (via VDF file)
 * - Manual game launch options via desktop shortcuts
 * - Error handling for unsupported launchers
 * - Correct return values for revert operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Hoisted Mocks
// =============================================================================

const {
  mockGetSteamEnvironment,
  mockModifySteamDataFile,
  mockKillSteam,
  mockWaitForSteamTermination,
  mockStartSteam,
  mockGetDesktopPath,
  mockGetTwikiShortcutName,
  mockFindTwikiShortcuts,
  mockReadShortcut,
  mockCreateShortcut,
  mockUpdateShortcutArgs,
  mockGameLibraryServiceGetInstance,
  mockGetGame,
  mockGetGameByLauncherId,
  mockAddTwikiLaunchConfig,
} = vi.hoisted(() => ({
  mockGetSteamEnvironment: vi.fn(),
  mockModifySteamDataFile: vi.fn(),
  mockKillSteam: vi.fn(),
  mockWaitForSteamTermination: vi.fn(),
  mockStartSteam: vi.fn(),
  mockGetDesktopPath: vi.fn(),
  mockGetTwikiShortcutName: vi.fn(),
  mockFindTwikiShortcuts: vi.fn(),
  mockReadShortcut: vi.fn(),
  mockCreateShortcut: vi.fn(),
  mockUpdateShortcutArgs: vi.fn(),
  mockGameLibraryServiceGetInstance: vi.fn(),
  mockGetGame: vi.fn(),
  mockGetGameByLauncherId: vi.fn(),
  mockAddTwikiLaunchConfig: vi.fn(),
}));

// Mock steam utils
vi.mock('../../../../utils/steam.utils', () => ({
  getSteamEnvironment: mockGetSteamEnvironment,
  modifySteamDataFile: mockModifySteamDataFile,
  killSteam: mockKillSteam,
  waitForSteamTermination: mockWaitForSteamTermination,
  startSteam: mockStartSteam,
}));

// Mock shortcut utils
vi.mock('../../../../utils/shortcut.utils', () => ({
  getDesktopPath: mockGetDesktopPath,
  getTwikiShortcutName: mockGetTwikiShortcutName,
  findTwikiShortcuts: mockFindTwikiShortcuts,
  readShortcut: mockReadShortcut,
  createShortcut: mockCreateShortcut,
  updateShortcutArgs: mockUpdateShortcutArgs,
}));

// Mock GameLibraryService
vi.mock('../../../../services/game/game-library.service', () => ({
  GameLibraryService: {
    getInstance: mockGameLibraryServiceGetInstance,
  },
}));

// Import after mocks are set up
import { modifyGameLaunchOptions } from '../modify-launch-options.utils';

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockManualGame = (overrides = {}) => ({
  id: 'manual:manual-game-123:abcd1234',
  launcherId: 'manual-game-123',
  name: 'Test Manual Game',
  launcher: 'manual' as const,
  installPath: 'C:\\Games\\TestGame',
  launchConfigs: [
    {
      type: 'default',
      executable: 'C:\\Games\\TestGame\\game.exe',
      description: 'Play Game',
    },
  ],
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

describe('modifyGameLaunchOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful mocks for Steam
    mockGetSteamEnvironment.mockResolvedValue({
      success: true,
      userConfigPath: 'C:\\Steam\\userdata\\123\\config\\localconfig.vdf',
    });
    mockModifySteamDataFile.mockResolvedValue({
      path: 'C:\\Steam\\userdata\\123\\config\\localconfig.vdf',
      backupPath: 'C:\\Steam\\userdata\\123\\config\\localconfig.vdf.backup_123',
      modificationDetails: 'Added launch option',
    });
    mockKillSteam.mockResolvedValue(undefined);
    mockWaitForSteamTermination.mockResolvedValue(undefined);
    mockStartSteam.mockResolvedValue(undefined);

    // Default successful mocks for Manual
    mockGetDesktopPath.mockReturnValue('C:\\Users\\TestUser\\Desktop');
    mockGetTwikiShortcutName.mockImplementation((name: string) => `Twiki - ${name}.lnk`);
    mockFindTwikiShortcuts.mockResolvedValue([]);
    mockCreateShortcut.mockResolvedValue('C:\\Users\\TestUser\\Desktop\\Twiki - Test Manual Game.lnk');
    mockUpdateShortcutArgs.mockResolvedValue('');
    mockAddTwikiLaunchConfig.mockResolvedValue(undefined);
    mockGetGame.mockReturnValue(createMockManualGame());
    mockGetGameByLauncherId.mockReturnValue(createMockManualGame());
    mockGameLibraryServiceGetInstance.mockReturnValue({
      getGame: mockGetGame,
      getGameByLauncherId: mockGetGameByLauncherId,
      addTwikiLaunchConfig: mockAddTwikiLaunchConfig,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Steam launcher', () => {
    it('should modify Steam launch options', async () => {
      const result = await modifyGameLaunchOptions({
        launcher: 'steam',
        gameId: '12345',
        launchOptions: '-fullscreen -skipintro',
      });

      expect(result.launcher).toBe('steam');
      expect(result.path).toBe('C:\\Steam\\userdata\\123\\config\\localconfig.vdf');
      expect(result.backupPath).toBe('C:\\Steam\\userdata\\123\\config\\localconfig.vdf.backup_123');
      expect(mockKillSteam).toHaveBeenCalled();
      expect(mockWaitForSteamTermination).toHaveBeenCalledWith(10000);
      expect(mockStartSteam).toHaveBeenCalled();
    });

    it('should throw error when Steam environment not found', async () => {
      mockGetSteamEnvironment.mockResolvedValue({
        success: false,
        error: 'Steam not installed',
      });

      await expect(
        modifyGameLaunchOptions({
          launcher: 'steam',
          gameId: '12345',
          launchOptions: '-test',
        })
      ).rejects.toThrow('Cannot modify Steam launch options: Steam not installed');
    });

    it('should throw error when Steam config path not available', async () => {
      mockGetSteamEnvironment.mockResolvedValue({
        success: true,
        userConfigPath: null,
      });

      await expect(
        modifyGameLaunchOptions({
          launcher: 'steam',
          gameId: '12345',
          launchOptions: '-test',
        })
      ).rejects.toThrow('Cannot modify Steam launch options');
    });

    it('should use correct key path for Steam config', async () => {
      await modifyGameLaunchOptions({
        launcher: 'steam',
        gameId: '99999',
        launchOptions: '-custom',
      });

      expect(mockModifySteamDataFile).toHaveBeenCalledWith(
        expect.objectContaining({
          keyPath: 'UserLocalConfigStore.Software.Valve.Steam.apps.99999.LaunchOptions',
          value: '-custom',
        })
      );
    });

    it('should respect skipBackup option', async () => {
      await modifyGameLaunchOptions({
        launcher: 'steam',
        gameId: '12345',
        launchOptions: '-test',
        skipBackup: true,
      });

      expect(mockModifySteamDataFile).toHaveBeenCalledWith(
        expect.objectContaining({
          skipBackup: true,
        })
      );
    });
  });

  describe('Manual launcher', () => {
    describe('creating new shortcuts', () => {
      it('should create new shortcut when none exists', async () => {
        mockFindTwikiShortcuts.mockResolvedValue([]);

        const result = await modifyGameLaunchOptions({
          launcher: 'manual',
          gameId: 'manual-game-123',
          launchOptions: '-fullscreen',
        });

        expect(result.launcher).toBe('manual');
        expect(result.shortcutCreated).toBe(true);
        expect(result.originalArgs).toBeUndefined();
        expect(result.path).toBe('C:\\Users\\TestUser\\Desktop\\Twiki - Test Manual Game.lnk');
        expect(mockCreateShortcut).toHaveBeenCalledWith(
          expect.objectContaining({
            targetPath: 'C:\\Games\\TestGame\\game.exe',
            arguments: '-fullscreen',
            name: 'Twiki - Test Manual Game',
            location: 'C:\\Users\\TestUser\\Desktop',
          })
        );
      });

      it('should store internal launch config via GameLibraryService', async () => {
        mockFindTwikiShortcuts.mockResolvedValue([]);

        await modifyGameLaunchOptions({
          launcher: 'manual',
          gameId: 'manual-game-123',
          launchOptions: '-window',
        });

        expect(mockAddTwikiLaunchConfig).toHaveBeenCalledWith('manual:manual-game-123:abcd1234', '-window');
      });

      it('should include game name in shortcut description', async () => {
        mockFindTwikiShortcuts.mockResolvedValue([]);

        await modifyGameLaunchOptions({
          launcher: 'manual',
          gameId: 'manual-game-123',
          launchOptions: '-test',
        });

        expect(mockCreateShortcut).toHaveBeenCalledWith(
          expect.objectContaining({
            description: 'Launch Test Manual Game with Twiki options',
          })
        );
      });
    });

    describe('modifying existing shortcuts', () => {
      it('should modify existing shortcut without args', async () => {
        const existingShortcut = 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Manual Game.lnk';
        mockFindTwikiShortcuts.mockResolvedValue([existingShortcut]);
        mockReadShortcut.mockResolvedValue({
          path: existingShortcut,
          targetPath: 'C:\\Games\\TestGame\\game.exe',
          arguments: '',
          workingDirectory: '',
          description: '',
          iconLocation: '',
        });
        mockUpdateShortcutArgs.mockResolvedValue('');

        const result = await modifyGameLaunchOptions({
          launcher: 'manual',
          gameId: 'manual-game-123',
          launchOptions: '-newarg',
        });

        expect(result.shortcutCreated).toBe(false);
        expect(result.originalArgs).toBe('');
        expect(mockUpdateShortcutArgs).toHaveBeenCalledWith(existingShortcut, '-newarg');
        expect(mockCreateShortcut).not.toHaveBeenCalled();
      });

      it('should append to shortcut with existing args', async () => {
        const existingShortcut = 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Manual Game.lnk';
        mockFindTwikiShortcuts.mockResolvedValue([existingShortcut]);
        mockReadShortcut.mockResolvedValue({
          path: existingShortcut,
          targetPath: 'C:\\Games\\TestGame\\game.exe',
          arguments: '-existingArg',
          workingDirectory: '',
          description: '',
          iconLocation: '',
        });
        mockUpdateShortcutArgs.mockResolvedValue('-existingArg');

        const result = await modifyGameLaunchOptions({
          launcher: 'manual',
          gameId: 'manual-game-123',
          launchOptions: '-newArg',
        });

        expect(result.originalArgs).toBe('-existingArg');
        expect(mockUpdateShortcutArgs).toHaveBeenCalledWith(
          existingShortcut,
          '-existingArg -newArg'
        );
        expect(result.modificationDetails).toContain('appended');
      });

      it('should prefer shortcut without args when multiple exist', async () => {
        const shortcutWithArgs = 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Manual Game (modded).lnk';
        const shortcutWithoutArgs = 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Manual Game.lnk';

        mockFindTwikiShortcuts.mockResolvedValue([shortcutWithArgs, shortcutWithoutArgs]);
        mockReadShortcut
          .mockResolvedValueOnce({
            path: shortcutWithArgs,
            targetPath: 'C:\\Games\\TestGame\\game.exe',
            arguments: '-alreadyHasArgs',
            workingDirectory: '',
            description: '',
            iconLocation: '',
          })
          .mockResolvedValueOnce({
            path: shortcutWithoutArgs,
            targetPath: 'C:\\Games\\TestGame\\game.exe',
            arguments: '',
            workingDirectory: '',
            description: '',
            iconLocation: '',
          });

        const result = await modifyGameLaunchOptions({
          launcher: 'manual',
          gameId: 'manual-game-123',
          launchOptions: '-test',
        });

        expect(result.originalArgs).toBe('');
        expect(mockUpdateShortcutArgs).toHaveBeenCalledWith(shortcutWithoutArgs, '-test');
      });

      it('should use first shortcut if all have args', async () => {
        const shortcut1 = 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Manual Game.lnk';
        const shortcut2 = 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Manual Game (v2).lnk';

        mockFindTwikiShortcuts.mockResolvedValue([shortcut1, shortcut2]);
        mockReadShortcut
          .mockResolvedValueOnce({
            path: shortcut1,
            targetPath: 'C:\\Games\\TestGame\\game.exe',
            arguments: '-arg1',
            workingDirectory: '',
            description: '',
            iconLocation: '',
          })
          .mockResolvedValueOnce({
            path: shortcut2,
            targetPath: 'C:\\Games\\TestGame\\game.exe',
            arguments: '-arg2',
            workingDirectory: '',
            description: '',
            iconLocation: '',
          });

        const result = await modifyGameLaunchOptions({
          launcher: 'manual',
          gameId: 'manual-game-123',
          launchOptions: '-newArg',
        });

        expect(result.originalArgs).toBe('-arg1');
        expect(mockUpdateShortcutArgs).toHaveBeenCalledWith(shortcut1, '-arg1 -newArg');
      });

      it('should skip duplicate launch options when appending', async () => {
        const existingShortcut = 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Manual Game.lnk';
        mockFindTwikiShortcuts.mockResolvedValue([existingShortcut]);
        mockReadShortcut.mockResolvedValue({
          path: existingShortcut,
          targetPath: 'C:\\Games\\TestGame\\game.exe',
          arguments: '-nointro -fullscreen',
          workingDirectory: '',
          description: '',
          iconLocation: '',
        });
        mockUpdateShortcutArgs.mockResolvedValue('-nointro -fullscreen');

        const result = await modifyGameLaunchOptions({
          launcher: 'manual',
          gameId: 'manual-game-123',
          launchOptions: '-nointro -newArg',
        });

        // Should only append -newArg, skipping -nointro which already exists
        expect(mockUpdateShortcutArgs).toHaveBeenCalledWith(
          existingShortcut,
          '-nointro -fullscreen -newArg'
        );
        expect(result.originalArgs).toBe('-nointro -fullscreen');
        // modificationDetails should still mention the original requested options
        expect(result.modificationDetails).toContain('-nointro -newArg');
      });

      it('should skip all options when all already exist', async () => {
        const existingShortcut = 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Manual Game.lnk';
        mockFindTwikiShortcuts.mockResolvedValue([existingShortcut]);
        mockReadShortcut.mockResolvedValue({
          path: existingShortcut,
          targetPath: 'C:\\Games\\TestGame\\game.exe',
          arguments: '-nointro -fullscreen',
          workingDirectory: '',
          description: '',
          iconLocation: '',
        });
        mockUpdateShortcutArgs.mockResolvedValue('-nointro -fullscreen');

        const result = await modifyGameLaunchOptions({
          launcher: 'manual',
          gameId: 'manual-game-123',
          launchOptions: '-nointro -fullscreen',
        });

        // Should update with the same args (no new options to add)
        expect(mockUpdateShortcutArgs).toHaveBeenCalledWith(
          existingShortcut,
          '-nointro -fullscreen'
        );
        expect(result.shortcutCreated).toBe(false);
        expect(result.originalArgs).toBe('-nointro -fullscreen');
      });

      it('should handle case-insensitive duplicate detection', async () => {
        const existingShortcut = 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Manual Game.lnk';
        mockFindTwikiShortcuts.mockResolvedValue([existingShortcut]);
        mockReadShortcut.mockResolvedValue({
          path: existingShortcut,
          targetPath: 'C:\\Games\\TestGame\\game.exe',
          arguments: '-NoIntro',
          workingDirectory: '',
          description: '',
          iconLocation: '',
        });
        mockUpdateShortcutArgs.mockResolvedValue('-NoIntro');

        await modifyGameLaunchOptions({
          launcher: 'manual',
          gameId: 'manual-game-123',
          launchOptions: '-nointro -newArg',
        });

        // Should skip -nointro (case-insensitive match with -NoIntro)
        expect(mockUpdateShortcutArgs).toHaveBeenCalledWith(existingShortcut, '-NoIntro -newArg');
      });
    });

    describe('error handling', () => {
      it('should throw error when game not found', async () => {
        mockGetGameByLauncherId.mockReturnValue(undefined);

        await expect(
          modifyGameLaunchOptions({
            launcher: 'manual',
            gameId: 'nonexistent-game',
            launchOptions: '-test',
          })
        ).rejects.toThrow('Game not found: nonexistent-game');
      });

      it('should throw error when game is not a manual game', async () => {
        mockGetGameByLauncherId.mockReturnValue({
          ...createMockManualGame(),
          launcher: 'steam',
        });

        await expect(
          modifyGameLaunchOptions({
            launcher: 'manual',
            gameId: 'manual-game-123',
            launchOptions: '-test',
          })
        ).rejects.toThrow('is not a manual game');
      });

      it('should throw error when no executable found', async () => {
        mockGetGameByLauncherId.mockReturnValue({
          ...createMockManualGame(),
          launchConfigs: [],
        });

        await expect(
          modifyGameLaunchOptions({
            launcher: 'manual',
            gameId: 'manual-game-123',
            launchOptions: '-test',
          })
        ).rejects.toThrow('No executable found');
      });
    });

    describe('return values for revert', () => {
      it('should return shortcutCreated: true when creating new shortcut', async () => {
        mockFindTwikiShortcuts.mockResolvedValue([]);

        const result = await modifyGameLaunchOptions({
          launcher: 'manual',
          gameId: 'manual-game-123',
          launchOptions: '-test',
        });

        expect(result.shortcutCreated).toBe(true);
        expect(result.originalArgs).toBeUndefined();
      });

      it('should return shortcutCreated: false and originalArgs when modifying', async () => {
        const existingShortcut = 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Manual Game.lnk';
        mockFindTwikiShortcuts.mockResolvedValue([existingShortcut]);
        mockReadShortcut.mockResolvedValue({
          path: existingShortcut,
          targetPath: 'C:\\Games\\TestGame\\game.exe',
          arguments: '-original',
          workingDirectory: '',
          description: '',
          iconLocation: '',
        });

        const result = await modifyGameLaunchOptions({
          launcher: 'manual',
          gameId: 'manual-game-123',
          launchOptions: '-new',
        });

        expect(result.shortcutCreated).toBe(false);
        expect(result.originalArgs).toBe('-original');
      });
    });
  });

  describe('unsupported launchers', () => {
    it('should throw error for Epic launcher', async () => {
      await expect(
        modifyGameLaunchOptions({
          launcher: 'epic' as any,
          gameId: '12345',
          launchOptions: '-test',
        })
      ).rejects.toThrow('Unsupported launcher: epic');
    });

    it('should throw error for GOG launcher', async () => {
      await expect(
        modifyGameLaunchOptions({
          launcher: 'gog' as any,
          gameId: '12345',
          launchOptions: '-test',
        })
      ).rejects.toThrow('Unsupported launcher: gog');
    });
  });
});
