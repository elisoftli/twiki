/**
 * Markdown rendering and file detection utilities.
 */

import { marked } from 'marked';
import { BINARY_FILE_EXTENSIONS } from '../../../../shared/constants';

/**
 * Check if a filename looks like a file (has valid extension) and is not a binary.
 * Used to determine if clicking on code text should open it as a file.
 */
export function isClickableFile(text: string): boolean {
  const lower = text.toLowerCase();
  // Must have a file extension (contains a dot, not at the start)
  const lastDot = lower.lastIndexOf('.');
  if (lastDot <= 0) return false;

  // Extract the extension (everything after the last dot)
  const ext = lower.slice(lastDot + 1);

  // Extension must be alphanumeric only and reasonable length (1-10 chars)
  // This filters out things like "[Engine.PlayerInput]" where the "extension" is "playerinput]"
  if (!/^[a-z0-9]{1,10}$/.test(ext)) return false;

  // Not a binary file
  return !BINARY_FILE_EXTENSIONS.some(binExt => ext === binExt);
}

/**
 * Configure marked for safe rendering.
 * Call this once at app initialization or when needed.
 */
export function configureMarked(): void {
  marked.setOptions({
    breaks: true,
    gfm: true,
  });
}

/**
 * Render markdown to HTML.
 */
export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown) as string;
}

/**
 * Render inline markdown to HTML (no block elements).
 */
export function renderMarkdownInline(markdown: string): string {
  return marked.parseInline(markdown) as string;
}
