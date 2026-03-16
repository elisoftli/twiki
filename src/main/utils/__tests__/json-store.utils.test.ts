/**
 * JSON Store Utils Tests
 *
 * Tests for atomic JSON file operations:
 * - ensureDirectoryExists - creates directories recursively
 * - ensureParentDirectoryExists - creates parent directory of a file
 * - atomicWriteJson - atomic JSON file writing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
  },
}));

// Import after mocks
import { ensureDirectoryExists, ensureParentDirectoryExists, atomicWriteJson } from '../json-store.utils';

// =============================================================================
// Tests
// =============================================================================

describe('JSON Store Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ensureDirectoryExists', () => {
    it('should not create directory if it already exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await ensureDirectoryExists('/existing/dir');

      expect(fs.access).toHaveBeenCalledWith('/existing/dir');
      expect(fs.mkdir).not.toHaveBeenCalled();
    });

    it('should create directory recursively if it does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await ensureDirectoryExists('/new/nested/dir');

      expect(fs.access).toHaveBeenCalledWith('/new/nested/dir');
      expect(fs.mkdir).toHaveBeenCalledWith('/new/nested/dir', { recursive: true });
    });

    it('should handle empty path', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await ensureDirectoryExists('');

      expect(fs.mkdir).toHaveBeenCalledWith('', { recursive: true });
    });
  });

  describe('ensureParentDirectoryExists', () => {
    it('should ensure parent directory exists for a file path', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await ensureParentDirectoryExists('/parent/dir/file.json');

      expect(fs.access).toHaveBeenCalledWith('/parent/dir');
      expect(fs.mkdir).toHaveBeenCalledWith('/parent/dir', { recursive: true });
    });

    it('should not create directory if parent already exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await ensureParentDirectoryExists('/existing/parent/file.json');

      expect(fs.access).toHaveBeenCalledWith('/existing/parent');
      expect(fs.mkdir).not.toHaveBeenCalled();
    });

    it('should handle file in root directory', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await ensureParentDirectoryExists('/file.json');

      // dirname of '/file.json' is '/'
      expect(fs.access).toHaveBeenCalledWith('/');
    });
  });

  describe('atomicWriteJson', () => {
    it('should write JSON to temp file then rename atomically', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const data = { key: 'value', nested: { arr: [1, 2, 3] } };
      await atomicWriteJson('/path/to/file.json', data);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/path/to/file.json.tmp',
        JSON.stringify(data, null, 2),
        'utf-8'
      );
      expect(fs.rename).toHaveBeenCalledWith('/path/to/file.json.tmp', '/path/to/file.json');
    });

    it('should use custom indentation', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const data = { a: 1, b: 2 };
      await atomicWriteJson('/file.json', data, 4);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/file.json.tmp',
        JSON.stringify(data, null, 4),
        'utf-8'
      );
    });

    it('should handle null data', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await atomicWriteJson('/file.json', null);

      expect(fs.writeFile).toHaveBeenCalledWith('/file.json.tmp', 'null', 'utf-8');
    });

    it('should handle array data', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const data = [1, 2, { nested: true }];
      await atomicWriteJson('/file.json', data);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/file.json.tmp',
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    });

    it('should propagate write errors', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Disk full'));

      await expect(atomicWriteJson('/file.json', {})).rejects.toThrow('Disk full');
      expect(fs.rename).not.toHaveBeenCalled();
    });

    it('should propagate rename errors', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockRejectedValue(new Error('Permission denied'));

      await expect(atomicWriteJson('/file.json', {})).rejects.toThrow('Permission denied');
    });

    it('should handle complex nested objects', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const data = {
        users: [
          { id: 1, name: 'Alice', settings: { theme: 'dark' } },
          { id: 2, name: 'Bob', settings: { theme: 'light' } },
        ],
        metadata: {
          version: '1.0.0',
          timestamp: '2024-01-01T00:00:00Z',
        },
      };

      await atomicWriteJson('/complex.json', data);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/complex.json.tmp',
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    });
  });
});
