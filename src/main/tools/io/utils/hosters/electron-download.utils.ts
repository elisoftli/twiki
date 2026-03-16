/**
 * Electron net-based download utility
 *
 * Provides a way to download files using Electron's net module with a specific
 * session partition. This is useful for downloading from sites that require
 * cookies obtained during a BrowserWindow-based fetch (e.g., Cloudflare bypass).
 *
 * Usage:
 * ```ts
 * const bytesDownloaded = await downloadWithSession(
 *   'https://example.com/file.zip',
 *   '/path/to/output.zip',
 *   {
 *     sessionPartition: 'persist:my-resolver',
 *     onProgress: (progress) => console.log(`${progress.percentage}%`),
 *   }
 * );
 * ```
 */

import { net, session } from 'electron';
import { promises as fs } from 'fs';
import type { DownloadProgress, ProgressCallback } from './types';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Options for downloadWithSession
 */
export interface DownloadWithSessionOptions {
  /** Session partition name to use for the request */
  sessionPartition: string;
  /** Custom User-Agent string */
  userAgent?: string;
  /** Callback for progress updates */
  onProgress?: ProgressCallback;
  /** Custom headers to send with the request */
  headers?: Record<string, string>;
  /** Enable debug logging */
  debug?: boolean;
  /** AbortSignal for cancellation support */
  signal?: AbortSignal;
}

/**
 * Download a file using Electron's net module with a specific session.
 *
 * This is needed when downloading from sites that require cookies or other
 * session data obtained during a previous BrowserWindow-based fetch
 * (e.g., after bypassing Cloudflare).
 *
 * @param url The URL to download from
 * @param destPath The local path to save the file to
 * @param options Configuration options
 * @returns The number of bytes downloaded
 */
export async function downloadWithSession(
  url: string,
  destPath: string,
  options: DownloadWithSessionOptions
): Promise<number> {
  const {
    sessionPartition,
    userAgent = DEFAULT_USER_AGENT,
    onProgress,
    headers = {},
    debug = false,
    signal,
  } = options;

  const log = debug ? console.log.bind(console) : () => {};

  log('[ElectronDownload] Downloading:', url);
  log('[ElectronDownload] Using session:', sessionPartition);

  // Check if already aborted
  if (signal?.aborted) {
    throw new Error('Download aborted');
  }

  const sess = session.fromPartition(sessionPartition);

  return new Promise(async (resolve, reject) => {
    const fileHandle = await fs.open(destPath, 'w');
    let downloadedBytes = 0;
    let totalBytes: number | undefined;
    let aborted = false;

    const request = net.request({
      url,
      method: 'GET',
      session: sess,
    });

    // Handle abort signal
    const onAbort = () => {
      if (aborted) return;
      aborted = true;
      log('[ElectronDownload] Aborted by signal');
      request.abort();
      fileHandle.close().catch(() => {});
      reject(new Error('Download aborted'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    // Set headers
    request.setHeader('User-Agent', userAgent);
    request.setHeader('Accept', '*/*');
    request.setHeader('Accept-Language', 'en-US,en;q=0.5');

    // Apply custom headers
    for (const [key, value] of Object.entries(headers)) {
      request.setHeader(key, value);
    }

    request.on('response', (response) => {
      log('[ElectronDownload] Response status:', response.statusCode);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        signal?.removeEventListener('abort', onAbort);
        fileHandle.close();
        reject(new Error(`Download failed: ${response.statusCode} ${response.statusMessage}`));
        return;
      }

      const contentLength = response.headers['content-length'];
      if (contentLength) {
        totalBytes = parseInt(Array.isArray(contentLength) ? contentLength[0] : contentLength, 10);
        log('[ElectronDownload] Content-Length:', totalBytes);
      }

      response.on('data', async (chunk) => {
        if (aborted) return;
        try {
          await fileHandle.write(chunk);
          downloadedBytes += chunk.length;

          if (onProgress) {
            const progress: DownloadProgress = {
              downloadedBytes,
              totalBytes,
              percentage: totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : undefined,
            };
            onProgress(progress);
          }
        } catch (err) {
          reject(err);
        }
      });

      response.on('end', async () => {
        signal?.removeEventListener('abort', onAbort);
        if (aborted) return;
        await fileHandle.close();
        log('[ElectronDownload] Complete, total bytes:', downloadedBytes);
        resolve(downloadedBytes);
      });

      response.on('error', async (error) => {
        signal?.removeEventListener('abort', onAbort);
        if (aborted) return;
        await fileHandle.close();
        reject(error);
      });
    });

    request.on('error', async (error) => {
      signal?.removeEventListener('abort', onAbort);
      if (aborted) return;
      await fileHandle.close();
      reject(error);
    });

    request.end();
  });
}
