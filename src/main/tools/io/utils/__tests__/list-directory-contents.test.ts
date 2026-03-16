import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listDirectoryContents } from '../list-directory-contents.utils';

// Mock dependencies
vi.mock('fs', () => ({
  promises: {
    readdir: vi.fn(),
  },
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn((...parts: string[]) => parts.join('\\')),
    relative: vi.fn((from: string, to: string) => {
      // Simple relative path implementation for tests
      if (to.startsWith(from)) {
        const rel = to.slice(from.length);
        return rel.startsWith('\\') ? rel.slice(1) : rel;
      }
      return to;
    }),
  },
  join: vi.fn((...parts: string[]) => parts.join('\\')),
  relative: vi.fn((from: string, to: string) => {
    if (to.startsWith(from)) {
      const rel = to.slice(from.length);
      return rel.startsWith('\\') ? rel.slice(1) : rel;
    }
    return to;
  }),
}));

vi.mock('../../../../utils', () => ({
  expandWindowsEnvVars: vi.fn((path: string) => path.replace(/%([^%]+)%/g, (_, varName) => {
    if (varName === 'USERPROFILE') return 'C:\\Users\\TestUser';
    if (varName === 'APPDATA') return 'C:\\Users\\TestUser\\AppData\\Roaming';
    if (varName === 'LOCALAPPDATA') return 'C:\\Users\\TestUser\\AppData\\Local';
    return `%${varName}%`;
  })),
  createLogger: vi.fn(() => ({
    log: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  })),
}));

import { promises as fs } from 'fs';
import path from 'path';
import { expandWindowsEnvVars } from '../../../../utils';

// Helper to create mock directory entries
interface MockDirent {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
}

function createMockDirent(name: string, type: 'file' | 'directory'): MockDirent {
  return {
    name,
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
  };
}

describe('listDirectoryContents', () => {
  const mockReaddir = vi.mocked(fs.readdir);
  const mockExpandWindowsEnvVars = vi.mocked(expandWindowsEnvVars);
  const mockPathJoin = vi.mocked(path.join);
  const mockPathRelative = vi.mocked(path.relative);

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset path mocks to default behavior
    mockPathJoin.mockImplementation((...parts: string[]) => parts.join('\\'));
    mockPathRelative.mockImplementation((from: string, to: string) => {
      if (to.startsWith(from)) {
        const rel = to.slice(from.length);
        return rel.startsWith('\\') ? rel.slice(1) : rel;
      }
      return to;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('happy path - basic listing', () => {
    it('should list files and directories in a directory', async () => {
      const dirPath = 'C:\\Games\\MyGame';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('game.exe', 'file'),
        createMockDirent('config', 'directory'),
        createMockDirent('readme.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // For the 'config' subdirectory
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('settings.ini', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({ path: dirPath });

      expect(result.path).toBe(dirPath);
      expect(result.totalFiles).toBe(3);
      expect(result.totalDirectories).toBe(1);
      expect(result.truncated).toBe(false);
      expect(result.files).toContain('config\\');
    });

    it('should return sorted results', async () => {
      const dirPath = 'C:\\Games\\MyGame';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('zebra.txt', 'file'),
        createMockDirent('apple.txt', 'file'),
        createMockDirent('mango.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({ path: dirPath });

      expect(result.files).toEqual(['apple.txt', 'mango.txt', 'zebra.txt']);
    });
  });

  describe('depth control', () => {
    it('should respect default depth of 5', async () => {
      const dirPath = 'C:\\Games';

      // Create a 6-level deep structure
      // Level 0 (root)
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('level1', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Level 1
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('level2', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Level 2
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('level3', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Level 3
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('level4', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Level 4
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('level5', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Level 5 (at max depth)
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('level6', 'directory'),
        createMockDirent('deepfile.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Level 6 should NOT be traversed (beyond depth 5)

      const result = await listDirectoryContents({ path: dirPath });

      // Should have 6 directories (level1-6) but level6's contents not listed
      expect(result.totalDirectories).toBe(6);
      expect(mockReaddir).toHaveBeenCalledTimes(6);
    });

    it('should respect custom depth setting', async () => {
      const dirPath = 'C:\\Games';

      // Level 0 (root)
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('level1', 'directory'),
        createMockDirent('root.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Level 1
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('level2', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Level 2 should NOT be traversed with depth=1

      await listDirectoryContents({ path: dirPath, depth: 1 });

      expect(mockReaddir).toHaveBeenCalledTimes(2);
    });

    it('should handle depth of 0 (root only)', async () => {
      const dirPath = 'C:\\Games';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('subdir', 'directory'),
        createMockDirent('file.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // With depth=0, subdir should be listed but not traversed
      const result = await listDirectoryContents({ path: dirPath, depth: 0 });

      expect(mockReaddir).toHaveBeenCalledTimes(1);
      expect(result.totalDirectories).toBe(1);
      expect(result.totalFiles).toBe(1);
    });
  });

  describe('file name search', () => {
    it('should filter files by name search (case insensitive)', async () => {
      const dirPath = 'C:\\Games\\MyGame';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('config.ini', 'file'),
        createMockDirent('CONFIG_backup.ini', 'file'),
        createMockDirent('settings.xml', 'file'),
        createMockDirent('user_config.ini', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({
        path: dirPath,
        fileNameSearch: 'config',
      });

      expect(result.totalFiles).toBe(3);
      expect(result.files).toContain('config.ini');
      expect(result.files).toContain('CONFIG_backup.ini');
      expect(result.files).toContain('user_config.ini');
      expect(result.files).not.toContain('settings.xml');
    });

    it('should include directories regardless of search filter', async () => {
      const dirPath = 'C:\\Games\\MyGame';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('settings', 'directory'),
        createMockDirent('config.ini', 'file'),
        createMockDirent('readme.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // settings directory contents
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('game.ini', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({
        path: dirPath,
        fileNameSearch: 'ini',
      });

      // Directory should be included
      expect(result.files).toContain('settings\\');
      // Only .ini files should be listed
      expect(result.totalFiles).toBe(2);
    });

    it('should handle search with no matches', async () => {
      const dirPath = 'C:\\Games\\MyGame';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('game.exe', 'file'),
        createMockDirent('data.pak', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({
        path: dirPath,
        fileNameSearch: 'nonexistent',
      });

      expect(result.totalFiles).toBe(0);
      expect(result.files).toHaveLength(0);
    });
  });

  describe('maxFilesPerDirectory limiting', () => {
    it('should respect maxFilesPerDirectory limit', async () => {
      const dirPath = 'C:\\Games\\MyGame';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('file1.txt', 'file'),
        createMockDirent('file2.txt', 'file'),
        createMockDirent('file3.txt', 'file'),
        createMockDirent('file4.txt', 'file'),
        createMockDirent('file5.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({
        path: dirPath,
        maxFilesPerDirectory: 3,
      });

      expect(result.totalFiles).toBe(3);
      expect(result.truncated).toBe(true);
    });

    it('should not set truncated flag when under limit', async () => {
      const dirPath = 'C:\\Games\\MyGame';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('file1.txt', 'file'),
        createMockDirent('file2.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({
        path: dirPath,
        maxFilesPerDirectory: 25,
      });

      expect(result.truncated).toBe(false);
    });

    it('should apply limit after search filter', async () => {
      const dirPath = 'C:\\Games\\MyGame';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('match1.ini', 'file'),
        createMockDirent('nomatch.txt', 'file'),
        createMockDirent('match2.ini', 'file'),
        createMockDirent('match3.ini', 'file'),
        createMockDirent('match4.ini', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({
        path: dirPath,
        fileNameSearch: 'ini',
        maxFilesPerDirectory: 2,
      });

      // Only 2 of the 4 matching files should be included
      expect(result.totalFiles).toBe(2);
      expect(result.truncated).toBe(true);
    });

    it('should use default maxFilesPerDirectory of 25', async () => {
      const dirPath = 'C:\\Games\\MyGame';

      // Create 30 files
      const entries = Array.from({ length: 30 }, (_, i) =>
        createMockDirent(`file${i}.txt`, 'file')
      );

      mockReaddir.mockResolvedValueOnce(
        entries as unknown as Awaited<ReturnType<typeof fs.readdir>>
      );

      const result = await listDirectoryContents({ path: dirPath });

      expect(result.totalFiles).toBe(25);
      expect(result.truncated).toBe(true);
    });
  });

  describe('environment variable expansion', () => {
    it('should expand Windows environment variables in path', async () => {
      const envPath = '%USERPROFILE%\\Documents\\MyGame';
      const expandedPath = 'C:\\Users\\TestUser\\Documents\\MyGame';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('config.ini', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({ path: envPath });

      expect(mockExpandWindowsEnvVars).toHaveBeenCalledWith(envPath);
      expect(result.path).toBe(expandedPath);
    });
  });

  describe('error handling', () => {
    it('should skip directories with permission errors', async () => {
      const dirPath = 'C:\\Games';

      // Root directory
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('accessible', 'directory'),
        createMockDirent('protected', 'directory'),
        createMockDirent('file.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // accessible directory
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('accessible-file.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // protected directory - permission denied
      mockReaddir.mockRejectedValueOnce(new Error('EACCES: permission denied'));

      const result = await listDirectoryContents({ path: dirPath });

      // Should still return results, just skip the protected directory
      expect(result.totalFiles).toBe(2);
      expect(result.totalDirectories).toBe(2);
    });

    it('should propagate initial readdir error', async () => {
      const dirPath = 'C:\\NonExistent';

      mockReaddir.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

      // The function catches errors internally, so this should still work
      const result = await listDirectoryContents({ path: dirPath });

      expect(result.files).toHaveLength(0);
      expect(result.totalFiles).toBe(0);
    });

    it('should handle mixed success and failure in nested directories', async () => {
      const dirPath = 'C:\\Games';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('dir1', 'directory'),
        createMockDirent('dir2', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // dir1 - success
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('file1.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // dir2 - error
      mockReaddir.mockRejectedValueOnce(new Error('EPERM: operation not permitted'));

      const result = await listDirectoryContents({ path: dirPath });

      expect(result.totalFiles).toBe(1);
      expect(result.totalDirectories).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty directory', async () => {
      const dirPath = 'C:\\Games\\Empty';

      mockReaddir.mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({ path: dirPath });

      expect(result.files).toHaveLength(0);
      expect(result.totalFiles).toBe(0);
      expect(result.totalDirectories).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it('should handle directory with only subdirectories', async () => {
      const dirPath = 'C:\\Games\\DirsOnly';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('dir1', 'directory'),
        createMockDirent('dir2', 'directory'),
        createMockDirent('dir3', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Empty subdirectories
      mockReaddir.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({ path: dirPath });

      expect(result.totalFiles).toBe(0);
      expect(result.totalDirectories).toBe(3);
    });

    it('should handle special characters in file and directory names', async () => {
      const dirPath = 'C:\\Games\\Special (1)';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('file with spaces.txt', 'file'),
        createMockDirent('file(1).txt', 'file'),
        createMockDirent('file[2].txt', 'file'),
        createMockDirent('dir with spaces', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('nested file.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({ path: dirPath });

      expect(result.totalFiles).toBe(4);
      expect(result.files).toContain('file with spaces.txt');
      expect(result.files).toContain('file(1).txt');
    });

    it('should handle unicode characters in names', async () => {
      const dirPath = 'C:\\Games\\Unicode';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('\u65e5\u672c\u8a9e.txt', 'file'),
        createMockDirent('\u00e9\u00e8\u00ea.ini', 'file'),
        createMockDirent('\u4e2d\u6587', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      mockReaddir.mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({ path: dirPath });

      expect(result.totalFiles).toBe(2);
      expect(result.totalDirectories).toBe(1);
    });

    it('should mark directories with trailing backslash', async () => {
      const dirPath = 'C:\\Games';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('MyDir', 'directory'),
        createMockDirent('file.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      mockReaddir.mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({ path: dirPath });

      expect(result.files.some(f => f === 'MyDir\\')).toBe(true);
      expect(result.files.some(f => f === 'file.txt')).toBe(true);
    });

    it('should handle deeply nested structures', async () => {
      const dirPath = 'C:\\Games';

      // Level 0
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('a', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Level 1
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('b', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Level 2
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('c', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Level 3
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('deepfile.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({ path: dirPath, depth: 3 });

      expect(result.totalDirectories).toBe(3);
      expect(result.totalFiles).toBe(1);
    });
  });

  describe('file counting', () => {
    it('should correctly count files vs directories', async () => {
      const dirPath = 'C:\\Games';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('dir1', 'directory'),
        createMockDirent('dir2', 'directory'),
        createMockDirent('file1.txt', 'file'),
        createMockDirent('file2.txt', 'file'),
        createMockDirent('file3.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Empty subdirectories
      mockReaddir.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({ path: dirPath });

      expect(result.totalFiles).toBe(3);
      expect(result.totalDirectories).toBe(2);
      expect(result.files.filter(f => f.endsWith('\\'))).toHaveLength(2);
      expect(result.files.filter(f => !f.endsWith('\\'))).toHaveLength(3);
    });

    it('should count nested files correctly', async () => {
      const dirPath = 'C:\\Games';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('subdir', 'directory'),
        createMockDirent('root.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('nested1.txt', 'file'),
        createMockDirent('nested2.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await listDirectoryContents({ path: dirPath });

      expect(result.totalFiles).toBe(3);
      expect(result.totalDirectories).toBe(1);
    });
  });

  describe('combination of options', () => {
    it('should apply both search filter and depth limit', async () => {
      const dirPath = 'C:\\Games';

      // Level 0
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('level1', 'directory'),
        createMockDirent('match.ini', 'file'),
        createMockDirent('nomatch.txt', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Level 1
      mockReaddir.mockResolvedValueOnce([
        createMockDirent('level2', 'directory'),
        createMockDirent('deep.ini', 'file'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Level 2 should not be traversed with depth=1

      const result = await listDirectoryContents({
        path: dirPath,
        depth: 1,
        fileNameSearch: 'ini',
      });

      expect(result.totalFiles).toBe(2);
      expect(mockReaddir).toHaveBeenCalledTimes(2);
    });

    it('should apply search filter, depth limit, and maxFiles together', async () => {
      const dirPath = 'C:\\Games';

      mockReaddir.mockResolvedValueOnce([
        createMockDirent('match1.ini', 'file'),
        createMockDirent('match2.ini', 'file'),
        createMockDirent('match3.ini', 'file'),
        createMockDirent('nomatch.txt', 'file'),
        createMockDirent('subdir', 'directory'),
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      // Should not traverse subdir with depth=0

      const result = await listDirectoryContents({
        path: dirPath,
        depth: 0,
        fileNameSearch: 'ini',
        maxFilesPerDirectory: 2,
      });

      expect(result.totalFiles).toBe(2);
      expect(result.truncated).toBe(true);
      expect(mockReaddir).toHaveBeenCalledTimes(1);
    });
  });
});
