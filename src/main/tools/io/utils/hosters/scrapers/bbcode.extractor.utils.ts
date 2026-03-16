/**
 * BBCode Instruction Extractor
 *
 * Extracts installation instructions from NexusMods mod descriptions
 * returned by the GraphQL API (BBCode + <br /> format).
 *
 * The extraction pipeline:
 * 1. Identify section headers (sized bold text or [heading] tags) directly in BBCode
 * 2. Extract instruction-related sections by keyword matching
 * 3. Convert instruction BBCode → Markdown directly (no HTML intermediate)
 */

import {
  INSTRUCTION_KEYWORDS,
  NOISE_KEYWORDS,
  MIN_SECTION_LENGTH,
  isInstructionHeader,
  isNoiseHeader,
} from './base-scraper.utils';

/**
 * Extract installation instructions from a NexusMods mod description (BBCode).
 *
 * @param bbcode - Raw BBCode description from the NexusMods GraphQL API
 * @returns Markdown string with installation instructions, or null if none found
 */
export function extractInstructionsFromBBCode(bbcode: string): string | null {
  if (!bbcode || bbcode.trim().length === 0) {
    return null;
  }

  // Normalize: strip literal newlines (API uses <br /> for visual breaks)
  const normalized = bbcode.replace(/\n/g, '');

  // Strategy 1: header-based extraction
  const headerResult = extractByHeaders(normalized);
  if (headerResult) return headerResult;

  // Strategy 2: paragraph-break based extraction
  return extractByParagraphBreaks(normalized);
}

// ============================================================================
// Header detection in BBCode
// ============================================================================

interface BBCodeHeader {
  text: string;
  index: number;
  endIndex: number;
}

/**
 * Find all headers in BBCode source.
 *
 * Header patterns:
 * - [size=4-7][b]...[/b][/size] (optionally wrapped in [color])
 * - [b][size=4-7]...[/size][/b] (optionally wrapped in [color])
 *
 * Note: [heading] tags are treated as sub-headers (####) within sections,
 * not as top-level section dividers.
 */
function findHeaders(bbcode: string): BBCodeHeader[] {
  const headers: BBCodeHeader[] = [];

  // Pattern 1: [color=]?[size=4-7][b]text[/b][/size][/color]?
  const p1 =
    /(?:\[color=[^\]]+\]\s*)?(?:<br\s*\/?>[\s]*)*\[size=([4-7])\]\s*\[b\]([\s\S]*?)\[\/b\]\s*\[\/size\](?:\s*\[\/color\])?/gi;
  let match: RegExpExecArray | null;
  while ((match = p1.exec(bbcode)) !== null) {
    headers.push({
      text: stripAllTags(match[2]).trim(),
      index: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // Pattern 2: [color=]?[b][size=4-7]text[/size][/b][/color]?
  const p2 =
    /(?:\[color=[^\]]+\]\s*)?(?:<br\s*\/?>[\s]*)*\[b\]\s*\[size=([4-7])\]([\s\S]*?)\[\/size\]\s*\[\/b\](?:\s*\[\/color\])?/gi;
  while ((match = p2.exec(bbcode)) !== null) {
    if (overlapsAny(match.index, match.index + match[0].length, headers)) continue;
    headers.push({
      text: stripAllTags(match[2]).trim(),
      index: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  headers.sort((a, b) => a.index - b.index);
  return headers;
}

function overlapsAny(start: number, end: number, headers: BBCodeHeader[]): boolean {
  return headers.some((h) => start < h.endIndex && end > h.index);
}

// ============================================================================
// Extraction strategies
// ============================================================================

/**
 * Strategy 1: Find headers containing instruction keywords,
 * extract content until the next header.
 */
function extractByHeaders(bbcode: string): string | null {
  const headers = findHeaders(bbcode);
  if (headers.length === 0) return null;

  const sections: string[] = [];
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];

    if (isNoiseHeader(header.text)) continue;
    if (!isInstructionHeader(header.text)) continue;

    const contentStart = header.endIndex;
    const contentEnd = i + 1 < headers.length ? headers[i + 1].index : bbcode.length;
    const sectionBBCode = bbcode.slice(contentStart, contentEnd).trim();

    const plainText = stripAllTags(sectionBBCode).trim();
    if (plainText.length < MIN_SECTION_LENGTH) continue;

    sections.push(`### ${header.text}\n\n${bbcodeToMarkdown(sectionBBCode)}`);
  }

  if (sections.length === 0) return null;

  const result = sections.join('\n\n').trim();
  return result || null;
}

/**
 * Strategy 2: Split on double <br> breaks and find segments
 * starting with instruction keywords.
 */
function extractByParagraphBreaks(bbcode: string): string | null {
  const PARAGRAPH_BREAK = /(?:<br\s*\/?>[\s]*){2,}/gi;
  const segments = bbcode.split(PARAGRAPH_BREAK);

  if (segments.length <= 1) return null;

  const instructionSegments: string[] = [];
  let capturing = false;

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const plainText = stripAllTags(trimmed).trim();
    const lowerText = plainText.toLowerCase();

    const startsWithKeyword = INSTRUCTION_KEYWORDS.some(
      (kw) => lowerText.startsWith(kw) || lowerText.startsWith(`${kw}:`),
    );

    const isNoise = NOISE_KEYWORDS.some(
      (kw) => lowerText.startsWith(kw) || lowerText.startsWith(`${kw}:`),
    );

    if (startsWithKeyword && !isNoise) {
      capturing = true;
    }
    if (isNoise) {
      capturing = false;
    }

    if (capturing && plainText.length >= MIN_SECTION_LENGTH) {
      instructionSegments.push(bbcodeToMarkdown(trimmed));
    }
  }

  if (instructionSegments.length === 0) return null;

  const result = instructionSegments.join('\n\n').trim();
  return result || null;
}

// ============================================================================
// BBCode → Markdown conversion
// ============================================================================

/**
 * Strip all BBCode tags and HTML <br> tags, returning plain text.
 */
function stripAllTags(input: string): string {
  return input
    .replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, '')
    .replace(/\[youtube\][\s\S]*?\[\/youtube\]/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\[\/?[\w]+(?:=[^\]]*?)?\]/g, '')
    .trim();
}

/**
 * Convert a BBCode fragment to Markdown.
 */
function bbcodeToMarkdown(bbcode: string): string {
  let md = bbcode;

  // Strip images and youtube embeds
  md = md.replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, '');
  md = md.replace(/\[youtube\][\s\S]*?\[\/youtube\]/gi, '');

  // Strip decorative tags (color, size, font, center)
  md = md.replace(/\[color=[^\]]+\]/gi, '');
  md = md.replace(/\[\/color\]/gi, '');
  md = md.replace(/\[size=[^\]]+\]/gi, '');
  md = md.replace(/\[\/size\]/gi, '');
  md = md.replace(/\[font=[^\]]*\]/gi, '');
  md = md.replace(/\[\/font\]/gi, '');
  md = md.replace(/\[center\]/gi, '');
  md = md.replace(/\[\/center\]/gi, '');

  // Clean up <br /> around list markers
  md = md.replace(/(?:<br\s*\/?>)*\s*\[\*\]/gi, '[*]');
  md = md.replace(/\[\*\]\s*(?:<br\s*\/?>)*/gi, '[*]');
  md = md.replace(/\[list\]\s*(?:<br\s*\/?>)*/gi, '[list]');
  md = md.replace(/(?:<br\s*\/?>)*\s*\[\/list\]/gi, '[/list]');

  // Convert lists (innermost first for nesting)
  const LEAF_LIST = /\[list\]((?:(?!\[list\])[\s\S])*?)\[\/list\]/gi;
  while (LEAF_LIST.test(md)) {
    LEAF_LIST.lastIndex = 0;
    md = md.replace(LEAF_LIST, (_, content: string) => {
      const items = content
        .split(/\[\*\]/)
        .map((item: string) => item.replace(/(?:<br\s*\/?>)*\s*$/i, '').trim())
        .filter((item: string) => item.length > 0)
        .map((item: string) => `- ${item}`)
        .join('\n');
      return `\n${items}\n`;
    });
  }
  // Stray list markers outside [list] blocks
  md = md.replace(/\[\*\]/g, '\n- ');

  // Convert code blocks (convert <br /> to newlines inside)
  md = md.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_, code: string) => {
    const codeText = code.replace(/<br\s*\/?>/gi, '\n').trim();
    return `\n\`\`\`\n${codeText}\n\`\`\`\n`;
  });

  // Convert spoilers (just unwrap)
  md = md.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, '$1');

  // Convert URLs (before bold/italic since URL text may contain formatting)
  md = md.replace(
    /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi,
    (_, href: string, text: string) => {
      const cleanText = stripAllTags(text).trim();
      return `[${cleanText || href}](${href})`;
    },
  );
  md = md.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, href: string) => {
    const trimmed = href.trim();
    return `[${trimmed}](${trimmed})`;
  });

  // Convert quotes
  md = md.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, (_, text: string) => {
    const lines = text.replace(/<br\s*\/?>/gi, '\n').trim().split('\n');
    return lines.map((line: string) => `> ${line}`).join('\n');
  });

  // Convert formatting
  md = md.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '**$1**');
  md = md.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '*$1*');
  md = md.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '~~$1~~');
  md = md.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '$1');

  // Convert sub-headers within a section
  md = md.replace(/\[heading\]([\s\S]*?)\[\/heading\]/gi, (_, text: string) => {
    return `\n#### ${stripAllTags(text).trim()}\n`;
  });

  // Convert horizontal rules
  md = md.replace(/\[line\]/gi, '\n---\n');
  md = md.replace(/\[hr\]/gi, '\n---\n');

  // Strip remaining unrecognized BBCode tags
  md = md.replace(/\[\/?[\w]+(?:=[^\]]*?)?\]/g, '');

  // Convert <br /> to newlines
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.replace(/[ \t]+$/gm, '');

  return md.trim();
}
