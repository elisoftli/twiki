/**
 * Extract archive utility - extracts archive files to a directory
 * Supports: ZIP, RAR, 7z formats
 * Tracks individual file extractions and creates backups of overwritten files
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { createExtractorFromFile } from 'node-unrar-js';
import { list as list7z, unpack as unpack7z, type ListItem } from '../../../utils/7zip.utils';
import { expandWindowsEnvVars } from '../../../utils';
import { createBackup } from '../../tool.utils';
import type {
  ExtractArchiveParams,
  ExtractArchiveResult,
  FileTransferRecord,
  DirectoryCreatedRecord,
} from './types';

/**
 * Supported archive extensions
 */
export const SUPPORTED_ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z'];

/**
 * Result of extraction with tracking
 */
interface ExtractionTrackingResult {
  extractedFiles: string[];
  fileTransfers: FileTransferRecord[];
  directoriesCreated: DirectoryCreatedRecord[];
}

/**
 * Check if a path exists
 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, tracking newly created directories
 */
async function ensureDirectoryExists(
  dirPath: string,
  directoriesCreated: DirectoryCreatedRecord[]
): Promise<void> {
  const parts = dirPath.split(path.sep);
  let currentPath = '';

  for (const part of parts) {
    currentPath = currentPath ? path.join(currentPath, part) : part;
    // On Windows, handle drive letter (e.g., "C:")
    if (currentPath.endsWith(':')) {
      currentPath += path.sep;
      continue;
    }

    if (!(await pathExists(currentPath))) {
      await fs.mkdir(currentPath, { recursive: false }).catch(() => {
        // Directory may have been created by another process
      });
      // Only track if we actually created it
      if (await pathExists(currentPath)) {
        // Check if already tracked
        if (!directoriesCreated.some((d) => d.path === currentPath)) {
          directoriesCreated.push({ path: currentPath });
        }
      }
    }
  }
}

/**
 * Prepare destination for extraction - backup if exists, ensure parent dir
 * @returns backupPath if file was backed up, undefined otherwise
 */
async function prepareDestination(
  destPath: string,
  directoriesCreated: DirectoryCreatedRecord[]
): Promise<{ wasOverwrite: boolean; backupPath?: string }> {
  const parentDir = path.dirname(destPath);

  // Ensure parent directory exists
  await ensureDirectoryExists(parentDir, directoriesCreated);

  // Check if destination file exists
  const exists = await pathExists(destPath);

  if (exists) {
    // Create backup of existing file
    const backupPath = await createBackup(destPath);
    return { wasOverwrite: true, backupPath };
  }

  return { wasOverwrite: false };
}

/**
 * Detect archive type from file extension
 */
function getArchiveType(filePath: string): 'zip' | 'rar' | '7z' | null {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.zip':
      return 'zip';
    case '.rar':
      return 'rar';
    case '.7z':
      return '7z';
    default:
      return 'zip';
  }
}

/**
 * Extract a ZIP archive with tracking
 */
async function extractZipWithTracking(
  archivePath: string,
  extractPath: string
): Promise<ExtractionTrackingResult> {
  const zip = new AdmZip(archivePath);
  const entries = zip.getEntries();

  const extractedFiles: string[] = [];
  const fileTransfers: FileTransferRecord[] = [];
  const directoriesCreated: DirectoryCreatedRecord[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) {
      // Track directory creation
      const dirPath = path.join(extractPath, entry.entryName);
      await ensureDirectoryExists(dirPath, directoriesCreated);
      continue;
    }

    const destPath = path.join(extractPath, entry.entryName);

    // Prepare destination (backup if exists, ensure parent dir)
    const { wasOverwrite, backupPath } = await prepareDestination(destPath, directoriesCreated);

    // Extract the single entry
    zip.extractEntryTo(entry, extractPath, true, true);

    extractedFiles.push(destPath);
    fileTransfers.push({
      sourcePath: entry.entryName,
      destinationPath: destPath,
      wasOverwrite,
      backupPath,
    });
  }

  return { extractedFiles, fileTransfers, directoriesCreated };
}

/**
 * Extract a RAR archive with tracking
 * Uses two-pass approach: first scan for backups, then extract
 */
async function extractRarWithTracking(
  archivePath: string,
  extractPath: string
): Promise<ExtractionTrackingResult> {
  const extractedFiles: string[] = [];
  const fileTransfers: FileTransferRecord[] = [];
  const directoriesCreated: DirectoryCreatedRecord[] = [];
  const backupMap = new Map<string, { wasOverwrite: boolean; backupPath?: string }>();

  // First pass: get file list and prepare destinations (backup existing files)
  const extractor1 = await createExtractorFromFile({
    filepath: archivePath,
    targetPath: extractPath,
  });
  const list = extractor1.getFileList();
  const fileHeaders = [...list.fileHeaders];

  for (const fileHeader of fileHeaders) {
    if (fileHeader.flags.directory) {
      const dirPath = path.join(extractPath, fileHeader.name);
      await ensureDirectoryExists(dirPath, directoriesCreated);
      continue;
    }

    const destPath = path.join(extractPath, fileHeader.name);
    const prepResult = await prepareDestination(destPath, directoriesCreated);
    backupMap.set(fileHeader.name, prepResult);
  }

  // Second pass: extract all files
  const extractor2 = await createExtractorFromFile({
    filepath: archivePath,
    targetPath: extractPath,
  });
  const extracted = extractor2.extract();
  const files = [...extracted.files];

  // Collect results
  for (const file of files) {
    const fileHeader = file.fileHeader;
    if (fileHeader.flags.directory) continue;

    const destPath = path.join(extractPath, fileHeader.name);
    const prepResult = backupMap.get(fileHeader.name) || { wasOverwrite: false };

    extractedFiles.push(destPath);
    fileTransfers.push({
      sourcePath: fileHeader.name,
      destinationPath: destPath,
      wasOverwrite: prepResult.wasOverwrite,
      backupPath: prepResult.backupPath,
    });
  }

  return { extractedFiles, fileTransfers, directoriesCreated };
}

/**
 * Get list of files in a 7z archive
 */
async function list7zContents(archivePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    list7z(archivePath, (err: Error | null, result?: ListItem[]) => {
      if (err) {
        reject(err);
        return;
      }
      if (!result) {
        resolve([]);
        return;
      }
      // Filter out directories (attr contains 'D')
      const files = result.filter((item) => !item.attr?.includes('D')).map((item) => item.name);
      resolve(files);
    });
  });
}

/**
 * Extract a 7z archive with tracking
 */
async function extract7zWithTracking(
  archivePath: string,
  extractPath: string
): Promise<ExtractionTrackingResult> {
  const extractedFiles: string[] = [];
  const fileTransfers: FileTransferRecord[] = [];
  const directoriesCreated: DirectoryCreatedRecord[] = [];

  // Get list of files in the archive
  let archiveContents: string[];
  try {
    archiveContents = await list7zContents(archivePath);
  } catch {
    // Fallback: extract first, then scan (won't have proper backup support)
    archiveContents = [];
  }

  // Prepare destinations (backup existing files) before extraction
  const backupMap = new Map<string, { wasOverwrite: boolean; backupPath?: string }>();

  for (const entryName of archiveContents) {
    const destPath = path.join(extractPath, entryName);
    const prepResult = await prepareDestination(destPath, directoriesCreated);
    backupMap.set(entryName, prepResult);
  }

  // Extract the archive
  await new Promise<void>((resolve, reject) => {
    unpack7z(archivePath, extractPath, (err: Error | null) => {
      if (err) {
        reject(new Error(`Failed to extract 7z archive: ${err.message}`));
        return;
      }
      resolve();
    });
  });

  // Scan extracted files and build tracking info
  const scannedFiles = await scanDirectory(extractPath);

  for (const destPath of scannedFiles) {
    const relativePath = path.relative(extractPath, destPath);
    const prepResult = backupMap.get(relativePath) || { wasOverwrite: false };

    extractedFiles.push(destPath);
    fileTransfers.push({
      sourcePath: relativePath,
      destinationPath: destPath,
      wasOverwrite: prepResult.wasOverwrite,
      backupPath: prepResult.backupPath,
    });
  }

  return { extractedFiles, fileTransfers, directoriesCreated };
}

/**
 * Recursively scan a directory and return all file paths
 */
async function scanDirectory(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  await scan(dirPath);
  return files;
}

export async function extractArchive(params: ExtractArchiveParams): Promise<ExtractArchiveResult> {
  const { archivePath, extractPath: customExtractPath } = params;

  const expandedArchivePath = expandWindowsEnvVars(archivePath);

  // Check if archive exists
  try {
    await fs.access(expandedArchivePath);
  } catch {
    throw new Error(`Archive file not found: ${expandedArchivePath}`);
  }

  // Detect archive type
  const archiveType = getArchiveType(expandedArchivePath);
  if (!archiveType) {
    const ext = path.extname(expandedArchivePath);
    throw new Error(
      `Unsupported archive format: ${ext}. Supported formats: ${SUPPORTED_ARCHIVE_EXTENSIONS.join(', ')}`
    );
  }

  // Determine extraction path
  const extractPath = customExtractPath
    ? expandWindowsEnvVars(customExtractPath)
    : `${expandedArchivePath}_extracted`;

  // Create extraction directory (track if newly created)
  const directoriesCreated: DirectoryCreatedRecord[] = [];
  if (!(await pathExists(extractPath))) {
    await fs.mkdir(extractPath, { recursive: true });
    directoriesCreated.push({ path: extractPath });
  }

  // Extract based on archive type with tracking
  let result: ExtractionTrackingResult;

  switch (archiveType) {
    case 'zip':
      result = await extractZipWithTracking(expandedArchivePath, extractPath);
      break;
    case 'rar':
      result = await extractRarWithTracking(expandedArchivePath, extractPath);
      break;
    case '7z':
      result = await extract7zWithTracking(expandedArchivePath, extractPath);
      break;
  }

  // Merge directoriesCreated from initial creation with those from extraction
  const allDirectoriesCreated = [...directoriesCreated, ...result.directoriesCreated];

  return {
    path: expandedArchivePath,
    extractPath,
    extractedFiles: result.extractedFiles,
    fileTransfers: result.fileTransfers,
    directoriesCreated: allDirectoriesCreated,
  };
}
