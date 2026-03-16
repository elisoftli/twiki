/**
 * ManualService Tests
 *
 * Tests the manual game launcher service basic functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameLauncher, type Game } from '../../../../interfaces/game-library.interface';

// Hoisted mocks for spawn
const mockSpawn = vi.hoisted(() => vi.fn());
const mockShellOpenPath = vi.hoisted(() => vi.fn());

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData'),
  },
  shell: {
    openPath: mockShellOpenPath,
  },
}));

// Mock child_process
vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn().mockResolvedValue('{}'),
    access: vi.fn().mockRejectedValue(new Error('File not found')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock json-store utils
vi.mock('../../../../utils/json-store.utils', () => ({
  ensureDirectoryExists: vi.fn().mockResolvedValue(undefined),
  ensureParentDirectoryExists: vi.fn().mockResolvedValue(undefined),
  atomicWriteJson: vi.fn().mockResolvedValue(undefined),
}));

// Mock system utilities
vi.mock('../../../../utils/system.utils', () => ({
  areProcessesRunning: vi.fn().mockResolvedValue(false),
  killProcesses: vi.fn().mockResolvedValue(undefined),
  waitForProcessTermination: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock('../../../../utils/logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock AppliedTweaksService
vi.mock('../../../tweak/applied-tweaks.service', () => ({
  AppliedTweaksService: {
    getByGame: vi.fn().mockResolvedValue([]),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock shared constants
vi.mock('@twiki/shared', () => ({
  PCGW_USER_AGENT: 'PCGamingWiki/1.0',
}));

// Helper to create mock child process
function createMockChildProcess() {
  return {
    unref: vi.fn(),
    on: vi.fn(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ManualService', () => {
  let ManualService: typeof import('../manual.launcher').ManualService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import('../manual.launcher');
    ManualService = module.ManualService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Constructor', () => {
    it('should set launcher type to MANUAL', () => {
      const service = new ManualService();
      expect(service.launcher).toBe(GameLauncher.MANUAL);
    });

    it('should initialize with empty state', () => {
      const service = new ManualService();
      expect(service.isLoaded).toBe(false);
      expect(service.error).toBeNull();
      expect(service.getGames()).toHaveLength(0);
    });
  });

  describe('loadEnvironment', () => {
    it('should return true with empty games when data file does not exist', async () => {
      const service = new ManualService();
      const result = await service.loadEnvironment();

      expect(result).toBe(true);
      expect(service.isLoaded).toBe(true);
      expect(service.getGames()).toHaveLength(0);
    });
  });

  describe('getGames', () => {
    it('should return empty array when not loaded', () => {
      const service = new ManualService();
      const games = service.getGames();
      expect(games).toHaveLength(0);
    });
  });

  describe('isGameRunning', () => {
    it('should return false for unknown game', async () => {
      const service = new ManualService();
      await service.loadEnvironment();
      const running = await service.isGameRunning('unknown-id');
      expect(running).toBe(false);
    });
  });

  describe('terminateGame', () => {
    it('should do nothing for unknown game', async () => {
      const { killProcesses } = await import('../../../../utils/system.utils');
      const service = new ManualService();
      await service.loadEnvironment();
      await service.terminateGame('unknown-id');
      expect(killProcesses).not.toHaveBeenCalled();
    });
  });

  describe('expandPath', () => {
    it('should return path unchanged', () => {
      const service = new ManualService();
      const result = service.expandPath('C:\\Games\\TestGame\\config.ini');
      expect(result).toBe('C:\\Games\\TestGame\\config.ini');
    });
  });

  describe('hasGameWithInstallPath', () => {
    it('should return false for non-existing path', async () => {
      const service = new ManualService();
      await service.loadEnvironment();
      expect(service.hasGameWithInstallPath('C:\\OtherPath')).toBe(false);
    });
  });

  describe('hasGameWithPcgwPageId', () => {
    it('should return false for non-existing page ID', async () => {
      const service = new ManualService();
      await service.loadEnvironment();
      expect(service.hasGameWithPcgwPageId(99999)).toBe(false);
    });
  });

  describe('launchGame', () => {
    const createMockGame = (overrides?: Partial<Game>): Game => ({
      id: 'manual-12345',
      launcherId: 'manual-12345',
      name: 'Test Game',
      launcher: GameLauncher.MANUAL,
      installPath: 'C:\\Games\\TestGame',
      posterPath: null,
      heroPath: null,
      launchConfigs: [
        {
          executable: 'C:\\Games\\TestGame\\game.exe',
          relativeExecutable: 'game.exe',
          type: 'default',
          description: 'Launch',
        },
      ],
      lastPlayed: null,
      pinnedAt: null,
      ...overrides,
    });

    beforeEach(() => {
      mockSpawn.mockReturnValue(createMockChildProcess());
      mockShellOpenPath.mockClear();
    });

    it('should use shell.openPath when no twiki config exists (default launch)', async () => {
      const { promises: fs } = await import('fs');
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
        version: 1,
        games: [{
          id: 'manual-12345',
          name: 'Test Game',
          installPath: 'C:\\Games\\TestGame',
          executablePath: 'C:\\Games\\TestGame\\game.exe',
          posterPath: null,
          pcgwPageId: 12345,
          importedAt: '2024-01-01T00:00:00Z',
        }],
        savedAt: '2024-01-01T00:00:00Z',
      }));

      const service = new ManualService();
      await service.loadEnvironment();

      // Create a game without twiki config
      const game = createMockGame();
      service.launchGame(game);

      expect(mockShellOpenPath).toHaveBeenCalledWith('C:\\Games\\TestGame\\game.exe');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should use spawn with args when twiki config exists (type === "twiki")', async () => {
      const { promises: fs } = await import('fs');
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
        version: 1,
        games: [{
          id: 'manual-12345',
          name: 'Test Game',
          installPath: 'C:\\Games\\TestGame',
          executablePath: 'C:\\Games\\TestGame\\game.exe',
          posterPath: null,
          pcgwPageId: 12345,
          importedAt: '2024-01-01T00:00:00Z',
        }],
        savedAt: '2024-01-01T00:00:00Z',
      }));

      const service = new ManualService();
      await service.loadEnvironment();

      // Create a game WITH twiki config (type: 'twiki')
      const game = createMockGame({
        launchConfigs: [
          {
            executable: 'C:\\Games\\TestGame\\game.exe',
            relativeExecutable: 'game.exe',
            type: 'default',
            description: 'Launch',
          },
          {
            executable: 'C:\\Games\\TestGame\\game.exe',
            relativeExecutable: 'game.exe',
            type: 'twiki',
            description: 'Launch with Twiki options',
            args: '-fullscreen -skipintro',
          },
        ],
      });

      service.launchGame(game);

      expect(mockSpawn).toHaveBeenCalledWith(
        'C:\\Games\\TestGame\\game.exe',
        ['-fullscreen', '-skipintro'],
        expect.objectContaining({
          cwd: 'C:\\Games\\TestGame',
          detached: true,
          stdio: 'ignore',
        })
      );
      expect(mockShellOpenPath).not.toHaveBeenCalled();
    });

    it('should parse quoted arguments correctly', async () => {
      const { promises: fs } = await import('fs');
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
        version: 1,
        games: [{
          id: 'manual-12345',
          name: 'Test Game',
          installPath: 'C:\\Games\\TestGame',
          executablePath: 'C:\\Games\\TestGame\\game.exe',
          posterPath: null,
          pcgwPageId: 12345,
          importedAt: '2024-01-01T00:00:00Z',
        }],
        savedAt: '2024-01-01T00:00:00Z',
      }));

      const service = new ManualService();
      await service.loadEnvironment();

      const game = createMockGame({
        launchConfigs: [
          {
            executable: 'C:\\Games\\TestGame\\game.exe',
            relativeExecutable: 'game.exe',
            type: 'default',
            description: 'Launch',
          },
          {
            executable: 'C:\\Games\\TestGame\\game.exe',
            relativeExecutable: 'game.exe',
            type: 'twiki',
            description: 'Launch with Twiki options',
            args: '-config "path with spaces" -name \'quoted\'',
          },
        ],
      });

      service.launchGame(game);

      expect(mockSpawn).toHaveBeenCalledWith(
        'C:\\Games\\TestGame\\game.exe',
        ['-config', 'path with spaces', '-name', 'quoted'],
        expect.any(Object)
      );
    });

    it('should fallback to shell.openPath when twiki config exists but has no args', async () => {
      const { promises: fs } = await import('fs');
      vi.mocked(fs.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
        version: 1,
        games: [{
          id: 'manual-12345',
          name: 'Test Game',
          installPath: 'C:\\Games\\TestGame',
          executablePath: 'C:\\Games\\TestGame\\game.exe',
          posterPath: null,
          pcgwPageId: 12345,
          importedAt: '2024-01-01T00:00:00Z',
        }],
        savedAt: '2024-01-01T00:00:00Z',
      }));

      const service = new ManualService();
      await service.loadEnvironment();

      // Twiki config exists but without args
      const game = createMockGame({
        launchConfigs: [
          {
            executable: 'C:\\Games\\TestGame\\game.exe',
            relativeExecutable: 'game.exe',
            type: 'default',
            description: 'Launch',
          },
          {
            executable: 'C:\\Games\\TestGame\\game.exe',
            relativeExecutable: 'game.exe',
            type: 'twiki',
            description: 'Launch with Twiki options',
            // No args property
          },
        ],
      });

      service.launchGame(game);

      // Should fallback to shell.openPath since no args
      expect(mockShellOpenPath).toHaveBeenCalledWith('C:\\Games\\TestGame\\game.exe');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should not launch unknown game', async () => {
      const service = new ManualService();
      await service.loadEnvironment();

      const game = createMockGame({ id: 'unknown-game' });
      service.launchGame(game);

      expect(mockShellOpenPath).not.toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });
});
