/**
 * Download file utility - downloads files from URLs with hoster resolution
 */

import { app } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import { extractArchive, SUPPORTED_ARCHIVE_EXTENSIONS } from './extract-archive.utils';
import {
  resolveDownloadUrl,
  downloadWithSession,
  downloadFromMega,
  isMegaUrl,
  MODDB_SESSION_PARTITION,
} from './hosters';
import type { AssetInfo, ProgressCallback } from './hosters';
import type { DownloadFileParams, DownloadFileResult, DownloadMetadata } from './types';

// Browser-like User-Agent required for some hosts (e.g., ModDB with Cloudflare)
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Extended params for internal use (includes callbacks)
 */
export interface DownloadFileOptions extends DownloadFileParams {
  /** Callback for user asset selection (for multi-asset releases) */
  getUserSelection?: (assets: AssetInfo[]) => Promise<number>;
  /** Callback for download progress updates */
  onProgress?: ProgressCallback;
  /** AbortSignal for cancellation support */
  signal?: AbortSignal;
  /** Callback called when download path is determined (for cleanup on abort) */
  onDownloadPathDetermined?: (path: string) => void;
  /** Optional hint to help auto-select when multiple files are available */
  selectionHint?: string;
}

/**
 * Generate a unique filename by appending timestamp if file already exists
 */
async function getUniqueFilePath(dir: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);
  let filePath = path.join(dir, fileName);

  try {
    await fs.access(filePath);
    // File exists, add timestamp to make unique
    const timestamp = Date.now();
    filePath = path.join(dir, `${baseName}-${timestamp}${ext}`);
  } catch {
    // File doesn't exist, use original name
  }

  return filePath;
}

/**
 * Check if a URL is a ModDB URL that needs special session handling
 */
function isModDBUrl(url: string): boolean {
  return url.includes('moddb.com');
}

/**
 * Determine if session-aware download is needed and return the partition
 * @returns Session partition string if session download needed, null otherwise
 */
function getSessionPartition(url: string, metadata?: Record<string, unknown>): string | null {
  // ModDB URLs need their session for Cloudflare cookies
  if (isModDBUrl(url)) {
    return MODDB_SESSION_PARTITION;
  }
  // URLs resolved via download browser need their session for authentication
  if (metadata?.resolvedViaDownloadBrowser && metadata?.sessionPartition) {
    return metadata.sessionPartition as string;
  }
  return null;
}

/**
 * Check if a file can be extracted based on its extension
 */
function isExtractable(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_ARCHIVE_EXTENSIONS.includes(ext);
}

/**
 * Find indices of assets whose names contain the hint (case-insensitive)
 */
function findMatchingAssets(assets: AssetInfo[], hint: string): number[] {
  const normalizedHint = hint.toLowerCase().trim();
  if (!normalizedHint) return [];

  return assets
    .map((asset, index) => ({
      index,
      matches: asset.name.toLowerCase().includes(normalizedHint),
    }))
    .filter((item) => item.matches)
    .map((item) => item.index);
}

/**
 * Download a file with progress reporting
 * Uses streaming to avoid loading entire file into memory
 */
async function downloadWithProgress(
  url: string,
  destPath: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
  metadata?: Record<string, unknown>
): Promise<number> {
  // Check if already aborted
  if (signal?.aborted) {
    throw new Error('Download aborted');
  }

  // For MEGA URLs, use megajs for decryption and streaming
  if (isMegaUrl(url)) {
    return downloadFromMega(url, destPath, {
      onProgress,
      signal,
      debug: true,
    });
  }

  // Check if session-aware download is needed (ModDB, manual browser, etc.)
  const sessionPartition = getSessionPartition(url, metadata);
  if (sessionPartition) {
    return downloadWithSession(url, destPath, {
      sessionPartition,
      userAgent: BROWSER_USER_AGENT,
      onProgress,
      debug: true,
      signal,
    });
  }

  // For other URLs, use standard fetch
  const response = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_USER_AGENT,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('content-length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : undefined;

  // Create write stream via file handle
  const fileHandle = await fs.open(destPath, 'w');

  try {
    let downloadedBytes = 0;
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error('Response body is not readable');
    }

    // Read stream chunks and write to file
    while (true) {
      // Check for abort between chunks
      if (signal?.aborted) {
        reader.cancel();
        throw new Error('Download aborted');
      }

      const { done, value } = await reader.read();

      if (done) break;

      await fileHandle.write(value);
      downloadedBytes += value.length;

      // Report progress
      if (onProgress) {
        onProgress({
          downloadedBytes,
          totalBytes,
          percentage: totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : undefined,
        });
      }
    }

    return downloadedBytes;
  } finally {
    await fileHandle.close();
  }
}

/**
 * Download a file from a URL with automatic hoster resolution
 */
export async function downloadFile(options: DownloadFileOptions): Promise<DownloadFileResult> {
  const {
    downloadUrl,
    shouldExtract,
    getUserSelection,
    onProgress,
    signal,
    onDownloadPathDetermined,
    selectionHint,
  } = options;

  // Check if already aborted
  if (signal?.aborted) {
    throw new Error('Download aborted');
  }

  // Create wrapped getUserSelection that uses hint for auto-selection
  const wrappedGetUserSelection = getUserSelection
    ? async (assets: AssetInfo[]): Promise<number> => {
        if (selectionHint) {
          const matchingIndices = findMatchingAssets(assets, selectionHint);

          if (matchingIndices.length === 1) {
            // Exactly one match - auto-select
            return matchingIndices[0];
          }

          if (matchingIndices.length > 1) {
            // Multiple matches - prompt with filtered list
            const filteredAssets = matchingIndices.map((i) => assets[i]);
            const selectedFilteredIndex = await getUserSelection(filteredAssets);
            return matchingIndices[selectedFilteredIndex];
          }

          // No matches - fall through to full list
        }

        // No hint or no matches - use original callback with full list
        return getUserSelection(assets);
      }
    : undefined;

  // Resolve the URL to a direct download link
  const { resolved, hosterUsed } = await resolveDownloadUrl(downloadUrl, wrappedGetUserSelection);

  // Check if aborted after resolution
  if (signal?.aborted) {
    throw new Error('Download aborted');
  }

  // Determine download directory (app data folder + downloads subdirectory)
  const downloadsDir = path.join(app.getPath('userData'), 'downloads');
  await fs.mkdir(downloadsDir, { recursive: true });

  // Determine unique filename
  const downloadPath = await getUniqueFilePath(downloadsDir, resolved.fileName);

  // Notify caller of the download path (for cleanup on abort)
  if (onDownloadPathDetermined) {
    onDownloadPathDetermined(downloadPath);
  }

  // Download the file with progress reporting
  const fileSize = await downloadWithProgress(
    resolved.downloadUrl,
    downloadPath,
    onProgress,
    signal,
    resolved.metadata
  );

  // Extract if requested and file is an extractable archive
  let extractPath: string | undefined;
  let extractedFiles: string[] | undefined;
  if (shouldExtract && isExtractable(downloadPath)) {
    try {
      const extractResult = await extractArchive({
        archivePath: downloadPath,
      });
      extractPath = extractResult.extractPath;
      extractedFiles = extractResult.extractedFiles;
    } catch (extractError) {
      // If extraction fails, keep the downloaded file but report the error
      const errorMsg = extractError instanceof Error ? extractError.message : String(extractError);
      throw new Error(
        `File downloaded successfully to ${downloadPath}, but extraction failed: ${errorMsg}`
      );
    }
  }

  // Extract scraped metadata from resolver metadata (e.g., NexusMods installation instructions)
  const scrapedMetadata = resolved.metadata?.scrapedMetadata as DownloadMetadata | undefined;

  return {
    downloadPath,
    extractPath,
    extractedFiles,
    originalUrl: downloadUrl,
    resolvedUrl: resolved.downloadUrl,
    hosterUsed,
    fileSize,
    metadata: scrapedMetadata,
  };
}
