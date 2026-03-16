import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';

// Mock all external dependencies before importing the module under test
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
}));

// Mock path module to handle Windows paths on Linux
vi.mock('path', () => ({
  default: {
    dirname: vi.fn((p: string) => {
      // Handle Windows-style paths
      const normalized = p.replace(/\//g, '\\');
      const lastSeparator = normalized.lastIndexOf('\\');
      if (lastSeparator === -1) return '.';
      if (lastSeparator === 2 && normalized[1] === ':') {
        // e.g., C:\file.txt -> C:\
        return normalized.substring(0, 3);
      }
      return normalized.substring(0, lastSeparator);
    }),
  },
  dirname: vi.fn((p: string) => {
    const normalized = p.replace(/\//g, '\\');
    const lastSeparator = normalized.lastIndexOf('\\');
    if (lastSeparator === -1) return '.';
    if (lastSeparator === 2 && normalized[1] === ':') {
      return normalized.substring(0, 3);
    }
    return normalized.substring(0, lastSeparator);
  }),
}));

// Mock tools/tool.utils.ts (restoreLineEndings, WINDOWS_LINE_ENDING)
// Test file is at io/utils/__tests__/, source imports from '../../tool.utils' (tools/tool.utils)
// From test file, path to tools/tool.utils is ../../../tool.utils
vi.mock('../../../tool.utils', () => ({
  restoreLineEndings: vi.fn((content: string, lineEnding: string) => {
    const normalized = content.replace(/\r\n/g, '\n');
    if (lineEnding === '\r\n') {
      return normalized.replace(/\n/g, '\r\n');
    }
    return normalized;
  }),
  WINDOWS_LINE_ENDING: '\r\n',
}));

// Mock main/utils (expandWindowsEnvVars)
// Test file is at io/utils/__tests__/, source imports from '../../../tool.utils' (main/utils)
// From test file, path to main/utils is ../../../../utils
vi.mock('../../../../utils', () => ({
  expandWindowsEnvVars: vi.fn((path: string) => path),
}));

// Import module under test after mocks are set up
import { createFile } from '../create-file.utils';
// Import mocked modules with same paths as vi.mock (relative to THIS test file)
import { restoreLineEndings } from '../../../tool.utils';
import { expandWindowsEnvVars } from '../../../../utils';

describe('createFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations after clear
    vi.mocked(restoreLineEndings).mockImplementation((content: string, lineEnding: string) => {
      const normalized = content.replace(/\r\n/g, '\n');
      if (lineEnding === '\r\n') {
        return normalized.replace(/\n/g, '\r\n');
      }
      return normalized;
    });
    vi.mocked(expandWindowsEnvVars).mockImplementation((p: string) => p);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  });

  describe('happy path', () => {
    it('should create a new file with content', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await createFile({
        path: 'C:\\test\\newfile.txt',
        content: 'Hello, World!',
      });

      expect(result.path).toBe('C:\\test\\newfile.txt');
      expect(result.bytesWritten).toBeGreaterThan(0);
      expect(result.alreadyExists).toBeUndefined();
      expect(fs.mkdir).toHaveBeenCalledWith('C:\\test', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith('C:\\test\\newfile.txt', expect.any(String), 'utf-8');
    });

    it('should create parent directories if they do not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await createFile({
        path: 'C:\\deep\\nested\\path\\file.txt',
        content: 'content',
      });

      expect(fs.mkdir).toHaveBeenCalledWith('C:\\deep\\nested\\path', { recursive: true });
    });

    it('should convert line endings to Windows CRLF', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await createFile({
        path: 'C:\\test\\file.txt',
        content: 'line1\nline2\n',
      });

      expect(restoreLineEndings).toHaveBeenCalledWith('line1\nline2\n', '\r\n');
      expect(fs.writeFile).toHaveBeenCalledWith(
        'C:\\test\\file.txt',
        'line1\r\nline2\r\n',
        'utf-8'
      );
    });

    it('should handle empty content', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await createFile({
        path: 'C:\\test\\empty.txt',
        content: '',
      });

      expect(result).toEqual({
        path: 'C:\\test\\empty.txt',
        bytesWritten: 0,
      });
      expect(fs.writeFile).toHaveBeenCalledWith('C:\\test\\empty.txt', '', 'utf-8');
    });
  });

  describe('file already exists', () => {
    it('should return alreadyExists: true when file exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await createFile({
        path: 'C:\\test\\existing.txt',
        content: 'new content',
      });

      expect(result).toEqual({
        path: 'C:\\test\\existing.txt',
        bytesWritten: 0,
        alreadyExists: true,
      });
      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should not modify existing file', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await createFile({
        path: 'C:\\test\\existing.txt',
        content: 'this should not be written',
      });

      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('environment variable expansion', () => {
    it('should expand environment variables in file path', async () => {
      vi.mocked(expandWindowsEnvVars).mockReturnValue('C:\\Users\\testuser\\Documents\\file.txt');
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await createFile({
        path: '%USERPROFILE%\\Documents\\file.txt',
        content: 'content',
      });

      expect(expandWindowsEnvVars).toHaveBeenCalledWith('%USERPROFILE%\\Documents\\file.txt');
      expect(result.path).toBe('C:\\Users\\testuser\\Documents\\file.txt');
      expect(fs.writeFile).toHaveBeenCalledWith('C:\\Users\\testuser\\Documents\\file.txt', expect.any(String), 'utf-8');
    });

    it('should expand %APPDATA% variable', async () => {
      vi.mocked(expandWindowsEnvVars).mockReturnValue(
        'C:\\Users\\testuser\\AppData\\Roaming\\Game\\config.ini'
      );
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await createFile({
        path: '%APPDATA%\\Game\\config.ini',
        content: '[Settings]',
      });

      expect(expandWindowsEnvVars).toHaveBeenCalledWith('%APPDATA%\\Game\\config.ini');
      expect(fs.mkdir).toHaveBeenCalledWith('C:\\Users\\testuser\\AppData\\Roaming\\Game', { recursive: true });
    });

    it('should expand %LOCALAPPDATA% variable', async () => {
      vi.mocked(expandWindowsEnvVars).mockReturnValue(
        'C:\\Users\\testuser\\AppData\\Local\\Game\\settings.json'
      );
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await createFile({
        path: '%LOCALAPPDATA%\\Game\\settings.json',
        content: '{}',
      });

      expect(expandWindowsEnvVars).toHaveBeenCalledWith('%LOCALAPPDATA%\\Game\\settings.json');
    });
  });

  describe('edge cases', () => {
    it('should handle files with special characters in names', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await createFile({
        path: 'C:\\test\\file with spaces.txt',
        content: 'content',
      });

      expect(result.path).toBe('C:\\test\\file with spaces.txt');
      expect(fs.writeFile).toHaveBeenCalledWith('C:\\test\\file with spaces.txt', expect.any(String), 'utf-8');
    });

    it('should handle very long content', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const longContent = 'a'.repeat(1024 * 1024); // 1MB for test speed
      const result = await createFile({
        path: 'C:\\test\\large.txt',
        content: longContent,
      });

      expect(result.bytesWritten).toBe(1024 * 1024);
      expect(fs.writeFile).toHaveBeenCalledWith('C:\\test\\large.txt', longContent, 'utf-8');
    });

    it('should handle content with various line endings', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await createFile({
        path: 'C:\\test\\mixed.txt',
        content: 'line1\nline2\r\nline3\r',
      });

      expect(restoreLineEndings).toHaveBeenCalledWith('line1\nline2\r\nline3\r', '\r\n');
    });

    it('should handle file path with no parent directory', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await createFile({
        path: 'C:\\file.txt',
        content: 'root content',
      });

      expect(fs.mkdir).toHaveBeenCalledWith('C:\\', { recursive: true });
    });

    it('should handle INI file content', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await createFile({
        path: 'C:\\Game\\config.ini',
        content: '[Section]\nKey=Value\n',
      });

      expect(fs.writeFile).toHaveBeenCalledWith('C:\\Game\\config.ini', '[Section]\r\nKey=Value\r\n', 'utf-8');
    });
  });

  describe('error scenarios', () => {
    it('should propagate mkdir errors', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(
        createFile({
          path: 'C:\\protected\\file.txt',
          content: 'content',
        })
      ).rejects.toThrow('EACCES: permission denied');
    });

    it('should propagate writeFile errors', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('ENOSPC: no space left on device'));

      await expect(
        createFile({
          path: 'C:\\test\\file.txt',
          content: 'content',
        })
      ).rejects.toThrow('ENOSPC: no space left on device');
    });

    it('should handle network path errors gracefully', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('ENETUNREACH: network unreachable'));

      await expect(
        createFile({
          path: '\\\\server\\share\\file.txt',
          content: 'content',
        })
      ).rejects.toThrow('ENETUNREACH');
    });
  });

  describe('file extension handling', () => {
    it('should handle .ini extension', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await createFile({
        path: 'C:\\Game\\config.ini',
        content: '[Section]',
      });

      expect(result.path).toBe('C:\\Game\\config.ini');
    });

    it('should handle .cfg extension', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await createFile({
        path: 'C:\\Game\\autoexec.cfg',
        content: 'bind "w" "+forward"',
      });

      expect(result.path).toBe('C:\\Game\\autoexec.cfg');
    });

    it('should handle .xml extension', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await createFile({
        path: 'C:\\Game\\settings.xml',
        content: '<?xml version="1.0"?><settings></settings>',
      });

      expect(result.path).toBe('C:\\Game\\settings.xml');
    });

    it('should handle files without extension', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await createFile({
        path: 'C:\\Game\\Makefile',
        content: 'all: build',
      });

      expect(result.path).toBe('C:\\Game\\Makefile');
    });
  });
});
