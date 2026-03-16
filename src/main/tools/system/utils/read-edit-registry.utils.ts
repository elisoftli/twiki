/**
 * Read/Edit Windows Registry utility - read, set, or delete registry values
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { ReadEditRegistryParams, ReadEditRegistryResult, SingleRegistryResult, RegistryValueType } from './types';

const execAsync = promisify(exec);

/**
 * Normalize registry path abbreviations to full form
 */
function normalizeKeyPath(keyPath: string): string {
  return keyPath
    .replace(/^HKLM\\/i, 'HKEY_LOCAL_MACHINE\\')
    .replace(/^HKCU\\/i, 'HKEY_CURRENT_USER\\')
    .replace(/^HKCR\\/i, 'HKEY_CLASSES_ROOT\\')
    .replace(/^HKU\\/i, 'HKEY_USERS\\')
    .replace(/^HKCC\\/i, 'HKEY_CURRENT_CONFIG\\');
}

/**
 * Check if the registry path requires admin privileges for write operations
 */
function requiresElevation(keyPath: string): boolean {
  const normalized = normalizeKeyPath(keyPath).toUpperCase();
  return (
    normalized.startsWith('HKEY_LOCAL_MACHINE') ||
    normalized.startsWith('HKEY_CLASSES_ROOT') ||
    normalized.startsWith('HKEY_USERS') ||
    normalized.startsWith('HKEY_CURRENT_CONFIG')
  );
}

/**
 * Escape special characters in registry data for command line
 */
function escapeData(data: string | number): string {
  if (typeof data === 'number') {
    return String(data);
  }
  // Escape double quotes and other special characters
  return data.replace(/"/g, '\\"');
}

/**
 * Read current registry value (returns null if not exists)
 */
async function readRegistryValue(
  keyPath: string,
  valueName: string
): Promise<{ value: string | number | null; type: string | null }> {
  const normalizedPath = normalizeKeyPath(keyPath);
  const valueArg = valueName === '(Default)' ? '/ve' : `/v "${valueName}"`;

  try {
    const { stdout } = await execAsync(`reg query "${normalizedPath}" ${valueArg}`);
    // Parse output format:
    // For named value: "    valueName    REG_SZ    data"
    // For default:     "    (Default)    REG_SZ    data"
    // For empty value: "    (Default)    REG_SZ    (value not set)"
    const lines = stdout.split('\n');
    for (const line of lines) {
      // Remove carriage return if present (Windows line endings)
      const cleanLine = line.replace(/\r$/, '');

      // Match: whitespace + valueName + whitespace + REG_TYPE + whitespace + data
      // The value name can be "(Default)" or any other name
      // Format: "    (Default)    REG_SZ    value" or "    ValueName    REG_DWORD    0x1"
      // Using \s{2,} to match the tab/multi-space separators between columns
      const match = cleanLine.match(/^\s+(.+?)\s{2,}(REG_\w+)\s{2,}(.*)$/);
      if (match) {
        // match[1] = value name (e.g., "(Default)")
        // match[2] = type (e.g., "REG_SZ")
        // match[3] = value data
        const type = match[2];
        const rawValue = match[3].trim();

        // Handle "(value not set)" - value exists but is empty
        if (rawValue === '(value not set)') {
          return { value: '', type };
        }

        let value: string | number = rawValue;
        if (type === 'REG_DWORD') {
          // REG_DWORD values are displayed as 0x prefix hex
          value = parseInt(rawValue.replace('0x', ''), 16);
        }
        return { value, type };
      }
    }
    return { value: null, type: null };
  } catch {
    // Key/value doesn't exist: "ERROR: The system was unable to find the specified registry key or value."
    return { value: null, type: null };
  }
}

/**
 * Escape a string for use in PowerShell single-quoted strings
 */
function escapePowerShellString(str: string): string {
  // In single-quoted PowerShell strings, only single quotes need escaping (doubled)
  return str.replace(/'/g, "''");
}

/**
 * Execute command with UAC elevation if needed using PowerShell Start-Process
 * This uses the native Windows UAC prompt without external dependencies
 */
async function execWithElevation(
  command: string,
  needsElevation: boolean
): Promise<{ stdout: string; stderr: string }> {
  if (needsElevation) {
    // Use PowerShell's Start-Process with -Verb RunAs to trigger UAC elevation
    // -Wait ensures we wait for completion
    // -PassThru returns the process object so we can check the exit code
    // -WindowStyle Hidden prevents a visible console window
    const escapedCommand = escapePowerShellString(command);

    // Build PowerShell command with proper statement separator (;)
    const psCommand =
      `$process = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c ${escapedCommand}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden; ` +
      `exit $process.ExitCode`;

    try {
      // Execute the PowerShell script
      const result = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand.replace(/"/g, '\\"')}"`,
        { windowsHide: true }
      );
      return result;
    } catch (error) {
      // PowerShell returns non-zero exit code if the elevated command failed
      // or if the user cancelled the UAC prompt
      const execError = error as { code?: number; stderr?: string; message?: string };
      if (execError.code === 1223 || execError.message?.includes('canceled')) {
        throw new Error('UAC elevation was cancelled by the user');
      }
      throw error;
    }
  } else {
    return execAsync(command);
  }
}

/**
 * Build the reg.exe command for setting a value
 */
function buildSetCommand(
  keyPath: string,
  valueName: string,
  valueType: RegistryValueType,
  data: string | number
): string {
  const valueArg = valueName === '(Default)' ? '/ve' : `/v "${valueName}"`;
  const typeArg = `/t ${valueType}`;
  const escapedData = escapeData(data);
  const dataArg = `/d "${escapedData}"`;

  return `reg add "${keyPath}" ${valueArg} ${typeArg} ${dataArg} /f`;
}

/**
 * Build the reg.exe command for deleting a value
 */
function buildDeleteCommand(keyPath: string, valueName: string): string {
  const valueArg = valueName === '(Default)' ? '/ve' : `/v "${valueName}"`;
  return `reg delete "${keyPath}" ${valueArg} /f`;
}

/**
 * Read, set, or delete Windows Registry entries
 */
export async function readEditRegistry(params: ReadEditRegistryParams): Promise<ReadEditRegistryResult> {
  const results: SingleRegistryResult[] = [];

  for (const op of params.operations) {
    const normalizedPath = normalizeKeyPath(op.keyPath);

    try {
      if (op.operationType === 'read') {
        // Read operation - just fetch the current value
        const { value, type } = await readRegistryValue(op.keyPath, op.valueName);

        results.push({
          keyPath: normalizedPath,
          valueName: op.valueName,
          operationType: 'read',
          valueType: type ?? undefined,
          success: true,
          value,
        });
      } else if (op.operationType === 'set') {
        // Set operation - read previous value first, then set new value
        const needsElevation = requiresElevation(op.keyPath);
        const { value: previousValue, type: previousType } = await readRegistryValue(op.keyPath, op.valueName);

        if (op.data === undefined) {
          throw new Error('Data is required for set operation');
        }

        const command = buildSetCommand(normalizedPath, op.valueName, op.valueType ?? 'REG_SZ', op.data);
        await execWithElevation(command, needsElevation);

        results.push({
          keyPath: normalizedPath,
          valueName: op.valueName,
          operationType: 'set',
          valueType: op.valueType,
          success: true,
          value: op.data,
          previousValue,
          previousType: previousType ?? undefined,
        });
      } else if (op.operationType === 'delete') {
        // Delete operation - read previous value first, then delete
        const needsElevation = requiresElevation(op.keyPath);
        const { value: previousValue, type: previousType } = await readRegistryValue(op.keyPath, op.valueName);

        const command = buildDeleteCommand(normalizedPath, op.valueName);
        await execWithElevation(command, needsElevation);

        results.push({
          keyPath: normalizedPath,
          valueName: op.valueName,
          operationType: 'delete',
          success: true,
          previousValue,
          previousType: previousType ?? undefined,
        });
      }
    } catch (error) {
      results.push({
        keyPath: normalizedPath,
        valueName: op.valueName,
        operationType: op.operationType,
        valueType: op.valueType,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    results,
    successfulOperations: results.filter((r) => r.success).length,
    failedOperations: results.filter((r) => !r.success).length,
  };
}
