/**
 * Shared utility functions for client-side tools
 */

import { promises as fs } from 'fs';

/** Line ending types */
export type LineEnding = '\r\n' | '\n';

/** Default line ending for Windows */
export const WINDOWS_LINE_ENDING: LineEnding = '\r\n';

/**
 * Detects the line ending used in a file's content.
 * Returns CRLF if the file contains \r\n, otherwise returns the Windows default (CRLF).
 */
export function detectLineEnding(content: string): LineEnding {
  // Check for CRLF first (Windows)
  if (content.includes('\r\n')) {
    return '\r\n';
  }
  // Default to Windows line ending for this Windows-exclusive app
  return WINDOWS_LINE_ENDING;
}

/**
 * Normalizes all line endings to LF (\n) for consistent internal processing.
 * This allows string operations to work uniformly regardless of original line endings.
 */
export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

/**
 * Restores line endings to the specified type.
 * Converts all LF to the target line ending (typically CRLF for Windows).
 */
export function restoreLineEndings(content: string, lineEnding: LineEnding): string {
  // First normalize to LF, then convert to target
  const normalized = content.replace(/\r\n/g, '\n');
  if (lineEnding === '\r\n') {
    return normalized.replace(/\n/g, '\r\n');
  }
  return normalized;
}

/**
 * Reads a file and returns its content with normalized line endings (LF),
 * along with the original line ending for later restoration.
 */
export async function readFileNormalized(filePath: string): Promise<{ content: string; lineEnding: LineEnding }> {
  const rawContent = await fs.readFile(filePath, 'utf-8');
  const lineEnding = detectLineEnding(rawContent);
  const content = normalizeLineEndings(rawContent);
  return { content, lineEnding };
}

/**
 * Writes content to a file, converting line endings to the specified type.
 */
export async function writeFileWithLineEnding(filePath: string, content: string, lineEnding: LineEnding): Promise<void> {
  const finalContent = restoreLineEndings(content, lineEnding);
  await fs.writeFile(filePath, finalContent, 'utf-8');
}

/**
 * Converts escaped string sequences to actual characters.
 * Handles common escape sequences that LLMs may produce: \r, \n, \t
 */
export function unescapeString(str: string): string {
  return str
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

/**
 * Creates a backup of a file if it exists and has content
 * @returns Backup file path if created, undefined otherwise
 */
export async function createBackup(filePath: string, skipBackup = false): Promise<string | undefined> {
  if (skipBackup) {
    return undefined;
  }

  try {
    // Use stat to check if file exists and has content (works for both text and binary files)
    const stat = await fs.stat(filePath);
    if (stat.size === 0) {
      return undefined;
    }

    const backupPath = `${filePath}.backup_${Date.now()}`;
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  } catch {
    // File doesn't exist or can't be read, no backup needed
    return undefined;
  }
}
