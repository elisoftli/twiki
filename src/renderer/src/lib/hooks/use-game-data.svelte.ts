import type { Game } from '../../../../main/interfaces/game-library.interface';
import type {
  TweakGroup,
  PCGWGameInfo,
  PCGWGroupedResources,
  PCGWConfigPath,
} from '@twiki/shared';
import type { TweakMetadata } from '../../../../main/services/tweak/tweak-metadata.service';
import { createLogger } from '$lib/utils/logger.utils';

const logger = createLogger('GameData');

export interface GameData {
  game: Game | null;
  tweakGroups: TweakGroup[];
  pageName: string | null;
  configPaths: PCGWConfigPath[];
  gameInfo: PCGWGameInfo | null;
  externalResources: PCGWGroupedResources | null;
  tweakMetadata: Map<string, TweakMetadata>;
  isGameLoading: boolean;
  isTweaksLoading: boolean;
  isMetadataLoading: boolean;
  error: string | null;
}

/**
 * Hook for loading game data from the library and PCGamingWiki.
 * Handles loading states and error handling.
 */
export function useGameData(gameId: string) {
  let game = $state<Game | null>(null);
  let tweakGroups = $state<TweakGroup[]>([]);
  let pageName = $state<string | null>(null);
  let configPaths = $state<PCGWConfigPath[]>([]);
  let gameInfo = $state<PCGWGameInfo | null>(null);
  let externalResources = $state<PCGWGroupedResources | null>(null);
  let tweakMetadata = $state<Map<string, TweakMetadata>>(new Map());
  let isGameLoading = $state(true);
  let isTweaksLoading = $state(true);
  let isMetadataLoading = $state(false);
  let error = $state<string | null>(null);

  /**
   * Loads game info from the library (fast, cached in main process)
   */
  async function loadGame(): Promise<Game | null> {
    try {
      const loadedGame = await window.api.library.getGame(gameId);
      game = loadedGame || null;
      if (!game) {
        error = 'Game not found';
      }
      return game;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load game data';
      return null;
    } finally {
      isGameLoading = false;
    }
  }

  /**
   * Loads tweaks and metadata from PCGamingWiki (slow, network request)
   */
  async function loadTweaks(loadedGame: Game): Promise<void> {
    try {
      const gamePage = await window.api.pcgw.getTweaks(loadedGame.id, loadedGame.launcher);
      if (gamePage) {
        logger.debug(`Loaded tweaks for game ${loadedGame.launcherId} from PCGamingWiki`);
        logger.debug(gamePage);

        tweakGroups = gamePage.tweakGroups;
        pageName = gamePage.pcgwPageName ?? null;
        configPaths = gamePage.configPaths;
        gameInfo = gamePage.gameInfo;
        externalResources = gamePage.externalResources;

        // Update local state with pcgwPageId (cache is updated automatically by the service)
        if (gamePage.pcgwPageId && !loadedGame.pcgwPageId) {
          game = { ...loadedGame, pcgwPageId: gamePage.pcgwPageId };
        }

        // Load metadata for all tweaks (non-blocking — has its own isMetadataLoading state)
        if (gamePage.pcgwPageId) {
          loadMetadata(gamePage.tweakGroups, gamePage.pcgwPageId, loadedGame.launcher);
        }
      }
    } catch (err) {
      logger.error('Failed to load tweaks:', err);
      error = formatTweaksError(err);
    } finally {
      isTweaksLoading = false;
    }
  }

  /**
   * Formats error messages from the tweaks API into user-friendly messages
   */
  function formatTweaksError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);

    // Network/fetch failures
    if (message.includes('fetch failed') || message.includes('Failed to fetch')) {
      return 'Unable to connect to fetch tweaks.';
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return 'Connection to server timed out. Please try again.';
    }

    // Game not found on PCGW
    if (message.includes('not found') || message.includes('404')) {
      return 'This game was not found on PCGamingWiki.';
    }

    // Generic fallback
    return 'Failed to load tweaks from PCGamingWiki. Please try again.';
  }

  /**
   * Loads tweak metadata (canProcess status and recipes) from the server
   */
  async function loadMetadata(loadedTweakGroups: TweakGroup[], pcgwPageId: number, launcher?: string): Promise<void> {
    isMetadataLoading = true;
    try {
      // Collect all hashes from tweak groups
      const hashes: string[] = [];
      for (const group of loadedTweakGroups) {
        for (const tweak of group.tweaks) {
          if (tweak.hash) {
            hashes.push(tweak.hash);
          }
        }
      }

      if (hashes.length > 0) {
        const metadata = await window.api.tweakMetadata.fetch(hashes, pcgwPageId, launcher);
        tweakMetadata = new Map(Object.entries(metadata));
      }
    } catch (err) {
      logger.error('Failed to load tweak metadata:', err);
      // Don't set error state - metadata loading failure is non-critical
    } finally {
      isMetadataLoading = false;
    }
  }

  /**
   * Loads all game data (game info + tweaks)
   */
  async function load(): Promise<void> {
    // Reset states for retry support
    isGameLoading = true;
    isTweaksLoading = true;
    error = null;

    const loadedGame = await loadGame();
    if (loadedGame) {
      await loadTweaks(loadedGame);
    } else {
      isTweaksLoading = false;
    }
  }

  /**
   * Refreshes just the game data without reloading tweaks.
   * Useful for updating the game object after changes like adding/removing custom config paths.
   */
  async function refreshGame(): Promise<void> {
    try {
      const loadedGame = await window.api.library.getGame(gameId);
      if (loadedGame) {
        game = loadedGame;
      }
    } catch (err) {
      logger.error('Failed to refresh game:', err);
    }
  }

  return {
    // State (getters using $derived pattern for reactivity)
    get game() { return game; },
    get tweakGroups() { return tweakGroups; },
    get pageName() { return pageName; },
    get configPaths() { return configPaths; },
    get gameInfo() { return gameInfo; },
    get externalResources() { return externalResources; },
    get tweakMetadata() { return tweakMetadata; },
    get isGameLoading() { return isGameLoading; },
    get isTweaksLoading() { return isTweaksLoading; },
    get isMetadataLoading() { return isMetadataLoading; },
    get error() { return error; },

    // Actions
    load,
    loadGame,
    loadTweaks,
    refreshGame,
  };
}
