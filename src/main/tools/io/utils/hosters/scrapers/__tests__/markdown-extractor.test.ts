import { describe, it, expect } from 'vitest';
import { extractInstructionsFromMarkdown } from '../markdown-extractor.utils';

describe('extractInstructionsFromMarkdown', () => {
  // ==========================================================================
  // Edge cases / empty input
  // ==========================================================================

  describe('empty and invalid input', () => {
    it('should return null for empty string', () => {
      expect(extractInstructionsFromMarkdown('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(extractInstructionsFromMarkdown('   \n\t  ')).toBeNull();
    });

    it('should return null for null/undefined input', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(extractInstructionsFromMarkdown(null as any)).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(extractInstructionsFromMarkdown(undefined as any)).toBeNull();
    });

    it('should return null for markdown with no instruction headers or keywords', () => {
      const md = '# My Cool Mod\n\nThis mod adds new weapons to the game.\n\n## Features\n\n- New sword\n- New shield';
      expect(extractInstructionsFromMarkdown(md)).toBeNull();
    });
  });

  // ==========================================================================
  // Header-based extraction
  // ==========================================================================

  describe('header-based extraction', () => {
    it('should extract section under "Installation" header', () => {
      const md = [
        '# My Mod',
        '',
        '## Description',
        'A great mod.',
        '',
        '## Installation',
        'Copy the files to your game folder.',
        'Overwrite when prompted.',
        '',
        '## Credits',
        'Thanks to everyone.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('## Installation');
      expect(result!.instructions).toContain('Copy the files to your game folder.');
      expect(result!.instructions).not.toContain('Description');
      expect(result!.instructions).not.toContain('Credits');
    });

    it('should extract section under "How to Install" header', () => {
      const md = [
        '## Features',
        'Lots of new stuff.',
        '',
        '## How to Install',
        'Download and extract the archive.',
        'Place files in the Data folder.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('## How to Install');
      expect(result!.instructions).toContain('Download and extract the archive.');
      expect(result!.instructions).not.toContain('Features');
    });

    it('should extract section under "Setup" header', () => {
      const md = [
        '## Overview',
        'This tool helps with modding.',
        '',
        '## Setup',
        'Run the installer and follow the prompts.',
        'Configure your settings in the INI file.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('## Setup');
      expect(result!.instructions).toContain('Run the installer');
    });

    it('should extract section under "Getting Started" header', () => {
      const md = [
        '## About',
        'A framework for modding.',
        '',
        '## Getting Started',
        'First install the prerequisites.',
        'Then clone the repository.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('## Getting Started');
      expect(result!.instructions).toContain('First install the prerequisites.');
    });

    it('should extract section under "Usage" header', () => {
      const md = [
        '## What it Does',
        'Improves performance.',
        '',
        '## Usage',
        'Open the config menu and adjust the settings.',
        'Save and restart the game.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('## Usage');
      expect(result!.instructions).toContain('Open the config menu');
    });

    it('should extract section under "Requirements" header', () => {
      const md = [
        '## Description',
        'Enhanced textures.',
        '',
        '## Requirements',
        'You need SKSE64 version 2.0 or higher.',
        'At least 4GB VRAM is recommended.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('## Requirements');
      expect(result!.instructions).toContain('SKSE64 version 2.0');
    });

    it('should extract section under "Instructions" header', () => {
      const md = [
        '## Overview',
        'A simple mod.',
        '',
        '## Instructions',
        'Follow these steps carefully to set up the mod.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('## Instructions');
      expect(result!.instructions).toContain('Follow these steps carefully');
    });

    it('should be case-insensitive for keyword matching', () => {
      const md = [
        '## INSTALLATION',
        'Extract and copy files to your game directory.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('## INSTALLATION');
    });

    it('should handle different header levels (# to ####)', () => {
      const testCases = [
        { level: '#', header: '# Installation Guide' },
        { level: '##', header: '## Installation Guide' },
        { level: '###', header: '### Installation Guide' },
        { level: '####', header: '#### Installation Guide' },
      ];

      for (const { header } of testCases) {
        const md = `${header}\nCopy the mod files to your game directory.`;
        const result = extractInstructionsFromMarkdown(md);
        expect(result).not.toBeNull();
        expect(result!.instructions).toContain('Copy the mod files');
      }
    });

    it('should normalize header levels to ## in output', () => {
      const md = [
        '#### Installation',
        'Copy files to the game folder and restart.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('## Installation');
    });
  });

  // ==========================================================================
  // Multiple instruction sections
  // ==========================================================================

  describe('multiple instruction sections', () => {
    it('should extract multiple instruction sections', () => {
      const md = [
        '## Description',
        'A graphics overhaul mod.',
        '',
        '## Requirements',
        'You need SKSE64 installed first.',
        'At least 8GB VRAM recommended.',
        '',
        '## Installation',
        'Download and extract to the Data folder.',
        'Enable the plugin in your mod manager.',
        '',
        '## Changelog',
        'v1.1 - Fixed water reflections.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('## Requirements');
      expect(result!.instructions).toContain('SKSE64 installed first');
      expect(result!.instructions).toContain('## Installation');
      expect(result!.instructions).toContain('Download and extract');
      expect(result!.instructions).not.toContain('Description');
      expect(result!.instructions).not.toContain('Changelog');
    });
  });

  // ==========================================================================
  // Noise filtering
  // ==========================================================================

  describe('noise filtering', () => {
    it('should skip Credits section', () => {
      const md = [
        '## Installation',
        'Extract files to the game directory and overwrite.',
        '',
        '## Credits',
        'Thanks to the community for testing.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('Extract files');
      expect(result!.instructions).not.toContain('Thanks to the community');
    });

    it('should skip Changelog section', () => {
      const md = [
        '## Installation',
        'Installation steps are simple and straightforward.',
        '',
        '## Changelog',
        'v1.1 - Fixed bugs.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result!.instructions).not.toContain('Fixed bugs');
    });

    it('should skip Thanks section', () => {
      const md = [
        '## Installation',
        'Follow these steps to install the mod correctly.',
        '',
        '## Thanks',
        'Special thanks to all supporters.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result!.instructions).not.toContain('Special thanks');
    });

    it('should skip License section', () => {
      const md = [
        '## Installation',
        'Copy the files to the correct location safely.',
        '',
        '## License',
        'MIT License - Free to use.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result!.instructions).not.toContain('MIT License');
    });

    it('should skip FAQ section', () => {
      const md = [
        '## Installation',
        'Use the mod manager to install this package.',
        '',
        '## FAQ',
        'Q: Is this safe? A: Yes!',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result!.instructions).not.toContain('Is this safe');
    });

    it('should skip sections with too short content', () => {
      const md = [
        '## Install',
        'See below.',
        '',
        '## Installation Guide',
        'This is the actual installation guide with enough content to pass the filter.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('actual installation guide');
      expect(result!.instructions).not.toContain('See below');
    });
  });

  // ==========================================================================
  // Fallback extraction
  // ==========================================================================

  describe('fallback - no headers but has keywords', () => {
    it('should use full content if short and contains install keyword', () => {
      const md = 'To install this mod, extract the archive and copy to your game folder. Make sure to backup your files first.';
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('extract the archive');
    });

    it('should use full content if contains setup keyword', () => {
      const md = 'Quick setup: Just drop the files in the data folder and you are good to go! Remember to restart.';
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('drop the files');
    });

    it('should NOT use fallback if content is too short', () => {
      const md = 'Install it.';
      expect(extractInstructionsFromMarkdown(md)).toBeNull();
    });

    it('should NOT use fallback if content is too long', () => {
      const md = `Install instructions: ${'Lorem ipsum '.repeat(200)}`;
      expect(extractInstructionsFromMarkdown(md)).toBeNull();
    });

    it('should NOT use fallback if no keywords present', () => {
      const md = 'This mod adds new weapons to the game. Enjoy playing with them and have fun exploring!';
      expect(extractInstructionsFromMarkdown(md)).toBeNull();
    });
  });

  // ==========================================================================
  // Sections without headers (headerless content)
  // ==========================================================================

  describe('headerless sections', () => {
    it('should skip headerless sections in header-based extraction', () => {
      // Content before any header is treated as headerless and skipped
      const md = [
        'This is introductory text about the mod.',
        '',
        '## Installation',
        'Copy the files into your game directory carefully.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('## Installation');
      expect(result!.instructions).not.toContain('introductory text');
    });
  });

  // ==========================================================================
  // Real-world-like patterns
  // ==========================================================================

  describe('real-world patterns', () => {
    it('should handle GitHub release body with installation section', () => {
      const md = [
        '## What\'s New',
        '- Added new feature X',
        '- Fixed bug Y',
        '',
        '## Installation',
        '1. Download the zip from the assets below',
        '2. Extract to your game folder',
        '3. Overwrite existing files when prompted',
        '',
        '## Contributors',
        'Thanks to all who contributed.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('Download the zip');
      expect(result!.instructions).toContain('Extract to your game folder');
      expect(result!.instructions).not.toContain('Added new feature');
      expect(result!.instructions).not.toContain('Thanks to all');
    });

    it('should handle mod readme with requirements and setup', () => {
      const md = [
        '# My Awesome Mod',
        '',
        '## Overview',
        'This mod improves graphics significantly.',
        '',
        '## Requirements',
        '- SKSE64 v2.0+',
        '- SkyUI 5.1+',
        '- At least 4GB VRAM',
        '',
        '## Setup',
        '1. Install SKSE64 first',
        '2. Download and install via MO2',
        '3. Place after base game in load order',
        '',
        '## Permissions',
        'Do not redistribute without permission.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('SKSE64 v2.0+');
      expect(result!.instructions).toContain('Install SKSE64 first');
      expect(result!.instructions).not.toContain('improves graphics');
      expect(result!.instructions).not.toContain('Do not redistribute');
    });

    it('should handle markdown with code blocks in instructions', () => {
      const md = [
        '## Installation',
        '',
        'Add the following to your config file:',
        '',
        '```ini',
        'bEnableDebug=1',
        'iMaxFPS=60',
        '```',
        '',
        'Then restart the game.',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('bEnableDebug=1');
      expect(result!.instructions).toContain('restart the game');
    });

    it('should handle markdown with only a usage section', () => {
      const md = [
        '## Usage',
        '',
        'Run the executable with the following flags:',
        '- `--config path/to/config`',
        '- `--verbose` for debug output',
      ].join('\n');
      const result = extractInstructionsFromMarkdown(md);
      expect(result).not.toBeNull();
      expect(result!.instructions).toContain('Run the executable');
    });
  });
});
