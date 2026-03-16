import { describe, it, expect } from 'vitest';
import { findScraperForUrl, extractContentFromPage } from '../index';

describe('Scraper Registry', () => {
  describe('findScraperForUrl', () => {
    it('should return NexusMods scraper for NexusMods mod page', () => {
      const scraper = findScraperForUrl('https://www.nexusmods.com/skyrim/mods/123');
      expect(scraper).toBeDefined();
      expect(scraper!.name).toBe('nexusmods');
    });

    it('should return NexusMods scraper for NexusMods mod page with description tab', () => {
      const scraper = findScraperForUrl('https://www.nexusmods.com/skyrim/mods/123?tab=description');
      expect(scraper).toBeDefined();
      expect(scraper!.name).toBe('nexusmods');
    });

    it('should NOT return NexusMods scraper for NexusMods files tab', () => {
      const scraper = findScraperForUrl('https://www.nexusmods.com/skyrim/mods/123?tab=files');
      // Should fall through to generic-fallback
      expect(scraper).toBeDefined();
      expect(scraper!.name).toBe('generic-fallback');
    });

    it('should return generic-fallback for non-NexusMods URLs', () => {
      const scraper = findScraperForUrl('https://github.com/user/repo/releases');
      expect(scraper).toBeDefined();
      expect(scraper!.name).toBe('generic-fallback');
    });

    it('should return generic-fallback for unknown hosting sites', () => {
      const scraper = findScraperForUrl('https://example.com/mod/download');
      expect(scraper).toBeDefined();
      expect(scraper!.name).toBe('generic-fallback');
    });

    it('should return undefined for invalid URLs', () => {
      const scraper = findScraperForUrl('not-a-url');
      expect(scraper).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const scraper = findScraperForUrl('');
      expect(scraper).toBeUndefined();
    });

    it('should return undefined for relative paths', () => {
      const scraper = findScraperForUrl('/path/to/page');
      expect(scraper).toBeUndefined();
    });

    it('should prioritize NexusMods scraper over generic-fallback', () => {
      // Both scrapers would match this URL, but NexusMods should be checked first
      const scraper = findScraperForUrl('https://www.nexusmods.com/skyrim/mods/456');
      expect(scraper!.name).toBe('nexusmods');
    });
  });

  describe('extractContentFromPage', () => {
    it('should extract content using NexusMods scraper for NexusMods URLs', () => {
      const html = `
        <html>
        <head><title>Test Mod at Skyrim Nexus - Mods</title></head>
        <body>
          <div id="mod_description_container">
            <h2>Installation</h2>
            <p>Copy files to your game directory.</p>
          </div>
        </div>
        </body>
        </html>
      `;
      const result = extractContentFromPage('https://www.nexusmods.com/skyrim/mods/123', html);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Test Mod');
      expect(result!.instructionsHtml).toContain('Copy files to your game directory');
    });

    it('should extract content using generic-fallback for non-NexusMods URLs', () => {
      const html = `
        <html>
        <head><title>My Mod - GitHub</title></head>
        <body>
          <main>
            <h2>Installation</h2>
            <p>Download and extract to your game folder.</p>
          </main>
        </body>
        </html>
      `;
      const result = extractContentFromPage('https://github.com/user/repo', html);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('My Mod');
      expect(result!.instructionsHtml).toContain('Download and extract');
    });

    it('should return null for invalid URLs', () => {
      const result = extractContentFromPage('not-a-url', '<html><body>content</body></html>');
      expect(result).toBeNull();
    });

    it('should return null when extraction yields no content', () => {
      const html = '<html><body></body></html>';
      const result = extractContentFromPage('https://example.com', html);
      expect(result).toBeNull();
    });

    it('should return title-only when instructions not found', () => {
      const html = `
        <html>
        <head><title>Cool Project</title></head>
        <body>
          <main>
            <p>Just some random text about the project.</p>
          </main>
        </body>
        </html>
      `;
      const result = extractContentFromPage('https://example.com', html);
      expect(result?.title).toBe('Cool Project');
      expect(result?.instructionsHtml).toBeUndefined();
    });
  });
});
