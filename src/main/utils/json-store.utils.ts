import { promises as fs } from 'fs';
import { dirname } from 'path';

/** Check if a path exists (async) */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures a directory exists, creating it recursively if needed.
 * @param dirPath - The directory path to ensure exists
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  if (!(await pathExists(dirPath))) {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Ensures the parent directory of a file exists.
 * @param filePath - The file path whose parent directory should exist
 */
export async function ensureParentDirectoryExists(filePath: string): Promise<void> {
  await ensureDirectoryExists(dirname(filePath));
}

/**
 * Writes JSON data to a file atomically.
 * First writes to a temp file, then renames to the target path.
 * This prevents corruption if the process is interrupted during write.
 *
 * @param filePath - The target file path
 * @param data - The data to serialize and write
 * @param indent - Number of spaces for JSON indentation (default: 2)
 */
export async function atomicWriteJson(filePath: string, data: unknown, indent: number = 2): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, indent), 'utf-8');
  await fs.rename(tempPath, filePath);
}
