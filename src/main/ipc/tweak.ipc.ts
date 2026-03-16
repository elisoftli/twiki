/**
 * Tweak IPC Handlers
 *
 * Handles IPC operations for tweaks and PCGW:
 * - PCGamingWiki game fixes
 * - Applied tweaks management
 * - Revert operations
 * - Tweak metadata
 */

import type { AppliedTweak, TweakSummary, GameLauncher } from '../interfaces';
import { PCGamingWikiService } from '../services/game/pcgamingwiki.service';
import { GameLibraryService } from '../services/game/game-library.service';
import { AppliedTweaksService } from '../services/tweak/applied-tweaks.service';
import { RevertService } from '../services/tweak/revert.service';
import { TweakMetadataService } from '../services/tweak/tweak-metadata.service';
import { createIpcHandlers } from './ipc-handler.factory';

/**
 * Setup PCGW-related IPC handlers.
 */
export function setupPcgwIpc(): void {
  createIpcHandlers([
    {
      channel: 'pcgw:get-tweaks',
      handler: async (_, { gameId, launcher }: { gameId: string; launcher: GameLauncher }) =>
        PCGamingWikiService.getGameFixes(gameId, launcher),
    },
  ]);
}

/**
 * Setup applied tweaks IPC handlers.
 */
export function setupAppliedTweaksIpc(): void {
  createIpcHandlers([
    {
      channel: 'applied-tweaks:get-by-game',
      handler: async (_, gameId: string) => {
        // Resolve composite game ID to launcher-specific ID for storage lookup
        const game = GameLibraryService.getInstance().getGame(gameId);
        const launcherGameId = game?.launcherId ?? gameId;
        return AppliedTweaksService.getByGame(launcherGameId);
      },
    },
    {
      channel: 'applied-tweaks:get-all',
      handler: async () => AppliedTweaksService.getAll(),
    },
    {
      channel: 'applied-tweaks:add',
      handler: async (_, tweak: AppliedTweak) => AppliedTweaksService.add(tweak),
    },
    {
      channel: 'applied-tweaks:remove',
      handler: async (_, hash: string) => AppliedTweaksService.remove(hash),
    },
  ]);
}

/**
 * Setup revert IPC handlers.
 */
export function setupRevertIpc(): void {
  createIpcHandlers([
    {
      channel: 'revert:execute',
      handler: async (_, summary: TweakSummary) => RevertService.execute(summary),
    },
    // Pre-check handler for surgical revert conflict detection
    {
      channel: 'revert:pre-check',
      handler: async (_, tweak: AppliedTweak) => {
        const allAppliedTweaks = await AppliedTweaksService.getAll();
        return RevertService.preCheck(tweak, allAppliedTweaks);
      },
    },
    // Execute with fallback option for surgical revert
    {
      channel: 'revert:execute-with-fallback',
      handler: async (_, { tweak, useFallback }: { tweak: AppliedTweak; useFallback: boolean }) =>
        RevertService.execute(tweak.summary, false, useFallback),
    },
  ]);
}

/**
 * Setup tweak metadata IPC handlers.
 */
export function setupTweakMetadataIpc(): void {
  createIpcHandlers([
    {
      channel: 'tweak-metadata:fetch',
      handler: async (_, { hashes, pcgwPageId, launcher }: { hashes: string[]; pcgwPageId: number; launcher?: string }) => {
        const metadata = await TweakMetadataService.fetchTweakMetadata(hashes, pcgwPageId, launcher);
        return Object.fromEntries(metadata);
      },
    },
  ]);
}
