/**
 * Markdown Instruction Extractor
 *
 * Extracts installation instruction sections from Markdown text.
 * Reuses the same keyword and noise patterns from the HTML-based base scraper.
 */

import {
  INSTRUCTION_KEYWORDS,
  FALLBACK_MIN_LENGTH,
  FALLBACK_MAX_LENGTH,
  isInstructionHeader,
  isNoiseHeader,
  isNoiseContent,
} from './base-scraper.utils';

/**
 * Extracted content from Markdown
 */
export interface ExtractedMarkdownContent {
  /** Installation instructions (relevant sections only) */
  instructions?: string;
}

/**
 * Parse Markdown into sections based on headers
 */
function parseMarkdownSections(
  markdown: string
): Array<{ level: number; header: string; content: string }> {
  const sections: Array<{ level: number; header: string; content: string }> = [];

  // Match markdown headers (# to ####)
  const headerPattern = /^(#{1,4})\s+(.+)$/gm;
  const headers: Array<{ level: number; text: string; index: number; length: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headerPattern.exec(markdown)) !== null) {
    headers.push({
      level: match[1].length,
      text: match[2].trim(),
      index: match.index,
      length: match[0].length,
    });
  }

  // Extract content between headers
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const contentStart = header.index + header.length;
    const contentEnd = i + 1 < headers.length ? headers[i + 1].index : markdown.length;
    const content = markdown.slice(contentStart, contentEnd).trim();

    sections.push({
      level: header.level,
      header: header.text,
      content,
    });
  }

  // If no headers, treat entire content as a single section
  if (headers.length === 0 && markdown.trim()) {
    sections.push({
      level: 0,
      header: '',
      content: markdown.trim(),
    });
  }

  return sections;
}

/**
 * Extract instruction sections from Markdown text
 * Uses the same keyword matching as HTML scrapers
 *
 * @param markdown The raw Markdown text (e.g., GitHub release body)
 * @returns Extracted instruction content or null if no relevant sections found
 */
export function extractInstructionsFromMarkdown(markdown: string): ExtractedMarkdownContent | null {
  if (!markdown || !markdown.trim()) {
    return null;
  }

  const sections = parseMarkdownSections(markdown);
  const instructionSections: string[] = [];

  for (const section of sections) {
    // Skip sections without headers (will be handled in fallback)
    if (!section.header) continue;

    // Skip noise headers
    if (isNoiseHeader(section.header)) continue;

    // Check if this is an instruction-related header
    if (isInstructionHeader(section.header)) {
      if (!isNoiseContent(section.content)) {
        // Normalize header level to ## for consistency
        instructionSections.push(`## ${section.header}\n\n${section.content}`);
      }
    }
  }

  // If we found specific instruction sections, return them
  if (instructionSections.length > 0) {
    return {
      instructions: instructionSections.join('\n\n'),
    };
  }

  // Fallback: check if the entire content is within bounds and contains keywords
  const plainText = markdown.trim();
  if (plainText.length >= FALLBACK_MIN_LENGTH && plainText.length <= FALLBACK_MAX_LENGTH) {
    const lowerText = plainText.toLowerCase();
    if (INSTRUCTION_KEYWORDS.some((kw) => lowerText.includes(kw))) {
      return {
        instructions: plainText,
      };
    }
  }

  return null;
}
