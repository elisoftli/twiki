/**
 * PCGamingWiki Service Tests
 *
 * Tests the PCGW data fetching via server proxy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameLauncher, type Game } from '../../interfaces/game-library.interface';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock GameLibraryService
const mockGetGame = vi.fn();
const mockUpdateGame = vi.fn();
vi.mock('../game/game-library.service', () => ({
  GameLibraryService: {
    getInstance: () => ({
      getGame: mockGetGame,
      updateGame: mockUpdateGame,
      expandPath: (_gameId: string, path: string) => path,
    }),
  },
}));

// Mock EnvService
vi.mock('../core/env.service', () => ({
  EnvService: {
    get: (key: string) => {
      if (key === 'API_URL') return 'http://localhost:4111/api';
      if (key === 'PCGW_CACHE_ENABLED') return true;
      return undefined;
    },
  },
}));

// Mock logger
vi.mock('../../utils', () => ({
  createLogger: () => ({
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
  expandWindowsEnvVars: (path: string) => path,
  withRetry: async <T>(fn: () => Promise<T>) => fn(),
}));

// Mock glob
vi.mock('glob', () => ({
  glob: vi.fn().mockResolvedValue([]),
}));

// Mock fs
vi.mock('fs', () => ({
  promises: {
    access: vi.fn().mockRejectedValue(new Error('Not found')),
    stat: vi.fn().mockRejectedValue(new Error('Not found')),
  },
}));

// Mock listDirectoryContents
vi.mock('../../tools/io/utils/list-directory-contents', () => ({
  listDirectoryContents: vi.fn().mockResolvedValue({ files: [], directories: [] }),
}));

import { PCGamingWikiService } from '../game/pcgamingwiki.service';

// Helper to create a mock game object
function createMockGame(overrides: Partial<Game> = {}): Game {
  return {
    id: '12345',
    launcherId: '12345',
    launcher: GameLauncher.STEAM,
    name: 'Test Game',
    installPath: 'C:\\Games\\TestGame',
    posterPath: null,
    heroPath: null,
    launchConfigs: [],
    lastPlayed: null,
    pinnedAt: null,
    ...overrides,
  };
}

function createMockServerGameResponse(pcgwPageId: number = 999) {
  return {
    pcgwPageId,
    pcgwPageName: 'Test Game',
    tweakGroups: [{ title: 'Video', tweaks: [] }],
    configPaths: [],
  };
}

describe('PCGamingWikiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('getGameFixes', () => {
    it('fetches Steam game via server /game endpoint with launcher and id', async () => {
      const steamGame = createMockGame({
        id: 'steam:730:abcd1234',
        launcherId: '730',
        launcher: GameLauncher.STEAM,
        name: 'Counter-Strike 2',
      });
      mockGetGame.mockReturnValue(steamGame);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createMockServerGameResponse(12345)),
      });

      await PCGamingWikiService.getGameFixes('steam:730:abcd1234', GameLauncher.STEAM);

      // Verify server /game endpoint was called with correct params
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/pcgw/game');
      expect(url).toContain('launcher=steam');
      expect(url).toContain('id=730');
      // Steam games should not include name param
      expect(url).not.toContain('name=');

      // Should cache pcgwPageId
      expect(mockUpdateGame).toHaveBeenCalledWith('steam:730:abcd1234', { pcgwPageId: 12345 });
    });

    it('includes name param for non-Steam games', async () => {
      const xboxGame = createMockGame({
        id: '9NXXX',
        launcherId: '9NXXX',
        launcher: GameLauncher.XBOX,
        name: 'Xbox Game',
      });
      mockGetGame.mockReturnValue(xboxGame);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createMockServerGameResponse(54321)),
      });

      await PCGamingWikiService.getGameFixes('9NXXX', GameLauncher.XBOX);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('launcher=xbox');
      expect(url).toContain('id=9NXXX');
      expect(url).toContain('name=Xbox+Game');

      expect(mockUpdateGame).toHaveBeenCalledWith('9NXXX', { pcgwPageId: 54321 });
    });

    it('includes pcgwPageId param when cached on game', async () => {
      const xboxGame = createMockGame({
        id: '9NYYY',
        launcherId: '9NYYY',
        launcher: GameLauncher.XBOX,
        name: 'Xbox Game With PageId',
        pcgwPageId: 88888,
      });
      mockGetGame.mockReturnValue(xboxGame);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createMockServerGameResponse(88888)),
      });

      await PCGamingWikiService.getGameFixes('9NYYY', GameLauncher.XBOX);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('pcgwPageId=88888');

      expect(mockUpdateGame).toHaveBeenCalledWith('9NYYY', { pcgwPageId: 88888 });
    });

    it('returns null when game is not found in library', async () => {
      mockGetGame.mockReturnValue(undefined);

      const result = await PCGamingWikiService.getGameFixes('unknown', GameLauncher.STEAM);

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns null when server returns 404', async () => {
      const steamGame = createMockGame({
        id: '99999',
        launcherId: '99999',
        launcher: GameLauncher.STEAM,
        name: 'Unknown Game',
      });
      mockGetGame.mockReturnValue(steamGame);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await PCGamingWikiService.getGameFixes('99999', GameLauncher.STEAM);

      expect(result).toBeNull();
      expect(mockUpdateGame).not.toHaveBeenCalled();
    });
  });
});
