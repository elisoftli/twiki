/**
 * PCGamingWiki Service
 *
 * Fetches game data from PCGamingWiki via server proxy.
 * All PCGW requests go through the server's /game and /search endpoints.
 * Handles local path expansion for config files.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import { GameLibraryService } from './game-library.service';
import { createLogger, expandWindowsEnvVars, withRetry } from '../../utils';
import { listDirectoryContents } from '../../tools/io/utils/list-directory-contents.utils';
import type { PCGWGame, PCGWConfigPath } from '@twiki/shared';
import { EnvService } from '../core/env.service';
import { GameLauncher } from '../../interfaces/game-library.interface';

/** Default timeout for API requests in milliseconds */
const REQUEST_TIMEOUT = 7500;

/** Server response config path (before local expansion) */
interface ServerConfigPath {
  path: string;
  pathType: 'file' | 'directory' | 'registry';
  platform: 'windows' | 'steam' | 'microsoft-store' | 'linux' | 'macos';
  category: 'config' | 'save';
}

/** Server response from /game endpoint (before local path expansion) */
interface PCGWGameServerResponse extends Omit<PCGWGame, 'configPaths'> {
  configPaths: ServerConfigPath[];
}

interface CacheEntry {
  data: PCGWGame;
  timestamp: number;
}

const logger = createLogger('PCGamingWikiService');

/** Check if a path exists (async) */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve files within a directory (depth 1, max 100 files).
 * Used by both PCGW path expansion and custom path addition.
 * @param dirPath - The directory path to resolve files in
 * @returns Array of full file paths, or undefined if empty/error
 */
export async function resolveDirectoryFiles(dirPath: string): Promise<string[] | undefined> {
  try {
    const result = await listDirectoryContents({
      path: dirPath,
      depth: 1,
      maxFilesPerDirectory: 100,
    });
    const files = result.files
      .filter((file) => !file.endsWith('\\'))
      .map((file) => path.join(dirPath, file));
    return files.length > 0 ? files : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Search result from PCGW search
 */
export interface PcgwSearchResult {
  pageId: number;
  title: string;
  posterUrl: string | null;
}

export class PCGamingWikiService {
  private static cache: Map<string, CacheEntry> = new Map();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_CACHE_SIZE = 5;

  /**
   * Invalidate the in-memory cache entry for a specific game.
   * Called when a game is linked to a different PCGW page.
   */
  public static invalidateCacheForGame(gameId: string, launcher: GameLauncher): void {
    const cacheKey = `${launcher}:${gameId}`;
    this.cache.delete(cacheKey);
  }

  /**
   * Fetch game data by unique game ID and launcher via server proxy.
   */
  public static async getGameFixes(
    gameId: string,
    launcher: GameLauncher
  ): Promise<PCGWGame | null> {
    const cacheKey = `${launcher}:${gameId}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const libraryService = GameLibraryService.getInstance();
    const game = libraryService.getGame(gameId);
    if (!game) return null;

    const serverResponse = await this.fetchFromServerGame(game.launcherId, launcher, game.name, game.pcgwPageId);
    if (!serverResponse) return null;

    // Cache the pcgwPageId so it persists across game data refreshes
    await libraryService.updateGame(gameId, { pcgwPageId: serverResponse.pcgwPageId });

    // Expand config paths locally
    const expandedPaths = await this.expandConfigPaths(serverResponse.configPaths, gameId);

    const result: PCGWGame = {
      ...serverResponse,
      configPaths: expandedPaths,
    };

    const serialized = JSON.parse(JSON.stringify(result));
    if (result.tweakGroups?.length > 0) {
      this.setCached(cacheKey, serialized);
    }
    return serialized;
  }

  /**
   * Search PCGW for games by name via server proxy.
   * Returns top results with page ID, title, and poster URL.
   *
   * @param query - The search query (game name)
   * @returns Array of search results
   */
  public static async searchGames(query: string): Promise<PcgwSearchResult[]> {
    const searchResults = await this.searchGamesFromServer(query);

    if (searchResults.length === 0) {
      return [];
    }

    // Batch fetch poster URLs for all results
    const titles = searchResults.map((r) => r.title);
    const posterMap = await this.fetchPostersFromArtworkApi(titles);

    return searchResults.map((result) => ({
      pageId: result.pageId,
      title: result.title,
      posterUrl: posterMap[result.title] ?? null,
    }));
  }

  /**
   * Search PCGW via server proxy.
   */
  private static async searchGamesFromServer(query: string): Promise<Array<{ pageId: number; title: string }>> {
    try {
      const response = await fetch(
        `${EnvService.get('API_URL')}/pcgw/search?q=${encodeURIComponent(query)}`,
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT) }
      );

      if (!response.ok) {
        logger.error(`Server search failed: ${response.status}`);
        return [];
      }

      const data = (await response.json()) as { results: Array<{ pageId: number; title: string }> };
      return data.results;
    } catch (error) {
      logger.error(`Server search error: ${error}`);
      return [];
    }
  }

  /**
   * Batch fetch poster URLs from the server artwork API (SteamGridDB backend).
   *
   * @param gameNames - Array of game names to search for
   * @returns Map of game name to poster URL (or null if not found)
   */
  private static async fetchPostersFromArtworkApi(gameNames: string[]): Promise<Record<string, string | null>> {
    if (gameNames.length === 0) {
      return {};
    }

    try {
      const response = await fetch(`${EnvService.get('API_URL')}/artwork/posters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: gameNames }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (!response.ok) {
        return {};
      }

      const data = (await response.json()) as { posters: Record<string, string | null> };
      return data.posters;
    } catch (error) {
      logger.debug(`Failed to fetch posters from artwork API: ${error}`);
      return {};
    }
  }

  /**
   * Fetch from server /game endpoint
   * Uses query params based on launcher type
   */
  private static async fetchFromServerGame(
    gameId: string,
    launcher: GameLauncher,
    gameName: string,
    pcgwPageId?: number
  ): Promise<PCGWGameServerResponse | null> {
    return withRetry(async () => {
      // Build URL with query params — always include launcher and id, add name for non-Steam
      const params = new URLSearchParams({ launcher, id: gameId });
      if (launcher !== GameLauncher.STEAM) {
        params.set('name', gameName);
      }
      if (pcgwPageId) {
        params.set('pcgwPageId', pcgwPageId.toString());
      }
      const url = `${EnvService.get('API_URL')}/pcgw/game?${params}`;

      const response = await fetch(url);
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Server game request failed: ${response.status}`);
      }
      return (await response.json()) as PCGWGameServerResponse;
    }, `Failed to fetch game data for ${launcher}:${gameId}`);
  }

  /**
   * Expand config paths with local filesystem info
   */
  private static async expandConfigPaths(
    paths: ServerConfigPath[],
    gameId: string
  ): Promise<PCGWConfigPath[]> {
    const libraryService = GameLibraryService.getInstance();
    return Promise.all(paths.map((p) => this.expandSinglePath(p, gameId, libraryService)));
  }

  private static async expandSinglePath(
    configPath: ServerConfigPath,
    gameId: string,
    libraryService: GameLibraryService
  ): Promise<PCGWConfigPath> {
    // Registry paths: no expansion
    if (configPath.pathType === 'registry') {
      return { ...configPath, exists: false, platform: configPath.platform, category: configPath.category };
    }

    // Expand variables
    const expanded = expandWindowsEnvVars(libraryService.expandPath(gameId, configPath.path));
    const isGlob = expanded.includes('*') || expanded.includes('?');

    if (isGlob) {
      return this.resolveGlobPath(expanded, configPath.platform, configPath.category);
    }

    const exists = await pathExists(expanded);
    const pathType = await this.getPathType(expanded, exists);

    let resolvedFiles: string[] | undefined;
    if (pathType === 'directory' && exists) {
      resolvedFiles = await resolveDirectoryFiles(expanded);
    }

    return {
      path: expanded,
      pathType,
      exists,
      platform: configPath.platform,
      category: configPath.category,
      ...(resolvedFiles?.length && { resolvedFiles }),
    };
  }

  private static async resolveGlobPath(
    pattern: string,
    platform: ServerConfigPath['platform'],
    category: ServerConfigPath['category']
  ): Promise<PCGWConfigPath> {
    const parentDir = path.dirname(pattern);
    const exists = await pathExists(parentDir);

    let resolvedFiles: string[] | undefined;
    if (exists) {
      try {
        const results = await glob(pattern.replace(/\\/g, '/'), { windowsPathsNoEscape: true, nodir: true });
        if (results.length > 0) {
          resolvedFiles = results.map((f) => String(f).replace(/\//g, '\\'));
        }
      } catch {
        // Glob failed silently
      }
    }

    return {
      path: pattern,
      pathType: 'directory',
      exists,
      platform,
      category,
      ...(resolvedFiles && { resolvedFiles }),
    };
  }

  private static async getPathType(
    expandedPath: string,
    exists: boolean
  ): Promise<'file' | 'directory'> {
    if (!exists) {
      // Return as directory so that existing nearest-ancestor directory opens instead
      return 'directory';
    }

    try {
      const stat = await fs.stat(expandedPath);
      return stat.isDirectory() ? 'directory' : 'file';
    } catch {
      // Fall through
    }

    const parts = expandedPath.split(/[\\/]/);
    const lastPart = parts[parts.length - 1];
    if (lastPart && (lastPart.includes('.') || lastPart.includes('*'))) {
      return 'file';
    }
    return 'file';
  }

  private static getCached(cacheKey: string): PCGWGame | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(cacheKey);
      return null;
    }

    this.cache.delete(cacheKey);
    this.cache.set(cacheKey, entry);
    return entry.data;
  }

  private static setCached(cacheKey: string, data: PCGWGame): void {
    if (!EnvService.get('PCGW_CACHE_ENABLED')) {
      return;
    }
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, { data, timestamp: Date.now() });
  }
}
