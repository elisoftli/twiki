/**
 * Types for URL hoster resolution
 * Extensible pattern for supporting different download sources (GitHub, Nexus Mods, etc.)
 */

/**
 * Result of resolving a URL to a downloadable asset
 */
export interface ResolvedAsset {
  /** Direct download URL */
  downloadUrl: string;
  /** Suggested filename for the downloaded file */
  fileName: string;
  /** File size in bytes (if known) */
  fileSize?: number;
  /** Content type (if known) */
  contentType?: string;
  /** Additional metadata from the hoster */
  metadata?: Record<string, unknown>;
}

/**
 * Information about a downloadable asset (used for user selection)
 */
export interface AssetInfo {
  /** Display name for the asset */
  name: string;
  /** Direct download URL */
  downloadUrl: string;
  /** File size in bytes */
  size?: number;
  /** Content type */
  contentType?: string;
}

/**
 * Interface that all hoster resolvers must implement
 */
export interface HosterResolver {
  /** Unique identifier for this hoster */
  readonly hosterId: string;
  /** Human-readable name */
  readonly displayName: string;

  /**
   * Check if this resolver can handle the given URL
   */
  canHandle(url: string): boolean;

  /**
   * Resolve the URL to a downloadable asset
   * @param url The URL to resolve
   * @param getUserSelection Callback for user selection when multiple assets exist
   */
  resolve(
    url: string,
    getUserSelection?: (assets: AssetInfo[]) => Promise<number>
  ): Promise<ResolvedAsset>;
}

/**
 * Progress information for download operations
 */
export interface DownloadProgress {
  /** Bytes downloaded so far */
  downloadedBytes: number;
  /** Total bytes (if known from Content-Length header) */
  totalBytes?: number;
  /** Progress percentage (0-100) */
  percentage?: number;
}

/**
 * Callback type for progress updates
 */
export type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * Error thrown by NexusModsResolver when it wants to fall through to the download browser.
 * This happens when hideDownloadDialog is true and no API key / not premium,
 * or when the user clicks "Open in Browser" in the auth dialog.
 */
export class NexusModsFallbackError extends Error {
  /** URL to open in the download browser (mod details page for instruction scraping) */
  readonly fallbackUrl: string;

  constructor(fallbackUrl: string) {
    super('NexusMods resolver requests fallback to download browser');
    this.name = 'NexusModsFallbackError';
    this.fallbackUrl = fallbackUrl;
  }
}
