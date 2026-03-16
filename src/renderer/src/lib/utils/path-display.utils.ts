/**
 * Utilities for displaying file paths in a user-friendly way.
 * Supports left-truncation and showing the last N path segments.
 */

/**
 * Normalize path separators to backslash (Windows style) for display consistency
 */
function normalizePath(path: string): string {
  return path.replace(/\//g, '\\');
}

/**
 * Extract the last N segments of a path for display.
 * @param path The full file path
 * @param segments Number of path segments to show (default: 2)
 * @returns Object with displayPath and whether it was truncated
 */
export function extractDisplayPath(
  path: string,
  segments: number = 2
): { displayPath: string; isTruncated: boolean } {
  if (!path) return { displayPath: '', isTruncated: false };

  const normalized = normalizePath(path);
  const parts = normalized.split('\\').filter(Boolean);

  if (parts.length <= segments) {
    return { displayPath: normalized, isTruncated: false };
  }

  const lastParts = parts.slice(-segments);
  return {
    displayPath: lastParts.join('\\'),
    isTruncated: true,
  };
}

/**
 * Format a path with ellipsis prefix if truncated.
 * Shows the last N segments of the path.
 * @param path The full file path
 * @param segments Number of path segments to show (default: 2)
 * @returns Formatted path string with ellipsis if truncated
 */
export function formatDisplayPath(path: string, segments: number = 2): string {
  const { displayPath, isTruncated } = extractDisplayPath(path, segments);
  return isTruncated ? `...\\${displayPath}` : displayPath;
}

/**
 * Get just the filename from a path
 */
export function getFileName(path: string): string {
  if (!path) return '';
  const normalized = normalizePath(path);
  const parts = normalized.split('\\').filter(Boolean);
  return parts[parts.length - 1] || path;
}

/**
 * Get the parent directory name from a path
 */
export function getParentDir(path: string): string {
  if (!path) return '';
  const normalized = normalizePath(path);
  const parts = normalized.split('\\').filter(Boolean);
  if (parts.length < 2) return '';
  return parts[parts.length - 2];
}

/**
 * Check if a path looks like a directory (no extension or ends with separator)
 */
export function looksLikeDirectory(path: string): boolean {
  if (!path) return false;
  const fileName = getFileName(path);
  return !fileName.includes('.') || path.endsWith('/') || path.endsWith('\\');
}
