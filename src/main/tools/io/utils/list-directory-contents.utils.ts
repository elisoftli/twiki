/**
 * List directory contents utility - lists files and directories recursively
 */

import { promises as fs } from 'fs';
import path from 'path';
import { expandWindowsEnvVars, createLogger } from '../../../utils';
import type { ListDirectoryContentsParams, ListDirectoryContentsResult } from './types';

const logger = createLogger('ListDirectory');

export async function listDirectoryContents(params: ListDirectoryContentsParams): Promise<ListDirectoryContentsResult> {
  const { path: dirPath, depth = 5, fileNameSearch, maxFilesPerDirectory = 25 } = params;

  const expandedPath = expandWindowsEnvVars(dirPath);
  const files: string[] = [];
  let totalDirectories = 0;
  let truncated = false;
  const fileNameSearchLower = fileNameSearch?.toLowerCase();

  async function traverse(currentPath: string, currentDepth: number, basePath: string): Promise<void> {
    if (currentDepth > depth) {
      return;
    }

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      // Separate directories and files
      const directories = entries.filter((e) => e.isDirectory());
      const regularFiles = entries.filter((e) => e.isFile());

      // Add all directories (they don't count toward the file limit)
      for (const entry of directories) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);
        files.push(relativePath + '\\');
        totalDirectories++;
        await traverse(fullPath, currentDepth + 1, basePath);
      }

      // Filter files first if search is provided, then apply limit
      let filesToProcess = regularFiles;

      // Apply search filter to files before limiting
      if (fileNameSearchLower) {
        filesToProcess = regularFiles.filter((entry) =>
          entry.name.toLowerCase().includes(fileNameSearchLower)
        );
      }

      // Add files up to the limit per directory
      const filesToAdd = filesToProcess.slice(0, maxFilesPerDirectory);
      if (filesToProcess.length > maxFilesPerDirectory) {
        truncated = true;
      }

      for (const entry of filesToAdd) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);
        files.push(relativePath);
      }
    } catch (error) {
      logger.debug(`Skipping directory ${currentPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await traverse(expandedPath, 0, expandedPath);

  // Count files vs directories (directories end with '\')
  const totalDirs = files.filter((file) => file.endsWith('\\')).length;
  const totalFiles = files.length - totalDirs;

  // Sort results
  files.sort();

  return {
    path: expandedPath,
    files: files,
    totalFiles: totalFiles,
    totalDirectories: totalDirs,
    truncated,
  };
}
