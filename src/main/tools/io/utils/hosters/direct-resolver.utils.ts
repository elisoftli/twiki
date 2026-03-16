/**
 * Direct URL resolver - handles any URL that points directly to a downloadable file
 * This is the fallback resolver that handles all URLs not matched by specific hosters
 *
 * If the HEAD request fails or returns HTML content, falls back to opening a
 * manual browser window where the user can interact with the website.
 */

import type { HosterResolver, ResolvedAsset, AssetInfo } from './types';
import { openDownloadBrowser } from './download-browser';

export class DirectResolver implements HosterResolver {
  readonly hosterId = 'direct';
  readonly displayName = 'Direct Download';

  /**
   * Direct resolver is a fallback - always returns true
   * (should be checked last in the resolver chain)
   */
  canHandle(_url: string): boolean {
    return true;
  }

  async resolve(
    url: string,
    _getUserSelection?: (assets: AssetInfo[]) => Promise<number>
  ): Promise<ResolvedAsset> {
    try {
      // Perform a HEAD request to get file info without downloading
      const response = await fetch(url, { method: 'HEAD' });

      if (!response.ok) {
        throw new Error(`Failed to access URL: ${response.status} ${response.statusText}`);
      }

      const contentDisposition = response.headers.get('content-disposition') || undefined;
      const contentLength = response.headers.get('content-length');
      const contentType = response.headers.get('content-type') || undefined;

      // Check if the response is HTML (not a direct downloadable file)
      if (contentType && contentType.includes('text/html')) {
        throw new Error('URL returns HTML, not a downloadable file');
      }

      return {
        downloadUrl: url,
        fileName: this.extractFileName(url, contentDisposition),
        fileSize: contentLength ? parseInt(contentLength, 10) : undefined,
        contentType,
      };
    } catch {
      // Fallback to download browser when auto-resolution fails
      return this.resolveWithDownloadBrowser(url);
    }
  }

  /**
   * Fallback: Open a browser window for user interaction
   * Used when HEAD request fails or returns HTML
   */
  private async resolveWithDownloadBrowser(url: string): Promise<ResolvedAsset> {
    const result = await openDownloadBrowser(url, { debug: false });

    return {
      downloadUrl: result.downloadUrl,
      fileName: result.fileName,
      fileSize: result.fileSize,
      metadata: {
        resolvedViaDownloadBrowser: true,
        sessionPartition: result.sessionPartition,
        // Include scraped metadata (title, instructions, sourceUrl) if available
        ...(result.metadata && { scrapedMetadata: result.metadata }),
      },
    };
  }

  /**
   * Extract filename from URL or Content-Disposition header
   */
  private extractFileName(url: string, contentDisposition?: string): string {
    // Try Content-Disposition header first (most reliable)
    if (contentDisposition) {
      // Handle: attachment; filename="file.zip" or filename=file.zip
      const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match?.[1]) {
        return match[1].replace(/['"]/g, '').trim();
      }
    }

    // Fall back to URL path
    try {
      const urlPath = new URL(url).pathname;
      const segments = urlPath.split('/').filter(Boolean);
      const lastSegment = segments[segments.length - 1];

      if (lastSegment) {
        // Decode URL-encoded characters
        return decodeURIComponent(lastSegment);
      }
    } catch {
      // If URL parsing fails, return a default
    }

    return 'download';
  }
}
