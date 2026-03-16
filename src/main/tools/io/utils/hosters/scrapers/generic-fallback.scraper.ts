/**
 * Generic Fallback Scraper
 *
 * Extracts installation instructions from any website when no site-specific
 * scraper matches. Uses keyword-header detection with strict quality requirements.
 *
 * This scraper runs LAST in the registry - only when no specific scraper matches.
 */

import { BaseScraper } from './base-scraper.utils';

/**
 * Common title suffixes to clean up from various sites
 */
const GENERIC_TITLE_SUFFIXES = [
  /\s*[-|:·]\s*GitHub$/i,
  /\s*[-|:·]\s*GitLab$/i,
  /\s*[-|:·]\s*Forum.*$/i,
  /\s*[-|:·]\s*Wiki$/i,
  /\s*[-|:·]\s*Reddit$/i,
  /\s*[-|:·]\s*Discord$/i,
  /\s*[-|:·]\s*Steam\s*(Community)?$/i,
  /\s*::\s*.*$/i, // Steam-style "Title :: Subtitle"
  /\s*[-|]\s*[^-|]+$/i, // Generic "Title - Site Name" or "Title | Site Name"
];

/**
 * Maximum HTML length to process (50KB) to prevent performance issues
 */
const MAX_HTML_LENGTH = 50 * 1024;

/**
 * Generic fallback scraper implementation
 */
class GenericFallbackScraper extends BaseScraper {
  get name(): string {
    return 'generic-fallback';
  }

  /**
   * Accept any valid URL - this is the fallback scraper
   */
  matchesUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Limit HTML length to prevent performance issues on large pages
   */
  protected override preprocessHtml(html: string): string {
    return html.length > MAX_HTML_LENGTH ? html.slice(0, MAX_HTML_LENGTH) : html;
  }

  /**
   * Clean generic title by removing common site suffixes
   */
  protected override cleanTitle(title: string): string {
    let cleaned = title.trim();
    for (const suffix of GENERIC_TITLE_SUFFIXES) {
      cleaned = cleaned.replace(suffix, '').trim();
    }
    return cleaned;
  }

  // Uses default findContentArea from BaseScraper (article > main > body)
  // Uses default getHeaderPattern from BaseScraper (h1-h4)
}

export const genericFallbackScraper = new GenericFallbackScraper();
