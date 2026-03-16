/**
 * Create archive utility - creates archive files from directories
 */

import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { createBackup } from '../../tool.utils';
import { expandWindowsEnvVars, createLogger } from '../../../utils';
import type { CreateArchiveParams, CreateArchiveResult } from './types';

const logger = createLogger('CreateArchive');

export async function createArchive(params: CreateArchiveParams): Promise<CreateArchiveResult> {
  const { sourcePath, archivePath, cleanupSource = true } = params;

  const expandedSourcePath = expandWindowsEnvVars(sourcePath);
  const expandedArchivePath = expandWindowsEnvVars(archivePath);

  // Check if source directory exists
  try {
    const stat = await fs.stat(expandedSourcePath);
    if (!stat.isDirectory()) {
      throw new Error(`Source path is not a directory: ${expandedSourcePath}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('not a directory')) {
      throw error;
    }
    throw new Error(`Source directory not found: ${expandedSourcePath}`);
  }

  // Create backup of existing archive if it exists
  const backupPath = await createBackup(expandedArchivePath);

  // Create archive
  const zip = new AdmZip();

  // Add all files from source directory
  async function addFilesToZip(dirPath: string, zipPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = zipPath ? path.join(zipPath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        await addFilesToZip(fullPath, relativePath);
      } else if (entry.isFile()) {
        const content = await fs.readFile(fullPath);
        zip.addFile(relativePath, content);
      }
    }
  }

  await addFilesToZip(expandedSourcePath, '');
  zip.writeZip(expandedArchivePath);

  // Cleanup source directory if requested
  let sourceCleanedUp = false;
  if (cleanupSource) {
    try {
      await fs.rm(expandedSourcePath, { recursive: true, force: true });
      sourceCleanedUp = true;
    } catch (cleanupError) {
      logger.warn(`Failed to cleanup source directory: ${cleanupError}`);
    }
  }

  return {
    path: expandedArchivePath,
    backupPath,
    sourceCleanedUp,
  };
}
