/**
 * Formatters for miscellaneous tools (user input, download, launch options).
 */

import type {
  UserInputOperation,
  LaunchOptionsOperation,
  DownloadOperation,
  PathOperation,
} from '../../interfaces/tool-display.interface';
import type { FormatterEntry } from './types';
import { shortenUrl, detectHoster, extractFileName } from './formatter-utils';

// === User Input Tool ===
export const getUserInputTool: FormatterEntry = {
  config: { displayName: 'User Input', iconType: 'message-square' },
  formatSimple: (args) => {
    return `Ask user: ${args.message}`;
  },
  formatStructured: (args, ctx) => {
    ctx.operations.push({
      type: 'user-input',
      message: String(args.message || ''),
      options: args.options as string[] | undefined,
    } as UserInputOperation);
  },
};

// === Game Launch Options Tool ===
export const gameLaunchOptionsTool: FormatterEntry = {
  config: { displayName: 'Launch Options', iconType: 'gamepad' },
  formatSimple: (args) => {
    const launcher = String(args.launcher || 'steam');
    const gameId = String(args.gameId || '');
    const launcherDisplay = launcher.charAt(0).toUpperCase() + launcher.slice(1);
    return `Set ${launcherDisplay} launch options (Game ID: ${gameId})\nOptions: ${args.launchOptions || '(clear)'}`;
  },
  formatStructured: (args, ctx) => {
    const launcher = String(args.launcher || 'steam') as 'steam' | 'manual';
    const gameId = String(args.gameId || '');
    ctx.operations.push({
      type: 'launch-options',
      launcher,
      gameId,
      options: String(args.launchOptions || ''),
    } as LaunchOptionsOperation);
  },
};

// === Download File Tool ===
export const downloadFileTool: FormatterEntry = {
  config: { displayName: 'Download File', iconType: 'download' },
  formatSimple: (args) => {
    const url = String(args.downloadUrl || '');
    const shouldExtract = args.shouldExtract === true;
    const openAfterDownload = args.openAfterDownload === true;
    const actions = [shouldExtract && 'extract', openAfterDownload && 'open'].filter(Boolean);
    const actionsStr = actions.length > 0 ? ` & ${actions.join(' & ')}` : '';
    return `Download${actionsStr}: ${url}`;
  },
  formatStructured: (args, ctx) => {
    const url = String(args.downloadUrl || '');
    const shouldExtract = args.shouldExtract === true;
    const openAfterDownload = args.openAfterDownload === true;
    ctx.operations.push({
      type: 'download',
      url,
      displayUrl: shortenUrl(url),
      shouldExtract,
      openAfterDownload,
      hoster: detectHoster(url),
    } as DownloadOperation);
  },
};

// === Install ReShade Tool ===
export const installReshadeTool: FormatterEntry = {
  config: { displayName: 'Install ReShade', iconType: 'settings' },
  formatSimple: (args) => {
    const gameExe = String(args.gameExePath || '');
    const api = String(args.graphicsApi || '');
    const addon = String(args.addonFilePath || '');
    const addonName = extractFileName(addon);
    return `Install ReShade (${api.toUpperCase()}) to: ${gameExe}\nAddon: ${addonName}`;
  },
  formatStructured: (args, ctx) => {
    const gameExe = String(args.gameExePath || '');
    const api = String(args.graphicsApi || '').toUpperCase();
    const addon = String(args.addonFilePath || '');
    const addonName = extractFileName(addon);

    // Show the game directory as the main path operation
    const gameDir = gameExe.substring(0, gameExe.lastIndexOf('\\')) || gameExe;
    ctx.operations.push({
      type: 'path',
      path: gameDir,
      fileName: extractFileName(gameDir) || gameDir,
      detail: `ReShade (${api}) + ${addonName}`,
    } as PathOperation);
  },
};

/**
 * All miscellaneous tool formatters.
 */
export const miscToolFormatters: Record<string, FormatterEntry> = {
  'get-user-input-tool': getUserInputTool,
  'modify-game-launch-options-tool': gameLaunchOptionsTool,
  'download-file-tool': downloadFileTool,
  'install-reshade-tool': installReshadeTool,
};
