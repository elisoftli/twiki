/**
 * File Hash Utils Tests
 *
 * Tests for file hashing utilities:
 * - SHA-256 file hash computation
 * - FILE_NOT_EXISTS_HASH constant
 * - Error handling for unreadable files
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stat } from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  stat: vi.fn(),
}));

// Import the module to test
import { FILE_NOT_EXISTS_HASH, computeFileHash } from '../file-hash.utils';

// =============================================================================
// Tests
// =============================================================================

describe('File Hash Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FILE_NOT_EXISTS_HASH', () => {
    it('should be a special constant string', () => {
      expect(FILE_NOT_EXISTS_HASH).toBe('__FILE_DOES_NOT_EXIST__');
    });

    it('should be a non-empty string', () => {
      expect(typeof FILE_NOT_EXISTS_HASH).toBe('string');
      expect(FILE_NOT_EXISTS_HASH.length).toBeGreaterThan(0);
    });
  });

  describe('computeFileHash', () => {
    it('should return null for non-existent files (ENOENT)', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(stat).mockRejectedValue(error);

      const result = await computeFileHash('/non/existent/file.txt');

      expect(result).toBeNull();
      expect(stat).toHaveBeenCalledWith('/non/existent/file.txt');
    });

    it('should return null for permission denied (EACCES)', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      vi.mocked(stat).mockRejectedValue(error);

      const result = await computeFileHash('/protected/file.txt');

      expect(result).toBeNull();
    });

    it('should return null for permission denied (EPERM)', async () => {
      const error = new Error('Operation not permitted') as NodeJS.ErrnoException;
      error.code = 'EPERM';
      vi.mocked(stat).mockRejectedValue(error);

      const result = await computeFileHash('/system/file.txt');

      expect(result).toBeNull();
    });

    it('should return null for directories (EISDIR)', async () => {
      const error = new Error('Is a directory') as NodeJS.ErrnoException;
      error.code = 'EISDIR';
      vi.mocked(stat).mockRejectedValue(error);

      const result = await computeFileHash('/some/directory');

      expect(result).toBeNull();
    });

    it('should return null if stat shows path is not a regular file', async () => {
      vi.mocked(stat).mockResolvedValue({
        isFile: () => false,
      } as any);

      const result = await computeFileHash('/some/directory');

      expect(result).toBeNull();
    });

    it('should throw on unexpected stat errors', async () => {
      const error = new Error('Unknown error');
      vi.mocked(stat).mockRejectedValue(error);

      await expect(computeFileHash('/some/file.txt')).rejects.toThrow('Unknown error');
    });

    it('should call stat with the provided file path', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(stat).mockRejectedValue(error);

      await computeFileHash('/specific/path/to/check.txt');

      expect(stat).toHaveBeenCalledWith('/specific/path/to/check.txt');
    });

    it('should handle absolute Windows paths', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(stat).mockRejectedValue(error);

      await computeFileHash('C:\\Users\\Test\\file.txt');

      expect(stat).toHaveBeenCalledWith('C:\\Users\\Test\\file.txt');
    });
  });
});
