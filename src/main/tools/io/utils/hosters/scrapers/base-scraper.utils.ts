/**
 * Base Scraper Class
 *
 * Abstract base class providing shared functionality for all scrapers.
 * Handles keyword-based instruction extraction, noise filtering, and
 * common HTML parsing utilities.
 *
 * To create a new scraper:
 * 1. Extend this class
 * 2. Implement `name` getter
 * 3. Implement `matchesUrl()` for URL filtering
 * 4. Optionally override `extractContent()` for custom extraction logic
 * 5. Optionally override helper methods for site-specific behavior
 */

import type { HosterScraper, ScrapedContent } from './scraper.interface';

/**
 * Keywords that indicate installation instruction sections
 * Shared across all scrapers
 */
export const INSTRUCTION_KEYWORDS = [
  'install',
  'installation',
  'how to',
  'setup',
  'instructions',
  'getting started',
  'usage',
  'requirements',
];

/**
 * Common noise section patterns to exclude
 * These headers typically don't contain installation instructions
 */
export const NOISE_HEADER_PATTERNS = [
  /^back to top$/i,
  /^table of contents$/i,
  /^credits?$/i,
  /^changelog$/i,
  /^version history$/i,
  /^permissions$/i,
  /^endorsements$/i,
  /^thanks?$/i,
  /^acknowledgements?$/i,
  /^contributors?$/i,
  /^license$/i,
  /^faq$/i,
  /^support$/i,
  /^donate$/i,
  /^donations?$/i,
];

/**
 * Noise keywords for paragraph-based extraction.
 * Checked via startsWith on the plain text of paragraph segments.
 * Used by scrapers/extractors that split content by paragraph breaks.
 */
export const NOISE_KEYWORDS = [
  'credits',
  'credit',
  'changelog',
  'version history',
  'permissions',
  'endorsements',
  'thanks',
  'thank you',
  'acknowledgements',
  'acknowledgement',
  'contributors',
  'contributor',
  'license',
  'faq',
  'support',
  'donate',
  'donations',
  'donation',
  'about',
  'back to top',
  'table of contents',
  'compatibility',
  'known issues',
  'bugs',
  'troubleshooting',
  'uninstall',
  'uninstallation',
];

/**
 * Minimum content length for a section to be considered useful
 */
export const MIN_SECTION_LENGTH = 20;

/**
 * Content length bounds for fallback extraction
 */
export const FALLBACK_MIN_LENGTH = 50;
export const FALLBACK_MAX_LENGTH = 2000;

/**
 * Abstract base class for scrapers
 */
export abstract class BaseScraper implements HosterScraper {
  /**
   * Unique identifier for this scraper
   */
  abstract get name(): string;

  /**
   * Check if this scraper can handle the given URL
   * @param url The URL to check
   * @returns true if this scraper should handle the URL
   */
  abstract matchesUrl(url: string): boolean;

  /**
   * Extract content from HTML
   * Default implementation finds content area and extracts instructions
   * Override for site-specific extraction logic
   */
  extractContent(html: string): ScrapedContent | null {
    try {
      const processedHtml = this.preprocessHtml(html);
      const title = this.extractTitle(processedHtml);
      const contentArea = this.findContentArea(processedHtml);

      if (!contentArea) {
        return title ? { title } : null;
      }

      let instructionsHtml = this.extractInstructionSections(contentArea);

      if (!instructionsHtml) {
        instructionsHtml = this.checkFallbackContent(contentArea);
      }

      if (!title && !instructionsHtml) {
        return null;
      }

      return {
        title,
        instructionsHtml: instructionsHtml || undefined,
      };
    } catch (error) {
      console.error(`[${this.name}] Error extracting content:`, error);
      return null;
    }
  }

  /**
   * Preprocess HTML before extraction
   * Override to add site-specific preprocessing (e.g., length limits)
   */
  protected preprocessHtml(html: string): string {
    return html;
  }

  /**
   * Extract title from HTML
   * Default: tries <title> tag first, then <h1>
   * Override for site-specific title extraction
   */
  protected extractTitle(html: string): string | undefined {
    // Try <title> tag first
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) {
      const title = this.cleanTitle(titleMatch[1]);
      if (title.length > 0) {
        return title;
      }
    }

    // Fallback to <h1>
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match?.[1]) {
      const h1Text = h1Match[1].replace(/<[^>]+>/g, '').trim();
      if (h1Text.length > 0) {
        return this.cleanTitle(h1Text);
      }
    }

    return undefined;
  }

  /**
   * Clean up page title by removing site-specific suffixes
   * Override to add site-specific cleanup patterns
   */
  protected cleanTitle(title: string): string {
    return title.trim();
  }

  /**
   * Find the main content area in the HTML
   * Override for site-specific container detection
   */
  protected findContentArea(html: string): string | undefined {
    // Default: try semantic elements in priority order
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch?.[1]?.trim()) {
      return articleMatch[1];
    }

    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch?.[1]?.trim()) {
      return mainMatch[1];
    }

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch?.[1]?.trim()) {
      return bodyMatch[1];
    }

    return undefined;
  }

  /**
   * Extract instruction sections based on keyword headers
   * Looks for h1-h4 headers containing keywords and extracts following content
   */
  protected extractInstructionSections(contentHtml: string): string | null {
    const sections: string[] = [];
    const headerPattern = this.getHeaderPattern();

    // Find all headers
    const headers: Array<{ text: string; index: number; fullMatch: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = headerPattern.exec(contentHtml)) !== null) {
      const headerText = match[1].replace(/<[^>]+>/g, '').trim();
      headers.push({
        text: headerText,
        index: match.index,
        fullMatch: match[0],
      });
    }

    // Process each header section
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];

      if (this.isNoiseHeader(header.text)) continue;
      if (!this.isInstructionHeader(header.text)) continue;

      const contentStart = header.index + header.fullMatch.length;
      const contentEnd = i + 1 < headers.length ? headers[i + 1].index : contentHtml.length;
      const sectionContent = contentHtml.slice(contentStart, contentEnd).trim();

      if (this.isNoiseContent(sectionContent)) continue;

      sections.push(`<h3>${header.text}</h3>\n${sectionContent}`);
    }

    return sections.length > 0 ? sections.join('\n\n') : null;
  }

  /**
   * Get regex pattern for matching headers
   * Default: h1-h4. Override for site-specific header levels.
   */
  protected getHeaderPattern(): RegExp {
    return /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  }

  /**
   * Check if full content can be used as fallback
   * Used when no specific instruction sections are found
   */
  protected checkFallbackContent(contentHtml: string): string | null {
    const plainText = contentHtml.replace(/<[^>]+>/g, '').trim();

    if (plainText.length < FALLBACK_MIN_LENGTH || plainText.length > FALLBACK_MAX_LENGTH) {
      return null;
    }

    const lowerText = plainText.toLowerCase();
    if (INSTRUCTION_KEYWORDS.some((kw) => lowerText.includes(kw))) {
      return contentHtml;
    }

    return null;
  }

  /**
   * Check if a header text contains instruction-related keywords
   */
  protected isInstructionHeader(headerText: string): boolean {
    return isInstructionHeader(headerText);
  }

  /**
   * Check if a header is a noise section we should skip
   */
  protected isNoiseHeader(headerText: string): boolean {
    return isNoiseHeader(headerText);
  }

  /**
   * Check if content is too short to be useful
   */
  protected isNoiseContent(text: string): boolean {
    return isNoiseContent(text);
  }
}

// ============================================================================
// Standalone utility functions (shared by extractors that don't use BaseScraper)
// ============================================================================

/**
 * Check if a header text contains instruction-related keywords
 */
export function isInstructionHeader(headerText: string): boolean {
  const normalized = headerText.toLowerCase().trim();
  return INSTRUCTION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/**
 * Check if a header is a noise section we should skip
 */
export function isNoiseHeader(headerText: string): boolean {
  const normalized = headerText.trim();
  return NOISE_HEADER_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Check if content is too short to be useful
 */
export function isNoiseContent(text: string): boolean {
  const normalized = text.trim();
  return normalized.length < MIN_SECTION_LENGTH;
}
