/**
 * MEGA resolver - handles mega.nz download URLs
 * Supports:
 * - /file/{fileId}#{key} (new file format)
 * - /folder/{folderId}#{key} (new folder format)
 * - /#!{fileId}!{key} (legacy file format)
 * - /#F!{folderId}!{key} (legacy folder format)
 *
 * Note: MEGA files are encrypted and require the megajs library for decryption.
 * The resolver returns the original MEGA URL as the downloadUrl, which must be
 * handled specially by the download utility using megajs streaming.
 */

import { File as MegaFile } from 'megajs';
import type { HosterResolver, ResolvedAsset, AssetInfo } from './types';

interface MegaFileAttributes {
  name: string;
  size: number;
}

export class MegaResolver implements HosterResolver {
  readonly hosterId = 'mega';
  readonly displayName = 'MEGA';

  // Patterns for MEGA URLs
  // New format: mega.nz/file/{id}#{key} or mega.nz/folder/{id}#{key}
  private static readonly NEW_FILE_PATTERN =
    /^https?:\/\/mega\.nz\/file\/([^#]+)#(.+)$/;
  private static readonly NEW_FOLDER_PATTERN =
    /^https?:\/\/mega\.nz\/folder\/([^#]+)#(.+)$/;

  // Legacy format: mega.nz/#!{id}!{key} (file) or mega.nz/#F!{id}!{key} (folder)
  private static readonly LEGACY_FILE_PATTERN =
    /^https?:\/\/mega\.nz\/#!([^!]+)!(.+)$/;
  private static readonly LEGACY_FOLDER_PATTERN =
    /^https?:\/\/mega\.nz\/#F!([^!]+)!(.+)$/;

  canHandle(url: string): boolean {
    return (
      MegaResolver.NEW_FILE_PATTERN.test(url) ||
      MegaResolver.NEW_FOLDER_PATTERN.test(url) ||
      MegaResolver.LEGACY_FILE_PATTERN.test(url) ||
      MegaResolver.LEGACY_FOLDER_PATTERN.test(url)
    );
  }

  async resolve(
    url: string,
    getUserSelection?: (assets: AssetInfo[]) => Promise<number>
  ): Promise<ResolvedAsset> {
    const isFolder = this.isFolderUrl(url);

    if (isFolder) {
      return this.resolveFolder(url, getUserSelection);
    }

    return this.resolveFile(url);
  }

  /**
   * Check if the URL points to a folder
   */
  private isFolderUrl(url: string): boolean {
    return (
      MegaResolver.NEW_FOLDER_PATTERN.test(url) ||
      MegaResolver.LEGACY_FOLDER_PATTERN.test(url)
    );
  }

  /**
   * Resolve a direct file URL
   */
  private async resolveFile(url: string): Promise<ResolvedAsset> {
    const file = MegaFile.fromURL(url);
    await file.loadAttributes();

    const attrs = file as unknown as MegaFileAttributes;

    return {
      downloadUrl: url, // Keep original URL - download utility will use megajs
      fileName: attrs.name || 'mega-download',
      fileSize: attrs.size,
      metadata: {
        hosterType: 'mega',
        requiresSpecialDownload: true,
      },
    };
  }

  /**
   * Resolve a folder URL - lists files and allows selection
   */
  private async resolveFolder(
    url: string,
    getUserSelection?: (assets: AssetInfo[]) => Promise<number>
  ): Promise<ResolvedAsset> {
    const folder = MegaFile.fromURL(url);
    await folder.loadAttributes();

    // Get list of files in the folder
    const children = (folder as unknown as { children?: MegaFile[] }).children || [];

    // Filter to only files (not subfolders) and get their attributes
    const files: Array<{ file: MegaFile; name: string; size: number; downloadUrl: string }> = [];

    for (const child of children) {
      const childAttrs = child as unknown as MegaFileAttributes & { directory?: boolean };
      if (!childAttrs.directory && childAttrs.name) {
        // Build the direct file URL for this item
        const fileUrl = this.buildFileUrl(child, url);
        files.push({
          file: child,
          name: childAttrs.name,
          size: childAttrs.size || 0,
          downloadUrl: fileUrl,
        });
      }
    }

    if (files.length === 0) {
      throw new Error('MEGA folder contains no downloadable files');
    }

    // Single file - auto-select
    if (files.length === 1) {
      const singleFile = files[0];

      return {
        downloadUrl: singleFile.downloadUrl,
        fileName: singleFile.name,
        fileSize: singleFile.size,
        metadata: {
          hosterType: 'mega',
          requiresSpecialDownload: true,
          sourceFolder: url,
        },
      };
    }

    // Multiple files - need user selection
    if (!getUserSelection) {
      const fileNames = files.map((f) => f.name).join(', ');
      throw new Error(
        `MEGA folder contains ${files.length} files: ${fileNames}. ` +
          `User selection is required.`
      );
    }

    const assetInfos: AssetInfo[] = files.map((f) => ({
      name: f.name,
      downloadUrl: f.downloadUrl,
      size: f.size,
    }));

    const selectedIndex = await getUserSelection(assetInfos);

    if (selectedIndex < 0 || selectedIndex >= files.length) {
      throw new Error(`Invalid file selection index: ${selectedIndex}`);
    }

    const selectedFile = files[selectedIndex];

    return {
      downloadUrl: selectedFile.downloadUrl,
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      metadata: {
        hosterType: 'mega',
        requiresSpecialDownload: true,
        sourceFolder: url,
      },
    };
  }

  /**
   * Build a direct file URL for a file within a shared folder
   * MEGA shared folder files have a specific URL format
   */
  private buildFileUrl(file: MegaFile, folderUrl: string): string {
    // megajs File objects have a downloadId property we can use
    const fileWithId = file as unknown as { downloadId?: string[]; key?: Uint8Array };

    if (fileWithId.downloadId && fileWithId.downloadId.length >= 2) {
      // downloadId contains [fileId, key] for shared folder files
      const [fileId] = fileWithId.downloadId;
      // For folder files, we need to keep the folder context in the URL
      // The megajs library handles this internally when we pass the file object
      // So we'll store a special marker URL that our download utility can parse
      return `mega-folder-file://${folderUrl}?file=${fileId}`;
    }

    // Fallback: return folder URL with file name hint
    const attrs = file as unknown as MegaFileAttributes;
    return `mega-folder-file://${folderUrl}?name=${encodeURIComponent(attrs.name)}`;
  }
}
