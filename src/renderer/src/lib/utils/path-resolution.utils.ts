/**
 * Utilities for resolving and matching file paths.
 * Used for handling PCGamingWiki links and file references.
 */

import type { PCGWConfigPath } from '@twiki/shared';

type PCGWConfigPathType = PCGWConfigPath['pathType'];

export const TWIKI_PATH_PROTOCOL = 'twiki-path://';
const PATH_TO_GAME_PLACEHOLDER = '<path-to-game>';

/**
 * Check if a full path ends with a given filename (case-insensitive).
 * Handles both forward and backslash separators.
 */
export function pathEndsWithFilename(fullPath: string, filename: string): boolean {
  const pathLower = fullPath.toLowerCase();
  const filenameLower = filename.toLowerCase();
  return (
    pathLower.endsWith(filenameLower) ||
    pathLower.endsWith(`\\${filenameLower}`) ||
    pathLower.endsWith(`/${filenameLower}`)
  );
}

/**
 * Resolve a twiki-path:// URL to an actual filesystem path.
 * Replaces <path-to-game> placeholder with the actual install path.
 */
export function resolveTwikiPath(twikiPath: string, installPath?: string): string {
  if (!twikiPath.startsWith(TWIKI_PATH_PROTOCOL)) {
    return twikiPath;
  }
  let resolved = twikiPath.slice(TWIKI_PATH_PROTOCOL.length);
  if (installPath) {
    resolved = resolved.replace(PATH_TO_GAME_PLACEHOLDER, installPath);
  }
  return resolved;
}

/**
 * Infer path type from the path string based on extension and trailing slash.
 */
export function inferPathType(path: string): PCGWConfigPathType {
  // Trailing slash = directory
  if (path.endsWith('\\') || path.endsWith('/')) {
    return 'directory';
  }

  // Check last segment for extension
  const lastSegment = path.split(/[\\/]/).pop() || '';
  const hasExtension = lastSegment.includes('.') && !lastSegment.startsWith('.');

  return hasExtension ? 'file' : 'directory';
}

/**
 * Find a matching config path by filename from a list of config paths.
 * Searches both direct paths and resolved files from glob patterns.
 */
export function findConfigPathByFilename(
  filename: string,
  configPaths: PCGWConfigPath[]
): { path: string; pathType: PCGWConfigPathType } | null {
  for (const configPath of configPaths) {
    // Direct match on config path
    if (pathEndsWithFilename(configPath.path, filename)) {
      return { path: configPath.path, pathType: configPath.pathType };
    }

    // Check resolved files from glob patterns
    if (configPath.resolvedFiles && configPath.resolvedFiles.length > 0) {
      const matchingFile = configPath.resolvedFiles.find((f) =>
        pathEndsWithFilename(f, filename)
      );
      if (matchingFile) {
        return { path: matchingFile, pathType: 'file' };
      }
    }
  }
  return null;
}

/**
 * Get the directory containing a file path.
 * Returns null if no separator found.
 */
export function getContainingDirectory(path: string): string | null {
  const lastSep = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return lastSep > 0 ? path.substring(0, lastSep) : null;
}

/**
 * Resolve link text keywords to a path action.
 * Handles common patterns like "installation folder", "<path-to-game>", etc.
 */
export function resolveLinkTextToPath(
  linkText: string,
  installPath?: string
): { path: string; pathType: PCGWConfigPathType } | null {
  const text = linkText.toLowerCase();

  // Installation/game folder references
  if (
    text.includes('installation') ||
    text.includes('game folder') ||
    text === '<path-to-game>'
  ) {
    return installPath ? { path: installPath, pathType: 'directory' } : null;
  }

  // Steam folder reference
  if (text.includes('<steam-folder>')) {
    return { path: '%STEAMDIR%', pathType: 'directory' };
  }

  // Match environment variable pattern like %USERPROFILE%, %APPDATA%, etc.
  const envVarMatch = linkText.match(/%([^%]+)%/i);
  if (envVarMatch) {
    return { path: `%${envVarMatch[1].toUpperCase()}%`, pathType: 'directory' };
  }

  return null;
}
