/**
 * Downloads IPC Handlers
 *
 * Handles IPC operations for download management:
 * - Getting download folder size
 * - Clearing downloads
 * - Opening downloads folder
 */

import { app } from 'electron';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { createIpcHandlers, createIpcListeners } from './ipc-handler.factory';

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
 * Recursively calculate the size of a directory.
 * @param dirPath - Directory path to calculate size for
 * @returns Total size in bytes
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += await getDirectorySize(entryPath);
      } else {
        const stats = await fs.stat(entryPath);
        totalSize += stats.size;
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return totalSize;
}

/**
 * Setup downloads-related IPC handlers.
 */
export function setupDownloadsIpc(): void {
  const downloadsDir = path.join(app.getPath('userData'), 'downloads');

  createIpcHandlers([
    {
      channel: 'downloads:get-size',
      handler: async (): Promise<number> => getDirectorySize(downloadsDir),
    },
    {
      channel: 'downloads:clear',
      handler: async (): Promise<{ success: boolean; error: string | null }> => {
        try {
          if (!(await pathExists(downloadsDir))) {
            return { success: true, error: null };
          }

          const entries = await fs.readdir(downloadsDir);
          for (const entry of entries) {
            const entryPath = path.join(downloadsDir, entry);
            await fs.rm(entryPath, { recursive: true, force: true });
          }

          return { success: true, error: null };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },
  ]);

  createIpcListeners([
    {
      channel: 'downloads:open-folder',
      handler: async () => {
        if (!(await pathExists(downloadsDir))) {
          await fs.mkdir(downloadsDir, { recursive: true });
        }
        exec(`explorer "${downloadsDir.replace(/\//g, '\\\\')}"`);
      },
    },
  ]);
}
