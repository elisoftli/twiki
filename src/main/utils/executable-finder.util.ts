/**
 * Executable Finder Utility
 *
 * Finds the most likely game executable in a directory by locating the largest .exe file,
 * excluding known non-game executables (crash handlers, launchers, bootstrappers, etc.)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { listDirectoryContents } from '../tools/io/utils';
import { createLogger } from './logger.utils';

const logger = createLogger('ExecutableFinder');

/** Minimum file size (in bytes) for an executable to be considered the main game executable */
const MIN_GAME_EXE_SIZE = 10 * 1024 * 1024; // 10MB

/** Patterns to exclude when searching for the main game executable */
const EXCLUDED_EXE_PATTERNS = [
  // Generic utility executables
  /crash/i,
  /helper/i,
  /bootstrap/i,
  /uninstall/i,
  /setup/i,
  /updater/i,
  /report/i,
  /install/i,
  /redist/i,
  /vcredist/i,
  /dxsetup/i,
  /dotnet/i,
  /prerequisite/i,
  /launcher/i,

  // Ubisoft
  /ubisoft/i,
  /uplay/i,

  // Steam
  /^steam/i,
  /steamworks/i,

  // Epic Games
  /^epic/i,
  /EpicOnlineServices/i,

  // EA / Origin
  /^origin/i,
  /EADesktop/i,
  /EABackgroundService/i,
  /EALauncher/i,

  // GOG Galaxy
  /^gog/i,
  /galaxy/i,

  // Rockstar
  /RockstarService/i,
  /SocialClub/i,

  // Battle.net
  /battle\.net/i,

  // Other common patterns
  /^agent/i,
  /^service/i,
  /^overlay/i,
  /^web/i,
  /^browser/i,
  /^cef/i,
  /^chromium/i,
];

/**
 * Find the most likely game executable in a directory.
 * Uses a heuristic: finds the largest .exe file, excluding known non-game executables.
 *
 * @param directory - The directory to search in
 * @param searchDepth - How deep to search subdirectories (default: 5)
 * @returns Full absolute path to the executable, or null if not found
 */
export async function findGameExecutable(
  directory: string,
  searchDepth: number = 5
): Promise<string | null> {
  try {
    const entries = await listDirectoryContents({
      path: directory,
      fileNameSearch: '.exe',
      depth: searchDepth,
    });
    const exeFiles: { path: string; size: number }[] = [];

    for (const entry of entries.files) {
      const filename = path.basename(entry);

      // Skip executables matching excluded patterns
      const isExcluded =
        !filename.endsWith('.exe') ||
        EXCLUDED_EXE_PATTERNS.some((pattern) => pattern.test(filename));
      if (isExcluded) {
        continue;
      }

      const fullPath = path.join(directory, entry);
      try {
        const stats = await fs.stat(fullPath);
        // Only consider files larger than minimum size
        if (stats.size >= MIN_GAME_EXE_SIZE) {
          exeFiles.push({ path: fullPath, size: stats.size });
        }
      } catch {
        // Skip files we can't stat
      }
    }

    if (exeFiles.length === 0) {
      logger.debug(`No suitable game executable found in ${directory}`);
      return null;
    }

    // Return the largest executable
    exeFiles.sort((a, b) => b.size - a.size);
    const selected = exeFiles[0];
    logger.debug(
      `Selected game executable: ${selected.path} (${(selected.size / 1024 / 1024).toFixed(1)}MB)`
    );
    return selected.path;
  } catch (error) {
    logger.debug(`Failed to find game executable in ${directory}: ${error}`);
    return null;
  }
}
