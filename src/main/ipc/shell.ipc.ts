/**
 * Shell IPC Handlers
 *
 * Handles IPC operations for shell/path operations including:
 * - Opening external URLs
 * - Opening directories and files in Explorer
 * - Opening registry paths in regedit
 */

import { shell } from 'electron';
import { exec, execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { expandWindowsEnvVars } from '../utils';
import { GameLibraryService } from '../services/game/game-library.service';
import { createLogger } from '../utils/logger.utils';
import { BINARY_FILE_EXTENSIONS } from '../constants';
import { createIpcListeners } from './ipc-handler.factory';

/** Check if a path exists (async) */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const logger = createLogger('ShellIpc');

/** Registry hive prefixes (both full and short forms) */
const REGISTRY_PREFIXES = [
  'HKEY_CLASSES_ROOT',
  'HKEY_CURRENT_USER',
  'HKEY_LOCAL_MACHINE',
  'HKEY_USERS',
  'HKEY_CURRENT_CONFIG',
  'HKCR',
  'HKCU',
  'HKLM',
  'HKU',
  'HKCC',
] as const;

/** Mapping of short registry prefixes to full names */
const SHORT_TO_FULL_REGISTRY: Record<string, string> = {
  HKCR: 'HKEY_CLASSES_ROOT',
  HKCU: 'HKEY_CURRENT_USER',
  HKLM: 'HKEY_LOCAL_MACHINE',
  HKU: 'HKEY_USERS',
  HKCC: 'HKEY_CURRENT_CONFIG',
};

/**
 * Open a path in Windows Explorer with foreground focus.
 * @param targetPath - Path to open
 */
function openPathInExplorer(targetPath: string): void {
  exec(`explorer "${targetPath.replace(/\//g, '\\')}"`);
}

/**
 * Check if a path is a Windows registry path.
 * @param pathStr - Path to check
 * @returns True if path starts with a registry hive prefix
 */
function isRegistryPath(pathStr: string): boolean {
  const upperPath = pathStr.toUpperCase();
  return REGISTRY_PREFIXES.some((prefix) => upperPath.startsWith(prefix));
}

/**
 * Normalize short registry prefixes to full names.
 * @param pathStr - Registry path with potentially short prefix
 * @returns Path with full registry hive name
 */
function normalizeRegistryPath(pathStr: string): string {
  for (const [short, full] of Object.entries(SHORT_TO_FULL_REGISTRY)) {
    if (pathStr.toUpperCase().startsWith(short + '\\') || pathStr.toUpperCase() === short) {
      return full + pathStr.substring(short.length);
    }
  }
  return pathStr;
}

/**
 * Open Registry Editor at a specific path.
 * Sets the LastKey registry value so regedit navigates to the correct location.
 * @param registryPath - Registry path to navigate to
 */
function openRegistryEditor(registryPath: string): void {
  const normalizedPath = normalizeRegistryPath(registryPath);
  const lastKeyPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit';

  try {
    execSync(`reg add "${lastKeyPath}" /v LastKey /t REG_SZ /d "Computer\\${normalizedPath}" /f`, {
      windowsHide: true,
    });
    exec('regedit');
  } catch (error) {
    logger.error('Failed to open registry editor:', error);
    exec('regedit');
  }
}

/**
 * Detect the type of a path.
 * @param pathStr - Path to analyze
 * @returns Path type: 'registry', 'file', 'directory', or 'unknown'
 */
async function getPathType(pathStr: string): Promise<'registry' | 'file' | 'directory' | 'unknown'> {
  if (isRegistryPath(pathStr)) {
    return 'registry';
  }

  try {
    const stats = await fs.stat(pathStr);
    return stats.isDirectory() ? 'directory' : 'file';
  } catch {
    // Path doesn't exist - try to determine from structure
    const lastSegment = pathStr.split(/[/\\]/).pop() || '';
    if (lastSegment.includes('.') && !lastSegment.startsWith('.')) {
      return 'file';
    }
    return 'unknown';
  }
}

/**
 * Find the first existing ancestor directory of a path.
 * @param pathStr - Starting path
 * @returns First existing ancestor directory, or null if none found
 */
async function findExistingAncestor(pathStr: string): Promise<string | null> {
  let current = pathStr;

  while (current) {
    if (await pathExists(current)) {
      try {
        const stats = await fs.stat(current);
        if (stats.isFile()) {
          return path.dirname(current);
        }
        return current;
      } catch {
        return current;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

/**
 * Remove wildcard patterns from a path, returning the parent directory.
 * @param pathStr - Path potentially containing wildcards
 * @returns Path with wildcard segment removed
 */
function stripWildcards(pathStr: string): string {
  if (!pathStr.includes('*')) {
    return pathStr;
  }

  const lastSep = Math.max(pathStr.lastIndexOf('/'), pathStr.lastIndexOf('\\'));
  if (lastSep > 0) {
    return pathStr.substring(0, lastSep);
  }
  return pathStr;
}

/**
 * Setup shell-related IPC handlers.
 */
export function setupShellIpc(): void {
  createIpcListeners([
    { channel: 'shell:open-external', handler: (_, url: string) => shell.openExternal(url) },
    {
      channel: 'shell:open-path',
      handler: async (_, inputPath: string) => {
        const expandedPath = stripWildcards(
          GameLibraryService.getInstance().expandLauncherPath(expandWindowsEnvVars(inputPath))
        );

        const pathType = await getPathType(expandedPath);

        switch (pathType) {
          case 'registry':
            openRegistryEditor(expandedPath);
            break;
          case 'file':
          case 'directory':
          case 'unknown':
          default:
            const fileExt = inputPath.split('.').pop()?.toLowerCase();
            if (
              (await pathExists(expandedPath)) &&
              !BINARY_FILE_EXTENSIONS.some((binExt) => fileExt === binExt)
            ) {
              openPathInExplorer(expandedPath);
            } else {
              const existingAncestor = await findExistingAncestor(expandedPath);
              if (existingAncestor) {
                openPathInExplorer(existingAncestor);
              } else {
                exec('explorer');
              }
            }
            break;
        }
      },
    },
  ]);
}
