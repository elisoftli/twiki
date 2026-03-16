import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Stats } from 'fs';
import { promises as fs } from 'fs';

// Define mock zip methods that tests will configure
const mockAddFile = vi.fn();
const mockWriteZip = vi.fn();

// Mock all external dependencies before importing the module under test
vi.mock('fs', () => ({
  promises: {
    stat: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    rm: vi.fn(),
  },
}));

// Mock AdmZip class - must use a class constructor (not arrow function)
vi.mock('adm-zip', () => {
  // Use a class to ensure it works with 'new'
  class MockAdmZip {
    addFile = mockAddFile;
    writeZip = mockWriteZip;
  }
  return { default: MockAdmZip };
});

// Mock tools/tool.utils.ts (createBackup)
// Test file is at io/utils/__tests__/, source imports from '../../tool.utils' (tools/tool.utils)
// From test file, path to tools/tool.utils is ../../../tool.utils
vi.mock('../../../tool.utils', () => ({
  createBackup: vi.fn(),
}));

// Mock main/utils (expandWindowsEnvVars, createLogger)
// Test file is at io/utils/__tests__/, source imports from '../../../tool.utils' (main/utils)
// From test file, path to main/utils is ../../../../utils
vi.mock('../../../../utils', () => ({
  expandWindowsEnvVars: vi.fn((path: string) => path),
  createLogger: vi.fn(() => ({
    log: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  })),
}));

// Import module under test after mocks are set up
import { createArchive } from '../create-archive.utils';
// Import mocked modules with same paths as vi.mock (relative to THIS test file)
import { createBackup } from '../../../tool.utils';
import { expandWindowsEnvVars } from '../../../../utils';

describe('createArchive', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(expandWindowsEnvVars).mockImplementation((p: string) => p);
    vi.mocked(createBackup).mockResolvedValue(undefined);
    vi.mocked(fs.rm).mockResolvedValue(undefined);
  });

  describe('happy path', () => {
    it('should create an archive from a directory with files', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file1.txt', isDirectory: () => false, isFile: () => true },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('file content'));

      const result = await createArchive({
        sourcePath: 'C:\\source\\folder',
        archivePath: 'C:\\output\\archive.zip',
      });

      expect(result).toEqual({
        path: 'C:\\output\\archive.zip',
        backupPath: undefined,
        sourceCleanedUp: true,
      });
      expect(mockAddFile).toHaveBeenCalledWith('file1.txt', expect.any(Buffer));
      expect(mockWriteZip).toHaveBeenCalledWith('C:\\output\\archive.zip');
      expect(fs.rm).toHaveBeenCalledWith('C:\\source\\folder', { recursive: true, force: true });
    });

    it('should create an archive with nested directories', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce([
          { name: 'subdir', isDirectory: () => true, isFile: () => false },
          { name: 'root.txt', isDirectory: () => false, isFile: () => true },
        ] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
        .mockResolvedValueOnce([
          { name: 'nested.txt', isDirectory: () => false, isFile: () => true },
        ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('content'));

      const result = await createArchive({
        sourcePath: 'C:\\source',
        archivePath: 'C:\\output\\archive.zip',
      });

      expect(result.path).toBe('C:\\output\\archive.zip');
      expect(mockAddFile).toHaveBeenCalledTimes(2);
    });

    it('should backup existing archive before overwriting', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file.txt', isDirectory: () => false, isFile: () => true },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(createBackup).mockResolvedValue('C:\\output\\archive.zip.backup_123');

      const result = await createArchive({
        sourcePath: 'C:\\source',
        archivePath: 'C:\\output\\archive.zip',
      });

      expect(createBackup).toHaveBeenCalledWith('C:\\output\\archive.zip');
      expect(result.backupPath).toBe('C:\\output\\archive.zip.backup_123');
    });

    it('should not cleanup source when cleanupSource is false', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file.txt', isDirectory: () => false, isFile: () => true },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('content'));

      const result = await createArchive({
        sourcePath: 'C:\\source',
        archivePath: 'C:\\output\\archive.zip',
        cleanupSource: false,
      });

      expect(fs.rm).not.toHaveBeenCalled();
      expect(result.sourceCleanedUp).toBe(false);
    });

    it('should handle empty directory', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const result = await createArchive({
        sourcePath: 'C:\\empty\\folder',
        archivePath: 'C:\\output\\empty.zip',
      });

      expect(result.path).toBe('C:\\output\\empty.zip');
      expect(mockAddFile).not.toHaveBeenCalled();
      expect(mockWriteZip).toHaveBeenCalledWith('C:\\output\\empty.zip');
    });
  });

  describe('environment variable expansion', () => {
    it('should expand environment variables in source path', async () => {
      vi.mocked(expandWindowsEnvVars)
        .mockReturnValueOnce('C:\\Users\\test\\source')
        .mockReturnValueOnce('C:\\output\\archive.zip');
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      await createArchive({
        sourcePath: '%USERPROFILE%\\source',
        archivePath: 'C:\\output\\archive.zip',
      });

      expect(expandWindowsEnvVars).toHaveBeenCalledWith('%USERPROFILE%\\source');
      expect(fs.stat).toHaveBeenCalledWith('C:\\Users\\test\\source');
    });

    it('should expand environment variables in archive path', async () => {
      vi.mocked(expandWindowsEnvVars)
        .mockReturnValueOnce('C:\\source')
        .mockReturnValueOnce('C:\\Users\\test\\Documents\\archive.zip');
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      await createArchive({
        sourcePath: 'C:\\source',
        archivePath: '%USERPROFILE%\\Documents\\archive.zip',
      });

      expect(expandWindowsEnvVars).toHaveBeenCalledWith('%USERPROFILE%\\Documents\\archive.zip');
      expect(mockWriteZip).toHaveBeenCalledWith('C:\\Users\\test\\Documents\\archive.zip');
    });
  });

  describe('error handling', () => {
    it('should throw error when source directory does not exist', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));

      await expect(
        createArchive({
          sourcePath: 'C:\\nonexistent\\folder',
          archivePath: 'C:\\output\\archive.zip',
        })
      ).rejects.toThrow('Source directory not found');
    });

    it('should throw error when source path is not a directory', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => false } as Stats);

      await expect(
        createArchive({
          sourcePath: 'C:\\some\\file.txt',
          archivePath: 'C:\\output\\archive.zip',
        })
      ).rejects.toThrow('Source path is not a directory');
    });

    it('should handle cleanup failure gracefully', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);
      vi.mocked(fs.readdir).mockResolvedValue([]);
      vi.mocked(fs.rm).mockRejectedValue(new Error('Permission denied'));

      const result = await createArchive({
        sourcePath: 'C:\\source',
        archivePath: 'C:\\output\\archive.zip',
        cleanupSource: true,
      });

      // Should complete successfully despite cleanup failure
      expect(result.sourceCleanedUp).toBe(false);
      expect(result.path).toBe('C:\\output\\archive.zip');
    });
  });

  describe('edge cases', () => {
    it('should handle files with special characters in names', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file with spaces.txt', isDirectory: () => false, isFile: () => true },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('content'));

      const result = await createArchive({
        sourcePath: 'C:\\source',
        archivePath: 'C:\\output\\archive.zip',
      });

      expect(result.path).toBe('C:\\output\\archive.zip');
      expect(mockAddFile).toHaveBeenCalledWith('file with spaces.txt', expect.any(Buffer));
    });

    it('should skip entries that are neither files nor directories', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'regular.txt', isDirectory: () => false, isFile: () => true },
        { name: 'symlink', isDirectory: () => false, isFile: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('content'));

      await createArchive({
        sourcePath: 'C:\\source',
        archivePath: 'C:\\output\\archive.zip',
      });

      expect(mockAddFile).toHaveBeenCalledTimes(1);
      expect(mockAddFile).toHaveBeenCalledWith('regular.txt', expect.any(Buffer));
    });

    it('should handle deeply nested directory structures', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce([
          { name: 'level1', isDirectory: () => true, isFile: () => false },
        ] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
        .mockResolvedValueOnce([
          { name: 'level2', isDirectory: () => true, isFile: () => false },
        ] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
        .mockResolvedValueOnce([
          { name: 'deep-file.txt', isDirectory: () => false, isFile: () => true },
        ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('deep content'));

      await createArchive({
        sourcePath: 'C:\\source',
        archivePath: 'C:\\output\\archive.zip',
      });

      expect(mockAddFile).toHaveBeenCalledTimes(1);
    });

    it('should handle large binary files', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'large-binary.bin', isDirectory: () => false, isFile: () => true },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      const largeBinaryContent = Buffer.alloc(1024, 0xFF); // 1KB - just verifying binary passthrough
      vi.mocked(fs.readFile).mockResolvedValue(largeBinaryContent);

      await createArchive({
        sourcePath: 'C:\\source',
        archivePath: 'C:\\output\\archive.zip',
      });

      expect(mockAddFile).toHaveBeenCalledWith('large-binary.bin', largeBinaryContent);
    });
  });
});
