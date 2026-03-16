/**
 * NexusModsService Tests
 *
 * Tests the NexusMods service including:
 * - GraphQL query execution and error handling
 * - Game search (WILDCARD matching)
 * - Game resolution with fuzzy matching (rejects false matches)
 * - Mod search with filters and pagination
 * - Mod file listing
 * - Game lookup by domain
 * - Single mod fetch
 * - Download URL retrieval (REST v1)
 * - Name normalization (trademark symbols, smart quotes, dashes)
 * - GraphQL string escaping
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  NexusModsGame,
  NexusModsMod,
  NexusModsModFile,
} from '../../../interfaces/nexusmods.interface';

// Mock logger
vi.mock('../../../utils', () => ({
  createLogger: () => ({
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocks
import { NexusModsService } from '../nexusmods.service';

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockGame(overrides?: Partial<NexusModsGame>): NexusModsGame {
  return {
    id: 1704,
    name: 'Skyrim Special Edition',
    domainName: 'skyrimspecialedition',
    modCount: 80000,
    ...overrides,
  };
}

function createMockMod(overrides?: Partial<NexusModsMod>): NexusModsMod {
  return {
    uid: 'mod-1',
    modId: 1,
    gameId: 1704,
    name: 'Test Mod',
    summary: 'A test mod',
    description: 'A detailed description',
    version: '1.0',
    author: 'TestAuthor',
    status: 'published',
    downloads: 1000,
    endorsements: 100,
    pictureUrl: null,
    thumbnailUrl: null,
    createdAt: '2024-01-01',
    updatedAt: '2024-06-01',
    adultContent: false,
    modCategory: { name: 'Gameplay' },
    modRequirements: null,
    ...overrides,
  };
}

function createMockModFile(overrides?: Partial<NexusModsModFile>): NexusModsModFile {
  return {
    fileId: 100,
    modId: 1,
    name: 'Test Mod Main File',
    version: '1.0',
    description: 'Main file',
    category: 'MAIN',
    categoryId: 1,
    size: 1024,
    sizeInBytes: 1048576,
    date: 1704067200,
    uri: 'test-mod-1.0.zip',
    primary: 1,
    scannedV2: 'safe',
    changelogText: ['Initial release'],
    ...overrides,
  };
}

/** Helper to mock a successful GraphQL response */
function mockGraphQLResponse(data: Record<string, unknown>): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data }),
  });
}

/** Helper to mock a GraphQL error response */
function mockGraphQLError(messages: string[]): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      errors: messages.map((message) => ({ message })),
    }),
  });
}

/** Helper to mock an HTTP error response */
function mockHttpError(status: number): void {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
  });
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NexusModsService', () => {
  // ---------------------------------------------------------------------------
  // GraphQL error handling
  // ---------------------------------------------------------------------------

  describe('GraphQL error handling', () => {
    it('should throw on HTTP error responses', async () => {
      mockHttpError(500);
      await expect(NexusModsService.searchGames('test')).rejects.toThrow(
        'NexusMods GraphQL request failed with status 500'
      );
    });

    it('should throw on GraphQL errors in response body', async () => {
      mockGraphQLError(['Rate limited', 'Server error']);
      await expect(NexusModsService.searchGames('test')).rejects.toThrow(
        'NexusMods GraphQL error: Rate limited; Server error'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // searchGames
  // ---------------------------------------------------------------------------

  describe('searchGames', () => {
    it('should return matching games', async () => {
      const game = createMockGame();
      mockGraphQLResponse({ games: { nodes: [game] } });

      const result = await NexusModsService.searchGames('Skyrim');
      expect(result).toEqual([game]);
    });

    it('should return empty array when no games match', async () => {
      mockGraphQLResponse({ games: { nodes: [] } });

      const result = await NexusModsService.searchGames('NonexistentGame');
      expect(result).toEqual([]);
    });

    it('should handle missing games field gracefully', async () => {
      mockGraphQLResponse({});

      const result = await NexusModsService.searchGames('test');
      expect(result).toEqual([]);
    });

    it('should strip trademark symbols from search query', async () => {
      mockGraphQLResponse({ games: { nodes: [] } });

      await NexusModsService.searchGames('DOOM Eternal™');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).toContain('DOOM Eternal');
      expect(body.query).not.toContain('™');
    });

    it('should replace smart quotes in search query', async () => {
      mockGraphQLResponse({ games: { nodes: [] } });

      await NexusModsService.searchGames('Dragon\u2019s Dogma');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).toContain("Dragon's Dogma");
    });

    it('should replace en/em dashes with hyphens', async () => {
      mockGraphQLResponse({ games: { nodes: [] } });

      await NexusModsService.searchGames('Nier: Automata\u2014Game');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).toContain('Nier: Automata-Game');
    });

    it('should escape double quotes for GraphQL', async () => {
      mockGraphQLResponse({ games: { nodes: [] } });

      await NexusModsService.searchGames('Game "Remastered"');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).toContain('Game \\"Remastered\\"');
    });
  });

  // ---------------------------------------------------------------------------
  // resolveGame
  // ---------------------------------------------------------------------------

  describe('resolveGame', () => {
    it('should return exact match when available', async () => {
      const deadlock = createMockGame({ id: 9999, name: 'Deadlock', domainName: 'deadlock', modCount: 50 });
      mockGraphQLResponse({ games: { nodes: [deadlock] } });

      const result = await NexusModsService.resolveGame('Deadlock');
      expect(result).toEqual(deadlock);
    });

    it('should reject false matches (Deadlock vs Battlestar Galactica Deadlock)', async () => {
      const bsg = createMockGame({
        id: 6056,
        name: 'Battlestar Galactica Deadlock',
        domainName: 'battlestargalacticadeadlock',
        modCount: 2,
      });
      mockGraphQLResponse({ games: { nodes: [bsg] } });

      const result = await NexusModsService.resolveGame('Deadlock');
      expect(result).toBeNull();
    });

    it('should return null when no games are found', async () => {
      mockGraphQLResponse({ games: { nodes: [] } });

      const result = await NexusModsService.resolveGame('CompletelyMadeUpGame');
      expect(result).toBeNull();
    });

    it('should select best fuzzy match among multiple candidates', async () => {
      const skyrimSE = createMockGame({
        id: 1704,
        name: 'Skyrim Special Edition',
        domainName: 'skyrimspecialedition',
        modCount: 80000,
      });
      const skyrimVR = createMockGame({
        id: 2805,
        name: 'Skyrim VR',
        domainName: 'skyrimvr',
        modCount: 5000,
      });
      mockGraphQLResponse({ games: { nodes: [skyrimSE, skyrimVR] } });

      const result = await NexusModsService.resolveGame('Skyrim Special Edition');
      expect(result).toEqual(skyrimSE);
    });

    it('should match games with minor name differences (edition suffixes)', async () => {
      const witcher3 = createMockGame({
        id: 952,
        name: 'The Witcher 3',
        domainName: 'witcher3',
        modCount: 10000,
      });
      mockGraphQLResponse({ games: { nodes: [witcher3] } });

      const result = await NexusModsService.resolveGame('The Witcher 3');
      expect(result).toEqual(witcher3);
    });

    it('should reject sequel number mismatch (Hades vs Hades 2)', async () => {
      const hades2 = createMockGame({
        id: 7000,
        name: 'Hades II',
        domainName: 'hades2',
        modCount: 500,
      });
      mockGraphQLResponse({ games: { nodes: [hades2] } });

      // "Hades" looking for the original should not resolve to "Hades II"
      const result = await NexusModsService.resolveGame('Hades');
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // searchMods
  // ---------------------------------------------------------------------------

  describe('searchMods', () => {
    it('should return mods with pagination info', async () => {
      const mod = createMockMod();
      mockGraphQLResponse({ mods: { nodes: [mod], totalCount: 1 } });

      const result = await NexusModsService.searchMods(
        'skyrimspecialedition',
        null,
        { field: 'downloads', direction: 'DESC' },
        0,
        20
      );

      expect(result.nodes).toEqual([mod]);
      expect(result.totalCount).toBe(1);
    });

    it('should include name filter when queryText is provided', async () => {
      mockGraphQLResponse({ mods: { nodes: [], totalCount: 0 } });

      await NexusModsService.searchMods(
        'skyrimspecialedition',
        'SkyUI',
        { field: 'relevance', direction: 'DESC' },
        0,
        20
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).toContain('nameStemmed');
      expect(body.query).toContain('SkyUI');
    });

    it('should omit name filter when queryText is null', async () => {
      mockGraphQLResponse({ mods: { nodes: [], totalCount: 0 } });

      await NexusModsService.searchMods(
        'skyrimspecialedition',
        null,
        { field: 'downloads', direction: 'DESC' },
        0,
        20
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).not.toContain('nameStemmed');
    });

    it('should handle missing mods field gracefully', async () => {
      mockGraphQLResponse({});

      const result = await NexusModsService.searchMods(
        'skyrimspecialedition',
        null,
        { field: 'downloads', direction: 'DESC' },
        0,
        20
      );

      expect(result.nodes).toEqual([]);
      expect(result.totalCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getModFiles
  // ---------------------------------------------------------------------------

  describe('getModFiles', () => {
    it('should return files for a mod', async () => {
      const file = createMockModFile();
      mockGraphQLResponse({ modFiles: [file] });

      const result = await NexusModsService.getModFiles(1, 1704);
      expect(result).toEqual([file]);
    });

    it('should return empty array when no files exist', async () => {
      mockGraphQLResponse({ modFiles: [] });

      const result = await NexusModsService.getModFiles(999, 1704);
      expect(result).toEqual([]);
    });

    it('should handle missing modFiles field gracefully', async () => {
      mockGraphQLResponse({});

      const result = await NexusModsService.getModFiles(1, 1704);
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getGameByDomain
  // ---------------------------------------------------------------------------

  describe('getGameByDomain', () => {
    it('should return game for valid domain', async () => {
      const game = createMockGame();
      mockGraphQLResponse({ game });

      const result = await NexusModsService.getGameByDomain('skyrimspecialedition');
      expect(result).toEqual(game);
    });

    it('should return null for unknown domain', async () => {
      mockGraphQLResponse({ game: null });

      const result = await NexusModsService.getGameByDomain('nonexistentgame');
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getMod
  // ---------------------------------------------------------------------------

  describe('getMod', () => {
    it('should return a single mod', async () => {
      const mod = createMockMod();
      mockGraphQLResponse({ mods: { nodes: [mod] } });

      const result = await NexusModsService.getMod(1704, 1);
      expect(result).toEqual(mod);
    });

    it('should return null when mod not found', async () => {
      mockGraphQLResponse({ mods: { nodes: [] } });

      const result = await NexusModsService.getMod(1704, 99999);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getDownloadUrl
  // ---------------------------------------------------------------------------

  describe('getDownloadUrl', () => {
    it('should return download URLs with API key header', async () => {
      const urls = [
        { URI: 'https://cdn.nexusmods.com/file.zip', name: 'Nexus CDN', short_name: 'Nexus' },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => urls,
      });

      const result = await NexusModsService.getDownloadUrl(
        'skyrimspecialedition',
        1,
        100,
        'test-api-key'
      );

      expect(result).toEqual(urls);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/games/skyrimspecialedition/mods/1/files/100/download_link.json'),
        expect.objectContaining({
          headers: { apikey: 'test-api-key' },
        })
      );
    });

    it('should throw on HTTP error', async () => {
      mockHttpError(403);

      await expect(
        NexusModsService.getDownloadUrl('skyrimspecialedition', 1, 100, 'bad-key')
      ).rejects.toThrow('NexusMods download link request failed with status 403');
    });
  });
});
