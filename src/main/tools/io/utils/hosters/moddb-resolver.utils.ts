/**
 * ModDB resolver - handles ModDB download page URLs
 * Supports:
 * - /mods/{mod}/downloads/{file} (mod downloads)
 * - /games/{game}/downloads/{file} (game downloads)
 * - /addons/{addon}/downloads/{file} (addon downloads)
 * - /downloads/{id} (direct download page)
 * - /downloads/mirror/{id}/{server}/{hash} (direct mirror - passthrough)
 *
 * Note: ModDB uses Cloudflare protection which requires JavaScript execution.
 * When running in Electron, we use a hidden BrowserWindow to load pages and
 * bypass Cloudflare's challenge.
 */

import * as cheerio from 'cheerio';
import type { HosterResolver, ResolvedAsset, AssetInfo } from './types';
import { electronBrowserFetch, type ElectronFetchResponse } from './electron-fetch.utils';

const BASE_URL = 'https://www.moddb.com';

/** Session partition used for ModDB requests - exported for use by download utility */
export const MODDB_SESSION_PARTITION = 'persist:moddb-resolver';

/**
 * ModDB-specific content ready check
 * Returns true when the page has the expected download elements
 */
function moddbContentReadyCheck(html: string): boolean {
  return (
    html.includes('/downloads/start/') ||
    html.includes('/downloads/mirror/') ||
    html.includes('class="button"')
  );
}

/**
 * Fetch a ModDB URL using the electron browser fetch utility
 */
async function fetchModDBPage(url: string): Promise<ElectronFetchResponse> {
  return electronBrowserFetch(url, {
    sessionPartition: MODDB_SESSION_PARTITION,
    contentReadyCheck: moddbContentReadyCheck,
    debug: false,
  });
}

export class ModDBResolver implements HosterResolver {
  readonly hosterId = 'moddb';
  readonly displayName = 'ModDB';

  // Patterns for ModDB URLs
  // Matches: /mods/x/downloads/y, /games/x/downloads/y, /addons/x/downloads/y
  private static readonly DOWNLOADS_PAGE_PATTERN =
    /^https?:\/\/(?:www\.)?moddb\.com\/(?:mods|games|addons)\/[^/]+\/downloads\/[^/]+\/?$/;

  // Matches: /downloads/{numeric_id}
  private static readonly DIRECT_DOWNLOAD_PATTERN =
    /^https?:\/\/(?:www\.)?moddb\.com\/downloads\/(\d+)\/?$/;

  // Matches: /downloads/mirror/{id}/{server}/{hash}
  private static readonly MIRROR_PATTERN =
    /^https?:\/\/(?:www\.)?moddb\.com\/downloads\/mirror\/\d+\/\d+\/[^/]+$/;

  canHandle(url: string): boolean {
    return (
      ModDBResolver.DOWNLOADS_PAGE_PATTERN.test(url) ||
      ModDBResolver.DIRECT_DOWNLOAD_PATTERN.test(url) ||
      ModDBResolver.MIRROR_PATTERN.test(url)
    );
  }

  async resolve(
    url: string,
    _getUserSelection?: (assets: AssetInfo[]) => Promise<number>
  ): Promise<ResolvedAsset> {
    // If it's already a direct mirror URL, just return it
    if (ModDBResolver.MIRROR_PATTERN.test(url)) {
      const fileName = this.extractFileNameFromMirrorUrl(url);
      return {
        downloadUrl: url,
        fileName,
      };
    }

    // For download page URLs, we need to scrape to get the file info
    const { fileId, fileName: fallbackFileName } = await this.fetchDownloadPageInfo(url);

    // Now fetch the /downloads/start/{id} page to get the actual download link and filename
    const { downloadUrl, fileName } = await this.getDownloadLink(fileId, fallbackFileName);

    return {
      downloadUrl,
      fileName,
      metadata: {
        fileId,
        sourceUrl: url,
      },
    };
  }

  /**
   * Extract filename from a mirror URL
   * Mirror URLs end with the filename or a hash, try to get something useful
   */
  private extractFileNameFromMirrorUrl(url: string): string {
    try {
      const urlPath = new URL(url).pathname;
      const segments = urlPath.split('/').filter(Boolean);
      const lastSegment = segments[segments.length - 1];
      if (lastSegment) {
        return decodeURIComponent(lastSegment);
      }
    } catch {
      // Fall through to default
    }
    return 'moddb-download';
  }

  /**
   * Fetch the download page and extract file ID and filename
   */
  private async fetchDownloadPageInfo(
    url: string
  ): Promise<{ fileId: string; fileName: string }> {
    const response = await fetchModDBPage(url);

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('ModDB blocked the request. Please try again later.');
      }
      if (response.status === 404) {
        throw new Error(`ModDB file not found: ${url}`);
      }
      throw new Error(`ModDB request failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Look for the download start link which contains the file ID
    // It's typically in a link like: href="/downloads/start/123456"
    const startLink = $('a[href*="/downloads/start/"]').attr('href');

    if (!startLink) {
      throw new Error('Could not find download link on ModDB page. The page structure may have changed.');
    }

    const idMatch = startLink.match(/\/downloads\/start\/(\d+)/);
    if (!idMatch) {
      throw new Error('Could not extract file ID from ModDB page.');
    }
    const fileId = idMatch[1];

    // Try to get the filename from the page
    // Usually in the title or a heading
    let fileName = 'moddb-download';

    // Try the page title first (format: "Filename - Mod DB" or similar)
    const title = $('title').text();
    if (title) {
      // Extract just the filename part before " - "
      const titleMatch = title.match(/^(.+?)\s+-\s+/);
      if (titleMatch) {
        fileName = titleMatch[1].trim();
      }
    }

    // Try to find a more specific filename from the file info section
    const fileNameFromMeta = $('meta[property="og:title"]').attr('content');
    if (fileNameFromMeta) {
      fileName = fileNameFromMeta.trim();
    }

    // Look for filename in the download button or file info
    const downloadBtn = $('a[href*="/downloads/start/"]').text().trim();
    if (downloadBtn && downloadBtn.toLowerCase() !== 'download now') {
      // Some pages have the actual filename in the button
      const btnMatch = downloadBtn.match(/download\s+(.+)/i);
      if (btnMatch) {
        fileName = btnMatch[1].trim();
      }
    }

    return { fileId, fileName };
  }

  /**
   * Get the actual download URL and filename from the /downloads/start/{id} page
   */
  private async getDownloadLink(
    fileId: string,
    _fallbackFileName: string
  ): Promise<{ downloadUrl: string; fileName: string }> {
    const startUrl = `${BASE_URL}/downloads/start/${fileId}`;
    const response = await fetchModDBPage(startUrl);

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('ModDB blocked the request. Please try again later.');
      }
      if (response.status === 404) {
        throw new Error(`ModDB download not found for file ID: ${fileId}`);
      }
      throw new Error(`ModDB start page request failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // The start page has a link like: <a href="/downloads/mirror/...">download filename.ext</a>
    // We need to find the mirror link and extract both the URL and the actual filename
    let downloadUrl: string | undefined;
    let fileName: string | undefined;

    // Look for the mirror download link - this is the most reliable pattern
    // Format: <a href="/downloads/mirror/290164/131/hash">download A_GUI_Mod_Installer.rar</a>
    const mirrorLink = $('a[href*="/downloads/mirror/"]').first();

    if (mirrorLink.length) {
      downloadUrl = mirrorLink.attr('href');
      const linkText = mirrorLink.text().trim();

      // Extract filename from "download filename.ext" pattern
      const fileNameMatch = linkText.match(/download\s+(.+)/i);
      if (fileNameMatch) {
        fileName = fileNameMatch[1].trim();
      }
    }

    // Fallback: try the auto-redirect script which has the full URL
    // Format: window.location.href="https://www.moddb.com/downloads/mirror/...";
    if (!downloadUrl) {
      const scriptMatch = html.match(
        /window\.location\.href\s*=\s*["']([^"']*\/downloads\/mirror\/[^"']*)["']/
      );
      if (scriptMatch) {
        downloadUrl = scriptMatch[1];
      }
    }

    if (!downloadUrl) {
      throw new Error(
        'Could not find download link on ModDB start page. The page structure may have changed.'
      );
    }

    // Ensure we have an absolute URL
    if (downloadUrl.startsWith('/')) {
      downloadUrl = `${BASE_URL}${downloadUrl}`;
    }

    // If we didn't get a filename from the link text, use the fallback
    if (!fileName) {
      fileName = _fallbackFileName;
    }

    return { downloadUrl, fileName };
  }
}
