/**
 * Steam VDF/ACF file parser and utilities
 * Parses and modifies Valve Data Format files used by Steam for configuration and app manifests
 */

import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { shell } from 'electron';
import { createBackup } from '../tools/tool.utils';
import { expandWindowsEnvVars, waitForProcessTermination } from './system.utils';

const execAsync = promisify(exec);

// =============================================================================
// Types
// =============================================================================

/**
 * Represents the parsed Steam config data structure
 * Can be a string value or a nested object
 */
export type SteamConfigValue = string | { [key: string]: SteamConfigValue };

/**
 * Steam environment information
 */
export interface SteamEnvironment {
  success: boolean;
  steamInstallPath?: string;
  userConfigPath?: string;
  userId?: string;
  error?: string;
}

/**
 * Parameters for modifying a Steam data file
 */
export interface ModifySteamDataFileParams {
  path: string;
  keyPath: string;
  value: string;
  skipBackup?: boolean;
}

/**
 * Result of modifying a Steam data file
 */
export interface ModifySteamDataFileResult {
  path: string;
  backupPath?: string;
  modificationDetails: string;
}

// =============================================================================
// Steam Environment Functions
// =============================================================================

/**
 * Queries Windows registry to find Steam installation path
 */
export async function getSteamInstallPath(): Promise<string | null> {
  const registryPaths = [
    'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam',
    'HKLM\\SOFTWARE\\Valve\\Steam',
    'HKCU\\Software\\Valve\\Steam',
  ];

  for (const regPath of registryPaths) {
    try {
      const { stdout } = await execAsync(`reg query "${regPath}" /v InstallPath`);
      const match = stdout.match(/InstallPath\s+REG_SZ\s+(.+)/);
      if (match?.[1]) {
        return match[1].trim();
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Finds the Steam user ID with the most recently modified localconfig.vdf
 */
export async function getMostRecentUserId(steamInstallPath: string): Promise<string | null> {
  const userdataPath = path.join(steamInstallPath, 'userdata');

  try {
    const entries = await fs.readdir(userdataPath, { withFileTypes: true });
    const userDirs = entries.filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name));

    if (userDirs.length === 0) {
      return null;
    }

    let mostRecentUserId: string | null = null;
    let mostRecentTime = 0;

    for (const userDir of userDirs) {
      const configPath = path.join(userdataPath, userDir.name, 'config', 'localconfig.vdf');

      try {
        const stats = await fs.stat(configPath);
        if (stats.mtimeMs > mostRecentTime) {
          mostRecentTime = stats.mtimeMs;
          mostRecentUserId = userDir.name;
        }
      } catch {
        continue;
      }
    }

    return mostRecentUserId;
  } catch {
    return null;
  }
}

/**
 * Retrieves Steam environment including install path and user config path
 */
export async function getSteamEnvironment(): Promise<SteamEnvironment> {
  try {
    const steamInstallPath = await getSteamInstallPath();
    if (!steamInstallPath) {
      return {
        success: false,
        error: 'Steam installation path not found in Windows registry',
      };
    }

    const userId = await getMostRecentUserId(steamInstallPath);
    if (!userId) {
      return {
        success: false,
        steamInstallPath,
        error: 'No Steam user data found in userdata folder',
      };
    }

    const userConfigPath = path.join(steamInstallPath, 'userdata', userId, 'config', 'localconfig.vdf');

    try {
      await fs.access(userConfigPath);
    } catch {
      return {
        success: false,
        steamInstallPath,
        userId,
        error: `User config file not found at: ${userConfigPath}`,
      };
    }

    return {
      success: true,
      steamInstallPath,
      userConfigPath,
      userId,
    };
  } catch (error) {
    return {
      success: false,
      error: `Unexpected error retrieving Steam configuration: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// =============================================================================
// VDF Parsing Functions
// =============================================================================

/**
 * Unescapes VDF string values
 * @param str - Escaped string from VDF file
 * @returns Unescaped string
 */
function unescapeVdfString(str: string): string {
  return str
    .replace(/\\n/g, '\n') // Unescape newlines
    .replace(/\\t/g, '\t') // Unescape tabs
    .replace(/\\"/g, '"') // Unescape quotes
    .replace(/\\\\/g, '\\'); // Unescape backslashes (must be last)
}

/**
 * Parses Steam data file format (VDF/ACF) text into a JavaScript object
 * @param content - The Steam data file content
 * @returns Parsed object structure
 */
export function parseSteamData(content: string): { [key: string]: SteamConfigValue } {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'));
  let index = 0;

  function parseValue(): SteamConfigValue {
    const line = lines[index];

    // Match quoted key
    const keyMatch = line.match(/^"([^"]*)"(?:\s+(.*))?$/);
    if (!keyMatch) {
      throw new Error(`Invalid Steam config syntax at line ${index + 1}: ${line}`);
    }

    const rest = keyMatch[2]?.trim();

    // Check if this is a key-value pair or a nested object
    if (rest && rest.startsWith('"') && rest.endsWith('"')) {
      // Simple key-value pair - unescape the value
      const value = unescapeVdfString(rest.slice(1, -1));
      return value;
    } else {
      // Nested object - find opening brace
      const key = keyMatch[1];
      index++;
      if (index >= lines.length) {
        throw new Error(`Expected opening brace after key "${key}"`);
      }

      const braceLine = lines[index];
      if (braceLine !== '{') {
        throw new Error(`Expected opening brace at line ${index + 1}, got: ${braceLine}`);
      }

      // Parse nested content
      const obj: { [key: string]: SteamConfigValue } = {};
      index++;

      while (index < lines.length && lines[index] !== '}') {
        const nestedKey = parseKey();
        obj[nestedKey] = parseValue();
        index++;
      }

      if (index >= lines.length || lines[index] !== '}') {
        throw new Error(`Missing closing brace for key "${key}"`);
      }

      return obj;
    }
  }

  function parseKey(): string {
    const line = lines[index];
    const keyMatch = line.match(/^"([^"]*)"(?:\s+(.*))?$/);
    if (!keyMatch) {
      throw new Error(`Invalid key at line ${index + 1}: ${line}`);
    }
    return keyMatch[1];
  }

  const root: { [key: string]: SteamConfigValue } = {};

  while (index < lines.length) {
    const key = parseKey();
    root[key] = parseValue();
    index++;
  }

  return root;
}

// =============================================================================
// VDF Writing Functions
// =============================================================================

/**
 * Escapes special characters in string values for VDF format
 */
function escapeVdfString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

/**
 * Stringifies a JavaScript object back to Steam config format
 */
function stringifySteamConfig(obj: { [key: string]: SteamConfigValue }, indent: number = 0): string {
  const lines: string[] = [];
  const indentStr = '\t'.repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      lines.push(`${indentStr}"${key}"\t\t"${escapeVdfString(value)}"`);
    } else {
      lines.push(`${indentStr}"${key}"`);
      lines.push(`${indentStr}{`);
      lines.push(stringifySteamConfig(value, indent + 1));
      lines.push(`${indentStr}}`);
    }
  }

  return lines.join('\n');
}

/**
 * Navigates to a nested key path and modifies the value
 */
function modifyAtKeyPath(
  obj: { [key: string]: SteamConfigValue },
  keyPath: string,
  value: string | { [key: string]: SteamConfigValue }
): { modified: boolean; details: string; oldValue?: SteamConfigValue } {
  const keys = keyPath.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj;
  let oldValue: SteamConfigValue | undefined;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    if (!(key in current)) {
      current[key] = {};
    } else if (typeof current[key] === 'string') {
      return {
        modified: false,
        details: `Cannot traverse through string value at "${keys.slice(0, i + 1).join('.')}"`,
      };
    }

    current = current[key];
  }

  const targetKey = keys[keys.length - 1];
  oldValue = current[targetKey];
  current[targetKey] = value;

  const details =
    oldValue !== undefined
      ? typeof value === 'string'
        ? `Updated ${keyPath}: "${oldValue}" → "${value}"`
        : `Updated ${keyPath} to nested object`
      : typeof value === 'string'
        ? `Added ${keyPath}="${value}"`
        : `Added ${keyPath} as nested object`;

  return { modified: true, details, oldValue };
}

/**
 * Modifies a Steam data file (VDF format) by setting a value at a specific key path
 */
export async function modifySteamDataFile(params: ModifySteamDataFileParams): Promise<ModifySteamDataFileResult> {
  const { path: filePath, keyPath, value, skipBackup = false } = params;

  const expandedPath = expandWindowsEnvVars(filePath);
  const currentContent = await fs.readFile(expandedPath, 'utf-8');
  const backupPath = await createBackup(expandedPath, skipBackup);
  const configData = parseSteamData(currentContent);

  const modifyResult = modifyAtKeyPath(configData, keyPath, value);
  if (!modifyResult.modified) {
    throw new Error(modifyResult.details);
  }

  const finalContent = stringifySteamConfig(configData);
  const dir = path.dirname(expandedPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(expandedPath, finalContent, 'utf-8');

  return {
    path: expandedPath,
    backupPath,
    modificationDetails: modifyResult.details,
  };
}

// =============================================================================
// Steam Process Management
// =============================================================================

const STEAM_PROCESSES = ['steam.exe', 'steamwebhelper.exe', 'steamservice.exe'];

/**
 * Kill Steam process using steam:// protocol
 */
export async function killSteam(): Promise<void> {
  await shell.openExternal(`steam://exit`);
}

/**
 * Wait for Steam processes to terminate
 */
export async function waitForSteamTermination(timeoutMs: number = 10000): Promise<void> {
  await waitForProcessTermination(STEAM_PROCESSES, timeoutMs);
}

/**
 * Start Steam
 */
export async function startSteam(): Promise<void> {
  try {
    const steamEnv = await getSteamEnvironment();
    if (steamEnv.success && steamEnv.steamInstallPath) {
      const steamExe = path.join(steamEnv.steamInstallPath, 'steam.exe');
      exec(`"${steamExe}"`, { windowsHide: true });
    }
  } catch {
    // Best effort
  }
}
