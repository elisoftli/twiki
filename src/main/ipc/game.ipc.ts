/**
 * Game Library IPC Handlers
 *
 * Handles IPC operations for game library:
 * - Getting library status and games
 * - Launching and terminating games
 * - Reloading library
 * - Manual game import/delete
 */

import { dialog } from 'electron';
import { promises as fs } from 'fs';
import { GameLibraryService } from '../services/game/game-library.service';
import { PCGamingWikiService } from '../services/game/pcgamingwiki.service';
import { createIpcHandlers, createIpcListeners } from './ipc-handler.factory';
import { findGameExecutable } from '../utils/executable-finder.util';
import { MainWindow } from '../windows';
import type { ImportGameParams } from '../services/game/launchers/manual.launcher';
import type { PCGWConfigPath } from '@twiki/shared';

/**
 * Setup game library IPC handlers.
 */
export function setupGameIpc(): void {
  const libraryService = GameLibraryService.getInstance();

  createIpcHandlers([
    { channel: 'library:get-status', handler: () => libraryService.getStatus() },
    { channel: 'library:get-games', handler: () => libraryService.games },
    {
      channel: 'library:reload',
      handler: async () => {
        await libraryService.forceReload();
        return libraryService.games;
      },
    },
    { channel: 'library:get-game', handler: (_, id: string) => libraryService.getGame(id) },
    { channel: 'library:get-game-by-launcher-id', handler: (_, launcherId: string) => libraryService.getGameByLauncherId(launcherId) },
    { channel: 'library:is-game-running', handler: async (_, id: string) => libraryService.isGameRunning(id) },
    { channel: 'library:terminate-game', handler: async (_, id: string) => libraryService.terminateGame(id) },
    { channel: 'library:pin-game', handler: async (_, id: string) => libraryService.pinGame(id) },
    { channel: 'library:unpin-game', handler: async (_, id: string) => libraryService.unpinGame(id) },
    { channel: 'library:reorder-pinned-games', handler: async (_, orderedIds: string[]) => libraryService.reorderPinnedGames(orderedIds) },

    // Manual game import handlers
    {
      channel: 'library:search-pcgw',
      handler: async (_, query: string) => PCGamingWikiService.searchGames(query),
    },
    {
      channel: 'library:import-game',
      handler: async (_, params: ImportGameParams) => {
        const manualService = libraryService.getManualService();
        const game = await manualService.importGame(params);
        await libraryService.addGame(game);
        return game;
      },
    },
    {
      channel: 'library:delete-game',
      handler: async (_, { id, deleteAppliedTweaks }: { id: string; deleteAppliedTweaks: boolean }) => {
        // Resolve composite ID to launcher-specific ID for manual service
        const game = libraryService.getGame(id);
        const launcherId = game?.launcherId ?? id;
        const manualService = libraryService.getManualService();
        await manualService.deleteGame(launcherId, deleteAppliedTweaks);
        await libraryService.removeGame(id);
      },
    },
    {
      channel: 'library:select-folder',
      handler: async (): Promise<{ folderPath: string; suggestedExecutable: string | null } | null> => {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory'],
        });
        if (result.canceled || !result.filePaths[0]) {
          return null;
        }
        const folderPath = result.filePaths[0];
        const suggestedExecutable = await findGameExecutable(folderPath);
        return { folderPath, suggestedExecutable };
      },
    },
    {
      channel: 'library:select-executable',
      handler: async (_, defaultPath?: string) => {
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          defaultPath,
          filters: [{ name: 'Executables', extensions: ['exe'] }],
        });
        return result.canceled ? null : result.filePaths[0] ?? null;
      },
    },
    {
      channel: 'library:check-duplicate-path',
      handler: (_, installPath: string) => libraryService.hasGameWithInstallPath(installPath),
    },
    {
      channel: 'library:check-duplicate-pcgw',
      handler: (_, pcgwPageId: number) => libraryService.getManualService().hasGameWithPcgwPageId(pcgwPageId),
    },

    // PCGW link handler
    {
      channel: 'library:link-pcgw',
      handler: async (
        _,
        { gameId, pcgwPageId }: { gameId: string; pcgwPageId: number }
      ) => {
        const game = libraryService.getGame(gameId);
        if (!game) {
          throw new Error(`Game not found: ${gameId}`);
        }

        const updates: Partial<{ pcgwPageId: number; name: string }> = { pcgwPageId };

        await libraryService.updateGame(gameId, updates);
        PCGamingWikiService.invalidateCacheForGame(gameId, game.launcher);
        MainWindow.getInstance().sendEvent('library:game-pcgw-linked', { id: gameId, pcgwPageId });

        return libraryService.getGame(gameId);
      },
    },

    // Remove game handler (non-manual games, removes from library only)
    {
      channel: 'library:remove-game',
      handler: async (_, { gameId }: { gameId: string }) => {
        await libraryService.removeGame(gameId);
      },
    },

    // Custom config path handlers
    {
      channel: 'library:add-custom-config-path',
      handler: async (
        _,
        {
          gameId,
          path,
          pathType,
          pcgwConfigPaths,
        }: {
          gameId: string;
          path: string;
          pathType: 'file' | 'directory';
          pcgwConfigPaths: PCGWConfigPath[];
        }
      ): Promise<{ success: boolean; configPath?: PCGWConfigPath; error?: string }> => {
        // Validate path exists on disk
        try {
          await fs.access(path);
        } catch {
          return { success: false, error: 'The selected path does not exist' };
        }

        // Get the game to check for duplicates
        const game = libraryService.getGame(gameId);
        if (!game) {
          return { success: false, error: 'Game not found' };
        }

        // Normalize path for comparison (case-insensitive, forward slashes, no trailing slash)
        const normalizePath = (p: string) => p.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
        const normalizedPath = normalizePath(path);

        // Check for duplicates against PCGW config paths
        const isDuplicatePcgw = pcgwConfigPaths.some(
          (cp) => normalizePath(cp.path) === normalizedPath
        );
        if (isDuplicatePcgw) {
          return { success: false, error: 'This path is already listed in config locations' };
        }

        // Check for duplicates against existing custom paths
        const existingCustomPaths = game.extraConfigPaths ?? [];
        const isDuplicateCustom = existingCustomPaths.some(
          (cp) => normalizePath(cp.path) === normalizedPath
        );
        if (isDuplicateCustom) {
          return { success: false, error: 'This path has already been added' };
        }

        // Add the custom config path
        const configPath = await libraryService.addCustomConfigPath(gameId, path, pathType);
        if (!configPath) {
          return { success: false, error: 'Failed to save custom config path' };
        }

        return { success: true, configPath };
      },
    },
    {
      channel: 'library:remove-custom-config-path',
      handler: async (
        _,
        { gameId, path }: { gameId: string; path: string }
      ): Promise<{ success: boolean; error?: string }> => {
        const removed = await libraryService.removeCustomConfigPath(gameId, path);
        if (!removed) {
          return { success: false, error: 'Path not found' };
        }
        return { success: true };
      },
    },
    {
      channel: 'library:select-config-path',
      handler: async (): Promise<{ path: string; pathType: 'file' | 'directory' } | null> => {
        // Allow selecting both files and directories
        const result = await dialog.showOpenDialog({
          properties: ['openFile', 'openDirectory'],
          title: 'Select Config File or Directory',
        });

        if (result.canceled || result.filePaths.length === 0) {
          return null;
        }

        const selectedPath = result.filePaths[0];

        // Determine if it's a file or directory
        try {
          const stats = await fs.stat(selectedPath);
          const pathType: 'file' | 'directory' = stats.isDirectory() ? 'directory' : 'file';
          return { path: selectedPath, pathType };
        } catch {
          return null;
        }
      },
    },

    // Config path disable/enable handlers
    {
      channel: 'library:disable-config-path',
      handler: async (_, { gameId, path }: { gameId: string; path: string }): Promise<void> => {
        await libraryService.disableConfigPath(gameId, path);
      },
    },
    {
      channel: 'library:enable-config-path',
      handler: async (_, { gameId, path }: { gameId: string; path: string }): Promise<void> => {
        await libraryService.enableConfigPath(gameId, path);
      },
    },
  ]);

  createIpcListeners([
    { channel: 'library:launch-game', handler: (_, id: string) => libraryService.launchGame(id) },
  ]);
}
