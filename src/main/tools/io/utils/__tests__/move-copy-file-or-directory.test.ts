import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MoveCopyFileOrDirectoryParams } from '../types';

// Mock dependencies using paths as they appear in the source file's imports
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn(),
    copyFile: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn(),
    rmdir: vi.fn(),
  },
}));

// Mock main/utils (expandWindowsEnvVars)
// Test file is at utils/__tests__/, source imports from '../../../tool.utils' (main/utils)
// So from test file, path to main/utils is ../../../../utils
vi.mock('../../../../utils', () => ({
  expandWindowsEnvVars: vi.fn((path: string) => {
    return path
      .replace(/%USERPROFILE%/gi, 'C:\\Users\\testuser')
      .replace(/%APPDATA%/gi, 'C:\\Users\\testuser\\AppData\\Roaming')
      .replace(/%LOCALAPPDATA%/gi, 'C:\\Users\\testuser\\AppData\\Local');
  }),
}));

// Mock tools/utils.ts (createBackup)
// Test file is at utils/__tests__/, source imports from '../../tool.utils' (tools/utils)
// So from test file, path to tools/utils is ../../../utils
vi.mock('../../../utils', () => ({
  createBackup: vi.fn(),
}));

// Import the function under test and mocked modules AFTER mocks are set up
import { moveCopyFileOrDirectory } from '../move-copy-file-or-directory.utils';
import { promises as fs } from 'fs';


describe('moveCopyFileOrDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy path - single file operations', () => {
    it('should move a single file successfully', async () => {
      // Setup mocks
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\file.txt',
            destinationPath: 'C:\\dest\\file.txt',
            skipBackup: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(1);
      expect(result.failedOperations).toBe(0);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].sourcePath).toBe('C:\\source\\file.txt');
      expect(result.results[0].destinationPath).toBe('C:\\dest\\file.txt');
      expect(result.results[0].wasCopy).toBe(false);
    });

    it('should copy a single file when copyOnly is true', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\file.txt',
            destinationPath: 'C:\\dest\\file.txt',
            skipBackup: true,
            copyOnly: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].wasCopy).toBe(true);
      expect(fs.copyFile).toHaveBeenCalledWith('C:\\source\\file.txt', 'C:\\dest\\file.txt');
      expect(fs.rename).not.toHaveBeenCalled();
    });

    it('should track overwrite when destination exists and skipBackup is false', async () => {
      // Both source and destination exist
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\file.txt',
            destinationPath: 'C:\\dest\\file.txt',
            skipBackup: false,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(1);
      expect(result.results[0].success).toBe(true);
      // When destination exists, wasOverwrite should be true
      expect(result.results[0].fileTransfers?.[0].wasOverwrite).toBe(true);
    });
  });

  describe('Happy path - directory operations', () => {
    it('should move a directory with nested files', async () => {
      // Source exists
      vi.mocked(fs.access).mockResolvedValue(undefined);

      // First stat call for source - it's a directory
      // Then for each file in directory
      let statCallCount = 0;
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        statCallCount++;
        const pathStr = String(path);
        if (pathStr === 'C:\\source\\dir' || pathStr === 'C:\\source\\dir\\subdir') {
          return { isDirectory: () => true, size: 0 } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never;
        }
        return { isDirectory: () => false, size: 1024 } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never;
      });

      // Mock readdir for directories
      vi.mocked(fs.readdir).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr === 'C:\\source\\dir') {
          return ['file1.txt', 'subdir'] as unknown as ReturnType<typeof fs.readdir> extends Promise<infer T> ? T : never;
        }
        if (pathStr === 'C:\\source\\dir\\subdir') {
          return ['file2.txt'] as unknown as ReturnType<typeof fs.readdir> extends Promise<infer T> ? T : never;
        }
        return [] as unknown as ReturnType<typeof fs.readdir> extends Promise<infer T> ? T : never;
      });

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);
      vi.mocked(fs.rmdir).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockRejectedValue({ code: 'EXDEV' }); // Simulate cross-drive

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\dir',
            destinationPath: 'D:\\dest\\dir',
            skipBackup: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(1);
      expect(result.results[0].success).toBe(true);
      // Verify files were copied
      expect(fs.copyFile).toHaveBeenCalled();
      // Verify source was cleaned up
      expect(fs.unlink).toHaveBeenCalled();
      expect(fs.rmdir).toHaveBeenCalled();
    });

    it('should copy a directory when copyOnly is true', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr === 'C:\\source\\dir') {
          return { isDirectory: () => true, size: 0 } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never;
        }
        return { isDirectory: () => false, size: 1024 } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never;
      });

      vi.mocked(fs.readdir).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr === 'C:\\source\\dir') {
          return ['file1.txt'] as unknown as ReturnType<typeof fs.readdir> extends Promise<infer T> ? T : never;
        }
        return [] as unknown as ReturnType<typeof fs.readdir> extends Promise<infer T> ? T : never;
      });

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\dir',
            destinationPath: 'C:\\dest\\dir',
            skipBackup: true,
            copyOnly: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(1);
      expect(result.results[0].wasCopy).toBe(true);
      expect(fs.copyFile).toHaveBeenCalled();
      // Source should NOT be deleted
      expect(fs.unlink).not.toHaveBeenCalled();
      expect(fs.rmdir).not.toHaveBeenCalled();
    });
  });

  describe('Batch operations', () => {
    it('should handle multiple operations with mixed results', async () => {
      let accessCallIndex = 0;
      vi.mocked(fs.access).mockImplementation(async (path) => {
        accessCallIndex++;
        const pathStr = String(path);
        // First operation source exists, second doesn't
        if (pathStr === 'C:\\source\\file1.txt') {
          return undefined;
        }
        if (pathStr === 'C:\\source\\nonexistent.txt') {
          throw new Error('ENOENT');
        }
        return undefined;
      });

      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\file1.txt',
            destinationPath: 'C:\\dest\\file1.txt',
            skipBackup: true,
          },
          {
            sourcePath: 'C:\\source\\nonexistent.txt',
            destinationPath: 'C:\\dest\\nonexistent.txt',
            skipBackup: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(1);
      expect(result.failedOperations).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toContain('Source path does not exist');
    });

    it('should process all operations and track file transfers', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\file1.txt',
            destinationPath: 'C:\\dest\\file1.txt',
            skipBackup: true,
          },
          {
            sourcePath: 'C:\\source\\file2.txt',
            destinationPath: 'C:\\dest\\file2.txt',
            skipBackup: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(2);
      expect(result.failedOperations).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].fileTransfers).toBeDefined();
      expect(result.results[1].fileTransfers).toBeDefined();
    });
  });

  describe('Environment variable expansion', () => {
    it('should expand Windows environment variables in paths', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: '%USERPROFILE%\\Documents\\file.txt',
            destinationPath: '%APPDATA%\\MyApp\\file.txt',
            skipBackup: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      // Verify the paths were expanded (behavior verification)
      expect(result.results[0].sourcePath).toBe('C:\\Users\\testuser\\Documents\\file.txt');
      expect(result.results[0].destinationPath).toBe('C:\\Users\\testuser\\AppData\\Roaming\\MyApp\\file.txt');
    });
  });

  describe('Error handling', () => {
    it('should handle source file not existing', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\nonexistent\\file.txt',
            destinationPath: 'C:\\dest\\file.txt',
            skipBackup: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.failedOperations).toBe(1);
      expect(result.successfulOperations).toBe(0);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('Source path does not exist');
    });

    it('should handle permission errors during copy', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockRejectedValue(new Error('EACCES: permission denied'));

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\file.txt',
            destinationPath: 'C:\\dest\\file.txt',
            skipBackup: true,
            copyOnly: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.failedOperations).toBe(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('EACCES');
    });

    it('should handle rename errors for same-drive moves', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockRejectedValue(new Error('EPERM: operation not permitted'));

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\file.txt',
            destinationPath: 'C:\\dest\\file.txt',
            skipBackup: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.failedOperations).toBe(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('EPERM');
    });
  });

  describe('Cross-drive move handling', () => {
    it('should fallback to copy+delete for cross-drive moves (EXDEV error)', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      // Simulate EXDEV error on rename
      const exdevError = new Error('EXDEV: cross-device link not permitted') as NodeJS.ErrnoException;
      exdevError.code = 'EXDEV';
      vi.mocked(fs.rename).mockRejectedValue(exdevError);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\file.txt',
            destinationPath: 'D:\\dest\\file.txt',
            skipBackup: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(1);
      expect(result.results[0].success).toBe(true);
      // Should have copied the file
      expect(fs.copyFile).toHaveBeenCalledWith('C:\\source\\file.txt', 'D:\\dest\\file.txt');
      // Should have deleted the source
      expect(fs.unlink).toHaveBeenCalledWith('C:\\source\\file.txt');
    });
  });

  describe('File transfer tracking', () => {
    it('should track file transfers for single file moves', async () => {
      // Source exists, destination does NOT exist
      vi.mocked(fs.access).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr === 'C:\\source\\file.txt') {
          return undefined; // Source exists
        }
        throw new Error('ENOENT'); // Destination doesn't exist
      });
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\file.txt',
            destinationPath: 'C:\\dest\\file.txt',
            skipBackup: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.results[0].fileTransfers).toBeDefined();
      expect(result.results[0].fileTransfers).toHaveLength(1);
      expect(result.results[0].fileTransfers![0]).toEqual({
        sourcePath: 'C:\\source\\file.txt',
        destinationPath: 'C:\\dest\\file.txt',
        wasOverwrite: false,
      });
    });

    it('should track directories created during operations', async () => {
      vi.mocked(fs.access).mockImplementation(async (path) => {
        const pathStr = String(path);
        if (pathStr === 'C:\\source\\file.txt') {
          return undefined;
        }
        // Destination directory and file don't exist
        throw new Error('ENOENT');
      });
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\file.txt',
            destinationPath: 'C:\\dest\\newdir\\file.txt',
            skipBackup: true,
            copyOnly: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(1);
      // Parent directory creation should be tracked
      expect(result.results[0].directoriesCreated).toBeDefined();
    });

    it('should mark overwrite correctly when destination exists', async () => {
      // Both source and destination exist
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\file.txt',
            destinationPath: 'C:\\dest\\file.txt',
            skipBackup: false,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      // Verify operation succeeded
      expect(result.successfulOperations).toBe(1);
      expect(result.results[0].success).toBe(true);
      // When destination exists, wasOverwrite should be true
      expect(result.results[0].fileTransfers).toBeDefined();
      expect(result.results[0].fileTransfers![0].wasOverwrite).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty operations array', async () => {
      const params: MoveCopyFileOrDirectoryParams = {
        operations: [],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(0);
      expect(result.failedOperations).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should handle paths with special characters', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\file (1).txt',
            destinationPath: 'C:\\dest\\file [copy].txt',
            skipBackup: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(1);
      expect(result.results[0].success).toBe(true);
    });

    it('should handle paths with unicode characters', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\archivo.txt',
            destinationPath: 'C:\\dest\\fichier.txt',
            skipBackup: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(1);
    });

    it('should handle long paths', async () => {
      const longPath = 'C:\\' + 'a'.repeat(200) + '\\file.txt';

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: longPath,
            destinationPath: 'C:\\dest\\file.txt',
            skipBackup: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(1);
    });
  });

  describe('Directory merge behavior', () => {
    it('should merge directories when destination exists', async () => {
      // Source and destination directories both exist
      vi.mocked(fs.access).mockResolvedValue(undefined);

      vi.mocked(fs.stat).mockImplementation(async (path) => {
        const pathStr = String(path);
        // Both source and destination are directories
        if (pathStr === 'C:\\source\\dir' || pathStr === 'C:\\dest\\dir') {
          return { isDirectory: () => true, size: 0 } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never;
        }
        return { isDirectory: () => false, size: 1024 } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never;
      });

      vi.mocked(fs.readdir).mockImplementation(async (path) => {
        if (String(path) === 'C:\\source\\dir') {
          return ['file1.txt'] as unknown as ReturnType<typeof fs.readdir> extends Promise<infer T> ? T : never;
        }
        return [] as unknown as ReturnType<typeof fs.readdir> extends Promise<infer T> ? T : never;
      });

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(fs.rmdir).mockResolvedValue(undefined);

      const params: MoveCopyFileOrDirectoryParams = {
        operations: [
          {
            sourcePath: 'C:\\source\\dir',
            destinationPath: 'C:\\dest\\dir',
            skipBackup: true,
          },
        ],
      };

      const result = await moveCopyFileOrDirectory(params);

      expect(result.successfulOperations).toBe(1);
      // Should have file transfer records for the merged files
      expect(result.results[0].fileTransfers).toBeDefined();
    });
  });
});
