import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFile } from '../read-file.utils';
import type { ReadFileParams } from '../types';

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

describe('readFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy path - reading entire file', () => {
    it('should read a small file completely', async () => {
      const fileContent = 'Line 1\nLine 2\nLine 3';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
      };

      const result = await readFile(params);

      expect(result.path).toBe('C:\\test\\file.txt');
      expect(result.content).toBe('Line 1\nLine 2\nLine 3');
      expect(result.lineCount).toBe(3);
      expect(result.sizeBytes).toBe(Buffer.byteLength(fileContent, 'utf-8'));
      expect(result.startLine).toBeUndefined();
      expect(result.endLine).toBeUndefined();
      expect(result.totalLines).toBeUndefined();
    });

    it('should read a file at exactly MAX_LINES (200 lines)', async () => {
      const lines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`);
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
      };

      const result = await readFile(params);

      expect(result.lineCount).toBe(200);
      expect(result.content).toBe(fileContent);
    });

    it('should read a single line file', async () => {
      const fileContent = 'Single line without newline';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
      };

      const result = await readFile(params);

      expect(result.lineCount).toBe(1);
      expect(result.content).toBe('Single line without newline');
    });

    it('should handle empty file', async () => {
      const fileContent = '';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\empty.txt',
      };

      const result = await readFile(params);

      expect(result.lineCount).toBe(1); // Empty string split by \n gives ['']
      expect(result.content).toBe('');
      expect(result.sizeBytes).toBe(0);
    });
  });

  describe('Reading with line range', () => {
    it('should read a specific range of lines', async () => {
      const lines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'];
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
        startLine: 2,
        endLine: 4,
      };

      const result = await readFile(params);

      expect(result.content).toBe('Line 2\nLine 3\nLine 4');
      expect(result.lineCount).toBe(3);
      expect(result.startLine).toBe(2);
      expect(result.endLine).toBe(4);
      expect(result.totalLines).toBe(5);
    });

    it('should read from startLine to end of file when only startLine is specified', async () => {
      const lines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'];
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
        startLine: 3,
      };

      const result = await readFile(params);

      expect(result.content).toBe('Line 3\nLine 4\nLine 5');
      expect(result.lineCount).toBe(3);
      expect(result.startLine).toBe(3);
      expect(result.endLine).toBe(5);
      expect(result.totalLines).toBe(5);
    });

    it('should read from beginning to endLine when only endLine is specified', async () => {
      const lines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'];
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
        endLine: 3,
      };

      const result = await readFile(params);

      expect(result.content).toBe('Line 1\nLine 2\nLine 3');
      expect(result.lineCount).toBe(3);
      expect(result.startLine).toBe(1);
      expect(result.endLine).toBe(3);
      expect(result.totalLines).toBe(5);
    });

    it('should handle range exceeding file length', async () => {
      const lines = ['Line 1', 'Line 2', 'Line 3'];
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
        startLine: 2,
        endLine: 100,
      };

      const result = await readFile(params);

      expect(result.content).toBe('Line 2\nLine 3');
      expect(result.lineCount).toBe(2);
      expect(result.startLine).toBe(2);
      expect(result.endLine).toBe(3);
      expect(result.totalLines).toBe(3);
    });

    it('should handle startLine before file start (negative-ish correction)', async () => {
      const lines = ['Line 1', 'Line 2', 'Line 3'];
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
        startLine: -5,
        endLine: 2,
      };

      const result = await readFile(params);

      // startLine is clamped to 1
      expect(result.startLine).toBe(1);
      expect(result.endLine).toBe(2);
      expect(result.content).toBe('Line 1\nLine 2');
    });

    it('should handle startLine equal to endLine (single line)', async () => {
      const lines = ['Line 1', 'Line 2', 'Line 3'];
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
        startLine: 2,
        endLine: 2,
      };

      const result = await readFile(params);

      expect(result.content).toBe('Line 2');
      expect(result.lineCount).toBe(1);
      expect(result.startLine).toBe(2);
      expect(result.endLine).toBe(2);
    });

    it('should allow reading large files when range is specified', async () => {
      // Create a file with more than MAX_LINES (200)
      const lines = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}`);
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\large-file.txt',
        startLine: 100,
        endLine: 150,
      };

      const result = await readFile(params);

      expect(result.lineCount).toBe(51);
      expect(result.startLine).toBe(100);
      expect(result.endLine).toBe(150);
      expect(result.totalLines).toBe(500);
    });
  });

  describe('File size limit enforcement', () => {
    it('should throw error when file exceeds MAX_LINES without range', async () => {
      const lines = Array.from({ length: 201 }, (_, i) => `Line ${i + 1}`);
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\large-file.txt',
      };

      await expect(readFile(params)).rejects.toThrow('File is too large (201 lines, max 200)');
    });

    it('should include helpful message in size limit error', async () => {
      const lines = Array.from({ length: 300 }, (_, i) => `Line ${i + 1}`);
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\large-file.txt',
      };

      await expect(readFile(params)).rejects.toThrow('startLine/endLine');
      await expect(readFile(params)).rejects.toThrow('readFileAroundPatternTool');
    });
  });

  describe('Environment variable expansion', () => {
    it('should expand Windows environment variables in path', async () => {
      const fileContent = 'Content';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: '%USERPROFILE%\\Documents\\file.txt',
      };

      const result = await readFile(params);

      expect(expandWindowsEnvVars).toHaveBeenCalledWith('%USERPROFILE%\\Documents\\file.txt');
      expect(result.path).toBe('C:\\Users\\testuser\\Documents\\file.txt');
    });

    it('should expand multiple environment variables', async () => {
      const fileContent = 'Content';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: '%APPDATA%\\MyApp\\config.ini',
      };

      const result = await readFile(params);

      expect(result.path).toBe('C:\\Users\\testuser\\AppData\\Roaming\\MyApp\\config.ini');
    });
  });

  describe('Line ending normalization', () => {
    it('should normalize CRLF to LF', async () => {
      const fileContent = 'Line 1\r\nLine 2\r\nLine 3';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
      };

      const result = await readFile(params);

      // The content should have normalized line endings (CRLF -> LF)
      expect(result.content).toBe('Line 1\nLine 2\nLine 3');
      expect(result.lineCount).toBe(3);
    });
  });

  describe('Error handling', () => {
    it('should propagate file not found error', async () => {
      const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const params: ReadFileParams = {
        path: 'C:\\nonexistent\\file.txt',
      };

      await expect(readFile(params)).rejects.toThrow('ENOENT');
    });

    it('should propagate permission denied error', async () => {
      const error = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const params: ReadFileParams = {
        path: 'C:\\protected\\file.txt',
      };

      await expect(readFile(params)).rejects.toThrow('EACCES');
    });

    it('should handle read error on binary file', async () => {
      const error = new Error('Invalid UTF-8 encoding');
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const params: ReadFileParams = {
        path: 'C:\\test\\binary.exe',
      };

      await expect(readFile(params)).rejects.toThrow('Invalid UTF-8');
    });
  });

  describe('Edge cases', () => {
    it('should handle file with only newlines', async () => {
      const fileContent = '\n\n\n';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\newlines.txt',
      };

      const result = await readFile(params);

      expect(result.lineCount).toBe(4); // Split '\n\n\n' gives ['', '', '', '']
    });

    it('should handle file with trailing newline', async () => {
      const fileContent = 'Line 1\nLine 2\n';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
      };

      const result = await readFile(params);

      expect(result.lineCount).toBe(3); // 'Line 1', 'Line 2', ''
    });

    it('should handle file with special characters', async () => {
      const fileContent = 'Line with special chars: <>&"\'`~!@#$%^&*()';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\special.txt',
      };

      const result = await readFile(params);

      expect(result.content).toBe(fileContent);
    });

    it('should handle file with unicode characters', async () => {
      const fileContent = 'Japanese: \u65E5\u672C\u8A9E\nArabic: \u0645\u0631\u062D\u0628\u0627\nEmoji: \uD83D\uDE00';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\unicode.txt',
      };

      const result = await readFile(params);

      expect(result.content).toContain('\u65E5\u672C\u8A9E');
      expect(result.sizeBytes).toBeGreaterThan(result.content.length); // UTF-8 bytes > char count
    });

    it('should handle very long lines', async () => {
      const longLine = 'x'.repeat(10000);
      const fileContent = `Short line\n${longLine}\nAnother short line`;
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\longlines.txt',
      };

      const result = await readFile(params);

      expect(result.lineCount).toBe(3);
      expect(result.content).toContain(longLine);
    });

    it('should handle path with spaces', async () => {
      const fileContent = 'Content';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\Program Files\\My App\\config.txt',
      };

      await readFile(params);

      expect(fs.readFile).toHaveBeenCalledWith('C:\\Program Files\\My App\\config.txt', 'utf-8');
    });

    it('should handle path with parentheses and brackets', async () => {
      const fileContent = 'Content';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\Games\\Game (2024) [Final]\\config.ini',
      };

      await readFile(params);

      expect(fs.readFile).toHaveBeenCalledWith('C:\\Games\\Game (2024) [Final]\\config.ini', 'utf-8');
    });
  });

  describe('Size bytes calculation', () => {
    it('should correctly calculate bytes for ASCII content', async () => {
      const fileContent = 'Hello World';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
      };

      const result = await readFile(params);

      expect(result.sizeBytes).toBe(11); // ASCII: 1 byte per char
    });

    it('should correctly calculate bytes for UTF-8 content', async () => {
      const fileContent = '\u00E9\u00E8\u00EA'; // e, e, e (2 bytes each in UTF-8)
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
      };

      const result = await readFile(params);

      expect(result.sizeBytes).toBe(6); // 3 chars * 2 bytes each
    });

    it('should calculate bytes for range-selected content', async () => {
      const lines = ['Line 1', 'Line 2', 'Line 3'];
      const fileContent = lines.join('\n');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const params: ReadFileParams = {
        path: 'C:\\test\\file.txt',
        startLine: 2,
        endLine: 2,
      };

      const result = await readFile(params);

      expect(result.sizeBytes).toBe(Buffer.byteLength('Line 2', 'utf-8'));
    });
  });
});
