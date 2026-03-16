import { describe, it, expect } from 'vitest';
import { extractInstructionsFromBBCode } from '../bbcode.extractor.utils';

describe('extractInstructionsFromBBCode', () => {
  // ==========================================================================
  // Edge cases / empty input
  // ==========================================================================

  describe('empty and invalid input', () => {
    it('should return null for empty string', () => {
      expect(extractInstructionsFromBBCode('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(extractInstructionsFromBBCode('   \n\t  ')).toBeNull();
    });

    it('should return null for null/undefined input', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(extractInstructionsFromBBCode(null as any)).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(extractInstructionsFromBBCode(undefined as any)).toBeNull();
    });

    it('should return null for description with no instruction sections', () => {
      const bbcode =
        'This is a great mod that changes textures.' +
        '<br /><br />Enjoy the new visuals!';
      expect(extractInstructionsFromBBCode(bbcode)).toBeNull();
    });
  });

  // ==========================================================================
  // Strategy 1: Header-based extraction
  // ==========================================================================

  describe('header-based extraction', () => {
    it('should extract section under [size=5][b]Install...[/b][/size] header', () => {
      const bbcode =
        '[size=5][b]Features[/b][/size]' +
        '<br />This mod changes many things.' +
        '<br /><br />' +
        '[size=5][b]Install SMAPI[/b][/size]' +
        '<br />Download the installer and run it.' +
        '<br />Follow the on-screen instructions.' +
        '<br /><br />' +
        '[size=5][b]Credits[/b][/size]' +
        '<br />Thanks to everyone.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('### Install SMAPI');
      expect(result).toContain('Download the installer and run it.');
      expect(result).not.toContain('Features');
      expect(result).not.toContain('Credits');
    });

    it('should extract section under [size=4][b]...[/b][/size] header (size 4)', () => {
      const bbcode =
        '[size=4][b]Description[/b][/size]' +
        '<br />A cool mod.' +
        '<br /><br />' +
        '[size=4][b]How to use[/b][/size]' +
        '<br />Copy the files to your game directory.' +
        '<br />Launch the game normally.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('### How to use');
      expect(result).toContain('Copy the files to your game directory.');
      expect(result).not.toContain('Description');
    });

    it('should extract section under [b][size=5]...[/size][/b] header (reversed order)', () => {
      const bbcode =
        '[b][size=5]Overview[/size][/b]' +
        '<br />Mod overview here.' +
        '<br /><br />' +
        '[b][size=5]Installation[/size][/b]' +
        '<br />Use a mod manager or install manually.' +
        '<br />Place files in the Data folder.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('### Installation');
      expect(result).toContain('Use a mod manager or install manually.');
      expect(result).not.toContain('Overview');
    });

    it('should extract section under [heading]...[/heading] tag', () => {
      const bbcode =
        '[heading]About[/heading]' +
        '<br />This mod does things.' +
        '<br /><br />' +
        '[heading]Installation Guide[/heading]' +
        '<br />Step 1: Download the file.' +
        '<br />Step 2: Extract to game folder.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('### Installation Guide');
      expect(result).toContain('Step 1: Download the file.');
    });

    it('should extract section with [color] wrapper around header', () => {
      const bbcode =
        '[color=#ff7700][size=4][b]Description[/b][/size][/color]' +
        '<br />Some text.' +
        '<br /><br />' +
        '[color=#ff7700][size=4][b]How to use[/b][/size][/color]' +
        '<br />Load the database file into the plugins directory.' +
        '<br />Call the initialization function.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('### How to use');
      expect(result).toContain('Load the database file');
    });

    it('should skip noise headers like Credits, Changelog, FAQ', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />Install with a mod manager.' +
        '<br /><br />' +
        '[size=5][b]Credits[/b][/size]' +
        '<br />Thanks to the community.' +
        '<br /><br />' +
        '[size=5][b]Changelog[/b][/size]' +
        '<br />v1.0 - Initial release.' +
        '<br /><br />' +
        '[size=5][b]FAQ[/b][/size]' +
        '<br />Q: Does it work? A: Yes.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('### Installation');
      expect(result).not.toContain('Credits');
      expect(result).not.toContain('Changelog');
      expect(result).not.toContain('FAQ');
    });

    it('should skip headers with too-short content', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />Short.' +
        '<br /><br />' +
        '[size=5][b]Setup Guide[/b][/size]' +
        '<br />Extract the archive to your game folder and run the installer.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      // "Short." is < MIN_SECTION_LENGTH, so Installation section is skipped
      expect(result).toContain('### Setup Guide');
    });

    it('should extract multiple instruction sections', () => {
      const bbcode =
        '[size=5][b]Requirements[/b][/size]' +
        '<br />You need SKSE64 installed first.' +
        '<br /><br />' +
        '[size=5][b]Features[/b][/size]' +
        '<br />New UI layout.' +
        '<br /><br />' +
        '[size=5][b]Installation[/b][/size]' +
        '<br />Download and extract to Data folder.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('### Requirements');
      expect(result).toContain('### Installation');
      expect(result).not.toContain('Features');
    });

    it('should handle headers with leading <br /> tags', () => {
      const bbcode =
        'Some intro text.' +
        '<br /><br />' +
        '<br />[size=5][b]Installation[/b][/size]' +
        '<br />Extract files to the game directory.' +
        '<br />Overwrite when prompted.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('### Installation');
    });

    it('should handle literal newlines in the BBCode source', () => {
      const bbcode =
        '[size=5][b]Features\n[/b][/size]\n' +
        '<br />Some features here.\n' +
        '<br /><br />\n' +
        '[size=5][b]Install\n[/b][/size]\n' +
        '<br />Extract to game folder and run setup.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('### Install');
    });
  });

  // ==========================================================================
  // Strategy 2: Paragraph-based extraction
  // ==========================================================================

  describe('paragraph-based extraction', () => {
    it('should extract paragraphs starting with instruction keywords', () => {
      const bbcode =
        'This mod overhauls combat mechanics.' +
        '<br /><br />' +
        'Installation: Download the file and extract the contents to your game directory.' +
        '<br /><br />' +
        'Credits: Thanks to the modding community.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('Download the file and extract the contents');
      expect(result).not.toContain('Credits');
    });

    it('should capture consecutive paragraphs after an instruction keyword', () => {
      const bbcode =
        'Description of the mod.' +
        '<br /><br />' +
        'Install: First download the mod.' +
        '<br /><br />' +
        'Then extract to your game folder.' +
        '<br /><br />' +
        'Credits: Thanks everyone.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('First download the mod');
      expect(result).toContain('Then extract to your game folder');
      expect(result).not.toContain('Credits');
    });

    it('should stop capturing at noise keywords', () => {
      const bbcode =
        'Usage: Run the executable and configure settings as needed.' +
        '<br /><br />' +
        'Adjust the values in the config file to your liking.' +
        '<br /><br />' +
        'Changelog: v1.0 - Initial release.' +
        '<br /><br />' +
        'v0.9 - Beta release.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('Run the executable');
      expect(result).not.toContain('Changelog');
      expect(result).not.toContain('Beta release');
    });

    it('should return null when no paragraphs match keywords', () => {
      const bbcode =
        'This mod is amazing.' +
        '<br /><br />' +
        'It has great features.' +
        '<br /><br />' +
        'Enjoy!';
      expect(extractInstructionsFromBBCode(bbcode)).toBeNull();
    });
  });

  // ==========================================================================
  // BBCode → Markdown conversion
  // ==========================================================================

  describe('BBCode to Markdown conversion', () => {
    it('should convert [b] to **bold**', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />[b]Important:[/b] Extract all files to the game root.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toContain('**Important:**');
    });

    it('should convert [i] to *italic*', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />[i]Note: this step is optional.[/i] Extract files to game dir.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toContain('*Note: this step is optional.*');
    });

    it('should convert [s] to ~~strikethrough~~', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />[s]Old method[/s] Use the new installer instead of manual copy.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toContain('~~Old method~~');
    });

    it('should strip [u] underline (no markdown equivalent)', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />[u]Download[/u] the file and extract to the game directory.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('Download');
      expect(result).not.toContain('[u]');
    });

    it('should convert [url=href]text[/url] to [text](href)', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />Download from [url=https://example.com]the official site[/url] and install.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toContain('[the official site](https://example.com)');
    });

    it('should convert [url]href[/url] to [href](href)', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />Visit [url]https://example.com/download[/url] for the latest version.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toContain('[https://example.com/download](https://example.com/download)');
    });

    it('should convert [code] to fenced code blocks', () => {
      const bbcode =
        '[size=5][b]How to use[/b][/size]' +
        '<br />Add this to your config:' +
        '<br />[code]bEnableDebug=1<br />iMaxFPS=60[/code]';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toContain('```');
      expect(result).toContain('bEnableDebug=1');
      expect(result).toContain('iMaxFPS=60');
    });

    it('should convert [list] with [*] items to markdown list', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />[list]' +
        '[*]Download the file' +
        '[*]Extract to game folder' +
        '[*]Run the game' +
        '[/list]';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toContain('- Download the file');
      expect(result).toContain('- Extract to game folder');
      expect(result).toContain('- Run the game');
    });

    it('should strip [img] tags', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />[img]https://example.com/screenshot.png[/img]' +
        '<br />Extract to game folder and overwrite files.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toContain('screenshot.png');
      expect(result).not.toContain('[img]');
      expect(result).toContain('Extract to game folder');
    });

    it('should strip [img] tags with attributes', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />[img width=20,height=20]https://example.com/icon.png[/img]' +
        '<br />Follow the steps below to install this mod.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toContain('icon.png');
      expect(result).toContain('Follow the steps below');
    });

    it('should strip decorative tags (color, size, font, center)', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />[color=#ff0000][b]Warning:[/b][/color] Make a backup first.' +
        '<br />[center]Step 1: Extract files[/center]';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toContain('**Warning:**');
      expect(result).toContain('Make a backup first');
      expect(result).toContain('Step 1: Extract files');
      expect(result).not.toContain('[color');
      expect(result).not.toContain('[center]');
    });

    it('should convert [quote] to blockquote', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />[quote]Place the DLL in your game root folder.[/quote]' +
        '<br />Then configure the INI file as needed for your system.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toContain('> Place the DLL in your game root folder.');
    });

    it('should convert horizontal rules ([line] and [hr])', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />Step 1: Download the mod from the files tab.' +
        '[line]' +
        'Step 2: Extract to the game directory and overwrite.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toContain('---');
    });

    it('should convert [heading] within content to #### sub-header', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />[heading]Manual Install[/heading]' +
        '<br />Copy files to the Data folder and run the patcher.' +
        '<br />[heading]Mod Manager[/heading]' +
        '<br />Use Vortex or MO2 to install the downloaded archive.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toContain('#### Manual Install');
      expect(result).toContain('#### Mod Manager');
    });

    it('should strip [youtube] embeds', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />[youtube]dQw4w9WgXcQ[/youtube]' +
        '<br />Follow the video tutorial or read the steps below.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toContain('dQw4w9WgXcQ');
      expect(result).toContain('Follow the video tutorial');
    });

    it('should unwrap [spoiler] content', () => {
      const bbcode =
        '[size=5][b]How to install[/b][/size]' +
        '<br />[spoiler]Extract the archive to your game directory and overwrite.[/spoiler]';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toContain('Extract the archive to your game directory');
    });

    it('should convert <br /> to newlines in output', () => {
      const bbcode =
        '[size=5][b]Installation[/b][/size]' +
        '<br />Line 1: Download the mod.' +
        '<br />Line 2: Extract it.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toContain('Line 1: Download the mod.\nLine 2: Extract it.');
    });
  });

  // ==========================================================================
  // Real-world-like BBCode patterns from NexusMods API
  // ==========================================================================

  describe('real-world patterns', () => {
    it('should extract install instructions from SMAPI-like description', () => {
      const bbcode =
        '[b]SMAPI [/b]is the mod loader for Stardew Valley.' +
        '<br /><br />' +
        '[size=5][b]Install SMAPI[/b][/size]' +
        '<br />See the [url=https://stardewvalleywiki.com/Modding:Player_Guide]player\'s guide[/url].' +
        '<br /><br />' +
        '[size=5][b]Get help[/b][/size]' +
        '<br />[list][*]See the wiki![/list]' +
        '<br /><br />' +
        '[size=5][b]See also[/b][/size]' +
        '<br />[list][*]Release notes[/list]';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('### Install SMAPI');
      expect(result).toContain("player's guide");
      expect(result).not.toContain('### Get help');
      expect(result).not.toContain('### See also');
    });

    it('should extract install instructions from Address Library-like description', () => {
      const bbcode =
        '[color=#ff6060][size=5][b]IMPORTANT![/b][/size][/color]' +
        '<br /><br />' +
        '[color=#ff7700][size=4][b]Description[/b][/size][/color]' +
        '<br />For regular mod users: Download the all-in-one package.' +
        '<br /><br />' +
        '[color=#ff7700][size=4][b]How to use[/b][/size][/color]' +
        '<br />The quickest way:' +
        '<br />[spoiler]' +
        '<br />[code]#include "versiondb.h"<br />VersionDb db;<br />db.Load();[/code]' +
        '<br />[/spoiler]';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('### How to use');
      expect(result).toContain('The quickest way:');
      expect(result).toContain('```');
      expect(result).toContain('#include "versiondb.h"');
    });

    it('should return null for description without keyword-starting paragraphs or instruction headers', () => {
      // Cyber Engine Tweaks-like: installation info is embedded mid-sentence,
      // no paragraphs start with instruction keywords, no instruction headers
      const bbcode =
        '[b]Cyber Engine Tweaks[/b] is a framework for scripting mods.' +
        '<br /><br />' +
        'As it stands the recommended method of installation is manual installation.' +
        ' Just drop the content of the zip file in the root folder of your game install.' +
        '<br /><br />' +
        '[b][size=4]IMPORTANT!!![/size][/b]' +
        '<br />You may need to install the latest Visual C++ Redistributable.' +
        '<br /><br />' +
        'No support will be provided here by developers.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).toBeNull();
    });

    it('should extract from Enhanced Blood Textures-like separator-style description', () => {
      const bbcode =
        '=====================' +
        '<br />[b][color=#00ffff]Install (MOD INSTALLER)[/color][/b]' +
        '<br />=====================' +
        '<br />[i]For manual install please click on the DOC tab[/i]' +
        '<br /><br />' +
        'Install: Open mod in a mod installer and pick the options that you want.' +
        '<br /><br />' +
        'After install go to your Fallout4Custom.ini' +
        '<br /><br />' +
        'Located here:' +
        '<br />...\\Documents\\My Games\\Fallout4' +
        '<br /><br />' +
        'Credits: Thanks to everyone.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      // Paragraph-based extraction should pick up "Install: Open mod..."
      expect(result).toContain('Open mod in a mod installer');
      expect(result).not.toContain('Credits');
    });

    it('should handle complex nested formatting in headers', () => {
      const bbcode =
        '[color=#ffd966][size=5][b]Features[/b][/size][/color]' +
        '<br />[list][*]Better loot tables[*]Improved AI[/list]' +
        '<br /><br />' +
        '[color=#ffd966][size=5][b]Installation Instructions[/b][/size][/color]' +
        '<br />Use your preferred mod manager to install this mod.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('### Installation Instructions');
      expect(result).not.toContain('Features');
    });

    it('should handle description with only paragraph breaks and no headers', () => {
      const bbcode =
        'This mod overhauls all weapon meshes.' +
        '<br /><br />' +
        'Requirements: SKSE64 2.0.4 or newer and SkyUI 5.1 or newer installed.' +
        '<br /><br />' +
        'Instructions: Download and install with your preferred mod manager.' +
        '<br />Run FNIS after installation to generate animations.' +
        '<br /><br />' +
        'Compatibility: Works with most other weapon mods.' +
        '<br /><br />' +
        'Known issues: Minor clipping with certain armors.';
      const result = extractInstructionsFromBBCode(bbcode);
      expect(result).not.toBeNull();
      expect(result).toContain('Download and install');
      expect(result).not.toContain('Known issues');
    });
  });
});
