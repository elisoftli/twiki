/**
 * Scraper Registry
 *
 * Central registry for all hoster-specific page scrapers.
 * Add new scrapers here to make them available for content extraction.
 *
 * To add a new scraper:
 * 1. Create a new file extending BaseScraper (see nexusmods.scraper.ts as example)
 * 2. Implement `name` getter and `matchesUrl()` method
 * 3. Override extraction methods as needed for site-specific behavior
 * 4. Import and add to the scrapers array below (BEFORE genericFallbackScraper)
 */

import type { HosterScraper, ScrapedContent } from './scraper.interface';
import { nexusmodsScraper } from './nexusmods.scraper';
import { genericFallbackScraper } from './generic-fallback.scraper';

// Export types and base class for creating new scrapers
export type { HosterScraper, ScrapedContent };
export {
  BaseScraper,
  INSTRUCTION_KEYWORDS,
  NOISE_HEADER_PATTERNS,
  NOISE_KEYWORDS,
  isInstructionHeader,
  isNoiseHeader,
  isNoiseContent,
} from './base-scraper.utils';

// Export markdown extractor for non-HTML sources (e.g., GitHub release bodies)
export { extractInstructionsFromMarkdown } from './markdown-extractor.utils';
export type { ExtractedMarkdownContent } from './markdown-extractor.utils';

// Export BBCode instruction extractor for NexusMods API descriptions
export { extractInstructionsFromBBCode } from './bbcode.extractor.utils';

// Registry of all available scrapers
// IMPORTANT: genericFallbackScraper must be LAST - it matches any valid URL
const scrapers: HosterScraper[] = [
  nexusmodsScraper,
  // Add more site-specific scrapers here...
  genericFallbackScraper, // Must be last - fallback for unrecognized sites
];

/**
 * Find a scraper that can handle the given URL
 * @param url The page URL
 * @returns The matching scraper or undefined if none match
 */
export function findScraperForUrl(url: string): HosterScraper | undefined {
  return scrapers.find((scraper) => scraper.matchesUrl(url));
}

/**
 * Try to extract content from HTML using the appropriate scraper
 * @param url The page URL (used to select the scraper)
 * @param html The page HTML content
 * @returns Extracted content or null if no scraper matches or extraction failed
 */
export function extractContentFromPage(url: string, html: string): ScrapedContent | null {
  const scraper = findScraperForUrl(url);
  if (!scraper) {
    return null;
  }

  return scraper.extractContent(html);
}
