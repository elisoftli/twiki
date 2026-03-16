/**
 * Scraper Interface
 *
 * Defines the interface for hoster-specific page scrapers that extract
 * metadata (title, installation instructions) from download source pages.
 */

/**
 * Content extracted by a scraper from a page
 */
export interface ScrapedContent {
  /** Title of the content (e.g., mod name) */
  title?: string;
  /** Installation instructions as raw HTML (will be converted to markdown) */
  instructionsHtml?: string;
}

/**
 * Interface for hoster-specific scrapers
 */
export interface HosterScraper {
  /** Unique name for this scraper */
  name: string;

  /**
   * Check if this scraper handles the given URL
   * @param url The page URL
   * @returns true if this scraper can handle the URL
   */
  matchesUrl(url: string): boolean;

  /**
   * Extract content from the page HTML
   * @param html The page HTML content
   * @returns Extracted content or null if extraction failed
   */
  extractContent(html: string): ScrapedContent | null;
}
