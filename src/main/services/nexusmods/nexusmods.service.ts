/**
 * NexusMods Service
 *
 * Static service for interacting with the NexusMods API.
 * - GraphQL v2 for mod search, game lookup, file listing, and requirements (no auth)
 * - REST v1 for download links (requires API key)
 */

import { findBestMatch } from '@twiki/shared';
import { createLogger } from '../../utils';
import type {
  NexusModsGame,
  NexusModsMod,
  NexusModsSearchResult,
  NexusModsModFile,
  NexusModsDownloadUrl,
  NexusModsSort,
} from '../../interfaces/nexusmods.interface';

const logger = createLogger('NexusModsService');

const GRAPHQL_ENDPOINT = 'https://api.nexusmods.com/v2/graphql';
const REST_V1_ENDPOINT = 'https://api.nexusmods.com/v1';
const REQUEST_TIMEOUT = 15_000;

/**
 * Normalize a Steam game name for NexusMods search:
 * - Strip trademark/copyright symbols (™®©)
 * - Replace smart/curly quotes with ASCII equivalents
 * - Replace en/em dashes with hyphen-minus
 * - Replace non-breaking spaces with regular spaces
 */
function normalizeName(value: string): string {
  return value
    .replace(/[™®©]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ');
}

/**
 * Escape a string for safe interpolation in a GraphQL string literal.
 * Handles double quotes, backslashes, and newlines.
 */
function escapeGraphQL(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

export class NexusModsService {
  /**
   * Execute a GraphQL query against the NexusMods v2 API.
   * No authentication is required for read queries.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static async graphqlQuery(query: string): Promise<Record<string, any>> {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`NexusMods GraphQL request failed with status ${response.status}`);
    }

    const json = await response.json();

    if (json.errors?.length) {
      const message = json.errors.map((e: { message: string }) => e.message).join('; ');
      throw new Error(`NexusMods GraphQL error: ${message}`);
    }

    return json.data;
  }

  /**
   * Search for games on NexusMods by name.
   *
   * @param name - Game name to search for
   * @returns Array of matching NexusMods games
   */
  public static async searchGames(name: string): Promise<NexusModsGame[]> {
    logger.log(`Searching NexusMods games for: "${name}"`);

    const cleanedName = normalizeName(name);
    const escapedName = escapeGraphQL(cleanedName);
    const query = `
      query {
        games(filter: { name: [{ value: "${escapedName}", op: WILDCARD }] }) {
          nodes { id, name, domainName, modCount }
        }
      }
    `;

    const data = await this.graphqlQuery(query);
    const games: NexusModsGame[] = data.games?.nodes ?? [];

    logger.debug(`Found ${games.length} game(s) matching "${name}"`);
    return games;
  }

  /**
   * Resolve a game name to a single NexusMods game using fuzzy matching.
   * Searches NexusMods for the name, then picks the best match that meets
   * the similarity threshold. Returns null if no quality match is found.
   *
   * @param name - Game name to resolve
   * @returns The best matching NexusMods game, or null
   */
  public static async resolveGame(name: string): Promise<NexusModsGame | null> {
    const games = await this.searchGames(name);

    if (games.length === 0) {
      return null;
    }

    const match = findBestMatch(
      name,
      games.map((g) => g.name)
    );

    if (!match || !match.isMatch) {
      logger.debug(`No quality match for "${name}" among ${games.length} candidate(s)`);
      return null;
    }

    const best = games.find((g) => g.name === match.nameB)!;
    logger.debug(`Resolved "${name}" → "${best.name}" (${best.domainName}) similarity=${match.similarity.toFixed(2)}`);
    return best;
  }

  /**
   * Search mods for a specific game on NexusMods.
   *
   * @param domainName - Game domain name (URL slug, e.g. "skyrimspecialedition")
   * @param queryText - Search query text, or null to browse all mods
   * @param sort - Sort field and direction
   * @param offset - Pagination offset
   * @param count - Number of results to return
   * @returns Paginated search result with mods and total count
   */
  public static async searchMods(
    domainName: string,
    queryText: string | null,
    sort: NexusModsSort,
    offset: number,
    count: number
  ): Promise<NexusModsSearchResult> {
    logger.log(
      `Searching mods for "${domainName}"${queryText ? ` query="${queryText}"` : ''} sort=${sort.field}:${sort.direction} offset=${offset} count=${count}`
    );

    const escapedDomain = escapeGraphQL(domainName);
    const nameFilter = queryText
      ? `nameStemmed: [{ value: "${escapeGraphQL(queryText)}", op: MATCHES }]`
      : '';

    const query = `
      query {
        mods(
          filter: {
            gameDomainName: [{ value: "${escapedDomain}", op: EQUALS }]
            ${nameFilter}
          }
          sort: [{ ${sort.field}: { direction: ${sort.direction} } }]
          count: ${count}
          offset: ${offset}
        ) {
          nodes {
            uid, modId, gameId, name, summary, description, version, author, status,
            downloads, endorsements, pictureUrl, thumbnailUrl, createdAt, updatedAt,
            adultContent,
            modCategory { name }
            modRequirements {
              nexusRequirements {
                nodes { modId, modName, gameId, notes, url, externalRequirement }
                totalCount
              }
            }
          }
          totalCount
        }
      }
    `;

    const data = await this.graphqlQuery(query);
    const result: NexusModsSearchResult = {
      nodes: data.mods?.nodes ?? [],
      totalCount: data.mods?.totalCount ?? 0,
    };

    logger.debug(`Found ${result.nodes.length} mod(s) (total: ${result.totalCount})`);
    return result;
  }

  /**
   * Get the list of files for a specific mod.
   *
   * @param modId - NexusMods mod ID
   * @param gameId - NexusMods game ID
   * @returns Array of mod files
   */
  public static async getModFiles(modId: number, gameId: number): Promise<NexusModsModFile[]> {
    logger.log(`Fetching files for mod ${modId} (game ${gameId})`);

    const query = `
      query {
        modFiles(modId: "${modId}", gameId: "${gameId}") {
          fileId, name, version, description, category, categoryId,
          size, sizeInBytes, date, uri, primary, scannedV2, changelogText
        }
      }
    `;

    const data = await this.graphqlQuery(query);
    const files: NexusModsModFile[] = data.modFiles ?? [];

    logger.debug(`Found ${files.length} file(s) for mod ${modId}`);
    return files;
  }

  /**
   * Look up a NexusMods game by its domain name (URL slug).
   *
   * @param domainName - Game domain name (e.g. "skyrimspecialedition")
   * @returns The matching game, or null if not found
   */
  public static async getGameByDomain(domainName: string): Promise<NexusModsGame | null> {
    logger.log(`Looking up NexusMods game by domain: "${domainName}"`);

    const escapedDomain = escapeGraphQL(domainName);
    const query = `
      query {
        game(domainName: "${escapedDomain}") {
          id, name, domainName, modCount
        }
      }
    `;

    const data = await this.graphqlQuery(query);
    return data.game ?? null;
  }

  /**
   * Fetch a single mod by game ID and mod ID.
   * Note: The NexusMods GraphQL API requires `gameId` when filtering by `modId`.
   *
   * @param gameId - NexusMods game ID
   * @param modId - NexusMods mod ID
   * @returns The mod, or null if not found
   */
  public static async getMod(gameId: number, modId: number): Promise<NexusModsMod | null> {
    logger.log(`Fetching mod ${modId} for game ${gameId}`);

    const query = `
      query {
        mods(
          filter: {
            gameId: [{ value: "${gameId}", op: EQUALS }]
            modId: [{ value: "${modId}", op: EQUALS }]
          }
          count: 1
        ) {
          nodes {
            uid, modId, gameId, name, summary, description, version, author,
            modCategory { name }
          }
        }
      }
    `;

    const data = await this.graphqlQuery(query);
    return data.mods?.nodes?.[0] ?? null;
  }

  /**
   * Get direct download links for a mod file via the REST v1 API.
   * Requires an API key (Premium users get CDN links; free users need key+expires params).
   *
   * @param domainName - Game domain name (URL slug)
   * @param modId - NexusMods mod ID
   * @param fileId - File ID to download
   * @param apiKey - NexusMods API key
   * @returns Array of download URLs with server info
   */
  public static async getDownloadUrl(
    domainName: string,
    modId: number,
    fileId: number,
    apiKey: string
  ): Promise<NexusModsDownloadUrl[]> {
    logger.log(`Fetching download URL for mod ${modId}, file ${fileId} (game: ${domainName})`);

    const url = `${REST_V1_ENDPOINT}/games/${encodeURIComponent(domainName)}/mods/${modId}/files/${fileId}/download_link.json`;

    const response = await fetch(url, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`NexusMods download link request failed with status ${response.status}`);
    }

    const downloadUrls: NexusModsDownloadUrl[] = await response.json();

    logger.debug(`Got ${downloadUrls.length} download URL(s) for file ${fileId}`);
    return downloadUrls;
  }
}
