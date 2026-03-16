import { createHash } from 'crypto';

/**
 * Generate a unique game ID from launcher type, launcher-specific ID, and install path.
 * The short hash of the install path ensures uniqueness even when the same launcher ID
 * appears in multiple library folders (e.g., same Steam game in two Steam library folders).
 *
 * @param launcher - The launcher type (e.g., 'steam', 'xbox', 'manual')
 * @param launcherId - The launcher-specific ID (e.g., Steam App ID, Xbox Store ID)
 * @param installPath - The full install path of the game
 * @returns A deterministic unique ID like "steam:1234567:a1b2c3d4"
 */
export function generateGameId(launcher: string, launcherId: string, installPath: string): string {
  const hash = createHash('md5').update(installPath).digest('hex').substring(0, 8);
  return `${launcher}:${launcherId}:${hash}`;
}
