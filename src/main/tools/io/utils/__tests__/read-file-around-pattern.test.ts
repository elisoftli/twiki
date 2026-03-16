import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileAroundPattern } from '../read-file-around-pattern.utils';
import type { ReadFileAroundPatternParams } from '../types';

// Mock dependencies
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

// Mock main/utils (expandWindowsEnvVars)
vi.mock('../../../../utils', () => ({
  expandWindowsEnvVars: vi.fn((path: string) => {
    return path
      .replace(/%USERPROFILE%/gi, 'C:\\Users\\testuser')
      .replace(/%APPDATA%/gi, 'C:\\Users\\testuser\\AppData\\Roaming')
      .replace(/%LOCALAPPDATA%/gi, 'C:\\Users\\testuser\\AppData\\Local');
  }),
}));

// Mock tools/utils.ts (normalizeLineEndings)
vi.mock('../../utils', () => ({
  normalizeLineEndings: vi.fn((content: string) => content.replace(/\r\n/g, '\n')),
}));

import { promises as fs } from 'fs';
import { expandWindowsEnvVars } from '../../../../utils';

describe('readFileAroundPattern', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy path - plain text search', () => {
    it('should find a pattern and return surrounding context', async () => {
      const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\file.txt',
        searches: [{ searchText: 'Line 25', contextLines: 5 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.path).toBe('C:\\test\\file.txt');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].found).toBe(true);
      expect(result.results[0].matchedLine).toBe(25);
      expect(result.results[0].startLine).toBe(20); // 25 - 5 = 20
      expect(result.results[0].endLine).toBe(30); // 25 + 5 = 30
      expect(result.results[0].totalMatches).toBe(1);
      expect(result.results[0].allMatchedLines).toEqual([25]);
    });

    it('should find multiple occurrences of a pattern', async () => {
      const fileContent = 'apple\nbanana\napple\norange\napple';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\fruits.txt',
        searches: [{ searchText: 'apple', contextLines: 1 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].totalMatches).toBe(3);
      expect(result.results[0].allMatchedLines).toEqual([1, 3, 5]);
      // Context is around first match (line 1)
      expect(result.results[0].matchedLine).toBe(1);
      expect(result.results[0].startLine).toBe(1); // Can't go below 1
      expect(result.results[0].endLine).toBe(2); // 1 + 1 = 2
    });

    it('should handle multiple search patterns in one request', async () => {
      const fileContent = '[Section1]\nkey1=value1\n\n[Section2]\nkey2=value2';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\config.ini',
        searches: [
          { searchText: '[Section1]', contextLines: 2 },
          { searchText: 'key2=', contextLines: 1 },
        ],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results).toHaveLength(2);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].searchText).toBe('[Section1]');
      expect(result.results[0].matchedLine).toBe(1);

      expect(result.results[1].found).toBe(true);
      expect(result.results[1].searchText).toBe('key2=');
      expect(result.results[1].matchedLine).toBe(5);
    });

    it('should use default contextLines of 100 when not specified', async () => {
      const lines = Array.from({ length: 300 }, (_, i) => `Line ${i + 1}`);
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\file.txt',
        searches: [{ searchText: 'Line 150' }], // No contextLines specified
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].matchedLine).toBe(150);
      expect(result.results[0].startLine).toBe(50); // 150 - 100 = 50
      expect(result.results[0].endLine).toBe(250); // 150 + 100 = 250
    });
  });

  describe('Regex pattern matching', () => {
    it('should match using regex when isRegex is true', async () => {
      const fileContent = 'value=123\ncount=456\nname=test\nid=789';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\config.ini',
        searches: [{ searchText: '\\w+=\\d+', isRegex: true, contextLines: 1 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].totalMatches).toBe(3); // matches value=123, count=456, id=789
      expect(result.results[0].allMatchedLines).toEqual([1, 2, 4]);
    });

    it('should handle complex regex patterns', async () => {
      const fileContent = 'ERROR: Something failed\nINFO: All good\nWARNING: Check this\nERROR: Another failure';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\log.txt',
        searches: [{ searchText: '^ERROR:', isRegex: true, contextLines: 0 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].totalMatches).toBe(2);
      expect(result.results[0].allMatchedLines).toEqual([1, 4]);
    });

    it('should handle case-sensitive regex', async () => {
      const fileContent = 'Hello World\nhello world\nHELLO WORLD';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\file.txt',
        searches: [{ searchText: 'hello', isRegex: true, contextLines: 0 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].totalMatches).toBe(1);
      expect(result.results[0].matchedLine).toBe(2);
    });

    it('should handle regex with special characters', async () => {
      const fileContent = 'price: $19.99\ndiscount: 10%\ntotal: $17.99';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\prices.txt',
        searches: [{ searchText: '\\$\\d+\\.\\d+', isRegex: true, contextLines: 0 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].totalMatches).toBe(2);
      expect(result.results[0].allMatchedLines).toEqual([1, 3]);
    });
  });

  describe('Pattern not found', () => {
    it('should return not found result when pattern does not exist', async () => {
      const fileContent = 'Line 1\nLine 2\nLine 3';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\file.txt',
        searches: [{ searchText: 'NonExistent', contextLines: 5 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(false);
      expect(result.results[0].content).toBe('');
      expect(result.results[0].matchedLine).toBe(0);
      expect(result.results[0].startLine).toBe(0);
      expect(result.results[0].endLine).toBe(0);
      expect(result.results[0].totalMatches).toBe(0);
      expect(result.results[0].allMatchedLines).toEqual([]);
    });

    it('should handle mixed found/not found results', async () => {
      const fileContent = 'apple\nbanana\norange';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\fruits.txt',
        searches: [
          { searchText: 'banana', contextLines: 1 },
          { searchText: 'grape', contextLines: 1 },
          { searchText: 'orange', contextLines: 1 },
        ],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].searchText).toBe('banana');

      expect(result.results[1].found).toBe(false);
      expect(result.results[1].searchText).toBe('grape');

      expect(result.results[2].found).toBe(true);
      expect(result.results[2].searchText).toBe('orange');
    });
  });

  describe('Context boundary handling', () => {
    it('should clamp context to file start', async () => {
      const fileContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\file.txt',
        searches: [{ searchText: 'Line 2', contextLines: 10 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].startLine).toBe(1); // Can't go below 1
      expect(result.results[0].endLine).toBe(5); // Line 2 + 10, but file only has 5 lines
    });

    it('should clamp context to file end', async () => {
      const fileContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\file.txt',
        searches: [{ searchText: 'Line 4', contextLines: 10 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].matchedLine).toBe(4);
      expect(result.results[0].startLine).toBe(1); // 4 - 10 = -6, clamped to 1
      expect(result.results[0].endLine).toBe(5); // 4 + 10 = 14, clamped to 5
    });

    it('should handle zero context lines', async () => {
      const fileContent = 'Line 1\nLine 2\nLine 3';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\file.txt',
        searches: [{ searchText: 'Line 2', contextLines: 0 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].startLine).toBe(2);
      expect(result.results[0].endLine).toBe(2);
      expect(result.results[0].content).toBe('Line 2');
    });
  });

  describe('Environment variable expansion', () => {
    it('should expand Windows environment variables in path', async () => {
      const fileContent = 'Content';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: '%APPDATA%\\MyApp\\config.ini',
        searches: [{ searchText: 'Content' }],
      };

      const result = await readFileAroundPattern(params);

      expect(expandWindowsEnvVars).toHaveBeenCalledWith('%APPDATA%\\MyApp\\config.ini');
      expect(result.path).toBe('C:\\Users\\testuser\\AppData\\Roaming\\MyApp\\config.ini');
    });
  });

  describe('Line ending normalization', () => {
    it('should normalize CRLF to LF for consistent matching', async () => {
      const fileContent = 'Line 1\r\nPattern Here\r\nLine 3';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\file.txt',
        searches: [{ searchText: 'Pattern Here', contextLines: 1 }],
      };

      const result = await readFileAroundPattern(params);

      // The pattern should be found (normalization working)
      expect(result.results[0].found).toBe(true);
      // Content should have normalized line endings
      expect(result.results[0].content).toBe('Line 1\nPattern Here\nLine 3');
    });
  });

  describe('Error handling', () => {
    it('should propagate file not found error', async () => {
      const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\nonexistent\\file.txt',
        searches: [{ searchText: 'pattern' }],
      };

      await expect(readFileAroundPattern(params)).rejects.toThrow('ENOENT');
    });

    it('should propagate permission denied error', async () => {
      const error = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\protected\\file.txt',
        searches: [{ searchText: 'pattern' }],
      };

      await expect(readFileAroundPattern(params)).rejects.toThrow('EACCES');
    });

    it('should handle invalid regex pattern', async () => {
      const fileContent = 'Some content';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\file.txt',
        searches: [{ searchText: '[invalid(regex', isRegex: true }],
      };

      await expect(readFileAroundPattern(params)).rejects.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty file', async () => {
      const fileContent = '';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\empty.txt',
        searches: [{ searchText: 'anything' }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(false);
    });

    it('should handle file with single line', async () => {
      const fileContent = 'Only one line';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\single.txt',
        searches: [{ searchText: 'one', contextLines: 10 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].startLine).toBe(1);
      expect(result.results[0].endLine).toBe(1);
    });

    it('should handle empty search array', async () => {
      const fileContent = 'Some content';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\file.txt',
        searches: [],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results).toHaveLength(0);
    });

    it('should match partial line content', async () => {
      const fileContent = 'The quick brown fox\njumps over the lazy dog';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\file.txt',
        searches: [{ searchText: 'brown', contextLines: 0 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].matchedLine).toBe(1);
      expect(result.results[0].content).toBe('The quick brown fox');
    });

    it('should handle special characters in plain text search', async () => {
      const fileContent = 'key=value\npath=C:\\Users\\test\nprice=$100';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\config.txt',
        searches: [
          { searchText: 'C:\\Users\\test', contextLines: 0 },
          { searchText: '$100', contextLines: 0 },
        ],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].matchedLine).toBe(2);

      expect(result.results[1].found).toBe(true);
      expect(result.results[1].matchedLine).toBe(3);
    });

    it('should handle unicode in search pattern', async () => {
      const fileContent = 'English line\n\u65E5\u672C\u8A9E line\nAnother line';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\unicode.txt',
        searches: [{ searchText: '\u65E5\u672C\u8A9E', contextLines: 1 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].matchedLine).toBe(2);
    });

    it('should correctly build content from line range', async () => {
      const lines = ['Header', 'Line 2', 'Target', 'Line 4', 'Footer'];
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\file.txt',
        searches: [{ searchText: 'Target', contextLines: 1 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].content).toBe('Line 2\nTarget\nLine 4');
      expect(result.results[0].startLine).toBe(2);
      expect(result.results[0].endLine).toBe(4);
    });

    it('should handle very large context lines value', async () => {
      const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`);
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\file.txt',
        searches: [{ searchText: 'Line 5', contextLines: 1000 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].startLine).toBe(1);
      expect(result.results[0].endLine).toBe(10);
      expect(result.results[0].content).toBe(fileContent);
    });
  });

  describe('INI file patterns (common use case)', () => {
    it('should find INI section headers', async () => {
      const fileContent = `[Display]
Resolution=1920x1080
Fullscreen=true

[Audio]
Volume=80
Mute=false

[Graphics]
Quality=Ultra`;
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\settings.ini',
        searches: [{ searchText: '[Audio]', contextLines: 3 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].matchedLine).toBe(5);
      expect(result.results[0].content).toContain('Volume=80');
      expect(result.results[0].content).toContain('Mute=false');
    });

    it('should find key-value pairs', async () => {
      const fileContent = `[Settings]
bShowFPS=0
bVSync=1
iResolutionX=1920
iResolutionY=1080`;
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\test\\game.ini',
        searches: [
          { searchText: 'bShowFPS', contextLines: 0 },
          { searchText: 'iResolution', contextLines: 0 },
        ],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].content).toBe('bShowFPS=0');

      expect(result.results[1].found).toBe(true);
      expect(result.results[1].totalMatches).toBe(2); // Matches both iResolutionX and iResolutionY
    });
  });

  describe('Log file patterns (common use case)', () => {
    it('should find error patterns in logs', async () => {
      const fileContent = `2024-01-01 10:00:00 INFO Starting application
2024-01-01 10:00:01 DEBUG Loading config
2024-01-01 10:00:02 ERROR Failed to load resource
2024-01-01 10:00:03 INFO Retrying...
2024-01-01 10:00:04 ERROR Connection timeout`;
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\logs\\app.log',
        searches: [{ searchText: 'ERROR', contextLines: 1 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].totalMatches).toBe(2);
      expect(result.results[0].matchedLine).toBe(3); // First ERROR
    });

    it('should use regex to match timestamp patterns', async () => {
      const fileContent = `[2024-01-01 10:00:00] Event A
[2024-01-01 10:00:01] Event B
[2024-01-01 10:00:02] Event C`;
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileAroundPatternParams = {
        path: 'C:\\logs\\events.log',
        searches: [{ searchText: '\\[\\d{4}-\\d{2}-\\d{2}', isRegex: true, contextLines: 0 }],
      };

      const result = await readFileAroundPattern(params);

      expect(result.results[0].found).toBe(true);
      expect(result.results[0].totalMatches).toBe(3);
    });
  });
});
