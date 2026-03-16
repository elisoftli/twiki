/**
 * Hoster resolver registry and main resolution function
 * Extensible pattern - add new hosters by creating a resolver class and adding to the array
 */

import type { HosterResolver, ResolvedAsset, AssetInfo } from './types';
import { NexusModsFallbackError } from './types';
import { GitHubResolver } from './github-resolver.utils';
import { ModDBResolver, MODDB_SESSION_PARTITION } from './moddb-resolver.utils';
import { MegaResolver } from './mega-resolver.utils';
import { NexusModsResolver } from './nexusmods-resolver.utils';
import { DirectResolver } from './direct-resolver.utils';
import { openDownloadBrowser, DOWNLOAD_BROWSER_SESSION_PARTITION } from './download-browser';

// Export types for external use
export type {
  HosterResolver,
  ResolvedAsset,
  AssetInfo,
  DownloadProgress,
  ProgressCallback,
} from './types';
export { NexusModsFallbackError } from './types';

// Export Electron-based utilities for bypassing Cloudflare and session-aware downloads
export {
  electronBrowserFetch,
  isCloudflareChallenge,
  type ElectronFetchResponse,
  type ElectronBrowserFetchOptions,
} from './electron-fetch.utils';

export {
  downloadWithSession,
  type DownloadWithSessionOptions,
} from './electron-download.utils';

// Export MEGA download utility for special handling
export {
  downloadFromMega,
  isMegaUrl,
  type MegaDownloadOptions,
} from './mega-download.utils';

// Export hoster-specific session partitions for reuse
export { MODDB_SESSION_PARTITION };
export { DOWNLOAD_BROWSER_SESSION_PARTITION };
export { registerDownloadBrowserIpcHandler } from './download-browser';

// Resolver instances - ORDER MATTERS!
// More specific resolvers first, DirectResolver (fallback) must be last
const resolvers: HosterResolver[] = [
  new GitHubResolver(),
  new ModDBResolver(),
  new MegaResolver(),
  new NexusModsResolver(),
  // Future hosters can be added here:
  // new GoogleDriveResolver(),
  new DirectResolver(), // Fallback - must be last
];

/**
 * Result of URL resolution including which hoster handled it
 */
export interface ResolveResult {
  resolved: ResolvedAsset;
  hosterUsed: string;
}

/**
 * Resolve a URL to a downloadable asset using the appropriate hoster
 * @param url The URL to resolve
 * @param getUserSelection Optional callback for user selection when multiple assets exist
 */
export async function resolveDownloadUrl(
  url: string,
  getUserSelection?: (assets: AssetInfo[]) => Promise<number>
): Promise<ResolveResult> {
  for (const resolver of resolvers) {
    if (resolver.canHandle(url)) {
      try {
        const resolved = await resolver.resolve(url, getUserSelection);
        return {
          resolved,
          hosterUsed: resolver.hosterId,
        };
      } catch (error) {
        if (error instanceof NexusModsFallbackError) {
          // Open the download browser directly — skip DirectResolver's HEAD request
          // (NexusMods always returns HTML) and skip the info dialog (user already
          // interacted with the NexusMods auth dialog).
          const browserUrl = error.fallbackUrl;
          const result = await openDownloadBrowser(browserUrl, {
            skipInfoDialog: true,
          });
          return {
            resolved: {
              downloadUrl: result.downloadUrl,
              fileName: result.fileName,
              fileSize: result.fileSize,
              metadata: {
                resolvedViaDownloadBrowser: true,
                sessionPartition: DOWNLOAD_BROWSER_SESSION_PARTITION,
                ...(result.metadata && { scrapedMetadata: result.metadata }),
              },
            },
            hosterUsed: 'nexusmods',
          };
        }
        throw error;
      }
    }
  }

  // Should never reach here since DirectResolver handles everything
  throw new Error(`No resolver found for URL: ${url}`);
}

/**
 * Get list of supported hosters for documentation/display
 */
export function getSupportedHosters(): Array<{ id: string; name: string }> {
  return resolvers.map((r) => ({ id: r.hosterId, name: r.displayName }));
}
