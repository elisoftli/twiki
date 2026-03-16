/**
 * BBCode to HTML converter for NexusMods mod descriptions.
 *
 * NexusMods uses BBCode formatting in their mod description fields.
 * This converts common BBCode tags to safe HTML equivalents.
 *
 * Key design decisions:
 * - Simple/parameterized tags are replaced independently (open and close
 *   separately) so that arbitrary nesting works correctly.
 * - Lists are processed inside-out so nested [list] blocks resolve properly.
 * - <br /> tags injected by the NexusMods API are cleaned up around list
 *   markers to prevent empty list items.
 */

/**
 * Convert BBCode text to HTML.
 * Handles common NexusMods BBCode tags including formatting, links, images,
 * lists, and font styling. Unrecognized tags are stripped.
 */
export function bbcodeToHtml(bbcode: string): string {
  let html = bbcode;

  // NexusMods API includes <br /> for line breaks alongside \n.
  // Strip bare newlines since they're just source formatting, not visual breaks.
  html = html.replace(/\n/g, '');

  // Clean up <br /> around list markers to prevent empty list items.
  // Order matters: clean around [*] first, then list boundaries.
  html = html.replace(/(?:<br\s*\/?>)*\s*\[\*\]/gi, '[*]');
  html = html.replace(/\[\*\]\s*(?:<br\s*\/?>)*/gi, '[*]');
  html = html.replace(/\[list\]\s*(?:<br\s*\/?>)*/gi, '[list]');
  html = html.replace(/(?:<br\s*\/?>)*\s*\[\/list\]/gi, '[/list]');

  // === Simple tags: replace open/close independently for correct nesting ===
  html = html.replace(/\[b\]/gi, '<strong>');
  html = html.replace(/\[\/b\]/gi, '</strong>');
  html = html.replace(/\[i\]/gi, '<em>');
  html = html.replace(/\[\/i\]/gi, '</em>');
  html = html.replace(/\[u\]/gi, '<u>');
  html = html.replace(/\[\/u\]/gi, '</u>');
  html = html.replace(/\[s\]/gi, '<s>');
  html = html.replace(/\[\/s\]/gi, '</s>');
  html = html.replace(/\[center\]/gi, '<div style="text-align:center">');
  html = html.replace(/\[\/center\]/gi, '</div>');
  html = html.replace(/\[quote\]/gi, '<blockquote>');
  html = html.replace(/\[\/quote\]/gi, '</blockquote>');

  // === Parameterized tags: also independent for nesting ===
  html = html.replace(
    /\[size=([^\]]+)\]/gi,
    (_, size) => `<span style="font-size:${mapFontSize(size)}">`,
  );
  html = html.replace(/\[\/size\]/gi, '</span>');

  html = html.replace(
    /\[color=([^\]]+)\]/gi,
    (_, color) => `<span style="color:${escapeAttr(color)}">`,
  );
  html = html.replace(/\[\/color\]/gi, '</span>');

  // [font=...] → strip (font family is not useful in our UI)
  html = html.replace(/\[font=[^\]]*\]/gi, '');
  html = html.replace(/\[\/font\]/gi, '');

  // === Paired tags (content-dependent, rarely nested) ===

  // [code]...[/code]
  html = html.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '<pre><code>$1</code></pre>');

  // [spoiler]...[/spoiler]
  html = html.replace(
    /\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi,
    '<details><summary>Spoiler</summary>$1</details>',
  );

  // [url=...]...[/url] → <a href="...">...</a>
  html = html.replace(
    /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi,
    (_, href, text) => `<a href="${escapeAttr(href)}">${text}</a>`,
  );

  // [url]...[/url] → <a href="...">...</a>
  html = html.replace(
    /\[url\]([\s\S]*?)\[\/url\]/gi,
    (_, href) => `<a href="${escapeAttr(href)}">${href}</a>`,
  );

  // [img]...[/img] → <img src="...">
  html = html.replace(
    /\[img\]([\s\S]*?)\[\/img\]/gi,
    (_, src) => `<img src="${escapeAttr(src.trim())}" alt="" />`,
  );

  // [heading]...[/heading] → <h3>
  html = html.replace(/\[heading\]([\s\S]*?)\[\/heading\]/gi, '<h3>$1</h3>');

  // === Lists: process innermost first to handle nesting ===
  // The negative lookahead ensures we only match lists that don't contain
  // inner [list] tags, so we resolve from the inside out.
  const LEAF_LIST = /\[list\]((?:(?!\[list\])[\s\S])*?)\[\/list\]/gi;
  while (LEAF_LIST.test(html)) {
    LEAF_LIST.lastIndex = 0;
    html = html.replace(LEAF_LIST, (_, content: string) => {
      const items = content
        .split(/\[\*\]/)
        .filter((item: string) => item.trim().length > 0)
        .map((item: string) => `<li>${item.replace(/(?:<br\s*\/?>)*\s*$/, '').trim()}</li>`)
        .join('');
      return `<ul>${items}</ul>`;
    });
  }

  // Handle stray [*] outside any [list] block (malformed BBCode)
  html = html.replace(/\[\*\]/g, '<br>');

  // [line] or [hr] → <hr>
  html = html.replace(/\[line\]/gi, '<hr>');
  html = html.replace(/\[hr\]/gi, '<hr>');

  // Strip any remaining unrecognized BBCode tags
  html = html.replace(/\[\/?\w+(?:=[^\]]*?)?\]/g, '');

  return html;
}

/** Map BBCode size values (1-7) to CSS font sizes */
function mapFontSize(size: string): string {
  const sizeMap: Record<string, string> = {
    '1': '0.75em',
    '2': '0.875em',
    '3': '1em',
    '4': '1.25em',
    '5': '1.5em',
    '6': '1.75em',
    '7': '2em',
  };
  return sizeMap[size.trim()] ?? `${size.trim()}px`;
}

/** Escape a value for use in an HTML attribute */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
