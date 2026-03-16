/**
 * Converts frontend-optimized markdown to plain text suitable for agent instructions.
 *
 * This handles:
 * - HTML entities (&lt; &gt; &amp;) → literal characters
 * - Markdown links [text](url) → just the text
 * - Preserves code blocks, inline code, newlines, and spacing
 *
 * @param markdown The markdown string from PCGamingWiki
 * @returns Plain text instructions for the agent
 */
export function markdownToPlainText(markdown: string): string {
  if (!markdown) return '';

  return (
    markdown
      // Decode HTML entities back to literal characters
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Convert markdown links [text](url) or [text](url "title") to just text
      // This regex handles optional title in quotes
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  );
}
