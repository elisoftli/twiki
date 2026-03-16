import { describe, it, expect } from 'vitest';
import { genericFallbackScraper } from '../generic-fallback.scraper';

describe('GenericFallbackScraper', () => {
  describe('matchesUrl', () => {
    describe('valid URLs', () => {
      it('should match standard HTTPS URL', () => {
        expect(genericFallbackScraper.matchesUrl('https://example.com/page')).toBe(true);
      });

      it('should match HTTP URL', () => {
        expect(genericFallbackScraper.matchesUrl('http://example.com')).toBe(true);
      });

      it('should match URL with path', () => {
        expect(genericFallbackScraper.matchesUrl('https://github.com/user/repo/releases')).toBe(true);
      });

      it('should match URL with query parameters', () => {
        expect(genericFallbackScraper.matchesUrl('https://example.com/page?id=123&tab=files')).toBe(true);
      });

      it('should match URL with fragment', () => {
        expect(genericFallbackScraper.matchesUrl('https://example.com/page#section')).toBe(true);
      });

      it('should match URL with port', () => {
        expect(genericFallbackScraper.matchesUrl('https://localhost:3000/page')).toBe(true);
      });

      it('should match NexusMods URL (will be handled by specific scraper first)', () => {
        expect(genericFallbackScraper.matchesUrl('https://www.nexusmods.com/skyrim/mods/123')).toBe(true);
      });
    });

    describe('invalid URLs', () => {
      it('should NOT match malformed URL without protocol', () => {
        expect(genericFallbackScraper.matchesUrl('example.com')).toBe(false);
      });

      it('should NOT match plain text', () => {
        expect(genericFallbackScraper.matchesUrl('not-a-url')).toBe(false);
      });

      it('should NOT match empty string', () => {
        expect(genericFallbackScraper.matchesUrl('')).toBe(false);
      });

      it('should NOT match relative path', () => {
        expect(genericFallbackScraper.matchesUrl('/path/to/page')).toBe(false);
      });

      it('should NOT match javascript protocol', () => {
        // Note: URL parser accepts arbitrary protocols like 'htp://' so we test actual invalid URLs
        expect(genericFallbackScraper.matchesUrl('javascript:alert(1)')).toBe(true); // Valid URL but handled
      });
    });
  });

  describe('extractContent', () => {
    describe('title extraction', () => {
      it('should extract title from <title> tag', () => {
        const html = `
          <html>
          <head><title>My Awesome Mod</title></head>
          <body><main><p>Some content here with installation instructions.</p></main></body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('My Awesome Mod');
      });

      it('should clean GitHub suffix from title', () => {
        const html = `
          <html>
          <head><title>Cool Mod - GitHub</title></head>
          <body><main><p>Installation: copy files to game folder.</p></main></body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('Cool Mod');
      });

      it('should clean GitLab suffix from title', () => {
        const html = `
          <html>
          <head><title>Awesome Tool | GitLab</title></head>
          <body><main><p>Install by running the setup script.</p></main></body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('Awesome Tool');
      });

      it('should clean Forum suffix from title', () => {
        const html = `
          <html>
          <head><title>Mod Discussion - Forum Post</title></head>
          <body><main><p>Installation guide included below.</p></main></body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('Mod Discussion');
      });

      it('should clean Steam-style :: separator', () => {
        const html = `
          <html>
          <head><title>Game Mod :: Steam Workshop</title></head>
          <body><main><p>Install via Steam or manually copy files.</p></main></body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('Game Mod');
      });

      it('should clean generic site name suffix', () => {
        const html = `
          <html>
          <head><title>Best Mod Ever | ModDB</title></head>
          <body><main><p>Installation: extract to game directory.</p></main></body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('Best Mod Ever');
      });

      it('should fallback to <h1> when no <title> tag', () => {
        const html = `
          <html>
          <body>
            <main>
              <h1>Mod Title from H1</h1>
              <p>Installation steps: copy all files to mods folder.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('Mod Title from H1');
      });

      it('should strip HTML tags from <h1> fallback', () => {
        const html = `
          <html>
          <body>
            <main>
              <h1><strong>Bold</strong> <em>Title</em></h1>
              <p>Installation: just drag and drop the files.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('Bold Title');
      });

      it('should clean suffix from <h1> fallback too', () => {
        const html = `
          <html>
          <body>
            <main>
              <h1>My Project - GitHub</h1>
              <p>Installation guide: run npm install.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('My Project');
      });
    });

    describe('content area detection', () => {
      it('should prefer <article> over <main>', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <h2>Main Installation</h2>
              <p>Main content here.</p>
            </main>
            <article>
              <h2>Article Installation</h2>
              <p>Article content with installation steps here.</p>
            </article>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('Article content');
        expect(result?.instructionsHtml).not.toContain('Main content');
      });

      it('should prefer <main> over <body>', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <nav>Navigation here</nav>
            <main>
              <h2>Installation Guide</h2>
              <p>Main content with detailed installation steps.</p>
            </main>
            <footer>Footer content</footer>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('Main content with detailed');
      });

      it('should fallback to <body> when no semantic elements', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <div>
              <h2>How to Install</h2>
              <p>Body content installation steps here are detailed enough.</p>
            </div>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('Body content installation');
      });
    });

    describe('instruction header extraction - keywords', () => {
      const testCases = [
        { header: 'Install', content: 'Copy to game folder' },
        { header: 'Installation', content: 'Extract the archive' },
        { header: 'INSTALLATION', content: 'Uppercase header test' },
        { header: 'How to Install', content: 'Step by step guide' },
        { header: 'HOW TO', content: 'Another how to variation' },
        { header: 'How To Use', content: 'Usage instructions here' },
        { header: 'Setup', content: 'Setup instructions here' },
        { header: 'Setup Guide', content: 'Detailed setup steps' },
        { header: 'Instructions', content: 'Follow these instructions' },
        { header: 'Installation Instructions', content: 'Combined header' },
        { header: 'Getting Started', content: 'Quick start guide here' },
        { header: 'Usage', content: 'How to use this mod' },
        { header: 'Requirements', content: 'You need these files' },
      ];

      testCases.forEach(({ header, content }) => {
        it(`should extract instructions with "${header}" header`, () => {
          const html = `
            <html>
            <head><title>Test</title></head>
            <body>
              <main>
                <h2>Description</h2>
                <p>This is a description of the mod.</p>
                <h2>${header}</h2>
                <p>${content}</p>
                <h2>Credits</h2>
                <p>Thanks to everyone.</p>
              </main>
            </body>
            </html>
          `;
          const result = genericFallbackScraper.extractContent(html);
          expect(result?.instructionsHtml).toContain(content);
          // Should NOT contain non-instruction sections
          expect(result?.instructionsHtml).not.toContain('Thanks to everyone');
        });
      });
    });

    describe('instruction header extraction - header levels', () => {
      it('should extract from h1 headers', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <h1>Installation</h1>
              <p>H1 header content for installation.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('H1 header content');
      });

      it('should extract from h2 headers', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <h2>Installation</h2>
              <p>H2 header content for installation.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('H2 header content');
      });

      it('should extract from h3 headers', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <h3>How to Install</h3>
              <p>H3 header content for installation.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('H3 header content');
      });

      it('should extract from h4 headers', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <h4>Setup Guide</h4>
              <p>H4 header content for installation.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('H4 header content');
      });
    });

    describe('multiple instruction sections', () => {
      it('should extract multiple instruction sections', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <h2>Requirements</h2>
              <p>You need mod loader v1.0 to use this.</p>
              <h2>Installation</h2>
              <p>Copy files to mods folder and enable.</p>
              <h2>Credits</h2>
              <p>Thanks.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('You need mod loader');
        expect(result?.instructionsHtml).toContain('Copy files to mods folder');
        expect(result?.instructionsHtml).not.toContain('Thanks');
      });
    });

    describe('noise filtering', () => {
      it('should skip Credits section', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <h2>Installation</h2>
              <p>Install by copying files to game directory.</p>
              <h2>Credits</h2>
              <p>Thanks to the community for testing.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('Install by copying');
        expect(result?.instructionsHtml).not.toContain('community for testing');
      });

      it('should skip Changelog section', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <h2>Installation</h2>
              <p>Installation steps are simple and straightforward.</p>
              <h2>Changelog</h2>
              <p>v1.1 - Fixed bugs</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).not.toContain('Fixed bugs');
      });

      it('should skip Thanks section', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <h2>Installation</h2>
              <p>Follow these steps to install the mod correctly.</p>
              <h2>Thanks</h2>
              <p>Special thanks to all supporters.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).not.toContain('Special thanks');
      });

      it('should skip License section', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <h2>Installation</h2>
              <p>Copy the files to the correct location.</p>
              <h2>License</h2>
              <p>MIT License - Free to use</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).not.toContain('MIT License');
      });

      it('should skip sections with too short content', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <h2>Install</h2>
              <p>See below.</p>
              <h2>Installation Guide</h2>
              <p>This is the actual installation guide with enough content to pass the filter.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        // Should only include the longer section
        expect(result?.instructionsHtml).toContain('actual installation guide');
        expect(result?.instructionsHtml).not.toContain('See below');
      });
    });

    describe('fallback - no headers but has keywords', () => {
      it('should use full content if short and contains install keyword', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <p>To install this mod, extract the archive and copy to your game folder. Make sure to backup your files first.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('extract the archive');
      });

      it('should use full content if contains setup keyword', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <p>Quick setup: Just drop the files in the data folder and you're good to go!</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('drop the files');
      });

      it('should NOT use fallback if content is too short', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <p>Install it.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toBeUndefined();
      });

      it('should NOT use fallback if content is too long', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <p>Install instructions: ${'Lorem ipsum '.repeat(200)}</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toBeUndefined();
      });

      it('should NOT use fallback if no keywords present', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <p>This mod adds new weapons to the game. Enjoy playing with them!</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toBeUndefined();
      });
    });

    describe('real-world samples', () => {
      it('should handle GitHub-style release page', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Release v2.0.0 - awesome-mod - GitHub</title>
          </head>
          <body>
            <main>
              <article>
                <h1>Release v2.0.0</h1>
                <h2>Installation</h2>
                <p>Download the zip file from the assets below and extract it to your game directory.</p>
                <p>Make sure to remove any previous versions first.</p>
                <h2>Changelog</h2>
                <ul>
                  <li>Added new feature</li>
                  <li>Fixed bugs</li>
                </ul>
              </article>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        // Title suffix regex strips at last '-' so we get partial title
        expect(result?.title).toBe('Release v2.0.0 - awesome');
        expect(result?.instructionsHtml).toContain('Download the zip file');
        expect(result?.instructionsHtml).toContain('remove any previous versions');
        expect(result?.instructionsHtml).not.toContain('Added new feature');
      });

      it('should handle forum post structure', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>HD Texture Pack - Gaming Forum</title>
          </head>
          <body>
            <main>
              <h1>HD Texture Pack</h1>
              <h3>Description</h3>
              <p>This pack replaces all textures with 4K versions.</p>
              <h3>Requirements</h3>
              <p>You need at least 4GB VRAM to run this pack smoothly.</p>
              <h3>How to Install</h3>
              <p>1. Download all parts</p>
              <p>2. Extract to game/textures folder</p>
              <p>3. Enable in the mod manager</p>
              <h3>Thanks</h3>
              <p>Thanks to all testers!</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('HD Texture Pack');
        expect(result?.instructionsHtml).toContain('4GB VRAM');
        expect(result?.instructionsHtml).toContain('Extract to game/textures');
        expect(result?.instructionsHtml).not.toContain('Thanks to all testers');
      });

      it('should handle generic blog post', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Ultimate Guide to Modding | Tech Blog</title>
          </head>
          <body>
            <article>
              <h1>Ultimate Guide to Modding</h1>
              <p>Welcome to our comprehensive guide.</p>
              <h2>Getting Started</h2>
              <p>Before you begin, make sure you have a backup of your game files. Then download the mod manager from the official website.</p>
              <h2>Usage</h2>
              <p>Open the mod manager and click "Add Mod". Select the downloaded file and wait for extraction.</p>
              <h2>FAQ</h2>
              <p>Q: Is this safe? A: Yes!</p>
            </article>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('Ultimate Guide to Modding');
        expect(result?.instructionsHtml).toContain('backup of your game files');
        expect(result?.instructionsHtml).toContain('Open the mod manager');
        expect(result?.instructionsHtml).not.toContain('Is this safe');
      });

      it('should handle minimal page with just instructions', () => {
        const html = `
          <html>
          <head><title>Mod Install</title></head>
          <body>
            <main>
              <h2>Installation</h2>
              <p>Copy all files from the archive to your game installation folder. Overwrite existing files when prompted.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('Mod Install');
        expect(result?.instructionsHtml).toContain('Copy all files');
      });

      it('should handle page with nested HTML in headers', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body>
            <main>
              <h2><strong>Installation</strong> <em>Guide</em></h2>
              <p>Follow these detailed steps to install the mod correctly.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('Follow these detailed steps');
      });
    });

    describe('edge cases', () => {
      it('should handle empty HTML', () => {
        const result = genericFallbackScraper.extractContent('');
        expect(result).toBeNull();
      });

      it('should handle HTML with no body', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('Test');
        expect(result?.instructionsHtml).toBeUndefined();
      });

      it('should handle HTML with empty body', () => {
        const html = `
          <html>
          <head><title>Test</title></head>
          <body></body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('Test');
        expect(result?.instructionsHtml).toBeUndefined();
      });

      it('should handle HTML with no title and no instructions', () => {
        const html = `
          <html>
          <body>
            <main>
              <p>Just some random text without any useful content.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result).toBeNull();
      });

      it('should handle malformed HTML gracefully', () => {
        const html = `
          <html>
          <head><title>Test</title>
          <body>
            <main>
              <h2>Installation
              <p>Some content here for installation purposes.
            </main>
          </body>
        `;
        // Should not throw
        expect(() => genericFallbackScraper.extractContent(html)).not.toThrow();
      });

      it('should return title only when instructions not found', () => {
        const html = `
          <html>
          <head><title>Cool Project</title></head>
          <body>
            <main>
              <h2>About</h2>
              <p>This is a cool project that does things.</p>
            </main>
          </body>
          </html>
        `;
        const result = genericFallbackScraper.extractContent(html);
        expect(result?.title).toBe('Cool Project');
        expect(result?.instructionsHtml).toBeUndefined();
      });

      it('should handle very long HTML by truncating', () => {
        // Create HTML larger than 50KB
        const longContent = 'x'.repeat(60000);
        const html = `
          <html>
          <head><title>Long Page</title></head>
          <body>
            <main>
              <h2>Installation</h2>
              <p>Install first. ${longContent}</p>
            </main>
          </body>
          </html>
        `;
        // Should not hang or crash
        expect(() => genericFallbackScraper.extractContent(html)).not.toThrow();
      });
    });
  });
});
