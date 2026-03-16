/**
 * MEGA download utility
 *
 * Provides streaming download for MEGA files using the megajs library.
 * MEGA files are encrypted and cannot be downloaded via standard HTTP -
 * they require the megajs library to handle decryption.
 *
 * Usage:
 * ```ts
 * const bytesDownloaded = await downloadFromMega(
 *   'https://mega.nz/file/abc123#key',
 *   '/path/to/output.zip',
 *   {
 *     onProgress: (progress) => console.log(`${progress.percentage}%`),
 *   }
 * );
 * ```
 */

import { File as MegaFile } from 'megajs';
import { createWriteStream } from 'fs';
import type { ProgressCallback, DownloadProgress } from './types';

/**
 * Options for downloadFromMega
 */
export interface MegaDownloadOptions {
  /** Callback for progress updates */
  onProgress?: ProgressCallback;
  /** AbortSignal for cancellation support */
  signal?: AbortSignal;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Check if a URL is a MEGA URL that requires special download handling
 */
export function isMegaUrl(url: string): boolean {
  return url.startsWith('https://mega.nz/') || url.startsWith('mega-folder-file://');
}

/**
 * Download a file from MEGA using the megajs library.
 *
 * @param url The MEGA URL to download from (direct file or folder-file marker)
 * @param destPath The local path to save the file to
 * @param options Configuration options
 * @returns The number of bytes downloaded
 */
export async function downloadFromMega(
  url: string,
  destPath: string,
  options: MegaDownloadOptions = {}
): Promise<number> {
  const { onProgress, signal, debug = false } = options;

  const log = debug ? console.log.bind(console) : () => {};

  log('[MegaDownload] Starting download:', url);
  log('[MegaDownload] Destination:', destPath);

  // Check if already aborted
  if (signal?.aborted) {
    throw new Error('Download aborted');
  }

  let file: MegaFile;
  let fileSize: number | undefined;

  // Handle folder-file marker URLs
  if (url.startsWith('mega-folder-file://')) {
    const result = await loadFileFromFolderUrl(url);
    file = result.file;
    fileSize = result.size;
    log('[MegaDownload] Loaded file from folder:', result.name);
  } else {
    // Direct file URL
    file = MegaFile.fromURL(url);
    await file.loadAttributes();
    const attrs = file as unknown as { name: string; size: number };
    fileSize = attrs.size;
    log('[MegaDownload] File attributes loaded:', attrs.name, 'Size:', fileSize);
  }

  // Start the download stream
  const downloadStream = file.download({});
  const writeStream = createWriteStream(destPath);

  let downloadedBytes = 0;
  let aborted = false;

  // Handle abort signal
  const onAbort = () => {
    if (aborted) return;
    aborted = true;
    log('[MegaDownload] Aborted by signal');
    downloadStream.destroy(new Error('Download aborted'));
    writeStream.close();
  };

  if (signal) {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  return new Promise((resolve, reject) => {
    downloadStream.on('data', (chunk: Buffer) => {
      if (aborted) return;

      downloadedBytes += chunk.length;

      if (onProgress) {
        const progress: DownloadProgress = {
          downloadedBytes,
          totalBytes: fileSize,
          percentage: fileSize ? Math.round((downloadedBytes / fileSize) * 100) : undefined,
        };
        onProgress(progress);
      }
    });

    downloadStream.on('error', (error: Error) => {
      signal?.removeEventListener('abort', onAbort);
      if (aborted) return;
      writeStream.close();
      reject(new Error(`MEGA download failed: ${error.message}`));
    });

    writeStream.on('error', (error: Error) => {
      signal?.removeEventListener('abort', onAbort);
      if (aborted) return;
      downloadStream.destroy();
      reject(new Error(`Failed to write file: ${error.message}`));
    });

    writeStream.on('finish', () => {
      signal?.removeEventListener('abort', onAbort);
      if (aborted) {
        reject(new Error('Download aborted'));
        return;
      }
      log('[MegaDownload] Complete, total bytes:', downloadedBytes);
      resolve(downloadedBytes);
    });

    // Pipe the download to the file
    downloadStream.pipe(writeStream);
  });
}

/**
 * Parse a mega-folder-file:// URL and load the file from the folder
 */
async function loadFileFromFolderUrl(
  markerUrl: string
): Promise<{ file: MegaFile; name: string; size: number }> {
  // Parse: mega-folder-file://{folderUrl}?file={fileId} or ?name={fileName}
  const url = new URL(markerUrl);
  const folderUrl = url.pathname.replace('//', '');
  const fileId = url.searchParams.get('file');
  const fileName = url.searchParams.get('name');

  if (!folderUrl) {
    throw new Error('Invalid mega-folder-file URL: missing folder URL');
  }

  // Load the folder
  const folder = MegaFile.fromURL(folderUrl);
  await folder.loadAttributes();

  const children = (folder as unknown as { children?: MegaFile[] }).children || [];

  // Find the target file
  let targetFile: MegaFile | undefined;

  if (fileId) {
    // Find by file ID
    targetFile = children.find((child) => {
      const childWithId = child as unknown as { downloadId?: string[] };
      return childWithId.downloadId?.[0] === fileId;
    });
  } else if (fileName) {
    // Find by name
    const decodedName = decodeURIComponent(fileName);
    targetFile = children.find((child) => {
      const attrs = child as unknown as { name: string };
      return attrs.name === decodedName;
    });
  }

  if (!targetFile) {
    throw new Error(
      `File not found in MEGA folder: ${fileId || fileName}`
    );
  }

  const attrs = targetFile as unknown as { name: string; size: number };

  return {
    file: targetFile,
    name: attrs.name,
    size: attrs.size,
  };
}
