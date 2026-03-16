/**
 * Windows Shortcut (.lnk) Utilities
 *
 * Provides functions for creating, reading, and modifying Windows shortcuts
 * using PowerShell and the WScript.Shell COM object.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'node:path/win32';
import { createLogger } from './logger.utils';

const logger = createLogger('ShortcutUtils');

/** Prefix for Twiki-created shortcuts */
const TWIKI_SHORTCUT_PREFIX = 'Twiki - ';

/** PowerShell common flags for non-interactive execution (using stdin) */
const PS_FLAGS_STDIN = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-OutputFormat', 'Text', '-Command', '-'];

/** PowerShell common flags for non-interactive execution (using command argument) */
const PS_FLAGS_CMD = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-OutputFormat', 'Text', '-Command'];

// =============================================================================
// Types
// =============================================================================

export interface ShortcutInfo {
  /** Full path to the shortcut file */
  path: string;
  /** Target executable path */
  targetPath: string;
  /** Launch arguments */
  arguments: string;
  /** Working directory */
  workingDirectory: string;
  /** Shortcut description */
  description: string;
  /** Icon location */
  iconLocation: string;
}

export interface CreateShortcutParams {
  /** Target executable path */
  targetPath: string;
  /** Launch arguments (optional) */
  arguments?: string;
  /** Shortcut name (without .lnk extension) */
  name: string;
  /** Directory where the shortcut will be created */
  location: string;
  /** Working directory (defaults to target's directory) */
  workingDirectory?: string;
  /** Shortcut description */
  description?: string;
  /** Icon location (defaults to target executable) */
  iconLocation?: string;
}

// =============================================================================
// PowerShell Execution Helper
// =============================================================================

/**
 * Executes a PowerShell script via stdin pipe to avoid command line length limits.
 * @param script - PowerShell script to execute
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns Promise that resolves with stdout
 */
function executePowerShellScript(script: string, timeoutMs: number = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    // For shorter scripts, pass directly via -Command argument (more reliable)
    // For longer scripts, use stdin to avoid command line length limits
    const useStdin = script.length > 2000;
    const args = useStdin ? PS_FLAGS_STDIN : [...PS_FLAGS_CMD, script];

    const ps = spawn('powershell', args, {
      stdio: useStdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      ps.kill();
      reject(new Error('PowerShell script timed out'));
    }, timeoutMs);

    ps.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    ps.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    ps.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        // Log stderr if stdout is empty (helps debug issues)
        if (!stdout.trim() && stderr.trim()) {
          logger.warn(`PowerShell produced no stdout but has stderr: ${stderr}`);
        }
        resolve(stdout);
      } else {
        reject(new Error(`PowerShell exited with code ${code}: ${stderr || 'No error output'}`));
      }
    });

    ps.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    // Write script to stdin if using stdin mode
    if (useStdin && ps.stdin) {
      ps.stdin.write(script);
      ps.stdin.end();
    }
  });
}

// =============================================================================
// Path Helpers
// =============================================================================

/**
 * Get the user's Desktop folder path.
 * @returns Desktop folder path
 */
export function getDesktopPath(): string {
  const userProfile = process.env.USERPROFILE;
  if (!userProfile) {
    throw new Error('USERPROFILE environment variable not found');
  }
  return path.join(userProfile, 'Desktop');
}

/**
 * Generate the Twiki shortcut name for a game.
 * @param gameName - The game's display name
 * @returns Shortcut filename with .lnk extension
 */
export function getTwikiShortcutName(gameName: string): string {
  // Sanitize game name for filesystem (remove invalid characters)
  const sanitized = gameName.replace(/[<>:"/\\|?*]/g, '_');
  return `${TWIKI_SHORTCUT_PREFIX}${sanitized}.lnk`;
}

// =============================================================================
// Shortcut Operations
// =============================================================================

/**
 * Find existing Twiki shortcuts for a game on the Desktop.
 * @param gameName - The game's display name
 * @returns Array of full paths to matching shortcuts
 */
export async function findTwikiShortcuts(gameName: string): Promise<string[]> {
  try {
    const desktopPath = getDesktopPath();
    const files = await fs.readdir(desktopPath);

    // Match shortcuts that start with "Twiki - " and contain the game name
    const sanitizedName = gameName.replace(/[<>:"/\\|?*]/g, '_').toLowerCase();
    const exactMatch = getTwikiShortcutName(gameName).toLowerCase();

    const matchingShortcuts: string[] = [];

    for (const file of files) {
      const lowerFile = file.toLowerCase();

      // First check for exact match
      if (lowerFile === exactMatch) {
        matchingShortcuts.push(path.join(desktopPath, file));
        continue;
      }

      // Then check for other Twiki shortcuts containing the game name
      if (
        lowerFile.startsWith(TWIKI_SHORTCUT_PREFIX.toLowerCase()) &&
        lowerFile.endsWith('.lnk') &&
        lowerFile.includes(sanitizedName)
      ) {
        matchingShortcuts.push(path.join(desktopPath, file));
      }
    }

    return matchingShortcuts;
  } catch (error) {
    logger.error('Failed to find Twiki shortcuts:', error);
    return [];
  }
}

/**
 * Read properties of a Windows shortcut (.lnk) file.
 * @param shortcutPath - Full path to the .lnk file
 * @returns Shortcut information
 */
export async function readShortcut(shortcutPath: string): Promise<ShortcutInfo> {
  // Escape single quotes in path for PowerShell
  const escapedPath = shortcutPath.replace(/'/g, "''");

  // PowerShell script that:
  // 1. Verifies the shortcut file exists
  // 2. Reads shortcut properties using WScript.Shell COM object
  // 3. Outputs JSON with proper escaping
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $path = '${escapedPath}'
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Shortcut file not found: $path"
  }
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($path)
  $result = @{
    path = $path
    targetPath = $shortcut.TargetPath
    arguments = $shortcut.Arguments
    workingDirectory = $shortcut.WorkingDirectory
    description = $shortcut.Description
    iconLocation = $shortcut.IconLocation
  }
  $json = $result | ConvertTo-Json -Compress
  Write-Output $json
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`;

  try {
    const result = await executePowerShellScript(script);
    const trimmed = result.trim();

    // Handle empty output
    if (!trimmed) {
      throw new Error('PowerShell returned empty output');
    }

    // Find the JSON object in the output (skip any BOM or extra output)
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
      logger.error(`Invalid PowerShell output for shortcut ${shortcutPath}: ${trimmed}`);
      throw new Error('PowerShell output does not contain valid JSON');
    }

    const jsonStr = trimmed.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonStr);

    return {
      path: parsed.path || shortcutPath,
      targetPath: parsed.targetPath || '',
      arguments: parsed.arguments || '',
      workingDirectory: parsed.workingDirectory || '',
      description: parsed.description || '',
      iconLocation: parsed.iconLocation || '',
    };
  } catch (error) {
    logger.error(`Failed to read shortcut ${shortcutPath}:`, error);
    throw new Error(`Failed to read shortcut: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a new Windows shortcut (.lnk) file.
 * @param params - Shortcut creation parameters
 * @returns Full path to the created shortcut
 */
export async function createShortcut(params: CreateShortcutParams): Promise<string> {
  const { targetPath, arguments: args = '', name, location, workingDirectory, description = '', iconLocation } = params;

  const shortcutPath = path.join(location, `${name}.lnk`);

  // Escape single quotes for PowerShell
  const escapedShortcutPath = shortcutPath.replace(/'/g, "''");
  const escapedTargetPath = targetPath.replace(/'/g, "''");
  const escapedArgs = args.replace(/'/g, "''");
  const escapedWorkingDir = (workingDirectory || path.dirname(targetPath)).replace(/'/g, "''");
  const escapedDescription = description.replace(/'/g, "''");
  const escapedIconLocation = (iconLocation || targetPath).replace(/'/g, "''");

  const script = `
$ErrorActionPreference = 'Stop'
try {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut('${escapedShortcutPath}')
  $shortcut.TargetPath = '${escapedTargetPath}'
  $shortcut.Arguments = '${escapedArgs}'
  $shortcut.WorkingDirectory = '${escapedWorkingDir}'
  $shortcut.Description = '${escapedDescription}'
  $shortcut.IconLocation = '${escapedIconLocation}'
  $shortcut.Save()
  Write-Output 'OK'
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`;

  try {
    const result = await executePowerShellScript(script);
    if (!result.trim().includes('OK')) {
      throw new Error('Shortcut creation did not complete successfully');
    }
    logger.info(`Created shortcut: ${shortcutPath}`);
    return shortcutPath;
  } catch (error) {
    logger.error(`Failed to create shortcut ${shortcutPath}:`, error);
    throw new Error(`Failed to create shortcut: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Update the arguments of an existing shortcut.
 * @param shortcutPath - Full path to the .lnk file
 * @param newArgs - New arguments string
 * @returns The previous arguments value
 */
export async function updateShortcutArgs(shortcutPath: string, newArgs: string): Promise<string> {
  // Escape single quotes for PowerShell
  const escapedPath = shortcutPath.replace(/'/g, "''");
  const escapedArgs = newArgs.replace(/'/g, "''");

  const script = `
$ErrorActionPreference = 'Stop'
try {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut('${escapedPath}')
  $oldArgs = $shortcut.Arguments
  $shortcut.Arguments = '${escapedArgs}'
  $shortcut.Save()
  Write-Output $oldArgs
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`;

  try {
    const result = await executePowerShellScript(script);
    const oldArgs = result.trim();
    logger.info(`Updated shortcut arguments: ${shortcutPath} -> "${newArgs}"`);
    return oldArgs;
  } catch (error) {
    logger.error(`Failed to update shortcut ${shortcutPath}:`, error);
    throw new Error(`Failed to update shortcut: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Delete a shortcut file.
 * @param shortcutPath - Full path to the .lnk file
 */
export async function deleteShortcut(shortcutPath: string): Promise<void> {
  try {
    await fs.unlink(shortcutPath);
    logger.info(`Deleted shortcut: ${shortcutPath}`);
  } catch (error) {
    logger.error(`Failed to delete shortcut ${shortcutPath}:`, error);
    throw new Error(`Failed to delete shortcut: ${error instanceof Error ? error.message : String(error)}`);
  }
}
