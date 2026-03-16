import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EditFileParams, EditOperation } from '../types';

// Use vi.hoisted to define mock functions that work with hoisted vi.mock factories
const {
  mockExpandWindowsEnvVars,
  mockComputeFileHash,
  mockCreateBackup,
  mockUnescapeString,
  mockReadFileNormalized,
  mockWriteFileWithLineEnding,
} = vi.hoisted(() => ({
  mockExpandWindowsEnvVars: vi.fn((path: string) =>
    path.replace(/%([^%]+)%/g, (_, varName) => {
      if (varName === 'USERPROFILE') return 'C:\\Users\\TestUser';
      if (varName === 'APPDATA') return 'C:\\Users\\TestUser\\AppData\\Roaming';
      return `%${varName}%`;
    })
  ),
  mockComputeFileHash: vi.fn(),
  mockCreateBackup: vi.fn(),
  mockUnescapeString: vi.fn((str: string) =>
    str
      .replace(/\\r\\n/g, '\r\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
  ),
  mockReadFileNormalized: vi.fn(),
  mockWriteFileWithLineEnding: vi.fn(),
}));

// Mock all dependencies - paths are relative to THIS test file
// src/main/utils (expandWindowsEnvVars) = ../../../../utils from __tests__/
vi.mock('../../../../utils', () => ({
  expandWindowsEnvVars: mockExpandWindowsEnvVars,
}));

// src/main/utils/file-hash.utils = ../../../../utils/file-hash.utils from __tests__/
vi.mock('../../../../utils/file-hash.utils', () => ({
  computeFileHash: mockComputeFileHash,
  FILE_NOT_EXISTS_HASH: '__FILE_DOES_NOT_EXIST__',
}));

// src/main/tools/tool.utils (createBackup, etc.) = ../../../tool.utils from __tests__/
vi.mock('../../../tool.utils', () => ({
  createBackup: mockCreateBackup,
  unescapeString: mockUnescapeString,
  readFileNormalized: mockReadFileNormalized,
  writeFileWithLineEnding: mockWriteFileWithLineEnding,
}));

// Import the function under test after mocks are set up
import { editFile } from '../edit-file.utils';

describe('editFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('happy path - single operation', () => {
    it('should successfully replace a single unique string', async () => {
      const testPath = 'C:\\Games\\MyGame\\config.ini';
      const originalContent = '[Settings]\nResolution=1920x1080\nFullscreen=false';
      const expectedContent = '[Settings]\nResolution=1920x1080\nFullscreen=true';

      mockComputeFileHash.mockResolvedValueOnce('abc123').mockResolvedValueOnce('def456');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup_123456`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: originalContent,
        lineEnding: '\r\n',
      });
      mockWriteFileWithLineEnding.mockResolvedValueOnce(undefined);

      const params: EditFileParams = {
        path: testPath,
        operations: [
          { oldString: 'Fullscreen=false', newString: 'Fullscreen=true' },
        ],
      };

      const result = await editFile(params);

      expect(result.path).toBe(testPath);
      expect(result.backupPath).toBe(`${testPath}.backup_123456`);
      expect(result.operationsApplied).toHaveLength(1);
      expect(result.operationsFailed).toBeUndefined();
      expect(result.wasDryRun).toBe(false);
      expect(result.fileHashes).toEqual([
        { filePath: testPath, beforeHash: 'abc123', afterHash: 'def456' },
      ]);

      expect(mockWriteFileWithLineEnding).toHaveBeenCalledWith(
        testPath,
        expectedContent,
        '\r\n'
      );
    });

    it('should handle replaceAll flag for multiple occurrences', async () => {
      const testPath = 'C:\\Games\\MyGame\\config.ini';
      const originalContent = 'color=red\ntext_color=red\nbg_color=blue';
      const expectedContent = 'color=green\ntext_color=green\nbg_color=blue';

      mockComputeFileHash.mockResolvedValueOnce('hash1').mockResolvedValueOnce('hash2');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup_123`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: originalContent,
        lineEnding: '\n',
      });

      const params: EditFileParams = {
        path: testPath,
        operations: [
          { oldString: 'red', newString: 'green', replaceAll: true },
        ],
      };

      const result = await editFile(params);

      expect(result.operationsApplied).toHaveLength(1);
      expect(result.operationsFailed).toBeUndefined();
      expect(mockWriteFileWithLineEnding).toHaveBeenCalledWith(
        testPath,
        expectedContent,
        '\n'
      );
    });
  });

  describe('happy path - multiple operations', () => {
    it('should apply multiple operations sequentially', async () => {
      const testPath = 'C:\\Games\\config.ini';
      const originalContent = 'setting1=value1\nsetting2=value2\nsetting3=value3';

      mockComputeFileHash.mockResolvedValueOnce('h1').mockResolvedValueOnce('h2');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: originalContent,
        lineEnding: '\r\n',
      });

      const operations: EditOperation[] = [
        { oldString: 'setting1=value1', newString: 'setting1=newvalue1' },
        { oldString: 'setting2=value2', newString: 'setting2=newvalue2' },
      ];

      const result = await editFile({ path: testPath, operations });

      expect(result.operationsApplied).toHaveLength(2);
      expect(result.operationsFailed).toBeUndefined();
    });

    it('should continue even if one operation fails', async () => {
      const testPath = 'C:\\Games\\config.ini';
      const originalContent = 'setting1=value1\nsetting2=value2';

      mockComputeFileHash.mockResolvedValueOnce('h1').mockResolvedValueOnce('h2');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: originalContent,
        lineEnding: '\r\n',
      });

      const operations: EditOperation[] = [
        { oldString: 'nonexistent', newString: 'replaced' },
        { oldString: 'setting1=value1', newString: 'setting1=newvalue' },
      ];

      const result = await editFile({ path: testPath, operations });

      expect(result.operationsApplied).toHaveLength(1);
      expect(result.operationsFailed).toHaveLength(1);
      expect(result.operationsFailed?.[0].error).toContain('String not found');
    });
  });

  describe('dry run mode', () => {
    it('should not modify file or create backup in dry run mode', async () => {
      const testPath = 'C:\\Games\\config.ini';
      const originalContent = 'setting=old';

      mockComputeFileHash.mockResolvedValueOnce('hash123');
      mockReadFileNormalized.mockResolvedValueOnce({
        content: originalContent,
        lineEnding: '\r\n',
      });

      const result = await editFile({
        path: testPath,
        operations: [{ oldString: 'setting=old', newString: 'setting=new' }],
        dryRun: true,
      });

      expect(result.wasDryRun).toBe(true);
      expect(result.backupPath).toBeUndefined();
      expect(result.operationsApplied).toHaveLength(1);
      expect(mockCreateBackup).not.toHaveBeenCalled();
      expect(mockWriteFileWithLineEnding).not.toHaveBeenCalled();
      // beforeHash and afterHash should be the same in dry run
      expect(result.fileHashes?.[0].beforeHash).toBe('hash123');
      expect(result.fileHashes?.[0].afterHash).toBe('hash123');
    });

    it('should detect and report failed operations in dry run', async () => {
      const testPath = 'C:\\Games\\config.ini';
      const originalContent = 'repeated=1\nrepeated=2\nrepeated=3';

      mockComputeFileHash.mockResolvedValueOnce('hash');
      mockReadFileNormalized.mockResolvedValueOnce({
        content: originalContent,
        lineEnding: '\r\n',
      });

      const result = await editFile({
        path: testPath,
        operations: [{ oldString: 'repeated', newString: 'unique' }],
        dryRun: true,
      });

      expect(result.operationsApplied).toHaveLength(0);
      expect(result.operationsFailed).toHaveLength(1);
      expect(result.operationsFailed?.[0].error).toContain('found 3 times');
    });
  });

  describe('hash validation', () => {
    it('should succeed when expectedFileHash matches current file hash', async () => {
      const testPath = 'C:\\Games\\config.ini';

      mockComputeFileHash.mockResolvedValueOnce('expected_hash').mockResolvedValueOnce('new_hash');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: 'content=old',
        lineEnding: '\r\n',
      });

      const result = await editFile({
        path: testPath,
        operations: [{ oldString: 'content=old', newString: 'content=new' }],
        expectedFileHash: 'expected_hash',
      });

      expect(result.operationsApplied).toHaveLength(1);
    });

    it('should throw error when expectedFileHash does not match', async () => {
      const testPath = 'C:\\Games\\config.ini';

      mockComputeFileHash.mockResolvedValueOnce('current_hash');

      await expect(
        editFile({
          path: testPath,
          operations: [{ oldString: 'old', newString: 'new' }],
          expectedFileHash: 'different_hash',
        })
      ).rejects.toThrow('File has been modified since it was read');
    });

    it('should use FILE_NOT_EXISTS_HASH when file does not exist', async () => {
      const testPath = 'C:\\Games\\newfile.ini';

      mockComputeFileHash.mockResolvedValueOnce(null);
      mockReadFileNormalized.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(
        editFile({
          path: testPath,
          operations: [{ oldString: 'old', newString: 'new' }],
        })
      ).rejects.toThrow('ENOENT');

      // Verify the hash was computed
      expect(mockComputeFileHash).toHaveBeenCalledWith(testPath);
    });
  });

  describe('environment variable expansion', () => {
    it('should expand Windows environment variables in path', async () => {
      const envPath = '%USERPROFILE%\\Documents\\MyGame\\config.ini';
      const expandedPath = 'C:\\Users\\TestUser\\Documents\\MyGame\\config.ini';

      mockComputeFileHash.mockResolvedValueOnce('h1').mockResolvedValueOnce('h2');
      mockCreateBackup.mockResolvedValueOnce(`${expandedPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: 'setting=value',
        lineEnding: '\r\n',
      });

      const result = await editFile({
        path: envPath,
        operations: [{ oldString: 'setting=value', newString: 'setting=new' }],
      });

      expect(mockExpandWindowsEnvVars).toHaveBeenCalledWith(envPath);
      expect(result.path).toBe(expandedPath);
    });
  });

  describe('edge cases - string matching', () => {
    it('should fail when string is not found', async () => {
      const testPath = 'C:\\Games\\config.ini';

      mockComputeFileHash.mockResolvedValueOnce('hash');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: 'existing content here',
        lineEnding: '\r\n',
      });

      const result = await editFile({
        path: testPath,
        operations: [{ oldString: 'nonexistent string', newString: 'replacement' }],
      });

      expect(result.operationsApplied).toHaveLength(0);
      expect(result.operationsFailed).toHaveLength(1);
      expect(result.operationsFailed?.[0].error).toContain('String not found');
    });

    it('should fail when multiple occurrences found without replaceAll', async () => {
      const testPath = 'C:\\Games\\config.ini';
      const content = 'value=1\nvalue=2\nvalue=3';

      mockComputeFileHash.mockResolvedValueOnce('hash');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content,
        lineEnding: '\r\n',
      });

      const result = await editFile({
        path: testPath,
        operations: [{ oldString: 'value', newString: 'val' }],
      });

      expect(result.operationsApplied).toHaveLength(0);
      expect(result.operationsFailed).toHaveLength(1);
      expect(result.operationsFailed?.[0].error).toContain('found 3 times');
      expect(result.operationsFailed?.[0].error).toContain('replaceAll=true');
    });

    it('should truncate long strings in error messages', async () => {
      const testPath = 'C:\\Games\\config.ini';
      const longString = 'a'.repeat(100);

      mockComputeFileHash.mockResolvedValueOnce('hash');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: 'short content',
        lineEnding: '\r\n',
      });

      const result = await editFile({
        path: testPath,
        operations: [{ oldString: longString, newString: 'replacement' }],
      });

      expect(result.operationsFailed?.[0].error).toContain('...');
      expect(result.operationsFailed?.[0].error.length).toBeLessThan(longString.length);
    });
  });

  describe('edge cases - special characters', () => {
    it('should handle escaped newlines in strings', async () => {
      const testPath = 'C:\\Games\\config.ini';
      const originalContent = 'line1\nline2\nline3';

      mockComputeFileHash.mockResolvedValueOnce('h1').mockResolvedValueOnce('h2');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: originalContent,
        lineEnding: '\n',
      });

      const result = await editFile({
        path: testPath,
        operations: [{ oldString: 'line1\\nline2', newString: 'merged_lines' }],
      });

      expect(result.operationsApplied).toHaveLength(1);
    });

    it('should handle tabs in content', async () => {
      const testPath = 'C:\\Games\\config.ini';
      const originalContent = 'name\tvalue\tdescription';

      mockComputeFileHash.mockResolvedValueOnce('h1').mockResolvedValueOnce('h2');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: originalContent,
        lineEnding: '\r\n',
      });

      const result = await editFile({
        path: testPath,
        operations: [{ oldString: 'name\\tvalue', newString: 'name\\tnewvalue' }],
      });

      expect(result.operationsApplied).toHaveLength(1);
    });

    it('should handle empty newString for deletion', async () => {
      const testPath = 'C:\\Games\\config.ini';
      const originalContent = 'keep\ndelete_me\nkeep_too';

      mockComputeFileHash.mockResolvedValueOnce('h1').mockResolvedValueOnce('h2');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: originalContent,
        lineEnding: '\n',
      });

      const result = await editFile({
        path: testPath,
        operations: [{ oldString: '\ndelete_me', newString: '' }],
      });

      expect(result.operationsApplied).toHaveLength(1);
      expect(mockWriteFileWithLineEnding).toHaveBeenCalledWith(
        testPath,
        'keep\nkeep_too',
        '\n'
      );
    });
  });

  describe('no-op scenarios', () => {
    it('should not write file when no operations are applied', async () => {
      const testPath = 'C:\\Games\\config.ini';

      mockComputeFileHash.mockResolvedValueOnce('hash');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: 'some content',
        lineEnding: '\r\n',
      });

      const result = await editFile({
        path: testPath,
        operations: [{ oldString: 'nonexistent', newString: 'replacement' }],
      });

      expect(result.operationsApplied).toHaveLength(0);
      expect(mockWriteFileWithLineEnding).not.toHaveBeenCalled();
      // afterHash should equal beforeHash when no changes made
      expect(result.fileHashes?.[0].beforeHash).toBe('hash');
      expect(result.fileHashes?.[0].afterHash).toBe('hash');
    });

    it('should handle empty operations array', async () => {
      const testPath = 'C:\\Games\\config.ini';

      mockComputeFileHash.mockResolvedValueOnce('hash');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: 'some content',
        lineEnding: '\r\n',
      });

      const result = await editFile({
        path: testPath,
        operations: [],
      });

      expect(result.operationsApplied).toHaveLength(0);
      expect(result.operationsFailed).toBeUndefined();
      expect(mockWriteFileWithLineEnding).not.toHaveBeenCalled();
    });
  });

  describe('line ending preservation', () => {
    it('should preserve CRLF line endings', async () => {
      const testPath = 'C:\\Games\\config.ini';

      mockComputeFileHash.mockResolvedValueOnce('h1').mockResolvedValueOnce('h2');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: 'line1\nline2',
        lineEnding: '\r\n',
      });

      await editFile({
        path: testPath,
        operations: [{ oldString: 'line1', newString: 'newline1' }],
      });

      expect(mockWriteFileWithLineEnding).toHaveBeenCalledWith(
        testPath,
        expect.any(String),
        '\r\n'
      );
    });

    it('should preserve LF line endings', async () => {
      const testPath = '/unix/style/config.ini';

      mockComputeFileHash.mockResolvedValueOnce('h1').mockResolvedValueOnce('h2');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: 'line1\nline2',
        lineEnding: '\n',
      });

      await editFile({
        path: testPath,
        operations: [{ oldString: 'line1', newString: 'newline1' }],
      });

      expect(mockWriteFileWithLineEnding).toHaveBeenCalledWith(
        testPath,
        expect.any(String),
        '\n'
      );
    });
  });

  describe('error handling', () => {
    it('should propagate file read errors', async () => {
      const testPath = 'C:\\Games\\nonexistent.ini';

      mockComputeFileHash.mockResolvedValueOnce('hash');
      mockCreateBackup.mockResolvedValueOnce(undefined);
      mockReadFileNormalized.mockRejectedValueOnce(new Error('ENOENT: no such file'));

      await expect(
        editFile({
          path: testPath,
          operations: [{ oldString: 'old', newString: 'new' }],
        })
      ).rejects.toThrow('ENOENT');
    });

    it('should propagate file write errors', async () => {
      const testPath = 'C:\\Games\\readonly.ini';

      mockComputeFileHash.mockResolvedValueOnce('hash');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: 'content=old',
        lineEnding: '\r\n',
      });
      mockWriteFileWithLineEnding.mockRejectedValueOnce(new Error('EACCES: permission denied'));

      await expect(
        editFile({
          path: testPath,
          operations: [{ oldString: 'content=old', newString: 'content=new' }],
        })
      ).rejects.toThrow('EACCES');
    });

    it('should propagate hash computation errors', async () => {
      const testPath = 'C:\\Games\\config.ini';

      mockComputeFileHash.mockRejectedValueOnce(new Error('Hash computation failed'));

      await expect(
        editFile({
          path: testPath,
          operations: [{ oldString: 'old', newString: 'new' }],
        })
      ).rejects.toThrow('Hash computation failed');
    });
  });

  describe('chained operations', () => {
    it('should apply operations on incrementally modified content', async () => {
      const testPath = 'C:\\Games\\config.ini';
      const originalContent = 'A->B->C';

      mockComputeFileHash.mockResolvedValueOnce('h1').mockResolvedValueOnce('h2');
      mockCreateBackup.mockResolvedValueOnce(`${testPath}.backup`);
      mockReadFileNormalized.mockResolvedValueOnce({
        content: originalContent,
        lineEnding: '\r\n',
      });

      const result = await editFile({
        path: testPath,
        operations: [
          { oldString: 'A', newString: 'X' },
          { oldString: 'X->B', newString: 'Y' },
          { oldString: 'Y->C', newString: 'Z' },
        ],
      });

      expect(result.operationsApplied).toHaveLength(3);
      expect(mockWriteFileWithLineEnding).toHaveBeenCalledWith(
        testPath,
        'Z',
        '\r\n'
      );
    });
  });
});
