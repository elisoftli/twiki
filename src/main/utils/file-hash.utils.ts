/**
 * File hash utility for recipe validation.
 * Uses SHA-256 to compute deterministic file identity.
 */

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

/**
 * Special hash value indicating file should not exist.
 * Used for create-file operations where beforeHash should indicate non-existence.
 */
export const FILE_NOT_EXISTS_HASH = '__FILE_DOES_NOT_EXIST__';

/**
 * Error codes that indicate file cannot be read (not a hard failure).
 * These are handled gracefully by returning null.
 */
const UNREADABLE_FILE_CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'EISDIR']);

/**
 * Check if an error code indicates the file is unreadable (not a hard failure).
 */
function isUnreadableError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return !!code && UNREADABLE_FILE_CODES.has(code);
}

/**
 * Computes SHA-256 hash of file content using streaming.
 * Memory-efficient for large files - doesn't load entire file into memory.
 * Returns null if file doesn't exist or cannot be read.
 *
 * @param filePath - Absolute path to the file
 * @returns SHA-256 hex digest or null if file is unreadable
 */
export async function computeFileHash(filePath: string): Promise<string | null> {
  // First check if file exists and is a regular file
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return null; // Not a regular file (e.g., directory, symlink)
    }
  } catch (error) {
    if (isUnreadableError(error)) {
      return null;
    }
    throw error;
  }

  // Use streaming to compute hash without loading entire file
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (error) => {
      if (isUnreadableError(error)) {
        resolve(null);
      } else {
        reject(error);
      }
    });
  });
}
