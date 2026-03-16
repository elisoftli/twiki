import { exec, execSync } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { createLogger } from './logger.utils';

const execAsync = promisify(exec);
const logger = createLogger('SystemUtils');

// =============================================================================
// Known Folder Redirection (OneDrive KFM)
// =============================================================================

/** Windows Known Folder GUID for Documents (alternative to 'Personal' value name) */
const KNOWN_FOLDER_DOCUMENTS_GUID = '{F42EE2D3-909F-4907-8871-4C22FC0BF756}';

/** Registry value names mapped to their default subfolder under %USERPROFILE% */
const KNOWN_FOLDERS = [
  { registryValue: 'Personal', defaultSubfolder: 'Documents' },
  { registryValue: 'Desktop', defaultSubfolder: 'Desktop' },
  { registryValue: KNOWN_FOLDER_DOCUMENTS_GUID, defaultSubfolder: 'Documents' },
  { registryValue: 'My Pictures', defaultSubfolder: 'Pictures' },
] as const;

/** Cache: lowercase default path → actual path. null = not yet initialized. */
let knownFolderRedirections: Map<string, string> | null = null;

/** Reset cache — exported for tests */
export function _resetKnownFolderCache(): void {
  knownFolderRedirections = null;
}

/**
 * Pure env var replacement: expands %VAR% references using process.env.
 * Does NOT apply known folder redirection — used by both expandWindowsEnvVars
 * and the registry value parser (which must avoid triggering redirection).
 */
function replaceEnvVars(value: string): string {
  return value.replace(/%([^%]+)%/g, (match, varName) => {
    const envValue = process.env[varName];
    if (envValue) {
      return envValue;
    }
    return match;
  });
}

/**
 * Query the registry for actual known folder locations and build the redirection map.
 * Only runs on win32 when USERPROFILE is available.
 */
function buildKnownFolderRedirections(): Map<string, string> {
  const map = new Map<string, string>();

  if (process.platform !== 'win32') return map;

  const userProfile = process.env.USERPROFILE;
  if (!userProfile) return map;

  try {
    const output = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders"',
      { encoding: 'utf-8', timeout: 5000, windowsHide: true }
    );

    for (const { registryValue, defaultSubfolder } of KNOWN_FOLDERS) {
      // Match lines like: Personal    REG_EXPAND_SZ    %USERPROFILE%\OneDrive\Documents
      const pattern = new RegExp(
        `^\\s+${registryValue.replace(/[{}]/g, '\\$&')}\\s+REG_(?:EXPAND_)?SZ\\s+(.+)$`,
        'mi'
      );
      const match = output.match(pattern);
      if (!match) continue;

      const actualPath = replaceEnvVars(match[1].trim());
      const defaultPath = path.win32.join(userProfile, defaultSubfolder);

      // Only add redirection when the actual path differs from the default
      if (actualPath.toLowerCase() !== defaultPath.toLowerCase()) {
        map.set(defaultPath.toLowerCase(), actualPath);
      }
    }
  } catch (err) {
    logger.debug('Failed to query known folder redirections:', err);
  }

  return map;
}

/** Lazy-init wrapper for the known folder cache */
function getKnownFolderRedirections(): Map<string, string> {
  if (knownFolderRedirections === null) {
    knownFolderRedirections = buildKnownFolderRedirections();
  }
  return knownFolderRedirections;
}

/**
 * If the expanded path starts with a known default folder that has been redirected,
 * replace the prefix with the actual location.
 * Uses case-insensitive matching with path boundary check.
 */
function applyKnownFolderRedirections(expandedPath: string): string {
  const redirections = getKnownFolderRedirections();
  if (redirections.size === 0) return expandedPath;

  const lowerPath = expandedPath.toLowerCase();
  for (const [defaultLower, actual] of redirections) {
    if (
      lowerPath.startsWith(defaultLower) &&
      (expandedPath.length === defaultLower.length ||
        expandedPath[defaultLower.length] === '\\' ||
        expandedPath[defaultLower.length] === '/')
    ) {
      return actual + expandedPath.slice(defaultLower.length);
    }
  }

  return expandedPath;
}

/**
 * Ensures critical Windows system directories are on PATH.
 * Packaged Electron apps may not inherit the full system PATH,
 * causing tools like powershell.exe and reg.exe to not be found.
 * Must be called early in app startup, before any child process spawning.
 */
export function ensureSystemPath(): void {
  if (process.platform !== 'win32') return;

  const systemRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  const requiredPaths = [
    path.join(systemRoot, 'System32'),
    path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0'),
    path.join(systemRoot, 'System32', 'Wbem'),
  ];

  const currentPath = process.env.PATH || '';
  const currentPathLower = currentPath.toLowerCase();
  const missingPaths = requiredPaths.filter(
    (p) => !currentPathLower.includes(p.toLowerCase())
  );

  if (missingPaths.length > 0) {
    process.env.PATH = `${currentPath};${missingPaths.join(';')}`;
  }
}

/** Default timeout for process termination wait in milliseconds */
const DEFAULT_PROCESS_TERMINATION_TIMEOUT_MS = 10000;

/** Polling interval for checking process status in milliseconds */
const PROCESS_CHECK_POLLING_INTERVAL_MS = 500;

/**
 * Expands Windows environment variables in a path string
 * Supports variables like %USERPROFILE%, %APPDATA%, %LOCALAPPDATA%, etc.
 */
export function expandWindowsEnvVars(pathString: string): string {
  return applyKnownFolderRedirections(replaceEnvVars(pathString));
}

/**
 * Check if any of the specified processes are currently running
 * Uses PowerShell Get-Process to check all processes in a single command
 * @param processNames - Array of process names (e.g., ['game.exe', 'launcher.exe'])
 * @returns true if any of the processes are running
 */
export async function areProcessesRunning(processNames: string[]): Promise<boolean> {
  if (processNames.length === 0) return false;

  try {
    // Strip .exe extension - Get-Process uses names without extension
    const names = processNames.map((p) => p.replace(/\.exe$/i, ''));
    // Use single quotes for process names inside PowerShell to avoid nested double-quote issues
    const namesArg = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');

    const { stdout } = await execAsync(
      `powershell -NoProfile -Command "Get-Process -Name ${namesArg} -ErrorAction SilentlyContinue | Select-Object -First 1"`,
      { windowsHide: true }
    );

    return stdout.trim().length > 0;
  } catch (error) {
    // PowerShell returns exit code 1 when some processes aren't found, but may still output found ones
    // Check if stdout contains any process info despite the error
    const stdout = (error as { stdout?: string })?.stdout;
    if (stdout && stdout.trim().length > 0) {
      return true;
    }
    return false;
  }
}

/**
 * Kill processes by name using taskkill
 * @param processNames - Array of process names to terminate
 */
export async function killProcesses(processNames: string[]): Promise<void> {
  for (const proc of processNames) {
    try {
      await execAsync(`taskkill /IM "${proc}" /F`);
    } catch {
      // Process might not be running, that's fine
    }
  }
}

/**
 * Wait for processes to terminate with a timeout
 * @param processNames - Array of process names to wait for
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 10000)
 */
export async function waitForProcessTermination(
  processNames: string[],
  timeoutMs: number = DEFAULT_PROCESS_TERMINATION_TIMEOUT_MS
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const anyRunning = await areProcessesRunning(processNames);

    if (!anyRunning) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, PROCESS_CHECK_POLLING_INTERVAL_MS));
  }
}
