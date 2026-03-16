/**
 * Downloads IPC Handler Tests
 *
 * Tests the downloads IPC handlers including:
 * - Get download folder size
 * - Clear downloads
 * - Open downloads folder
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Store registered handlers for testing
const registeredHandlers: Map<string, Function> = new Map();
const registeredListeners: Map<string, Function> = new Map();

// Mock ipc-handler.factory
vi.mock('../ipc-handler.factory', () => ({
  createIpcHandlers: (configs: Array<{ channel: string; handler: Function }>) => {
    for (const config of configs) {
      registeredHandlers.set(config.channel, config.handler);
    }
  },
  createIpcListeners: (configs: Array<{ channel: string; handler: Function }>) => {
    for (const config of configs) {
      registeredListeners.set(config.channel, config.handler);
    }
  },
}));

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/user/data'),
  },
}));

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    rm: vi.fn(),
    mkdir: vi.fn(),
  },
}));

// Import after mocks
import { setupDownloadsIpc } from '../downloads.ipc';
import { promises as fs } from 'fs';
import { exec } from 'child_process';

// Helper to invoke a registered handler
const invokeHandler = async (channel: string, args?: unknown) => {
  const handler = registeredHandlers.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  const mockEvent = { sender: {} };
  return handler(mockEvent, args);
};

// Helper to invoke a registered listener
const invokeListener = async (channel: string, args?: unknown) => {
  const handler = registeredListeners.get(channel);
  if (!handler) {
    throw new Error(`No listener registered for channel: ${channel}`);
  }
  const mockEvent = { sender: {} };
  return handler(mockEvent, args);
};

// =============================================================================
// Tests
// =============================================================================

describe('Downloads IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers.clear();
    registeredListeners.clear();
    setupDownloadsIpc();
  });

  describe('downloads:get-size', () => {
    it('should return 0 for empty directory', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const result = await invokeHandler('downloads:get-size');

      expect(result).toBe(0);
    });

    it('should calculate size of files', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file1.zip', isDirectory: () => false } as any,
        { name: 'file2.zip', isDirectory: () => false } as any,
      ]);
      vi.mocked(fs.stat)
        .mockResolvedValueOnce({ size: 1000 } as any)
        .mockResolvedValueOnce({ size: 2000 } as any);

      const result = await invokeHandler('downloads:get-size');

      expect(result).toBe(3000);
    });

    it('should recursively calculate directory sizes', async () => {
      // First call: root directory
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        { name: 'subdir', isDirectory: () => true } as any,
        { name: 'file.zip', isDirectory: () => false } as any,
      ]);
      // Second call: subdirectory
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        { name: 'nested.zip', isDirectory: () => false } as any,
      ]);

      vi.mocked(fs.stat)
        .mockResolvedValueOnce({ size: 500 } as any) // nested.zip
        .mockResolvedValueOnce({ size: 1000 } as any); // file.zip

      const result = await invokeHandler('downloads:get-size');

      expect(result).toBe(1500);
    });

    it('should return 0 when directory does not exist', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

      const result = await invokeHandler('downloads:get-size');

      expect(result).toBe(0);
    });
  });

  describe('downloads:clear', () => {
    it('should return success when directory does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await invokeHandler('downloads:clear');

      expect(result).toEqual({ success: true, error: null });
      expect(fs.rm).not.toHaveBeenCalled();
    });

    it('should clear all files in downloads directory', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue(['file1.zip', 'file2.zip', 'subdir'] as any);
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await invokeHandler('downloads:clear');

      expect(result).toEqual({ success: true, error: null });
      expect(fs.rm).toHaveBeenCalledTimes(3);
      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining('file1.zip'),
        { recursive: true, force: true }
      );
    });

    it('should return error when clearing fails', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue(['file.zip'] as any);
      vi.mocked(fs.rm).mockRejectedValue(new Error('Permission denied'));

      const result = await invokeHandler('downloads:clear');

      expect(result).toEqual({ success: false, error: 'Permission denied' });
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockRejectedValue('string error');

      const result = await invokeHandler('downloads:clear');

      expect(result).toEqual({ success: false, error: 'Unknown error' });
    });
  });

  describe('downloads:open-folder', () => {
    it('should create directory if it does not exist and open it', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await invokeListener('downloads:open-folder');

      expect(fs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(exec).toHaveBeenCalledWith(expect.stringContaining('explorer'));
    });

    it('should open existing directory', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await invokeListener('downloads:open-folder');

      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(exec).toHaveBeenCalledWith(expect.stringContaining('explorer'));
    });

    it('should convert forward slashes to backslashes for Windows', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await invokeListener('downloads:open-folder');

      // The regex /\\/ matches a single backslash in the path
      expect(exec).toHaveBeenCalledWith(expect.stringMatching(/explorer.*\\/));
    });
  });
});
