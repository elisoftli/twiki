/**
 * Shared utility functions for tool formatters.
 */

import type { EditableContent } from '../../interfaces/tool-display.interface';

/**
 * Truncate a string to a maximum length, adding ellipsis if needed.
 * @param str - The string to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated string with ellipsis if needed
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Extract filename from a path (handles both Windows and Unix paths).
 * @param path - Full path string
 * @returns Filename portion only
 */
export function extractFileName(path: string): string {
  if (!path) return '';
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

/**
 * Extract the last segment of a registry key path.
 * @param keyPath - Full registry key path
 * @returns Last segment of the key path
 */
export function extractKeyName(keyPath: string): string {
  if (!keyPath) return '';
  const parts = keyPath.split('\\');
  return parts[parts.length - 1] || keyPath;
}

/**
 * Shorten a URL for display (show host and key path parts).
 * @param url - Full URL
 * @returns Shortened display string
 */
export function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.host.replace(/^www\./, '');
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (host === 'github.com' && pathParts.length >= 2) {
      return `${pathParts[0]}/${pathParts[1]}${pathParts.length > 2 ? '/...' : ''}`;
    }
    if (pathParts.length > 0) {
      return `${host}/${pathParts[pathParts.length - 1]}`;
    }
    return host;
  } catch {
    return truncate(url, 40);
  }
}

/**
 * Detect the hoster type from a URL.
 * @param url - Download URL
 * @returns Hoster name (GitHub, Nexus Mods, or Direct)
 */
export function detectHoster(url: string): string {
  try {
    const host = new URL(url).host.toLowerCase();
    if (host.includes('github.com')) return 'GitHub';
    if (host.includes('nexusmods.com')) return 'Nexus Mods';
    return 'Direct';
  } catch {
    return 'Direct';
  }
}

/**
 * Create an editable content object for operations that support user editing.
 * @param value - The content value
 * @param mode - Editor mode ('code' or 'text')
 * @param startLine - Optional starting line number
 * @returns EditableContent object
 */
export function createEditable(value: string, mode: 'code' | 'text' = 'code', startLine?: number): EditableContent {
  return { value, mode, startLine };
}
