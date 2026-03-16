/**
 * GitHub releases resolver - handles GitHub release page URLs
 * Supports:
 * - /releases (latest release)
 * - /releases/tag/vX.Y.Z (specific version)
 * - /releases/download/vX.Y.Z/file.zip (direct download - passthrough)
 */

import type { HosterResolver, ResolvedAsset, AssetInfo } from './types';
import type { DownloadMetadata } from '../types';
import { extractInstructionsFromMarkdown } from './scrapers/markdown-extractor.utils';

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string | null;
  html_url: string;
  assets: GitHubAsset[];
}

export class GitHubResolver implements HosterResolver {
  readonly hosterId = 'github';
  readonly displayName = 'GitHub Releases';

  // Patterns for GitHub release URLs
  private static readonly RELEASES_PATTERN =
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/?$/;
  private static readonly RELEASE_TAG_PATTERN =
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/tag\/([^/]+)\/?$/;
  private static readonly RELEASE_DOWNLOAD_PATTERN =
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/(.+)$/;

  canHandle(url: string): boolean {
    return (
      GitHubResolver.RELEASES_PATTERN.test(url) ||
      GitHubResolver.RELEASE_TAG_PATTERN.test(url) ||
      GitHubResolver.RELEASE_DOWNLOAD_PATTERN.test(url)
    );
  }

  async resolve(
    url: string,
    getUserSelection?: (assets: AssetInfo[]) => Promise<number>
  ): Promise<ResolvedAsset> {
    // If it's already a direct download URL, just return it
    const downloadMatch = url.match(GitHubResolver.RELEASE_DOWNLOAD_PATTERN);
    if (downloadMatch) {
      const [, , , , fileName] = downloadMatch;
      return {
        downloadUrl: url,
        fileName: decodeURIComponent(fileName),
      };
    }

    // Parse owner and repo from URL
    const { owner, repo, tag } = this.parseUrl(url);

    // Fetch release info from GitHub API
    const release = await this.fetchRelease(owner, repo, tag);

    if (release.assets.length === 0) {
      throw new Error(
        `No downloadable assets found for ${owner}/${repo}${tag ? ` tag ${tag}` : ' (latest release)'}`
      );
    }

    // Extract installation instructions from release body
    const scrapedMetadata = this.extractScrapedMetadata(release);

    // If single asset, use it directly
    if (release.assets.length === 1) {
      const asset = release.assets[0];
      return {
        downloadUrl: asset.browser_download_url,
        fileName: asset.name,
        fileSize: asset.size,
        contentType: asset.content_type,
        metadata: {
          releaseTag: release.tag_name,
          releaseName: release.name,
          owner,
          repo,
          ...(scrapedMetadata && { scrapedMetadata }),
        },
      };
    }

    // Multiple assets - need user selection
    if (!getUserSelection) {
      const assetNames = release.assets.map((a) => a.name).join(', ');
      throw new Error(
        `Multiple assets available (${release.assets.length}): ${assetNames}. ` +
          `User selection is required.`
      );
    }

    const assetInfos: AssetInfo[] = release.assets.map((asset) => ({
      name: asset.name,
      downloadUrl: asset.browser_download_url,
      size: asset.size,
      contentType: asset.content_type,
    }));

    const selectedIndex = await getUserSelection(assetInfos);

    if (selectedIndex < 0 || selectedIndex >= release.assets.length) {
      throw new Error(`Invalid asset selection index: ${selectedIndex}`);
    }

    const selectedAsset = release.assets[selectedIndex];
    return {
      downloadUrl: selectedAsset.browser_download_url,
      fileName: selectedAsset.name,
      fileSize: selectedAsset.size,
      contentType: selectedAsset.content_type,
      metadata: {
        releaseTag: release.tag_name,
        releaseName: release.name,
        owner,
        repo,
        ...(scrapedMetadata && { scrapedMetadata }),
      },
    };
  }

  private parseUrl(url: string): { owner: string; repo: string; tag?: string } {
    // Try specific tag pattern first
    let match = url.match(GitHubResolver.RELEASE_TAG_PATTERN);
    if (match) {
      const [, owner, repo, tag] = match;
      return { owner, repo, tag };
    }

    // Try latest releases pattern
    match = url.match(GitHubResolver.RELEASES_PATTERN);
    if (match) {
      const [, owner, repo] = match;
      return { owner, repo };
    }

    throw new Error(`Invalid GitHub releases URL format: ${url}`);
  }

  private async fetchRelease(owner: string, repo: string, tag?: string): Promise<GitHubRelease> {
    const apiUrl = tag
      ? `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`
      : `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'PCGamingWiki-GameTweaker',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Release not found: ${owner}/${repo}${tag ? ` tag ${tag}` : ' (latest)'}`
        );
      }
      if (response.status === 403) {
        throw new Error(
          `GitHub API rate limit exceeded. Try again later or use a direct download URL.`
        );
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<GitHubRelease>;
  }

  /**
   * Extract installation instructions from the release body
   */
  private extractScrapedMetadata(release: GitHubRelease): DownloadMetadata | undefined {
    if (!release.body) {
      return undefined;
    }

    const extracted = extractInstructionsFromMarkdown(release.body);
    if (!extracted?.instructions) {
      return undefined;
    }

    return {
      title: release.name || release.tag_name,
      instructions: extracted.instructions,
      sourceUrl: release.html_url,
    };
  }
}
