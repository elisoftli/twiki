import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { downloadFile } from '../download-file.utils';
import * as hosters from '../hosters';
import * as extractArchiveModule from '../extract-archive.utils';

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:\\Users\\test\\AppData\\Roaming\\pcgw-client'),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    mkdir: vi.fn(),
    open: vi.fn(),
  },
}));

// Mock hosters module
vi.mock('../hosters', () => ({
  resolveDownloadUrl: vi.fn(),
  downloadWithSession: vi.fn(),
  downloadFromMega: vi.fn(),
  isMegaUrl: vi.fn(),
  MODDB_SESSION_PARTITION: 'persist:moddb',
}));

// Mock extract-archive module
vi.mock('../extract-archive.utils', () => ({
  extractArchive: vi.fn(),
  SUPPORTED_ARCHIVE_EXTENSIONS: ['.zip', '.rar', '.7z'],
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('downloadFile', () => {
  let mockFileHandle: {
    write: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockFileHandle = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT')); // File doesn't exist by default
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.open).mockResolvedValue(mockFileHandle as unknown as fs.FileHandle);

    vi.mocked(hosters.isMegaUrl).mockReturnValue(false);
    vi.mocked(hosters.resolveDownloadUrl).mockResolvedValue({
      resolved: {
        downloadUrl: 'https://example.com/file.zip',
        fileName: 'file.zip',
      },
      hosterUsed: 'direct',
    });
  });


  describe('happy path', () => {
    it('should download a file successfully', async () => {
      const mockBody = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-length', '4']]),
        body: mockBody,
      });

      const result = await downloadFile({
        downloadUrl: 'https://example.com/file.zip',
        shouldExtract: false,
      });

      expect(result).toEqual({
        downloadPath: expect.stringContaining('file.zip'),
        extractPath: undefined,
        extractedFiles: undefined,
        originalUrl: 'https://example.com/file.zip',
        resolvedUrl: 'https://example.com/file.zip',
        hosterUsed: 'direct',
        fileSize: 4,
      });
    });

    it('should extract archive when shouldExtract is true', async () => {
      const mockBody = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '4']]),
        body: mockBody,
      });

      vi.mocked(extractArchiveModule.extractArchive).mockResolvedValue({
        path: 'C:\\downloads\\file.zip',
        extractPath: 'C:\\downloads\\file.zip_extracted',
        extractedFiles: ['C:\\downloads\\file.zip_extracted\\data.dll'],
        fileTransfers: [],
        directoriesCreated: [],
      });

      const result = await downloadFile({
        downloadUrl: 'https://example.com/file.zip',
        shouldExtract: true,
      });

      expect(extractArchiveModule.extractArchive).toHaveBeenCalled();
      expect(result.extractPath).toBe('C:\\downloads\\file.zip_extracted');
      expect(result.extractedFiles).toEqual(['C:\\downloads\\file.zip_extracted\\data.dll']);
    });

    it('should not extract non-archive files even when shouldExtract is true', async () => {
      vi.mocked(hosters.resolveDownloadUrl).mockResolvedValue({
        resolved: {
          downloadUrl: 'https://example.com/file.dll',
          fileName: 'file.dll',
        },
        hosterUsed: 'direct',
      });

      const mockBody = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '4']]),
        body: mockBody,
      });

      const result = await downloadFile({
        downloadUrl: 'https://example.com/file.dll',
        shouldExtract: true,
      });

      expect(extractArchiveModule.extractArchive).not.toHaveBeenCalled();
      expect(result.extractPath).toBeUndefined();
    });

    it('should report progress during download', async () => {
      const progressCalls: Array<{ downloadedBytes: number; totalBytes?: number; percentage?: number }> = [];

      const mockBody = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array(50) })
            .mockResolvedValueOnce({ done: false, value: new Uint8Array(50) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '100']]),
        body: mockBody,
      });

      await downloadFile({
        downloadUrl: 'https://example.com/file.zip',
        shouldExtract: false,
        onProgress: (progress) => progressCalls.push(progress),
      });

      expect(progressCalls.length).toBe(2);
      expect(progressCalls[0]).toEqual({ downloadedBytes: 50, totalBytes: 100, percentage: 50 });
      expect(progressCalls[1]).toEqual({ downloadedBytes: 100, totalBytes: 100, percentage: 100 });
    });
  });

  describe('URL resolution', () => {
    it('should resolve GitHub release URLs', async () => {
      vi.mocked(hosters.resolveDownloadUrl).mockResolvedValue({
        resolved: {
          downloadUrl: 'https://github.com/user/repo/releases/download/v1.0/file.zip',
          fileName: 'file.zip',
        },
        hosterUsed: 'github',
      });

      const mockBody = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '4']]),
        body: mockBody,
      });

      const result = await downloadFile({
        downloadUrl: 'https://github.com/user/repo/releases',
        shouldExtract: false,
      });

      expect(hosters.resolveDownloadUrl).toHaveBeenCalledWith(
        'https://github.com/user/repo/releases',
        undefined
      );
      expect(result.hosterUsed).toBe('github');
    });

    it('should resolve ModDB URLs and use session download', async () => {
      vi.mocked(hosters.resolveDownloadUrl).mockResolvedValue({
        resolved: {
          downloadUrl: 'https://www.moddb.com/downloads/mirror/123456/1/abc123',
          fileName: 'mod.zip',
        },
        hosterUsed: 'moddb',
      });

      vi.mocked(hosters.downloadWithSession).mockResolvedValue(1024);

      const result = await downloadFile({
        downloadUrl: 'https://www.moddb.com/mods/some-mod/downloads/some-file',
        shouldExtract: false,
      });

      expect(hosters.downloadWithSession).toHaveBeenCalledWith(
        'https://www.moddb.com/downloads/mirror/123456/1/abc123',
        expect.stringContaining('mod.zip'),
        expect.objectContaining({
          sessionPartition: 'persist:moddb',
        })
      );
      expect(result.hosterUsed).toBe('moddb');
    });

    it('should use MEGA download for MEGA URLs', async () => {
      vi.mocked(hosters.isMegaUrl).mockReturnValue(true);
      vi.mocked(hosters.resolveDownloadUrl).mockResolvedValue({
        resolved: {
          downloadUrl: 'https://mega.nz/file/abcd1234',
          fileName: 'mega-file.zip',
        },
        hosterUsed: 'mega',
      });

      vi.mocked(hosters.downloadFromMega).mockResolvedValue(2048);

      const result = await downloadFile({
        downloadUrl: 'https://mega.nz/file/abcd1234',
        shouldExtract: false,
      });

      expect(hosters.downloadFromMega).toHaveBeenCalledWith(
        'https://mega.nz/file/abcd1234',
        expect.stringContaining('mega-file.zip'),
        expect.objectContaining({
          debug: true,
        })
      );
      expect(result.hosterUsed).toBe('mega');
    });
  });

  describe('user selection callback', () => {
    it('should pass getUserSelection to resolver', async () => {
      const mockGetUserSelection = vi.fn().mockResolvedValue(0);

      vi.mocked(hosters.resolveDownloadUrl).mockResolvedValue({
        resolved: {
          downloadUrl: 'https://example.com/selected-file.zip',
          fileName: 'selected-file.zip',
        },
        hosterUsed: 'github',
      });

      const mockBody = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '4']]),
        body: mockBody,
      });

      await downloadFile({
        downloadUrl: 'https://github.com/user/repo/releases',
        shouldExtract: false,
        getUserSelection: mockGetUserSelection,
      });

      // The wrapped callback should be passed to resolveDownloadUrl
      expect(hosters.resolveDownloadUrl).toHaveBeenCalledWith(
        'https://github.com/user/repo/releases',
        expect.any(Function)
      );
    });

    it('should auto-select when selectionHint matches exactly one asset', async () => {
      const mockGetUserSelection = vi.fn();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(hosters.resolveDownloadUrl).mockImplementation(async (_url, callback) => {
        // Simulate resolver calling the callback
        if (callback) {
          const assets: hosters.AssetInfo[] = [
            { name: 'mod-x86.zip', downloadUrl: 'https://example.com/x86.zip', size: 100 },
            { name: 'mod-x64.zip', downloadUrl: 'https://example.com/x64.zip', size: 200 },
          ];
          await callback(assets);
        }
        return {
          resolved: { downloadUrl: 'https://example.com/x64.zip', fileName: 'mod-x64.zip' },
          hosterUsed: 'github',
        };
      });

      const mockBody = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '4']]),
        body: mockBody,
      });

      await downloadFile({
        downloadUrl: 'https://github.com/user/repo/releases',
        shouldExtract: false,
        getUserSelection: mockGetUserSelection,
        selectionHint: 'x64',
      });

      // User selection should NOT be called since hint matched exactly one asset
      expect(mockGetUserSelection).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('abort handling', () => {
    it('should throw when aborted before download', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        downloadFile({
          downloadUrl: 'https://example.com/file.zip',
          shouldExtract: false,
          signal: controller.signal,
        })
      ).rejects.toThrow('Download aborted');
    });

    it('should throw when aborted after URL resolution', async () => {
      const controller = new AbortController();

      vi.mocked(hosters.resolveDownloadUrl).mockImplementation(async () => {
        controller.abort();
        return {
          resolved: { downloadUrl: 'https://example.com/file.zip', fileName: 'file.zip' },
          hosterUsed: 'direct',
        };
      });

      await expect(
        downloadFile({
          downloadUrl: 'https://example.com/file.zip',
          shouldExtract: false,
          signal: controller.signal,
        })
      ).rejects.toThrow('Download aborted');
    });

    it('should call onDownloadPathDetermined callback', async () => {
      const onDownloadPathDetermined = vi.fn();

      const mockBody = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '4']]),
        body: mockBody,
      });

      await downloadFile({
        downloadUrl: 'https://example.com/file.zip',
        shouldExtract: false,
        onDownloadPathDetermined,
      });

      expect(onDownloadPathDetermined).toHaveBeenCalledWith(expect.stringContaining('file.zip'));
    });
  });

  describe('error handling', () => {
    it('should throw error on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        downloadFile({
          downloadUrl: 'https://example.com/nonexistent.zip',
          shouldExtract: false,
        })
      ).rejects.toThrow('Download failed: 404 Not Found');
    });

    it('should throw error when response body is not readable', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '4']]),
        body: null,
      });

      await expect(
        downloadFile({
          downloadUrl: 'https://example.com/file.zip',
          shouldExtract: false,
        })
      ).rejects.toThrow('Response body is not readable');
    });

    it('should throw error on extraction failure with download path info', async () => {
      vi.mocked(hosters.resolveDownloadUrl).mockResolvedValue({
        resolved: {
          downloadUrl: 'https://example.com/corrupted.zip',
          fileName: 'corrupted.zip',
        },
        hosterUsed: 'direct',
      });

      const mockBody = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '4']]),
        body: mockBody,
      });

      vi.mocked(extractArchiveModule.extractArchive).mockRejectedValue(new Error('Invalid ZIP file'));

      await expect(
        downloadFile({
          downloadUrl: 'https://example.com/corrupted.zip',
          shouldExtract: true,
        })
      ).rejects.toThrow(/File downloaded successfully.*but extraction failed.*Invalid ZIP file/);
    });

    it('should propagate URL resolution errors', async () => {
      vi.mocked(hosters.resolveDownloadUrl).mockRejectedValue(new Error('Could not resolve URL'));

      await expect(
        downloadFile({
          downloadUrl: 'https://invalid-hoster.com/file.zip',
          shouldExtract: false,
        })
      ).rejects.toThrow('Could not resolve URL');
    });
  });

  describe('unique filename handling', () => {
    it('should generate unique filename when file exists', async () => {
      // First access call for unique path check - file exists
      vi.mocked(fs.access)
        .mockResolvedValueOnce(undefined); // File exists, need unique name

      const mockBody = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '4']]),
        body: mockBody,
      });

      const result = await downloadFile({
        downloadUrl: 'https://example.com/file.zip',
        shouldExtract: false,
      });

      // Path should contain timestamp suffix
      expect(result.downloadPath).toMatch(/file-\d+\.zip$/);
    });

    it('should use original filename when file does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT')); // File doesn't exist

      const mockBody = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '4']]),
        body: mockBody,
      });

      const result = await downloadFile({
        downloadUrl: 'https://example.com/file.zip',
        shouldExtract: false,
      });

      expect(result.downloadPath).toMatch(/file\.zip$/);
      expect(result.downloadPath).not.toMatch(/-\d+\.zip$/);
    });
  });

  describe('archive type detection', () => {
    it.each([
      ['.zip', true],
      ['.rar', true],
      ['.7z', true],
      ['.exe', false],
      ['.dll', false],
      ['.txt', false],
      ['.ZIP', true], // Should be case-insensitive
      ['.RAR', true],
      ['.7Z', true],
    ])('should correctly identify %s as extractable: %s', async (ext, shouldBeExtractable) => {
      vi.mocked(hosters.resolveDownloadUrl).mockResolvedValue({
        resolved: {
          downloadUrl: `https://example.com/file${ext}`,
          fileName: `file${ext}`,
        },
        hosterUsed: 'direct',
      });

      const mockBody = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3, 4]) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '4']]),
        body: mockBody,
      });

      if (shouldBeExtractable) {
        vi.mocked(extractArchiveModule.extractArchive).mockResolvedValue({
          path: `C:\\downloads\\file${ext}`,
          extractPath: `C:\\downloads\\file${ext}_extracted`,
          extractedFiles: [],
          fileTransfers: [],
          directoriesCreated: [],
        });
      }

      await downloadFile({
        downloadUrl: `https://example.com/file${ext}`,
        shouldExtract: true,
      });

      if (shouldBeExtractable) {
        expect(extractArchiveModule.extractArchive).toHaveBeenCalled();
      } else {
        expect(extractArchiveModule.extractArchive).not.toHaveBeenCalled();
      }
    });
  });

  describe('session-aware downloads', () => {
    it('should use session download for URLs resolved via download browser', async () => {
      vi.mocked(hosters.resolveDownloadUrl).mockResolvedValue({
        resolved: {
          downloadUrl: 'https://example.com/protected-file.zip',
          fileName: 'protected-file.zip',
          metadata: {
            resolvedViaDownloadBrowser: true,
            sessionPartition: 'persist:download-browser',
          },
        },
        hosterUsed: 'manual',
      });

      vi.mocked(hosters.downloadWithSession).mockResolvedValue(1024);

      const result = await downloadFile({
        downloadUrl: 'https://example.com/protected-file.zip',
        shouldExtract: false,
      });

      expect(hosters.downloadWithSession).toHaveBeenCalledWith(
        'https://example.com/protected-file.zip',
        expect.any(String),
        expect.objectContaining({
          sessionPartition: 'persist:download-browser',
        })
      );
      expect(result.fileSize).toBe(1024);
    });
  });

  describe('progress handling without content-length', () => {
    it('should handle downloads without content-length header', async () => {
      const progressCalls: Array<{ downloadedBytes: number; totalBytes?: number; percentage?: number }> = [];

      const mockBody = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array(100) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          cancel: vi.fn(),
        }),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(), // No content-length
        body: mockBody,
      });

      await downloadFile({
        downloadUrl: 'https://example.com/file.zip',
        shouldExtract: false,
        onProgress: (progress) => progressCalls.push(progress),
      });

      expect(progressCalls.length).toBe(1);
      expect(progressCalls[0].totalBytes).toBeUndefined();
      expect(progressCalls[0].percentage).toBeUndefined();
      expect(progressCalls[0].downloadedBytes).toBe(100);
    });
  });
});
