/**
 * NexusMods Scraper
 *
 * Extracts mod title and installation instructions from NexusMods mod pages.
 * Only matches the description tab of mod pages.
 */

import { BaseScraper, INSTRUCTION_KEYWORDS, NOISE_KEYWORDS, MIN_SECTION_LENGTH } from './base-scraper.utils';

/**
 * NexusMods-specific title suffix pattern
 */
const NEXUSMODS_TITLE_SUFFIX = /\s+at\s+.+Nexus\s*-.*$/i;

/**
 * Pattern to split content by paragraph breaks (double <br> tags)
 * Handles variations: <br><br>, <br/><br/>, <br /><br />
 */
const PARAGRAPH_BREAK_PATTERN = /(?:<br\s*\/?>\s*){2,}/gi;

/**
 * NexusMods scraper implementation
 */
class NexusModsScraper extends BaseScraper {
  get name(): string {
    return 'nexusmods';
  }

  matchesUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);

      // Must be a NexusMods domain
      if (!urlObj.hostname.includes('nexusmods.com')) {
        return false;
      }

      // Must be a mod page (pattern: /gamename/mods/modid)
      if (!urlObj.pathname.match(/^\/[^/]+\/mods\/\d+\/?$/)) {
        return false;
      }

      // Only match the description page (no tab param, or tab=description)
      // Exclude files, images, posts, logs, etc. tabs - they don't have the description
      const tab = urlObj.searchParams.get('tab');
      if (tab && tab !== 'description') {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean NexusMods title by removing " at Game Name Nexus - ..." suffix
   */
  protected override cleanTitle(title: string): string {
    return title.replace(NEXUSMODS_TITLE_SUFFIX, '').trim();
  }

  /**
   * Find NexusMods mod description container
   */
  protected override findContentArea(html: string): string | undefined {
    // Try mod_description_container by id first (for test compatibility)
    const idMatch = html.match(
      /<div[^>]*id="mod_description_container"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i
    );
    if (idMatch?.[1]) {
      return idMatch[1];
    }

    // Try mod_description_container by class (real NexusMods pages use class)
    // Match until </div> preceded by a newline (handles different line endings)
    const classMatch = html.match(
      /<div[^>]*class="[^"]*mod_description_container[^"]*"[^>]*>([\s\S]*?)[\r\n]+<\/div>/i
    );
    if (classMatch?.[1]) {
      return classMatch[1];
    }

    // Alternative: match until </div> followed by </body> or end of HTML
    // This handles cases where the container has nested divs and no newline before closing
    const classMatchWithBody = html.match(
      /<div[^>]*class="[^"]*mod_description_container[^"]*"[^>]*>([\s\S]*?)<\/div>(?=\s*(?:<\/body>|<\/html>|$))/i
    );
    if (classMatchWithBody?.[1]) {
      return classMatchWithBody[1];
    }

    // Fallback to mod_description class with </body> lookahead (handles nested divs)
    const altMatchWithBody = html.match(
      /<div[^>]*class="[^"]*mod_description[^"]*"[^>]*>([\s\S]*?)<\/div>(?=\s*(?:<\/body>|<\/html>|$))/i
    );
    if (altMatchWithBody?.[1]) {
      return altMatchWithBody[1];
    }

    // Final fallback to mod_description class (simpler pages without body tags)
    const altMatch = html.match(
      /<div[^>]*class="[^"]*mod_description[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    if (altMatch?.[1]) {
      return altMatch[1];
    }

    return undefined;
  }

  /**
   * NexusMods uses h2-h4 headers (not h1)
   */
  protected override getHeaderPattern(): RegExp {
    return /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi;
  }

  /**
   * Override instruction extraction to handle NexusMods pages without proper headers.
   * NexusMods often uses plain text like "Installation<br><ul>..." instead of <h2>Installation</h2>.
   * Falls back to paragraph-based extraction when header-based extraction fails.
   */
  protected override extractInstructionSections(contentHtml: string): string | null {
    // First try the standard header-based extraction
    const headerResult = super.extractInstructionSections(contentHtml);
    if (headerResult) {
      return headerResult;
    }

    // Second: try styled section markers (<font><strong>Section:</strong></font> pattern)
    const styledResult = this.extractByStyledSectionMarkers(contentHtml);
    if (styledResult) {
      return styledResult;
    }

    // Final fallback: split by paragraph breaks (<br><br>) and find instruction segments
    return this.extractByParagraphBreaks(contentHtml);
  }

  /**
   * Extract instructions by finding styled section markers.
   * NexusMods often uses <font size="5"><strong>Section:</strong></font> patterns for sections.
   * This handles pages where sections are separated by single <br> instead of <br><br>.
   */
  private extractByStyledSectionMarkers(contentHtml: string): string | null {
    // Pattern matches styled section headers with font size 4 or 5 (indicating headers, not inline text):
    // <font size="5"><strong>Instructions:</strong></font>
    // <font size="4"><strong>Features</strong></font>
    // Size 3 and below are typically inline text within paragraphs
    const sectionMarkerPattern =
      /<font[^>]*size=["']?[45]["']?[^>]*><strong>([^<]+?):?<\/strong><\/font>|<font[^>]*size=["']?[45]["']?[^>]*><strong>([^<]+?):?<\/strong>|<strong><font[^>]*size=["']?[45]["']?[^>]*>([^<]+?):?<\/font><\/strong>/gi;

    // Find all section markers with their positions
    const markers: Array<{ text: string; index: number; endIndex: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = sectionMarkerPattern.exec(contentHtml)) !== null) {
      const headerText = (match[1] || match[2] || match[3] || '').trim().replace(/:$/, '');
      if (headerText.length > 0 && headerText.length < 50) {
        // Skip very long matches (likely not headers)
        markers.push({
          text: headerText,
          index: match.index,
          endIndex: match.index + match[0].length,
        });
      }
    }

    if (markers.length === 0) {
      return null;
    }

    const instructionSections: string[] = [];

    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      const lowerText = marker.text.toLowerCase();

      // Check if this is an instruction-related section
      const isInstruction = INSTRUCTION_KEYWORDS.some(
        (kw) => lowerText.includes(kw) || lowerText === kw
      );

      // Check if this is a noise section
      const isNoise = NOISE_KEYWORDS.some((kw) => lowerText.startsWith(kw) || lowerText === kw);

      if (isInstruction && !isNoise) {
        // Extract content from this marker to the next marker (or end)
        const contentStart = marker.endIndex;
        const contentEnd = i + 1 < markers.length ? markers[i + 1].index : contentHtml.length;
        const sectionContent = contentHtml.slice(contentStart, contentEnd).trim();

        // Verify content has meaningful length
        const plainText = sectionContent.replace(/<[^>]+>/g, '').trim();
        if (plainText.length >= MIN_SECTION_LENGTH) {
          // Include the section header in output
          instructionSections.push(`<h3>${marker.text}</h3>\n${sectionContent}`);
        }
      }
    }

    return instructionSections.length > 0 ? instructionSections.join('\n\n') : null;
  }

  /**
   * Extract instructions by splitting content on <br><br> paragraph breaks.
   * Finds segments that start with instruction keywords and collects them.
   */
  private extractByParagraphBreaks(contentHtml: string): string | null {
    const segments = contentHtml.split(PARAGRAPH_BREAK_PATTERN);

    if (segments.length <= 1) {
      return null;
    }

    const instructionSegments: string[] = [];
    let capturing = false;

    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed) continue;

      // Get plain text for keyword matching
      const plainText = trimmed.replace(/<[^>]+>/g, '').trim();
      const lowerText = plainText.toLowerCase();

      // Check if this segment starts with an instruction keyword
      const startsWithKeyword = INSTRUCTION_KEYWORDS.some(
        (kw) => lowerText.startsWith(kw) || lowerText.startsWith(`${kw}:`)
      );

      // Check if this is a noise section (credits, changelog, about, etc.)
      // Uses startsWith check since segment text includes more than just the header
      const isNoise = NOISE_KEYWORDS.some(
        (kw) => lowerText.startsWith(kw) || lowerText.startsWith(`${kw}:`)
      );

      if (startsWithKeyword && !isNoise) {
        capturing = true;
      }

      if (isNoise) {
        // Stop capturing when we hit a noise section
        capturing = false;
      }

      if (capturing && plainText.length >= MIN_SECTION_LENGTH) {
        instructionSegments.push(trimmed);
      }
    }

    if (instructionSegments.length === 0) {
      return null;
    }

    return instructionSegments.join('<br><br>');
  }
}

export const nexusmodsScraper = new NexusModsScraper();
