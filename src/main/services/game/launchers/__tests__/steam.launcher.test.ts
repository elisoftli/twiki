/**
 * SteamService Tests
 *
 * Tests the Steam game launcher service including:
 * - Basic initialization
 * - Environment loading error handling
 * - Path expansion
 * - Game launch functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameLauncher, type Game } from '../../../../interfaces/game-library.interface';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData'),
  },
  shell: {
    openExternal: vi.fn(),
  },
}));

// Mock fs promises
const mockFsReadFile = vi.fn();
const mockFsReaddir = vi.fn();
const mockFsAccess = vi.fn();
const mockFsMkdir = vi.fn();
const mockFsWriteFile = vi.fn();
vi.mock('fs', () => ({
  promises: {
    readFile: (...args: unknown[]) => mockFsReadFile(...args),
    readdir: (...args: unknown[]) => mockFsReaddir(...args),
    access: (...args: unknown[]) => mockFsAccess(...args),
    mkdir: (...args: unknown[]) => mockFsMkdir(...args),
    writeFile: (...args: unknown[]) => mockFsWriteFile(...args),
  },
}));

// Mock Steam utilities
const mockGetSteamInstallPath = vi.fn();
const mockGetMostRecentUserId = vi.fn();
const mockParseSteamData = vi.fn();
vi.mock('../../../../utils/steam.utils', () => ({
  getSteamInstallPath: () => mockGetSteamInstallPath(),
  getMostRecentUserId: (path: string) => mockGetMostRecentUserId(path),
  parseSteamData: (content: string) => mockParseSteamData(content),
}));

// Mock appinfo parser
const mockParseAppInfo = vi.fn();
vi.mock('../../../../utils/appinfo.utils', () => ({
  parseAppInfo: (path: string) => mockParseAppInfo(path),
}));

// Mock system utilities
const mockAreProcessesRunning = vi.fn();
const mockKillProcesses = vi.fn();
const mockWaitForProcessTermination = vi.fn();
const mockExpandWindowsEnvVars = vi.fn();
vi.mock('../../../../utils/system.utils', () => ({
  areProcessesRunning: (names: string[]) => mockAreProcessesRunning(names),
  killProcesses: (names: string[]) => mockKillProcesses(names),
  waitForProcessTermination: (names: string[], timeout: number) =>
    mockWaitForProcessTermination(names, timeout),
  expandWindowsEnvVars: (path: string) => mockExpandWindowsEnvVars(path),
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

// Import after mocks
import { SteamService } from '../steam.launcher';

// =============================================================================
// Tests
// =============================================================================

describe('SteamService', () => {
  let service: SteamService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    mockGetSteamInstallPath.mockResolvedValue('C:\\Program Files (x86)\\Steam');
    mockGetMostRecentUserId.mockResolvedValue('12345678');
    mockFsAccess.mockResolvedValue(undefined);
    mockFsReadFile.mockResolvedValue('');
    mockFsReaddir.mockResolvedValue([]);
    mockParseAppInfo.mockResolvedValue(new Map());
    mockParseSteamData.mockReturnValue({});
    mockExpandWindowsEnvVars.mockImplementation((path: string) => path);
    mockAreProcessesRunning.mockResolvedValue(false);
    mockKillProcesses.mockResolvedValue(undefined);
    mockWaitForProcessTermination.mockResolvedValue(undefined);

    service = new SteamService();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Constructor', () => {
    it('should set launcher type to STEAM', () => {
      expect(service.launcher).toBe(GameLauncher.STEAM);
    });

    it('should initialize with empty state', () => {
      expect(service.isLoaded).toBe(false);
      expect(service.error).toBeNull();
      expect(service.getGames()).toHaveLength(0);
    });
  });

  describe('loadEnvironment', () => {
    it('should return false when Steam is not installed', async () => {
      mockGetSteamInstallPath.mockResolvedValue(null);

      const result = await service.loadEnvironment();

      expect(result).toBe(false);
      expect(service.error).toBe('Steam installation not found in Windows registry');
    });

    it('should return false when no Steam user found', async () => {
      mockGetMostRecentUserId.mockResolvedValue(null);

      const result = await service.loadEnvironment();

      expect(result).toBe(false);
      expect(service.error).toBe('No Steam user data found');
    });

    it('should return false when user config file not found', async () => {
      mockFsAccess.mockRejectedValue(new Error('File not found'));

      const result = await service.loadEnvironment();

      expect(result).toBe(false);
      expect(service.error).toContain('User config file not found');
    });

    it('should handle unexpected errors gracefully', async () => {
      mockGetSteamInstallPath.mockRejectedValue(new Error('Unexpected error'));

      const result = await service.loadEnvironment();

      expect(result).toBe(false);
      expect(service.error).toContain('Unexpected error');
    });
  });

  describe('getGames', () => {
    it('should return empty array when not loaded', () => {
      const games = service.getGames();
      expect(games).toHaveLength(0);
    });
  });

  describe('getSteamGames', () => {
    it('should return empty array when not loaded', () => {
      const steamGames = service.getSteamGames();
      expect(steamGames).toHaveLength(0);
    });
  });

  describe('launchGame', () => {
    it('should open Steam protocol URL', async () => {
      const { shell } = await import('electron');
      const mockGame: Game = {
        id: 'steam:730:abcd1234',
        launcherId: '730',
        launcher: GameLauncher.STEAM,
        name: 'Counter-Strike 2',
        installPath: 'C:\\Games\\CS2',
        posterPath: null,
        heroPath: null,
        launchConfigs: [],
        lastPlayed: null,
        pinnedAt: null,
      };

      service.launchGame(mockGame);

      expect(shell.openExternal).toHaveBeenCalledWith('steam://run/730');
    });
  });

  describe('isGameRunning', () => {
    it('should return false for unknown game', async () => {
      const running = await service.isGameRunning('unknown-id');
      expect(running).toBe(false);
    });
  });

  describe('terminateGame', () => {
    it('should do nothing for unknown game', async () => {
      await service.terminateGame('unknown-id');
      expect(mockKillProcesses).not.toHaveBeenCalled();
    });
  });

  describe('expandPath', () => {
    it('should normalize path separators', async () => {
      mockParseSteamData.mockReturnValue({ libraryfolders: {} });
      await service.loadEnvironment();

      const result = service.expandPath('C:/Games//TestGame/config.ini');

      // Should have consistent separators
      expect(result).not.toContain('//');
    });
  });
});
