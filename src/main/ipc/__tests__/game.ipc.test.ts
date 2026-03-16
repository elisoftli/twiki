/**
 * Game IPC Handler Tests
 *
 * Tests the game library IPC handlers including:
 * - Get games list
 * - Launch game with handler
 * - Link game to PCGW page
 * - Error handling for missing games
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameLauncher, type Game, type GameLibraryStatus } from '../../interfaces/game-library.interface';

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

// Mock electron dialog
vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    stat: vi.fn(),
  },
}));

// Mock GameLibraryService - use factory return
vi.mock('../../services/game/game-library.service', () => ({
  GameLibraryService: {
    getInstance: vi.fn(),
  },
}));

// Mock PCGamingWikiService
vi.mock('../../services/game/pcgamingwiki.service', () => ({
  PCGamingWikiService: {
    searchGames: vi.fn(),
  },
}));

// Mock executable finder
vi.mock('../../utils/executable-finder.util', () => ({
  findGameExecutable: vi.fn(),
}));

// Import after mocks
import { setupGameIpc } from '../game.ipc';
import { dialog } from 'electron';
import { promises as fs } from 'fs';
import { GameLibraryService } from '../../services/game/game-library.service';
import { PCGamingWikiService } from '../../services/game/pcgamingwiki.service';
import { findGameExecutable } from '../../utils/executable-finder.util';

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockGame = (overrides?: Partial<Game>): Game => ({
  id: 'game-123',
  launcherId: 'game-123',
  name: 'Test Game',
  launcher: GameLauncher.STEAM,
  installPath: 'C:\\Games\\TestGame',
  launcherInstallPath: 'C:\\Program Files\\Steam',
  posterPath: null,
  heroPath: null,
  launchConfigs: [],
  lastPlayed: null,
  pinnedAt: null,
  ...overrides,
});

const createMockStatus = (): GameLibraryStatus => ({
  isLoaded: true,
  launchers: {
    [GameLauncher.STEAM]: { isLoaded: true, error: null, gameCount: 5 },
  },
  error: null,
});

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
const invokeListener = (channel: string, args?: unknown) => {
  const listener = registeredListeners.get(channel);
  if (!listener) {
    throw new Error(`No listener registered for channel: ${channel}`);
  }
  const mockEvent = { sender: {} };
  listener(mockEvent, args);
};

// =============================================================================
// Tests
// =============================================================================

describe('Game IPC Handlers', () => {
  // Create mock library service
  const mockLibraryService = {
    getStatus: vi.fn(),
    games: [] as Game[],
    forceReload: vi.fn(),
    getGame: vi.fn(),
    isGameRunning: vi.fn(),
    terminateGame: vi.fn(),
    pinGame: vi.fn(),
    unpinGame: vi.fn(),
    getManualService: vi.fn(),
    addGame: vi.fn(),
    removeGame: vi.fn(),
    hasGameWithInstallPath: vi.fn(),
    addCustomConfigPath: vi.fn(),
    removeCustomConfigPath: vi.fn(),
    launchGame: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers.clear();
    registeredListeners.clear();
    mockLibraryService.games = [];

    // Setup the mock to return our service
    vi.mocked(GameLibraryService.getInstance).mockReturnValue(mockLibraryService as any);

    // Setup handlers
    setupGameIpc();
  });

  describe('library:get-status', () => {
    it('should return library status', async () => {
      const status = createMockStatus();
      mockLibraryService.getStatus.mockReturnValue(status);

      const result = await invokeHandler('library:get-status');

      expect(result).toEqual(status);
      expect(mockLibraryService.getStatus).toHaveBeenCalled();
    });
  });

  describe('library:get-games', () => {
    it('should return games list', async () => {
      const games = [createMockGame({ id: '1' }), createMockGame({ id: '2' })];
      mockLibraryService.games = games;

      const result = await invokeHandler('library:get-games');

      expect(result).toEqual(games);
    });

    it('should return empty array when no games', async () => {
      mockLibraryService.games = [];

      const result = await invokeHandler('library:get-games');

      expect(result).toEqual([]);
    });
  });

  describe('library:reload', () => {
    it('should reload library and return games', async () => {
      const games = [createMockGame()];
      mockLibraryService.forceReload.mockResolvedValue(undefined);
      mockLibraryService.games = games;

      const result = await invokeHandler('library:reload');

      expect(mockLibraryService.forceReload).toHaveBeenCalled();
      expect(result).toEqual(games);
    });
  });

  describe('library:get-game', () => {
    it('should return game by ID', async () => {
      const game = createMockGame({ id: 'test-id' });
      mockLibraryService.getGame.mockReturnValue(game);

      const result = await invokeHandler('library:get-game', 'test-id');

      expect(result).toEqual(game);
      expect(mockLibraryService.getGame).toHaveBeenCalledWith('test-id');
    });

    it('should return undefined for unknown game', async () => {
      mockLibraryService.getGame.mockReturnValue(undefined);

      const result = await invokeHandler('library:get-game', 'unknown-id');

      expect(result).toBeUndefined();
    });
  });

  describe('library:is-game-running', () => {
    it('should return true when game is running', async () => {
      mockLibraryService.isGameRunning.mockResolvedValue(true);

      const result = await invokeHandler('library:is-game-running', 'game-id');

      expect(result).toBe(true);
      expect(mockLibraryService.isGameRunning).toHaveBeenCalledWith('game-id');
    });

    it('should return false when game is not running', async () => {
      mockLibraryService.isGameRunning.mockResolvedValue(false);

      const result = await invokeHandler('library:is-game-running', 'game-id');

      expect(result).toBe(false);
    });
  });

  describe('library:terminate-game', () => {
    it('should terminate game', async () => {
      mockLibraryService.terminateGame.mockResolvedValue(undefined);

      await invokeHandler('library:terminate-game', 'game-id');

      expect(mockLibraryService.terminateGame).toHaveBeenCalledWith('game-id');
    });
  });

  describe('library:pin-game / library:unpin-game', () => {
    it('should pin game', async () => {
      mockLibraryService.pinGame.mockResolvedValue(undefined);

      await invokeHandler('library:pin-game', 'game-id');

      expect(mockLibraryService.pinGame).toHaveBeenCalledWith('game-id');
    });

    it('should unpin game', async () => {
      mockLibraryService.unpinGame.mockResolvedValue(undefined);

      await invokeHandler('library:unpin-game', 'game-id');

      expect(mockLibraryService.unpinGame).toHaveBeenCalledWith('game-id');
    });
  });

  describe('library:search-pcgw', () => {
    it('should search PCGamingWiki', async () => {
      const searchResults = [{ pageId: 1, title: 'Test Game' }];
      vi.mocked(PCGamingWikiService.searchGames).mockResolvedValue(searchResults as any);

      const result = await invokeHandler('library:search-pcgw', 'test query');

      expect(result).toEqual(searchResults);
      expect(PCGamingWikiService.searchGames).toHaveBeenCalledWith('test query');
    });
  });

  describe('library:import-game', () => {
    it('should import manual game', async () => {
      const mockManualService = {
        importGame: vi.fn().mockResolvedValue(createMockGame({ id: 'imported' })),
      };
      mockLibraryService.getManualService.mockReturnValue(mockManualService);
      mockLibraryService.addGame.mockResolvedValue(undefined);

      const params = {
        name: 'Test Game',
        installPath: 'C:\\Games\\Test',
        executablePath: 'C:\\Games\\Test\\game.exe',
        pcgwPageId: 12345,
      };

      const result = await invokeHandler('library:import-game', params);

      expect(mockManualService.importGame).toHaveBeenCalledWith(params);
      expect(mockLibraryService.addGame).toHaveBeenCalled();
      expect(result.id).toBe('imported');
    });
  });

  describe('library:delete-game', () => {
    it('should delete game', async () => {
      const mockManualService = {
        deleteGame: vi.fn().mockResolvedValue(undefined),
      };
      mockLibraryService.getManualService.mockReturnValue(mockManualService);
      mockLibraryService.removeGame.mockResolvedValue(undefined);

      await invokeHandler('library:delete-game', { id: 'game-id', deleteAppliedTweaks: false });

      expect(mockManualService.deleteGame).toHaveBeenCalledWith('game-id', false);
      expect(mockLibraryService.removeGame).toHaveBeenCalledWith('game-id');
    });

    it('should delete game with applied tweaks', async () => {
      const mockManualService = {
        deleteGame: vi.fn().mockResolvedValue(undefined),
      };
      mockLibraryService.getManualService.mockReturnValue(mockManualService);
      mockLibraryService.removeGame.mockResolvedValue(undefined);

      await invokeHandler('library:delete-game', { id: 'game-id', deleteAppliedTweaks: true });

      expect(mockManualService.deleteGame).toHaveBeenCalledWith('game-id', true);
    });
  });

  describe('library:select-folder', () => {
    it('should return folder path and suggested executable', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['C:\\Games\\Selected'],
      });
      vi.mocked(findGameExecutable).mockResolvedValue('game.exe');

      const result = await invokeHandler('library:select-folder');

      expect(result).toEqual({
        folderPath: 'C:\\Games\\Selected',
        suggestedExecutable: 'game.exe',
      });
    });

    it('should return null when dialog canceled', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const result = await invokeHandler('library:select-folder');

      expect(result).toBeNull();
    });

    it('should return null suggested executable when none found', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['C:\\Games\\Selected'],
      });
      vi.mocked(findGameExecutable).mockResolvedValue(null);

      const result = await invokeHandler('library:select-folder');

      expect(result).toEqual({
        folderPath: 'C:\\Games\\Selected',
        suggestedExecutable: null,
      });
    });
  });

  describe('library:select-executable', () => {
    it('should return selected executable path', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['C:\\Games\\game.exe'],
      });

      const result = await invokeHandler('library:select-executable', 'C:\\Games');

      expect(result).toBe('C:\\Games\\game.exe');
    });

    it('should return null when dialog canceled', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const result = await invokeHandler('library:select-executable');

      expect(result).toBeNull();
    });
  });

  describe('library:check-duplicate-path', () => {
    it('should return true when path exists', async () => {
      mockLibraryService.hasGameWithInstallPath.mockReturnValue(true);

      const result = await invokeHandler('library:check-duplicate-path', 'C:\\Games\\Test');

      expect(result).toBe(true);
      expect(mockLibraryService.hasGameWithInstallPath).toHaveBeenCalledWith('C:\\Games\\Test');
    });

    it('should return false when path does not exist', async () => {
      mockLibraryService.hasGameWithInstallPath.mockReturnValue(false);

      const result = await invokeHandler('library:check-duplicate-path', 'C:\\Games\\New');

      expect(result).toBe(false);
    });
  });

  describe('library:check-duplicate-pcgw', () => {
    it('should check for duplicate PCGW page ID', async () => {
      const mockManualService = {
        hasGameWithPcgwPageId: vi.fn().mockReturnValue(true),
      };
      mockLibraryService.getManualService.mockReturnValue(mockManualService);

      const result = await invokeHandler('library:check-duplicate-pcgw', 12345);

      expect(result).toBe(true);
      expect(mockManualService.hasGameWithPcgwPageId).toHaveBeenCalledWith(12345);
    });
  });

  describe('library:add-custom-config-path', () => {
    it('should add custom config path successfully', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockLibraryService.getGame.mockReturnValue(createMockGame({ id: 'game-id' }));
      const configPath = { path: 'C:\\config', pathType: 'directory', exists: true, platform: 'custom' };
      mockLibraryService.addCustomConfigPath.mockResolvedValue(configPath);

      const result = await invokeHandler('library:add-custom-config-path', {
        gameId: 'game-id',
        path: 'C:\\config',
        pathType: 'directory',
        pcgwConfigPaths: [],
      });

      expect(result.success).toBe(true);
      expect(result.configPath).toEqual(configPath);
    });

    it('should return error when path does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await invokeHandler('library:add-custom-config-path', {
        gameId: 'game-id',
        path: 'C:\\nonexistent',
        pathType: 'file',
        pcgwConfigPaths: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('should return error when game not found', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockLibraryService.getGame.mockReturnValue(undefined);

      const result = await invokeHandler('library:add-custom-config-path', {
        gameId: 'unknown-id',
        path: 'C:\\config',
        pathType: 'file',
        pcgwConfigPaths: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error for duplicate PCGW path', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockLibraryService.getGame.mockReturnValue(createMockGame());

      const result = await invokeHandler('library:add-custom-config-path', {
        gameId: 'game-id',
        path: 'C:\\config\\test.ini',
        pathType: 'file',
        pcgwConfigPaths: [{ path: 'C:\\config\\test.ini', pathType: 'file', exists: true, platform: 'windows' }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already listed');
    });

    it('should return error for duplicate custom path', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockLibraryService.getGame.mockReturnValue(
        createMockGame({
          extraConfigPaths: [{ path: 'C:\\config\\test.ini', pathType: 'file', exists: true, platform: 'custom', category: 'config' }],
        })
      );

      const result = await invokeHandler('library:add-custom-config-path', {
        gameId: 'game-id',
        path: 'C:\\config\\test.ini',
        pathType: 'file',
        pcgwConfigPaths: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already been added');
    });
  });

  describe('library:remove-custom-config-path', () => {
    it('should remove custom config path successfully', async () => {
      mockLibraryService.removeCustomConfigPath.mockResolvedValue(true);

      const result = await invokeHandler('library:remove-custom-config-path', {
        gameId: 'game-id',
        path: 'C:\\config\\test.ini',
      });

      expect(result.success).toBe(true);
    });

    it('should return error when path not found', async () => {
      mockLibraryService.removeCustomConfigPath.mockResolvedValue(false);

      const result = await invokeHandler('library:remove-custom-config-path', {
        gameId: 'game-id',
        path: 'C:\\nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('library:select-config-path', () => {
    it('should return file path when file selected', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['C:\\config\\test.ini'],
      });
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => false } as any);

      const result = await invokeHandler('library:select-config-path');

      expect(result).toEqual({ path: 'C:\\config\\test.ini', pathType: 'file' });
    });

    it('should return directory path when directory selected', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['C:\\config\\folder'],
      });
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);

      const result = await invokeHandler('library:select-config-path');

      expect(result).toEqual({ path: 'C:\\config\\folder', pathType: 'directory' });
    });

    it('should return null when dialog canceled', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const result = await invokeHandler('library:select-config-path');

      expect(result).toBeNull();
    });

    it('should return null on stat error', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['C:\\config\\error'],
      });
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));

      const result = await invokeHandler('library:select-config-path');

      expect(result).toBeNull();
    });
  });

  describe('library:launch-game (listener)', () => {
    it('should launch game via listener', () => {
      invokeListener('library:launch-game', 'game-id');

      expect(mockLibraryService.launchGame).toHaveBeenCalledWith('game-id');
    });
  });
});
