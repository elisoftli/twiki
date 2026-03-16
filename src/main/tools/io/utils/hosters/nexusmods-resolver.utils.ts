/**
 * NexusMods resolver - handles NexusMods mod page URLs
 * Supports:
 * - /gamename/mods/123 (mod page)
 * - /gamename/mods/123?tab=files&file_id=456 (specific file)
 *
 * When a Premium API key is available, resolves to a direct CDN download URL.
 * When no key or non-premium, shows the NexusMods auth dialog or falls through
 * to the DirectResolver (download browser).
 */

import type { HosterResolver, ResolvedAsset, AssetInfo } from './types';
import { NexusModsFallbackError } from './types';
import type { DownloadMetadata } from '../types';
import type { NexusModsModFile } from '../../../../interfaces/nexusmods.interface';
import { NexusModsService } from '../../../../services/nexusmods/nexusmods.service';
import { SettingsService } from '../../../../services/core/settings.service';
import {
  showNexusModsAuthDialog,
  type NexusModsAuthDialogReason,
  type NexusModsAuthDialogResult,
} from '../nexusmods-auth-dialog.utils';
import { extractInstructionsFromBBCode } from './scrapers';
import { createLogger } from '../../../../utils';

const logger = createLogger('NexusModsResolver');

/** REST v1 endpoint for direct download URL requests */
const REST_V1_ENDPOINT = 'https://api.nexusmods.com/v1';
const REQUEST_TIMEOUT = 15_000;

/** URL pattern: nexusmods.com/{domainName}/mods/{modId} */
const NEXUSMODS_MOD_PATTERN =
  /^https?:\/\/(?:www\.)?nexusmods\.com\/([^/]+)\/mods\/(\d+)/;

export class NexusModsResolver implements HosterResolver {
  readonly hosterId = 'nexusmods';
  readonly displayName = 'NexusMods';

  canHandle(url: string): boolean {
    return NEXUSMODS_MOD_PATTERN.test(url);
  }

  async resolve(
    url: string,
    getUserSelection?: (assets: AssetInfo[]) => Promise<number>
  ): Promise<ResolvedAsset> {
    const { domainName, modId, fileIdFromUrl } = this.parseUrl(url);
    const modPageUrl = `https://www.nexusmods.com/${domainName}/mods/${modId}`;

    // Obtain a valid API key (may show dialog to user)
    const apiKey = await this.obtainApiKey(modPageUrl);

    // Look up game first — needed for both file listing and mod metadata
    const game = await NexusModsService.getGameByDomain(domainName);
    if (!game) {
      throw new Error(`NexusMods game not found for domain: ${domainName}`);
    }

    // Fetch mod metadata in parallel with file resolution
    const modPromise = NexusModsService.getMod(game.id, modId).catch((err) => {
      logger.warn('Failed to fetch mod metadata:', err);
      return null;
    });

    // Determine which file to download
    let fileId: number;
    let fileName: string;
    let fileSize: number | undefined;

    if (fileIdFromUrl) {
      // URL specifies a file_id — skip file listing
      fileId = fileIdFromUrl;
      fileName = `nexusmods-${modId}-${fileId}`;
      fileSize = undefined;
    } else {
      const allFiles = await NexusModsService.getModFiles(modId, game.id);

      // Filter out removed/archived files
      const availableFiles = allFiles.filter(
        (f) => f.category !== 'REMOVED' && f.category !== 'ARCHIVED'
      );

      if (availableFiles.length === 0) {
        throw new Error(`No downloadable files found for mod ${modId}`);
      }

      const selected = await this.selectFile(availableFiles, getUserSelection);
      fileId = selected.fileId;
      fileName = selected.uri || selected.name;
      fileSize = selected.sizeInBytes ?? undefined;
    }

    // Get CDN download URL (may show dialog on auth errors)
    const cdnUrl = await this.obtainDownloadUrl(
      domainName,
      modId,
      fileId,
      apiKey,
      modPageUrl
    );

    // Wait for metadata
    const mod = await modPromise;
    const scrapedMetadata = this.buildMetadata(mod, modPageUrl);

    return {
      downloadUrl: cdnUrl,
      fileName,
      fileSize,
      metadata: {
        hosterType: 'nexusmods',
        ...(scrapedMetadata && { scrapedMetadata }),
      },
    };
  }

  /**
   * Parse a NexusMods URL into domain name, mod ID, and optional file ID.
   */
  private parseUrl(url: string): {
    domainName: string;
    modId: number;
    fileIdFromUrl: number | undefined;
  } {
    const match = url.match(NEXUSMODS_MOD_PATTERN);
    if (!match) {
      throw new Error(`Invalid NexusMods URL: ${url}`);
    }

    const domainName = match[1];
    const modId = parseInt(match[2], 10);

    // Check for file_id in query params
    let fileIdFromUrl: number | undefined;
    try {
      const urlObj = new URL(url);
      const fileIdParam = urlObj.searchParams.get('file_id');
      if (fileIdParam) {
        fileIdFromUrl = parseInt(fileIdParam, 10);
        if (isNaN(fileIdFromUrl)) fileIdFromUrl = undefined;
      }
    } catch {
      // URL parsing failed, no file_id
    }

    return { domainName, modId, fileIdFromUrl };
  }

  /**
   * Obtain a valid API key, showing the auth dialog if needed.
   * Throws NexusModsFallbackError if user wants to use browser instead.
   * Throws Error if user cancels.
   */
  private async obtainApiKey(modPageUrl: string): Promise<string> {
    const settings = SettingsService.settings;
    let apiKey = settings.integrations.nexusMods.apiKey;

    if (apiKey) {
      return apiKey;
    }

    // No API key configured
    const hideDialog = settings.integrations.nexusMods.hideDownloadDialog;
    if (hideDialog) {
      throw new NexusModsFallbackError(modPageUrl);
    }

    // Show dialog so user can add their key
    const result = await showNexusModsAuthDialog('no-key', modPageUrl);
    this.handleDialogResult(result, modPageUrl);

    // User clicked retry — re-read key from settings
    apiKey = SettingsService.settings.integrations.nexusMods.apiKey;
    if (!apiKey) {
      throw new Error('No NexusMods API key configured after dialog retry');
    }

    return apiKey;
  }

  /**
   * Get a CDN download URL for the given file.
   * Handles 401 (invalid key) and 403 (not premium) by showing the auth dialog.
   */
  private async obtainDownloadUrl(
    domainName: string,
    modId: number,
    fileId: number,
    initialApiKey: string,
    modPageUrl: string
  ): Promise<string> {
    let apiKey = initialApiKey;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const restUrl = `${REST_V1_ENDPOINT}/games/${encodeURIComponent(domainName)}/mods/${modId}/files/${fileId}/download_link.json`;

      const response = await fetch(restUrl, {
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (response.ok) {
        const downloadUrls: Array<{ URI: string; name: string }> = await response.json();
        if (downloadUrls.length === 0) {
          throw new Error('NexusMods returned no download URLs');
        }
        return downloadUrls[0].URI;
      }

      // Handle auth/premium errors with dialog
      if (response.status === 401 || response.status === 403) {
        const reason: NexusModsAuthDialogReason = response.status === 401 ? 'invalid-key' : 'not-premium';
        logger.warn(`NexusMods download failed (${response.status}): ${reason}`);

        const hideDialog = SettingsService.settings.integrations.nexusMods.hideDownloadDialog;
        if (hideDialog) {
          throw new NexusModsFallbackError(modPageUrl);
        }

        const result = await showNexusModsAuthDialog(reason, modPageUrl);
        this.handleDialogResult(result, modPageUrl);

        // User clicked retry — re-read key from settings
        const newKey = SettingsService.settings.integrations.nexusMods.apiKey;
        if (!newKey) {
          throw new Error('No NexusMods API key configured after dialog retry');
        }
        apiKey = newKey;
        continue;
      }

      throw new Error(
        `NexusMods download link request failed with status ${response.status}`
      );
    }

    throw new Error('NexusMods download failed after maximum retries');
  }

  /**
   * Handle the result from the auth dialog.
   * Throws on 'browser' (fallback) or 'close' (cancel).
   * Returns normally on 'retry'.
   */
  private handleDialogResult(result: NexusModsAuthDialogResult, modPageUrl: string): void {
    if (result.action === 'browser') {
      throw new NexusModsFallbackError(modPageUrl);
    }
    if (result.action === 'close') {
      throw new Error('NexusMods download cancelled by user');
    }
    // 'retry' — caller should re-read key and continue
  }

  /**
   * Select a file from the available files.
   * Priority: primary MAIN file → first MAIN file → user selection.
   */
  private async selectFile(
    files: NexusModsModFile[],
    getUserSelection?: (assets: AssetInfo[]) => Promise<number>
  ): Promise<NexusModsModFile> {
    // Try to find primary MAIN file
    const mainFiles = files.filter((f) => f.category === 'MAIN');
    const primaryMain = mainFiles.find((f) => f.primary === 1);
    if (primaryMain) {
      return primaryMain;
    }

    // Fallback to first MAIN file
    if (mainFiles.length === 1) {
      return mainFiles[0];
    }

    // If there are multiple MAIN files or no MAIN files, ask user
    const candidates = mainFiles.length > 0 ? mainFiles : files;

    if (candidates.length === 1) {
      return candidates[0];
    }

    if (!getUserSelection) {
      // No user selection available — pick first candidate
      return candidates[0];
    }

    const assetInfos: AssetInfo[] = candidates.map((f) => ({
      name: `${f.name} (${f.version}) [${f.category}]`,
      downloadUrl: '', // Not used directly — we get CDN URL later
      size: f.sizeInBytes ?? f.size * 1024,
    }));

    const selectedIndex = await getUserSelection(assetInfos);
    if (selectedIndex < 0 || selectedIndex >= candidates.length) {
      throw new Error(`Invalid file selection index: ${selectedIndex}`);
    }

    return candidates[selectedIndex];
  }

  /**
   * Build download metadata from mod info.
   * Extracts installation instructions from the BBCode description.
   */
  private buildMetadata(
    mod: { name?: string; description?: string } | null,
    modPageUrl: string
  ): DownloadMetadata | undefined {
    if (!mod) {
      return { sourceUrl: modPageUrl };
    }

    let instructions: string | undefined;
    if (mod.description) {
      instructions = extractInstructionsFromBBCode(mod.description) ?? undefined;
    }

    return {
      title: mod.name,
      instructions,
      sourceUrl: modPageUrl,
    };
  }
}
