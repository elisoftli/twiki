/**
 * NexusMods IPC Handlers
 *
 * Handles IPC operations for NexusMods integration:
 * - Searching games and mods
 * - Getting mod files
 * - Getting download URLs
 * - Downloading files to disk
 * - Linking games to NexusMods domain names
 */

import { dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { createIpcHandlers } from './ipc-handler.factory';
import { NexusModsService } from '../services/nexusmods/nexusmods.service';
import { GameLibraryService } from '../services/game/game-library.service';
import { createLogger } from '../utils';
import type { NexusModsSort } from '../interfaces/nexusmods.interface';

const logger = createLogger('NexusModsIpc');

/**
 * Setup NexusMods-related IPC handlers.
 */
export function setupNexusModsIpc(): void {
  createIpcHandlers([
    {
      channel: 'nexusmods:resolve-game',
      handler: async (_event, args: { name: string }) => {
        return NexusModsService.resolveGame(args.name);
      },
    },
    {
      channel: 'nexusmods:search-mods',
      handler: async (
        _event,
        args: {
          domainName: string;
          query: string | null;
          sort: NexusModsSort;
          offset: number;
          count: number;
        }
      ) => {
        return NexusModsService.searchMods(
          args.domainName,
          args.query,
          args.sort,
          args.offset,
          args.count
        );
      },
    },
    {
      channel: 'nexusmods:get-mod-files',
      handler: async (_event, args: { modId: number; gameId: number }) => {
        return NexusModsService.getModFiles(args.modId, args.gameId);
      },
    },
    {
      channel: 'nexusmods:get-download-url',
      handler: async (
        _event,
        args: { domainName: string; modId: number; fileId: number; apiKey: string }
      ) => {
        return NexusModsService.getDownloadUrl(
          args.domainName,
          args.modId,
          args.fileId,
          args.apiKey
        );
      },
    },
    {
      channel: 'nexusmods:download-file',
      handler: async (
        event,
        args: { url: string; modName: string; fileName: string; fileId: number }
      ): Promise<{ success: boolean; path?: string; error?: string; cancelled?: boolean }> => {
        try {
          // Show save dialog so the user can choose where to save
          const win = BrowserWindow.fromWebContents(event.sender);

          const dialogResult = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
            defaultPath: args.fileName,
            title: 'Save Mod File',
          });

          if (dialogResult.canceled || !dialogResult.filePath) {
            return { success: false, cancelled: true };
          }

          const filePath = dialogResult.filePath;

          // Ensure parent directory exists
          await fs.mkdir(path.dirname(filePath), { recursive: true });

          const response = await fetch(args.url);
          if (!response.ok) {
            throw new Error(`Download failed with status ${response.status}`);
          }

          const contentLength = response.headers.get('content-length');
          const totalBytes = contentLength ? parseInt(contentLength, 10) : undefined;

          // Stream-download with chunk-by-chunk writing
          const fileHandle = await fs.open(filePath, 'w');

          try {
            let downloadedBytes = 0;
            const reader = response.body?.getReader();

            if (!reader) {
              throw new Error('Response body is not readable');
            }

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              await fileHandle.write(value);
              downloadedBytes += value.length;

              // Send progress to the renderer
              const percentage = totalBytes
                ? Math.round((downloadedBytes / totalBytes) * 100)
                : undefined;
              event.sender.send('nexusmods:download-progress', {
                fileId: args.fileId,
                downloadedBytes,
                totalBytes,
                percentage,
              });
            }
          } finally {
            await fileHandle.close();
          }

          logger.info(`Downloaded file to ${filePath}`);
          return { success: true, path: filePath };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Failed to download file: ${message}`);
          return { success: false, error: message };
        }
      },
    },
    {
      channel: 'nexusmods:link-game',
      handler: async (
        _event,
        args: { gameId: string; domainName: string }
      ): Promise<void> => {
        await GameLibraryService.getInstance().updateGame(args.gameId, {
          nexusModsDomainName: args.domainName,
        });
      },
    },
  ]);
}
