/**
 * GameLibraryService Tests
 *
 * Tests the game library aggregation service including:
 * - Singleton initialization and getInstance
 * - Game loading from all launchers
 * - Game filtering by enabled launcher setting
 * - Getting individual game by ID
 * - Updating game data (poster, pcgwPageId)
 * - Searching games by title
 * - Getting launcher statuses
 * - Notification of poster updates
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameLauncher, type Game } from '../../../interfaces/game-library.interface';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData'),
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

// Mock json-store utils
vi.mock('../../../utils/json-store.utils', () => ({
  ensureParentDirectoryExists: vi.fn().mockResolvedValue(undefined),
  atomicWriteJson: vi.fn().mockResolvedValue(undefined),
}));

// Mock fs promises
const mockFsAccess = vi.fn();
const mockFsReadFile = vi.fn();
vi.mock('fs', () => ({
  promises: {
    access: (...args: unknown[]) => mockFsAccess(...args),
    readFile: (...args: unknown[]) => mockFsReadFile(...args),
  },
}));

// Mock SettingsService
const mockSettings = {
  gameLibrary: {
    launchers: {
      [GameLauncher.STEAM]: { enabled: true },
      [GameLauncher.XBOX]: { enabled: true },
      [GameLauncher.MANUAL]: { enabled: true },
    },
  },
};
vi.mock('../../core/settings.service', () => ({
  SettingsService: {
    get settings() {
      return mockSettings;
    },
  },
}));

// Mock resolveDirectoryFiles
vi.mock('../pcgamingwiki.service', () => ({
  resolveDirectoryFiles: vi.fn().mockResolvedValue([]),
}));

// Mock launcher services - must be defined before they're used in mocks
const mockSteamService = {
  launcher: GameLauncher.STEAM,
  isLoaded: true,
  error: null as string | null,
  installPath: '/mock/launcher/path',
  loadEnvironment: vi.fn().mockResolvedValue(true),
  getGames: vi.fn().mockReturnValue([]),
  launchGame: vi.fn(),
  isGameRunning: vi.fn().mockResolvedValue(false),
  terminateGame: vi.fn().mockResolvedValue(undefined),
  expandPath: vi.fn().mockImplementation((path: string) => path),
};

const mockXboxService = {
  launcher: GameLauncher.XBOX,
  isLoaded: true,
  error: null as string | null,
  installPath: '/mock/launcher/path',
  loadEnvironment: vi.fn().mockResolvedValue(true),
  getGames: vi.fn().mockReturnValue([]),
  launchGame: vi.fn(),
  isGameRunning: vi.fn().mockResolvedValue(false),
  terminateGame: vi.fn().mockResolvedValue(undefined),
  expandPath: vi.fn().mockImplementation((path: string) => path),
};

const mockManualService = {
  launcher: GameLauncher.MANUAL,
  isLoaded: true,
  error: null as string | null,
  installPath: '/mock/launcher/path',
  loadEnvironment: vi.fn().mockResolvedValue(true),
  getGames: vi.fn().mockReturnValue([]),
  launchGame: vi.fn(),
  isGameRunning: vi.fn().mockResolvedValue(false),
  terminateGame: vi.fn().mockResolvedValue(undefined),
  expandPath: vi.fn().mockImplementation((path: string) => path),
  importGame: vi.fn(),
  deleteGame: vi.fn(),
  hasGameWithPcgwPageId: vi.fn().mockReturnValue(false),
};

vi.mock('../launchers/steam.launcher', () => ({
  SteamService: vi.fn().mockImplementation(function() { return mockSteamService; }),
}));

vi.mock('../launchers/xbox.launcher', () => ({
  XboxService: vi.fn().mockImplementation(function() { return mockXboxService; }),
}));

vi.mock('../launchers/manual.launcher', () => ({
  ManualService: vi.fn().mockImplementation(function() { return mockManualService; }),
}));

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

// =============================================================================
// Tests
// =============================================================================

// Reset singleton between tests
let GameLibraryService: typeof import('../game-library.service').GameLibraryService;

describe('GameLibraryService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockFsAccess.mockRejectedValue(new Error('File not found')); // No cache by default
    mockFsReadFile.mockResolvedValue('{}');

    // Reset singleton by re-importing
    vi.resetModules();
    const module = await import('../game-library.service');
    GameLibraryService = module.GameLibraryService;

    // Reset mock settings
    mockSettings.gameLibrary = {
      launchers: {
        [GameLauncher.STEAM]: { enabled: true },
        [GameLauncher.XBOX]: { enabled: true },
        [GameLauncher.MANUAL]: { enabled: true },
      },
    };
  });

  afterEach(() => {
    // Clean up singleton for next test
    vi.resetModules();
  });

  describe('Singleton Pattern', () => {
    it('should throw if getInstance called before initialize', () => {
      expect(() => GameLibraryService.getInstance()).toThrow(
        'GameLibraryService has not been initialized'
      );
    });

    it('should return instance after initialize', () => {
      const instance = GameLibraryService.initialize();
      expect(instance).toBeDefined();
      expect(GameLibraryService.getInstance()).toBe(instance);
    });

    it('should throw if initialize called twice', () => {
      GameLibraryService.initialize();
      expect(() => GameLibraryService.initialize()).toThrow(
        'GameLibraryService has already been initialized'
      );
    });
  });

  describe('loadAllLaunchers', () => {
    it('should load games from all enabled launchers', async () => {
      const steamGame = createMockGame({ id: 'steam-1', name: 'Steam Game', launcher: GameLauncher.STEAM });
      const xboxGame = createMockGame({ id: 'xbox-1', name: 'Xbox Game', launcher: GameLauncher.XBOX });

      mockSteamService.getGames = vi.fn().mockReturnValue([steamGame]);
      mockXboxService.getGames = vi.fn().mockReturnValue([xboxGame]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      expect(service.isLoaded).toBe(true);
      expect(service.games).toHaveLength(2);
      expect(service.games.map((g) => g.name)).toContain('Steam Game');
      expect(service.games.map((g) => g.name)).toContain('Xbox Game');
    });

    it('should skip disabled launchers', async () => {
      mockSettings.gameLibrary.launchers[GameLauncher.XBOX] = { enabled: false };

      const steamGame = createMockGame({ id: 'steam-1', launcher: GameLauncher.STEAM });
      const xboxGame = createMockGame({ id: 'xbox-1', launcher: GameLauncher.XBOX });

      mockSteamService.getGames = vi.fn().mockReturnValue([steamGame]);
      mockXboxService.getGames = vi.fn().mockReturnValue([xboxGame]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      // Only Steam games should be loaded
      expect(service.games).toHaveLength(1);
      expect(service.games[0].launcher).toBe(GameLauncher.STEAM);
    });

    it('should send library:loaded event after loading', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      expect(mockSendEvent).toHaveBeenCalledWith('library:loaded', {
        gameCount: expect.any(Number),
      });
    });

    it('should sort games with pinned first, then alphabetically', async () => {
      const gameA = createMockGame({ id: 'a', name: 'Alpha', pinnedAt: null });
      const gameB = createMockGame({ id: 'b', name: 'Beta', pinnedAt: null });
      const gameC = createMockGame({ id: 'c', name: 'Charlie', pinnedAt: null });

      mockSteamService.getGames = vi.fn().mockReturnValue([gameA, gameB, gameC]);
      mockXboxService.getGames = vi.fn().mockReturnValue([]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      // Initially all unpinned, sorted alphabetically
      expect(service.games[0].name).toBe('Alpha');
      expect(service.games[1].name).toBe('Beta');
      expect(service.games[2].name).toBe('Charlie');

      // Pin Charlie first
      await service.pinGame('c');
      // Pinned Charlie should be first now
      expect(service.games[0].name).toBe('Charlie');

      // Pin Beta - it should be the newest pinned
      await service.pinGame('b');

      // Both pinned games should come before unpinned Alpha
      // The order between Beta and Charlie depends on their pinnedAt times
      // Since pinGame uses new Date().toISOString(), pinning may happen in same millisecond
      // Just verify pinned games come first and Alpha is last
      const pinnedGames = service.games.filter(g => g.pinnedAt !== null);
      const unpinnedGames = service.games.filter(g => g.pinnedAt === null);

      expect(pinnedGames).toHaveLength(2);
      expect(unpinnedGames).toHaveLength(1);
      expect(unpinnedGames[0].name).toBe('Alpha');
      expect(service.games[2].name).toBe('Alpha'); // Alpha should be last
    });
  });

  describe('getGame', () => {
    it('should return game by ID', async () => {
      const game = createMockGame({ id: 'test-game-id', name: 'Test Game' });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      const found = service.getGame('test-game-id');
      expect(found).toBeDefined();
      expect(found?.name).toBe('Test Game');
    });

    it('should return undefined for unknown ID', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      const found = service.getGame('unknown-id');
      expect(found).toBeUndefined();
    });
  });

  describe('updateGame', () => {
    it('should update game with partial data', async () => {
      const game = createMockGame({ id: 'test-id', name: 'Original Name' });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      await service.updateGame('test-id', { pcgwPageId: 12345 });

      const updated = service.getGame('test-id');
      expect(updated?.pcgwPageId).toBe(12345);
      expect(updated?.name).toBe('Original Name');
    });

    it('should do nothing for unknown game ID', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      // Should not throw
      await service.updateGame('unknown-id', { pcgwPageId: 12345 });
    });
  });

  describe('updateGamePoster', () => {
    it('should update poster path and notify renderer', async () => {
      const game = createMockGame({ id: 'test-id', launcherId: 'launcher-123', posterPath: null });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();
      mockSendEvent.mockClear();

      service.updateGamePoster('launcher-123', '/new/poster/path.jpg');

      const updated = service.getGame('test-id');
      expect(updated?.posterPath).toBe('/new/poster/path.jpg');
      expect(mockSendEvent).toHaveBeenCalledWith('library:game-poster-updated', {
        id: 'test-id',
        posterPath: '/new/poster/path.jpg',
      });
    });

    it('should do nothing for unknown game ID', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();
      mockSendEvent.mockClear();

      service.updateGamePoster('unknown-id', '/path.jpg');

      expect(mockSendEvent).not.toHaveBeenCalled();
    });
  });

  describe('updateGameHero', () => {
    it('should update hero path and notify renderer', async () => {
      const game = createMockGame({ id: 'test-id', launcherId: 'launcher-123', heroPath: null });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();
      mockSendEvent.mockClear();

      service.updateGameHero('launcher-123', '/new/hero/path.jpg');

      const updated = service.getGame('test-id');
      expect(updated?.heroPath).toBe('/new/hero/path.jpg');
      expect(mockSendEvent).toHaveBeenCalledWith('library:game-hero-updated', {
        id: 'test-id',
        heroPath: '/new/hero/path.jpg',
      });
    });
  });

  describe('getStatus', () => {
    it('should return status for all launchers', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      const status = service.getStatus();

      expect(status.isLoaded).toBe(true);
      expect(status.error).toBeNull();
      expect(status.launchers[GameLauncher.STEAM]).toBeDefined();
      expect(status.launchers[GameLauncher.XBOX]).toBeDefined();
    });
  });

  describe('launchGame', () => {
    it('should delegate to launcher service', async () => {
      const game = createMockGame({ id: 'test-id', launcher: GameLauncher.STEAM });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      service.launchGame('test-id');

      expect(mockSteamService.launchGame).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-id' }));
    });

    it('should do nothing for unknown game ID', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      // Should not throw
      service.launchGame('unknown-id');
      expect(mockSteamService.launchGame).not.toHaveBeenCalled();
    });
  });

  describe('isGameRunning', () => {
    it('should delegate to launcher service', async () => {
      const game = createMockGame({ id: 'test-id', launcherId: 'launcher-456', launcher: GameLauncher.STEAM });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);
      mockSteamService.isGameRunning = vi.fn().mockResolvedValue(true);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      const running = await service.isGameRunning('test-id');

      expect(running).toBe(true);
      expect(mockSteamService.isGameRunning).toHaveBeenCalledWith('launcher-456');
    });

    it('should return false for unknown game ID', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      const running = await service.isGameRunning('unknown-id');
      expect(running).toBe(false);
    });
  });

  describe('terminateGame', () => {
    it('should delegate to launcher service', async () => {
      const game = createMockGame({ id: 'test-id', launcherId: 'launcher-456', launcher: GameLauncher.STEAM });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      await service.terminateGame('test-id');

      expect(mockSteamService.terminateGame).toHaveBeenCalledWith('launcher-456');
    });
  });

  describe('pinGame / unpinGame', () => {
    it('should pin a game and re-sort', async () => {
      const gameA = createMockGame({ id: 'a', name: 'Alpha', pinnedAt: null });
      const gameB = createMockGame({ id: 'b', name: 'Beta', pinnedAt: null });
      mockSteamService.getGames = vi.fn().mockReturnValue([gameA, gameB]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();
      mockSendEvent.mockClear();

      await service.pinGame('b');

      const games = service.games;
      expect(games[0].id).toBe('b'); // Pinned game should be first
      expect(games[0].pinnedAt).toBeDefined();
      expect(mockSendEvent).toHaveBeenCalledWith('library:game-pinned', expect.any(Object));
    });

    it('should unpin a game and re-sort', async () => {
      const gameA = createMockGame({ id: 'a', name: 'Alpha', pinnedAt: '2024-01-01T00:00:00Z' });
      const gameB = createMockGame({ id: 'b', name: 'Beta', pinnedAt: null });
      mockSteamService.getGames = vi.fn().mockReturnValue([gameA, gameB]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();
      mockSendEvent.mockClear();

      await service.unpinGame('a');

      const games = service.games;
      // After unpinning Alpha, both are sorted alphabetically
      expect(games[0].id).toBe('a'); // Alpha comes before Beta
      expect(games[0].pinnedAt).toBeNull();
      expect(mockSendEvent).toHaveBeenCalledWith('library:game-unpinned', { id: 'a' });
    });
  });

  describe('expandPath', () => {
    it('should delegate to launcher service and replace path-to-game', async () => {
      const game = createMockGame({
        id: 'test-id',
        launcher: GameLauncher.STEAM,
        installPath: 'C:\\Games\\TestGame',
      });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);
      mockSteamService.expandPath = vi.fn().mockImplementation((path: string) => path);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      const expanded = service.expandPath('test-id', '<path-to-game>\\config.ini');

      expect(expanded).toBe('C:\\Games\\TestGame\\config.ini');
    });

    it('should return original path for unknown game', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      const result = service.expandPath('unknown-id', '<path-to-game>\\config.ini');
      expect(result).toBe('<path-to-game>\\config.ini');
    });
  });

  describe('hasGameWithInstallPath', () => {
    it('should return true for existing path (case-insensitive)', async () => {
      const game = createMockGame({ id: 'test-id', installPath: 'C:\\Games\\TestGame' });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      expect(service.hasGameWithInstallPath('c:\\games\\testgame')).toBe(true);
      expect(service.hasGameWithInstallPath('C:/Games/TestGame')).toBe(true);
    });

    it('should return false for non-existing path', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      expect(service.hasGameWithInstallPath('C:\\SomeOther\\Path')).toBe(false);
    });
  });

  describe('addGame / removeGame', () => {
    it('should add a game and notify renderer', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();
      mockSendEvent.mockClear();

      const newGame = createMockGame({ id: 'new-game', name: 'New Game' });
      await service.addGame(newGame);

      expect(service.games.map((g) => g.id)).toContain('new-game');
      expect(mockSendEvent).toHaveBeenCalledWith('library:game-added', { game: newGame });
    });

    it('should remove a game and notify renderer', async () => {
      const game = createMockGame({ id: 'test-id' });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();
      mockSendEvent.mockClear();

      await service.removeGame('test-id');

      expect(service.games.map((g) => g.id)).not.toContain('test-id');
      expect(mockSendEvent).toHaveBeenCalledWith('library:game-removed', { id: 'test-id' });
    });
  });

  describe('addCustomConfigPath / removeCustomConfigPath', () => {
    it('should add a custom config path to a game', async () => {
      const game = createMockGame({ id: 'test-id' });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();
      mockSendEvent.mockClear();

      const configPath = await service.addCustomConfigPath('test-id', 'C:\\config\\test.ini', 'file');

      expect(configPath).toBeDefined();
      expect(configPath?.path).toBe('C:\\config\\test.ini');
      expect(configPath?.pathType).toBe('file');
      expect(mockSendEvent).toHaveBeenCalledWith('library:custom-config-path-added', expect.any(Object));
    });

    it('should return null for unknown game', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      const result = await service.addCustomConfigPath('unknown-id', 'C:\\path', 'file');
      expect(result).toBeNull();
    });

    it('should remove a custom config path from a game', async () => {
      const game = createMockGame({ id: 'test-id' });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      // First add a config path
      await service.addCustomConfigPath('test-id', 'C:\\config\\test.ini', 'file');
      mockSendEvent.mockClear();

      // Then remove it
      const removed = await service.removeCustomConfigPath('test-id', 'C:\\config\\test.ini');

      expect(removed).toBe(true);
      expect(mockSendEvent).toHaveBeenCalledWith('library:custom-config-path-removed', expect.any(Object));
    });

    it('should return false when path not found', async () => {
      const game = createMockGame({ id: 'test-id' });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      const removed = await service.removeCustomConfigPath('test-id', 'C:\\nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('forceReload', () => {
    it('should reload all launchers and skip cache', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      // Reset mocks
      mockSteamService.loadEnvironment = vi.fn().mockResolvedValue(true);

      await service.forceReload();

      expect(mockSteamService.loadEnvironment).toHaveBeenCalled();
      expect(service.isLoaded).toBe(true);
    });
  });

  describe('games getter', () => {
    it('should return a copy of games array', async () => {
      const game = createMockGame({ id: 'test-id' });
      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      const games1 = service.games;
      const games2 = service.games;

      expect(games1).not.toBe(games2);
      expect(games1).toEqual(games2);
    });
  });

  describe('getManualService', () => {
    it('should return the ManualService instance', () => {
      const service = GameLibraryService.initialize();
      const manualService = service.getManualService();

      expect(manualService).toBeDefined();
    });
  });

  describe('expandLauncherPath', () => {
    it('should expand %STEAMDIR% variable', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      const expanded = service.expandLauncherPath('%STEAMDIR%\\userdata');

      expect(expanded).toBe('/mock/launcher/path\\userdata');
    });

    it('should leave unknown variables unchanged', async () => {
      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      const result = service.expandLauncherPath('%UNKNOWN%\\path');
      expect(result).toBe('%UNKNOWN%\\path');
    });
  });

  describe('Twiki Launch Configs', () => {
    it('should preserve twiki launch configs across aggregateGames() / forceReload()', async () => {
      // The launcher always returns fresh games without twiki configs
      // (twiki configs are stored separately in GameLibraryService's cache)
      const createFreshSteamGame = () => createMockGame({
        id: 'steam-1',
        name: 'Steam Game',
        launcher: GameLauncher.STEAM,
        launchConfigs: [
          { executable: 'C:\\Games\\game.exe', relativeExecutable: 'game.exe', type: 'default', description: 'Play' },
        ],
      });

      mockSteamService.getGames = vi.fn().mockImplementation(() => [createFreshSteamGame()]);
      mockXboxService.getGames = vi.fn().mockReturnValue([]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      // Add a twiki launch config
      await service.addTwikiLaunchConfig('steam-1', '-fullscreen');

      // Verify it was added
      let game = service.getGame('steam-1');
      expect(game?.launchConfigs).toHaveLength(2);
      expect(game?.launchConfigs.find((c) => c.type === 'twiki')).toBeDefined();
      expect(game?.launchConfigs.find((c) => c.type === 'twiki')?.args).toBe('-fullscreen');

      // Force reload (which re-aggregates games from launchers)
      // The launcher returns a fresh game without twiki config, but aggregateGames()
      // should preserve the twiki config from before the reload
      await service.forceReload();

      // Twiki config should still be present after reload
      game = service.getGame('steam-1');
      expect(game?.launchConfigs).toHaveLength(2);
      const twikiConfig = game?.launchConfigs.find((c) => c.type === 'twiki');
      expect(twikiConfig).toBeDefined();
      expect(twikiConfig?.args).toBe('-fullscreen');
    });

    it('should remove twiki launch config when removeTwikiLaunchConfig is called', async () => {
      const game = createMockGame({
        id: 'test-game',
        launchConfigs: [
          { executable: 'C:\\Games\\game.exe', relativeExecutable: 'game.exe', type: 'default', description: 'Play' },
        ],
      });

      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      // Add a twiki launch config
      await service.addTwikiLaunchConfig('test-game', '-custom');
      expect(service.getGame('test-game')?.launchConfigs).toHaveLength(2);

      // Remove it
      const removed = await service.removeTwikiLaunchConfig('test-game');
      expect(removed).toBe(true);
      expect(service.getGame('test-game')?.launchConfigs).toHaveLength(1);
      expect(service.getGame('test-game')?.launchConfigs[0].type).toBe('default');
    });

    it('should return false when removeTwikiLaunchConfig called for non-existent config', async () => {
      const game = createMockGame({
        id: 'test-game',
        launchConfigs: [
          { executable: 'C:\\Games\\game.exe', relativeExecutable: 'game.exe', type: 'default', description: 'Play' },
        ],
      });

      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      // Try to remove non-existent twiki config
      const removed = await service.removeTwikiLaunchConfig('test-game');
      expect(removed).toBe(false);
    });

    it('should update existing twiki config when addTwikiLaunchConfig called twice', async () => {
      const game = createMockGame({
        id: 'test-game',
        launchConfigs: [
          { executable: 'C:\\Games\\game.exe', relativeExecutable: 'game.exe', type: 'default', description: 'Play' },
        ],
      });

      mockSteamService.getGames = vi.fn().mockReturnValue([game]);

      const service = GameLibraryService.initialize();
      await service.loadAllLaunchers();

      // Add a twiki launch config
      await service.addTwikiLaunchConfig('test-game', '-first');
      expect(service.getGame('test-game')?.launchConfigs).toHaveLength(2);

      // Add another - should update, not create new
      await service.addTwikiLaunchConfig('test-game', '-second');
      expect(service.getGame('test-game')?.launchConfigs).toHaveLength(2);
      expect(service.getGame('test-game')?.launchConfigs.find((c) => c.type === 'twiki')?.args).toBe('-second');
    });
  });
});
