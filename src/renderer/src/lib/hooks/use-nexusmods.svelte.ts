import type { NexusModsMod, NexusModsSort, NexusModsSortField } from '../../../../main/interfaces/nexusmods.interface';
import { createLogger } from '$lib/utils/logger.utils';

const logger = createLogger('NexusMods');

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 500;

export function useNexusMods() {
  // Domain resolution state
  let domainName = $state<string | null>(null);
  let isResolving = $state(false);
  let resolutionFailed = $state(false);

  // Mod list state
  let mods = $state<NexusModsMod[]>([]);
  let totalCount = $state(0);
  let isLoading = $state(false);
  let isLoadingMore = $state(false);
  let error = $state<string | null>(null);
  let offset = $state(0);

  // Search/sort state
  let searchTerm = $state('');
  let sortField = $state<NexusModsSortField>('downloads');

  // Track if first load has happened (for lazy loading)
  let initialized = $state(false);

  // Debounce timer
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const hasMore = $derived(mods.length < totalCount);
  const currentSort = $derived<NexusModsSort>({
    field: searchTerm.trim() ? 'relevance' : sortField,
    direction: 'DESC',
  });

  /**
   * Resolve game name to NexusMods domain name.
   * Checks cached value first, otherwise queries NexusMods API.
   */
  async function resolve(gameId: string, gameName: string, cachedDomain?: string): Promise<boolean> {
    if (cachedDomain) {
      domainName = cachedDomain;
      return true;
    }

    isResolving = true;
    resolutionFailed = false;
    error = null;

    try {
      const game = await window.api.nexusmods.resolveGame(gameName);
      if (!game) {
        resolutionFailed = true;
        return false;
      }

      domainName = game.domainName;

      // Persist to game library
      await window.api.nexusmods.linkGame(gameId, game.domainName);

      return true;
    } catch (err) {
      logger.error('Failed to resolve game:', err);
      error = 'Failed to connect to NexusMods';
      resolutionFailed = true;
      return false;
    } finally {
      isResolving = false;
    }
  }

  /**
   * Fetch mods (resets list). Called on initial load, search change, sort change.
   */
  async function fetchMods(resetList = true): Promise<void> {
    if (!domainName) return;

    if (resetList) {
      offset = 0;
      mods = [];
      isLoading = true;
    } else {
      isLoadingMore = true;
    }
    error = null;

    try {
      const query = searchTerm.trim() || null;
      const result = await window.api.nexusmods.searchMods(
        domainName,
        query,
        currentSort,
        offset,
        PAGE_SIZE
      );
      logger.debug('Fetched mods:', { query, sort: currentSort, offset, mods: result.nodes });

      if (resetList) {
        mods = result.nodes;
      } else {
        mods = [...mods, ...result.nodes];
      }
      totalCount = result.totalCount;
      offset = mods.length;
    } catch (err) {
      logger.error('Failed to fetch mods:', err);
      error = err instanceof Error ? err.message : 'Failed to load mods';
    } finally {
      isLoading = false;
      isLoadingMore = false;
    }
  }

  /**
   * Initialize: resolve game and load initial mods.
   */
  async function init(gameId: string, gameName: string, cachedDomain?: string): Promise<void> {
    if (initialized && domainName) return; // Already loaded
    initialized = true;

    const resolved = await resolve(gameId, gameName, cachedDomain);
    if (resolved) {
      await fetchMods();
    }
  }

  /**
   * Handle search term change with debounce.
   */
  function setSearchTerm(term: string): void {
    if (term === searchTerm) return;
    searchTerm = term;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetchMods(true);
    }, DEBOUNCE_MS);
  }

  /**
   * Change sort field and refetch.
   */
  function setSortField(field: NexusModsSortField): void {
    sortField = field;
    fetchMods(true);
  }

  /**
   * Load more mods (pagination).
   */
  async function loadMore(): Promise<void> {
    if (!hasMore || isLoadingMore) return;
    await fetchMods(false);
  }

  /**
   * Re-link to a different game domain.
   */
  async function relinkGame(gameId: string, newDomainName: string): Promise<void> {
    domainName = newDomainName;
    await window.api.nexusmods.linkGame(gameId, newDomainName);
    await fetchMods(true);
  }

  /**
   * Retry after failure.
   */
  async function retry(gameId: string, gameName: string): Promise<void> {
    initialized = false;
    resolutionFailed = false;
    error = null;
    mods = [];
    totalCount = 0;
    await init(gameId, gameName);
  }

  return {
    // State getters
    get domainName() { return domainName; },
    get isResolving() { return isResolving; },
    get resolutionFailed() { return resolutionFailed; },
    get mods() { return mods; },
    get totalCount() { return totalCount; },
    get isLoading() { return isLoading; },
    get isLoadingMore() { return isLoadingMore; },
    get error() { return error; },
    get hasMore() { return hasMore; },
    get searchTerm() { return searchTerm; },
    get sortField() { return sortField; },
    get currentSort() { return currentSort; },
    get initialized() { return initialized; },

    // Actions
    init,
    setSearchTerm,
    setSortField,
    loadMore,
    relinkGame,
    retry,
  };
}
