import { describe, it, expect } from 'vitest';
import { nexusmodsScraper } from '../nexusmods.scraper';

describe('NexusModsScraper', () => {
  describe('matchesUrl', () => {
    describe('valid mod page URLs', () => {
      it('should match standard mod page URL', () => {
        expect(nexusmodsScraper.matchesUrl('https://www.nexusmods.com/robocoproguecity/mods/19')).toBe(true);
      });

      it('should match mod page URL without www', () => {
        expect(nexusmodsScraper.matchesUrl('https://nexusmods.com/skyrim/mods/12345')).toBe(true);
      });

      it('should match mod page URL with trailing slash', () => {
        expect(nexusmodsScraper.matchesUrl('https://www.nexusmods.com/fallout4/mods/999/')).toBe(true);
      });

      it('should match mod page URL with description tab', () => {
        expect(nexusmodsScraper.matchesUrl('https://www.nexusmods.com/skyrim/mods/123?tab=description')).toBe(true);
      });
    });

    describe('invalid URLs - other tabs', () => {
      it('should NOT match files tab', () => {
        expect(nexusmodsScraper.matchesUrl('https://www.nexusmods.com/skyrim/mods/123?tab=files')).toBe(false);
      });

      it('should NOT match images tab', () => {
        expect(nexusmodsScraper.matchesUrl('https://www.nexusmods.com/skyrim/mods/123?tab=images')).toBe(false);
      });

      it('should NOT match posts tab', () => {
        expect(nexusmodsScraper.matchesUrl('https://www.nexusmods.com/skyrim/mods/123?tab=posts')).toBe(false);
      });

      it('should NOT match logs tab', () => {
        expect(nexusmodsScraper.matchesUrl('https://www.nexusmods.com/skyrim/mods/123?tab=logs')).toBe(false);
      });

      it('should NOT match files tab with file_id', () => {
        expect(nexusmodsScraper.matchesUrl('https://www.nexusmods.com/skyrim/mods/123?tab=files&file_id=456')).toBe(false);
      });
    });

    describe('invalid URLs - non-mod pages', () => {
      it('should NOT match NexusMods home page', () => {
        expect(nexusmodsScraper.matchesUrl('https://www.nexusmods.com/')).toBe(false);
      });

      it('should NOT match NexusMods game page', () => {
        expect(nexusmodsScraper.matchesUrl('https://www.nexusmods.com/skyrim')).toBe(false);
      });

      it('should NOT match NexusMods mods listing page', () => {
        expect(nexusmodsScraper.matchesUrl('https://www.nexusmods.com/skyrim/mods')).toBe(false);
      });

      it('should NOT match NexusMods user page', () => {
        expect(nexusmodsScraper.matchesUrl('https://www.nexusmods.com/users/12345')).toBe(false);
      });

      it('should NOT match non-NexusMods URL', () => {
        expect(nexusmodsScraper.matchesUrl('https://www.moddb.com/mods/test')).toBe(false);
      });

      it('should NOT match invalid URL', () => {
        expect(nexusmodsScraper.matchesUrl('not-a-url')).toBe(false);
      });
    });
  });

  describe('extractContent', () => {
    describe('title extraction', () => {
      it('should extract and clean title from <title> tag', () => {
        const html = `
          <html>
          <head>
            <title>Fast Launch (Skip Startup - Intro Videos) at RoboCop: Rogue City Nexus - Mods and community</title>
          </head>
          <body></body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.title).toBe('Fast Launch (Skip Startup - Intro Videos)');
      });

      it('should handle title without "at Game Nexus" suffix', () => {
        const html = `
          <html>
          <head><title>Simple Mod Title</title></head>
          <body></body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.title).toBe('Simple Mod Title');
      });

      it('should handle various game title formats', () => {
        const html = `
          <html>
          <head>
            <title>My Mod at Skyrim Special Edition Nexus - Mods and community</title>
          </head>
          <body></body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.title).toBe('My Mod');
      });
    });

    describe('description container extraction', () => {
      it('should extract from mod_description_container by id', () => {
        const html = `
          <html>
          <head><title>Test Mod at Game Nexus - Mods</title></head>
          <body>
            <div id="mod_description_container">
              <h2>Installation</h2>
              <p>Copy files to game folder.</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('Copy files to game folder');
      });

      it('should fallback to mod_description class when id not found', () => {
        const html = `
          <html>
          <head><title>Test Mod at Game Nexus - Mods</title></head>
          <body>
            <div class="mod_description">
              <h2>How to Install</h2>
              <p>Extract and copy.</p>
            </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('Extract and copy');
      });
    });

    describe('instruction header extraction - various wordings', () => {
      const testCases = [
        { header: 'Install', content: 'Copy to game folder' },
        { header: 'Installation', content: 'Extract the archive' },
        { header: 'INSTALLATION', content: 'Uppercase header test' },
        { header: 'How to Install', content: 'Step by step guide' },
        { header: 'HOW TO', content: 'Another how to variation' },
        { header: 'How To Use', content: 'Usage instructions' },
        { header: 'Setup', content: 'Setup instructions here' },
        { header: 'Setup Guide', content: 'Detailed setup' },
        { header: 'Instructions', content: 'Follow these instructions' },
        { header: 'Installation Instructions', content: 'Combined header' },
        { header: 'Getting Started', content: 'Quick start guide' },
        { header: 'Usage', content: 'How to use this mod' },
        { header: 'Requirements', content: 'You need these files' },
      ];

      testCases.forEach(({ header, content }) => {
        it(`should extract instructions with "${header}" header`, () => {
          const html = `
            <html>
            <head><title>Test at Game Nexus - Mods</title></head>
            <body>
              <div id="mod_description_container">
                <h2>Description</h2>
                <p>This mod does something cool.</p>
                <h2>${header}</h2>
                <p>${content}</p>
                <h2>Credits</h2>
                <p>Thanks to everyone.</p>
              </div>
            </div>
            </body>
            </html>
          `;
          const result = nexusmodsScraper.extractContent(html);
          expect(result?.instructionsHtml).toContain(content);
          // Should NOT contain credits section
          expect(result?.instructionsHtml).not.toContain('Thanks to everyone');
        });
      });
    });

    describe('instruction header extraction - different header levels', () => {
      it('should extract from h2 headers', () => {
        const html = `
          <html>
          <head><title>Test at Game Nexus - Mods</title></head>
          <body>
            <div id="mod_description_container">
              <h2>Installation</h2>
              <p>H2 header content.</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('H2 header content');
      });

      it('should extract from h3 headers', () => {
        const html = `
          <html>
          <head><title>Test at Game Nexus - Mods</title></head>
          <body>
            <div id="mod_description_container">
              <h3>How to Install</h3>
              <p>H3 header content.</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('H3 header content');
      });

      it('should extract from h4 headers', () => {
        const html = `
          <html>
          <head><title>Test at Game Nexus - Mods</title></head>
          <body>
            <div id="mod_description_container">
              <h4>Setup Guide</h4>
              <p>H4 header content.</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('H4 header content');
      });
    });

    describe('multiple instruction sections', () => {
      it('should extract multiple instruction sections', () => {
        const html = `
          <html>
          <head><title>Test at Game Nexus - Mods</title></head>
          <body>
            <div id="mod_description_container">
              <h2>Requirements</h2>
              <p>You need mod loader v1.0.</p>
              <h2>Installation</h2>
              <p>Copy files to mods folder.</p>
              <h2>Credits</h2>
              <p>Thanks.</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('You need mod loader');
        expect(result?.instructionsHtml).toContain('Copy files to mods folder');
        expect(result?.instructionsHtml).not.toContain('Thanks');
      });
    });

    describe('fallback - no headers but has keywords', () => {
      it('should use full description if short and contains install keyword', () => {
        const html = `
          <html>
          <head><title>Test at Game Nexus - Mods</title></head>
          <body>
            <div id="mod_description_container">
              <p>HOW TO: Extract and copy "Game" folder from archive into your game root folder.</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('Extract and copy');
      });

      it('should use full description if contains "install" keyword', () => {
        const html = `
          <html>
          <head><title>Test at Game Nexus - Mods</title></head>
          <body>
            <div id="mod_description_container">
              <p>To install this mod, simply extract the contents to your game directory.</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('extract the contents');
      });

      it('should use full description if contains "setup" keyword', () => {
        const html = `
          <html>
          <head><title>Test at Game Nexus - Mods</title></head>
          <body>
            <div id="mod_description_container">
              <p>Quick setup: Just drop the files in the data folder and enable in your mod manager.</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('drop the files');
      });
    });

    describe('fallback - no instructions found', () => {
      it('should return null instructionsHtml when description has no keywords', () => {
        const html = `
          <html>
          <head><title>Test at Game Nexus - Mods</title></head>
          <body>
            <div id="mod_description_container">
              <p>This is a cool mod that adds new weapons to the game. Enjoy!</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.title).toBe('Test');
        expect(result?.instructionsHtml).toBeUndefined();
      });

      it('should return null instructionsHtml when description is too short', () => {
        const html = `
          <html>
          <head><title>Test at Game Nexus - Mods</title></head>
          <body>
            <div id="mod_description_container">
              <p>Install it.</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.instructionsHtml).toBeUndefined();
      });

      it('should return null when no description container found', () => {
        const html = `
          <html>
          <head><title>Test at Game Nexus - Mods</title></head>
          <body>
            <div class="other_content">
              <p>This is not the description.</p>
            </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.title).toBe('Test');
        expect(result?.instructionsHtml).toBeUndefined();
      });
    });

    describe('noise filtering', () => {
      it('should skip sections with too short content', () => {
        const html = `
          <html>
          <head><title>Test at Game Nexus - Mods</title></head>
          <body>
            <div id="mod_description_container">
              <h2>Install</h2>
              <p>See below.</p>
              <h2>Installation Guide</h2>
              <p>This is the actual installation guide with enough content to pass the length check.</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        // Should only include the longer section
        expect(result?.instructionsHtml).toContain('actual installation guide');
      });
    });

    describe('complex real-world examples', () => {
      it('should handle typical NexusMods mod page structure', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Ultimate Graphics Overhaul at Skyrim Special Edition Nexus - Mods and community</title>
          </head>
          <body>
            <div id="mod_description_container">
              <h2>Description</h2>
              <p>This mod completely overhauls the graphics of Skyrim with 4K textures and improved lighting.</p>
              <h2>Features</h2>
              <ul>
                <li>4K textures for all landscapes</li>
                <li>Improved water effects</li>
                <li>Better lighting</li>
              </ul>
              <h2>Requirements</h2>
              <p>SKSE64 version 2.0 or higher is required.</p>
              <p>You also need at least 8GB VRAM.</p>
              <h2>Installation</h2>
              <p>1. Download the main file</p>
              <p>2. Extract the contents to your Skyrim/Data folder</p>
              <p>3. Enable the plugin in your mod manager</p>
              <p>4. Load order should be after base game textures</p>
              <h2>Changelog</h2>
              <p>v1.1 - Fixed water reflections</p>
              <p>v1.0 - Initial release</p>
              <h2>Credits</h2>
              <p>Thanks to Bethesda for making Skyrim</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);

        expect(result?.title).toBe('Ultimate Graphics Overhaul');

        // Should include Requirements and Installation
        expect(result?.instructionsHtml).toContain('SKSE64 version 2.0');
        expect(result?.instructionsHtml).toContain('Extract the contents');
        expect(result?.instructionsHtml).toContain('Enable the plugin');

        // Should NOT include Description, Features, Changelog, or Credits
        expect(result?.instructionsHtml).not.toContain('completely overhauls');
        expect(result?.instructionsHtml).not.toContain('4K textures for all landscapes');
        expect(result?.instructionsHtml).not.toContain('Fixed water reflections');
        expect(result?.instructionsHtml).not.toContain('Thanks to Bethesda');
      });

      it('should handle mod page with only HOW TO section', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Fast Launch (Skip Startup - Intro Videos) at RoboCop: Rogue City Nexus - Mods and community</title>
          </head>
          <body>
            <div class="mod_description">
              <p>Skips the intro videos and logos for faster launch.</p>
              <p>HOW TO:</p>
              <p>Extract and copy "Game" folder from .rar archive, into your Robocop Rogue City game root folder, replacing/overwriting already existing folder and files.</p>
            </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);

        expect(result?.title).toBe('Fast Launch (Skip Startup - Intro Videos)');
        // Fallback should catch "how to" in content
        expect(result?.instructionsHtml).toContain('Extract and copy');
      });

      it('should handle mod page with nested HTML in headers', () => {
        const html = `
          <html>
          <head><title>Test at Game Nexus - Mods</title></head>
          <body>
            <div id="mod_description_container">
              <h2><strong>Installation</strong> <em>Guide</em></h2>
              <p>Follow these steps to install.</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('Follow these steps');
      });

      it('should handle mod page with special characters in title', () => {
        const html = `
          <html>
          <head>
            <title>HD Texture Pack (4K/8K) - V2.0 at Game Nexus - Mods and community</title>
          </head>
          <body>
            <div id="mod_description_container">
              <h2>Installation</h2>
              <p>Copy to textures folder.</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.title).toBe('HD Texture Pack (4K/8K) - V2.0');
      });
    });

    describe('real NexusMods HTML structure', () => {
      it('should extract from mod_description_container class (not id)', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Bioshock - Native HDR (Luma) at Bioshock Nexus - Mods and Community</title>
          </head>
          <body>
            <div class="container mod_description_container condensed">
    <font size="3"><strong>This mods add proper native HDR tonemapping.</strong><br>Installation<br><ul class="disc"><li>Install ReShade 6.5.1 or higher with addon support. No ReShade effects are required.</li><li>Copy the mod files into the Bioshock installation folder.</li><li>Run the game and access the ReShade UI.</li></ul></font>
</div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.title).toBe('Bioshock - Native HDR (Luma)');
        expect(result?.instructionsHtml).toContain('Install ReShade');
        expect(result?.instructionsHtml).toContain('Copy the mod files');
      });

      it('should handle nested divs in description (e.g., youtube_container)', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head><title>Test Mod at Game Nexus - Mods</title></head>
          <body>
            <div class="container mod_description_container condensed">
    <font size="3">Description here.<br><div class="youtube_container"><iframe src="video"></iframe></div><br>Installation<br><ul><li>Step 1: Extract files.</li><li>Step 2: Copy to game folder.</li></ul></font>
</div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.instructionsHtml).toContain('Extract files');
        expect(result?.instructionsHtml).toContain('Copy to game folder');
      });

      it('should extract instructions from plain text markers using paragraph breaks', () => {
        // Real-world NexusMods structure: no headers, uses <br><br> as section separators
        const html = `
          <!DOCTYPE html>
          <html>
          <head><title>Native HDR (Luma) at Bioshock Nexus - Mods</title></head>
          <body>
            <div class="container mod_description_container condensed">
    <font size="3"><strong>This mods add proper native HDR tonemapping.</strong><br>It actually doesn't change much in the rendering.<br><br>Showcase<br><div class="youtube_container"><iframe src="video"></iframe></div><br><br>Installation<br><ul class="disc"><li>Install ReShade 6.5.1 or higher with addon support.</li><li>Copy the mod files into the game folder.</li><li>Run the game and access the ReShade UI.</li></ul><br><br>Credits<br>Thanks to ShortFuse and Musa for the help.</font>
</div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.title).toBe('Native HDR (Luma)');
        // Should extract Installation section
        expect(result?.instructionsHtml).toContain('Install ReShade');
        expect(result?.instructionsHtml).toContain('Copy the mod files');
        // Should NOT include the intro description
        expect(result?.instructionsHtml).not.toContain('native HDR tonemapping');
        // Should NOT include Showcase section
        expect(result?.instructionsHtml).not.toContain('Showcase');
        // Should NOT include Credits section
        expect(result?.instructionsHtml).not.toContain('Thanks to ShortFuse');
      });

      it('should extract multiple instruction sections from paragraph-based content', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head><title>Test Mod at Game Nexus - Mods</title></head>
          <body>
            <div class="container mod_description_container condensed">
    <font size="3">Cool mod description here.<br><br>Requirements<br>You need SKSE version 2.0.<br><br>Installation<br>Extract files to Data folder.<br><br>Changelog<br>v1.0 Initial release.</font>
</div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        // Should include both Requirements and Installation
        expect(result?.instructionsHtml).toContain('SKSE version 2.0');
        expect(result?.instructionsHtml).toContain('Extract files to Data folder');
        // Should NOT include description or changelog
        expect(result?.instructionsHtml).not.toContain('Cool mod description');
        expect(result?.instructionsHtml).not.toContain('Initial release');
      });

      it('should extract instructions from styled section markers (font size 4/5)', () => {
        // Real-world case: sections use <font size="5"><strong>Header</strong></font> patterns
        // and are separated by single <br>, not <br><br>
        const html = `
          <!DOCTYPE html>
          <html>
          <head><title>Death Stranding HDR Fix at Game Nexus - Mods</title></head>
          <body>
            <div class="container mod_description_container condensed">
    <font size="3">This mod fixes HDR issues.</font><br><font size="4"><strong>Features</strong></font><br><ul class="disc"><li>Better colors</li></ul><br><font size="5"><strong>Compatibility</strong></font><font size="3"><br></font><ul class="disc"><li>May not work with other mods.</li></ul><br><font size="5"><strong>Instructions:</strong></font><font size="3"><br></font><font size="3"><ul class="content_list"><li>Install ReShade 6.7.0 with add-on support</li><li>Copy addon64 into game folder</li><li>Run the game</li></ul><br></font><font size="5"><strong>About RenoDX</strong></font><font size="3"><br>RenoDX is a toolset.</font>
</div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.title).toBe('Death Stranding HDR Fix');
        // Should extract Instructions section
        expect(result?.instructionsHtml).toContain('Install ReShade 6.7.0');
        expect(result?.instructionsHtml).toContain('Copy addon64 into game folder');
        // Should NOT include Features (not an instruction keyword)
        expect(result?.instructionsHtml).not.toContain('Better colors');
        // Should NOT include Compatibility (noise keyword)
        expect(result?.instructionsHtml).not.toContain('May not work');
        // Should NOT include About section (noise keyword)
        expect(result?.instructionsHtml).not.toContain('RenoDX is a toolset');
      });

      it('should handle nested divs inside mod_description_container', () => {
        // Real-world case: container has a nested <div align="center"> for warnings/links
        // The key issue this tests: nested divs shouldn't cause content area extraction to fail
        const html = `
          <!DOCTYPE html>
          <html>
          <head><title>Death Stranding HDR Fix at Game Nexus - Mods</title></head>
          <body>
            <div class="container mod_description_container condensed" style="display: block;">
    <strong><div align="center"><font size="6">THIS IS A RESHADE ADDON NOT RESHADE FX</font><br><font size="6">MOD REQUIRES HDR ON IN GAME</font><br><br><font size="6">Links</font><br><font size="5"><a href="https://github.com/example" rel="nofollow">Github</a><br><a href="https://discord.gg/example" rel="nofollow">Discord</a></font></div></strong><br><font size="3">This mod fixes HDR implementation issues.<br></font><br><font size="5"><strong>Core Issues Fixed<br></strong></font><ul class="disc"><li><font size="3">Game uses per-channel tonemapping</font></li></ul><br><br><font size="5"><strong>Instructions:</strong></font><font size="3"><br></font><font size="3"><ul class="content_list content_list_ordered"><li>Install ReShade 6.7.0 with add-on support</li><li>Copy renodx-addon.addon64 into the game folder</li><li>Run the game</li></ul><br></font><br><br><font size="5"><strong>About RenoDX</strong></font><font size="3"><br>RenoDX is a toolset to mod games.</font>
</div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.title).toBe('Death Stranding HDR Fix');
        // Should extract Instructions section
        expect(result?.instructionsHtml).toContain('Install ReShade 6.7.0');
        expect(result?.instructionsHtml).toContain('Copy renodx-addon.addon64');
        // Should NOT include the warning header from nested div
        expect(result?.instructionsHtml).not.toContain('THIS IS A RESHADE ADDON');
        // Should NOT include About section (separated by <br><br> and filtered as noise)
        expect(result?.instructionsHtml).not.toContain('RenoDX is a toolset');
      });
    });

    describe('edge cases', () => {
      it('should handle empty HTML', () => {
        const result = nexusmodsScraper.extractContent('');
        expect(result).toBeNull();
      });

      it('should handle HTML with no title', () => {
        const html = `
          <html>
          <body>
            <div id="mod_description_container">
              <h2>Installation</h2>
              <p>Install instructions here.</p>
            </div>
          </div>
          </body>
          </html>
        `;
        const result = nexusmodsScraper.extractContent(html);
        expect(result?.title).toBeUndefined();
        expect(result?.instructionsHtml).toContain('Install instructions');
      });

      it('should handle malformed HTML gracefully', () => {
        const html = `
          <html>
          <head><title>Test at Game Nexus - Mods</title>
          <body>
            <div id="mod_description_container">
              <h2>Installation
              <p>Some content here.
            </div>
          </body>
        `;
        // Should not throw
        expect(() => nexusmodsScraper.extractContent(html)).not.toThrow();
      });
    });
  });
});
