/**
 * Modify Game Launch Options Utility
 *
 * Provides launcher-agnostic interface for modifying game launch options.
 * Dispatches to launcher-specific implementations.
 */

import {
  getSteamEnvironment,
  modifySteamDataFile,
  killSteam,
  waitForSteamTermination,
  startSteam,
} from '../../../utils/steam.utils';
import {
  getDesktopPath,
  getTwikiShortcutName,
  findTwikiShortcuts,
  readShortcut,
  createShortcut,
  updateShortcutArgs,
} from '../../../utils/shortcut.utils';
import { GameLibraryService } from '../../../services/game/game-library.service';
import type { GameLauncher } from '@twiki/shared';

// =============================================================================
// Types
// =============================================================================

export interface ModifyLaunchOptionsParams {
  launcher: GameLauncher;
  gameId: string;
  launchOptions: string;
  skipBackup?: boolean;
}

export interface ModifyLaunchOptionsResult {
  path: string;
  backupPath?: string;
  modificationDetails: string;
  launcher: GameLauncher;
  /** Original launch arguments before modification (for revert) */
  originalArgs?: string;
  /** Whether a new desktop shortcut was created (manual games only) */
  shortcutCreated?: boolean;
  /** Game ID for internal launch config cleanup during revert (manual games only) */
  gameId?: string;
}

// =============================================================================
// Steam Implementation
// =============================================================================

async function modifySteamLaunchOptions(
  gameId: string,
  launchOptions: string,
  skipBackup: boolean
): Promise<ModifyLaunchOptionsResult> {
  // Get Steam environment
  const steamEnv = await getSteamEnvironment();
  if (!steamEnv.success || !steamEnv.userConfigPath) {
    const errorMessage = steamEnv.error || 'Steam environment not found';
    throw new Error(`Cannot modify Steam launch options: ${errorMessage}`);
  }

  // Kill Steam to avoid locked file conflicts
  await killSteam();
  await waitForSteamTermination(10000);

  // Modify the launch options
  const keyPath = `UserLocalConfigStore.Software.Valve.Steam.apps.${gameId}.LaunchOptions`;
  const result = await modifySteamDataFile({
    path: steamEnv.userConfigPath,
    keyPath,
    value: launchOptions,
    skipBackup,
  });

  // Restart Steam
  await startSteam();

  return {
    path: result.path,
    backupPath: result.backupPath,
    modificationDetails: result.modificationDetails,
    launcher: 'steam',
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse launch options string into individual options.
 * Handles simple flags like `-nointro` and key-value pairs like `-key=value`.
 * Respects quoted strings containing spaces.
 */
function parseLaunchOptions(options: string): string[] {
  if (!options || options.trim() === '') return [];

  const result: string[] = [];
  const trimmed = options.trim();
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true;
      quoteChar = char;
      current += char;
    } else if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = '';
      current += char;
    } else if (char === ' ' && !inQuote) {
      if (current.trim()) {
        result.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

/**
 * Filter out launch options that already exist in existing args.
 * Comparison is case-insensitive for the option name part.
 */
function filterDuplicateLaunchOptions(existingArgs: string, newOptions: string): string {
  const existingParsed = parseLaunchOptions(existingArgs);
  const newParsed = parseLaunchOptions(newOptions);

  // Normalize existing options for comparison (lowercase)
  const existingNormalized = new Set(existingParsed.map((opt) => opt.toLowerCase()));

  // Filter out duplicates
  const filtered = newParsed.filter((opt) => !existingNormalized.has(opt.toLowerCase()));

  return filtered.join(' ');
}

// =============================================================================
// Manual Implementation
// =============================================================================

/**
 * Modify launch options for a manually imported game.
 *
 * This creates or modifies a desktop shortcut with the launch arguments,
 * and stores the options internally via GameLibraryService for use when launching.
 *
 * Logic:
 * - If an existing Twiki shortcut is found without args: modify it, return original args for revert
 * - If found with args: append new options
 * - If multiple shortcuts found: prefer one without args, else create new
 * - If none found: create new shortcut (return shortcutCreated: true)
 */
async function modifyManualLaunchOptions(
  gameId: string,
  launchOptions: string
): Promise<ModifyLaunchOptionsResult> {
  // Get game from GameLibraryService - gameId here is the launcher-specific ID (from agent tool call)
  const gameLibrary = GameLibraryService.getInstance();
  const game = gameLibrary.getGameByLauncherId(gameId);

  if (!game) {
    throw new Error(`Game not found: ${gameId}`);
  }

  if (game.launcher !== 'manual') {
    throw new Error(`Game ${gameId} is not a manual game (launcher: ${game.launcher})`);
  }

  // Get the executable path from launch configs
  const defaultConfig = game.launchConfigs.find((c) => c.type === 'default') || game.launchConfigs[0];
  if (!defaultConfig || !defaultConfig.executable) {
    throw new Error(`No executable found for game: ${game.name}`);
  }

  const executablePath = defaultConfig.executable;
  const desktopPath = getDesktopPath();

  // Find existing Twiki shortcuts for this game
  const existingShortcuts = await findTwikiShortcuts(game.name);

  let shortcutPath: string;
  let originalArgs: string | undefined;
  let shortcutCreated = false;
  let modificationDetails: string;
  // The final combined args that will be stored in internal launch config
  let finalArgs: string = launchOptions;

  if (existingShortcuts.length === 0) {
    // No existing shortcut - create a new one
    const shortcutName = getTwikiShortcutName(game.name).replace('.lnk', '');
    shortcutPath = await createShortcut({
      targetPath: executablePath,
      arguments: launchOptions,
      name: shortcutName,
      location: desktopPath,
      description: `Launch ${game.name} with Twiki options`,
    });
    shortcutCreated = true;
    modificationDetails = `Created new desktop shortcut "${shortcutName}.lnk" with launch options: ${launchOptions}`;
  } else {
    // Find the best shortcut to modify
    // Prefer one without existing arguments
    let targetShortcut: { path: string; info: Awaited<ReturnType<typeof readShortcut>> } | null = null;

    for (const scPath of existingShortcuts) {
      const info = await readShortcut(scPath);

      // If this shortcut has no arguments, prefer it
      if (!info.arguments || info.arguments.trim() === '') {
        targetShortcut = { path: scPath, info };
        break;
      }

      // Otherwise, keep track of the first one we found
      if (!targetShortcut) {
        targetShortcut = { path: scPath, info };
      }
    }

    if (targetShortcut) {
      // Modify the existing shortcut
      originalArgs = targetShortcut.info.arguments;
      const hasOriginalArgs = originalArgs && originalArgs.trim() !== '';

      // Build combined args, filtering out duplicates to avoid "-nointro -nointro"
      let combinedArgs: string;
      if (hasOriginalArgs) {
        const newOptionsToAdd = filterDuplicateLaunchOptions(originalArgs, launchOptions);
        combinedArgs = newOptionsToAdd
          ? `${originalArgs.trim()} ${newOptionsToAdd}`
          : originalArgs.trim();
      } else {
        combinedArgs = launchOptions;
      }

      await updateShortcutArgs(targetShortcut.path, combinedArgs);
      shortcutPath = targetShortcut.path;
      finalArgs = combinedArgs;

      modificationDetails = hasOriginalArgs
        ? `Updated existing shortcut "${targetShortcut.path}" - appended "${launchOptions}" to existing args "${originalArgs}"`
        : `Updated existing shortcut "${targetShortcut.path}" with launch options: ${launchOptions}`;
    } else {
      // This shouldn't happen if existingShortcuts.length > 0, but handle it anyway
      const shortcutName = getTwikiShortcutName(game.name).replace('.lnk', '');
      shortcutPath = await createShortcut({
        targetPath: executablePath,
        arguments: launchOptions,
        name: shortcutName,
        location: desktopPath,
        description: `Launch ${game.name} with Twiki options`,
      });
      shortcutCreated = true;
      modificationDetails = `Created new desktop shortcut "${shortcutName}.lnk" with launch options: ${launchOptions}`;
    }
  }

  // Store the final combined launch options internally via GameLibraryService
  // This ensures launching via the app uses the same args as the shortcut
  await gameLibrary.addTwikiLaunchConfig(game.id, finalArgs);

  return {
    path: shortcutPath,
    modificationDetails,
    launcher: 'manual',
    originalArgs,
    shortcutCreated,
    gameId: game.id,
  };
}

// =============================================================================
// Main Dispatcher
// =============================================================================

/**
 * Modify game launch options for the specified launcher.
 *
 * @param params - Parameters for the modification
 * @returns Result of the modification including paths and details
 * @throws Error if the launcher is not supported or the modification fails
 */
export async function modifyGameLaunchOptions(
  params: ModifyLaunchOptionsParams
): Promise<ModifyLaunchOptionsResult> {
  const { launcher, gameId, launchOptions, skipBackup = false } = params;

  switch (launcher) {
    case 'steam':
      return modifySteamLaunchOptions(gameId, launchOptions, skipBackup);
    case 'manual':
      return modifyManualLaunchOptions(gameId, launchOptions);
    default:
      throw new Error(`Unsupported launcher: ${launcher}`);
  }
}
