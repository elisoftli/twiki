/**
 * System IPC Handler Tests
 *
 * Tests the system IPC handlers including:
 * - System specs handlers
 * - File read/write handlers
 * - Logs handlers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shell, clipboard } from 'electron';
import { promises as fs } from 'fs';

// Store registered handlers for testing
const registeredHandlers: Map<string, Function> = new Map();

// Mock ipc-handler.factory
vi.mock('../ipc-handler.factory', () => ({
  createIpcHandlers: (configs: Array<{ channel: string; handler: Function }>) => {
    for (const config of configs) {
      registeredHandlers.set(config.channel, config.handler);
    }
  },
}));

// Mock electron - inline to avoid hoisting issues
vi.mock('electron', () => ({
  shell: {
    openPath: vi.fn(),
  },
  clipboard: {
    writeText: vi.fn(),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

// Mock utils
vi.mock('../../utils', () => ({
  expandWindowsEnvVars: vi.fn((path: string) => path.replace(/%USERPROFILE%/g, 'C:\\Users\\TestUser')),
}));

// Mock logger utils
vi.mock('../../utils/logger.utils', () => ({
  getLogFilePath: vi.fn().mockReturnValue('C:\\Users\\TestUser\\AppData\\Roaming\\app\\logs\\main.log'),
}));

// Mock SystemSpecsService
vi.mock('../../services/system/system-specs.service', () => ({
  SystemSpecsService: {
    status: 'ready',
    specs: {
      cpu: { brand: 'Intel i7', cores: 8 },
      gpu: { model: 'RTX 3080' },
      ram: { total: 32000000000 },
    },
  },
}));

// Import after mocks
import { setupSystemSpecsIpc, setupFileIpc, setupLogsIpc } from '../system.ipc';
import { getLogFilePath } from '../../utils/logger.utils';
import { SystemSpecsService } from '../../services/system/system-specs.service';

// Helper to invoke a registered handler
const invokeHandler = async (channel: string, args?: unknown) => {
  const handler = registeredHandlers.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  const mockEvent = { sender: {} };
  return handler(mockEvent, args);
};

// =============================================================================
// Tests
// =============================================================================

describe('System IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers.clear();
  });

  describe('System Specs IPC', () => {
    beforeEach(() => {
      setupSystemSpecsIpc();
    });

    describe('system-specs:get-status', () => {
      it('should return system specs status', async () => {
        const result = await invokeHandler('system-specs:get-status');

        expect(result).toBe('ready');
      });
    });

    describe('system-specs:get-specs', () => {
      it('should return system specs', async () => {
        const result = await invokeHandler('system-specs:get-specs');

        expect(result).toEqual(SystemSpecsService.specs);
        expect(result.cpu.brand).toBe('Intel i7');
        expect(result.gpu.model).toBe('RTX 3080');
      });
    });
  });

  describe('File IPC', () => {
    beforeEach(() => {
      setupFileIpc();
    });

    describe('file:read-text', () => {
      it('should read file content successfully', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.readFile).mockResolvedValue('file content' as any);

        const result = await invokeHandler('file:read-text', 'C:\\path\\file.txt');

        expect(result).toEqual({
          success: true,
          content: 'file content',
          error: null,
        });
      });

      it('should return error when file not found', async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

        const result = await invokeHandler('file:read-text', 'C:\\nonexistent.txt');

        expect(result).toEqual({
          success: false,
          content: null,
          error: 'File not found',
        });
      });

      it('should return error on read failure', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'));

        const result = await invokeHandler('file:read-text', 'C:\\protected.txt');

        expect(result).toEqual({
          success: false,
          content: null,
          error: 'Permission denied',
        });
      });

      it('should expand environment variables in path', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.readFile).mockResolvedValue('content' as any);

        await invokeHandler('file:read-text', '%USERPROFILE%\\file.txt');

        expect(fs.access).toHaveBeenCalledWith('C:\\Users\\TestUser\\file.txt');
      });

      it('should handle non-Error exceptions', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.readFile).mockRejectedValue('string error');

        const result = await invokeHandler('file:read-text', 'C:\\file.txt');

        expect(result).toEqual({
          success: false,
          content: null,
          error: 'Unknown error',
        });
      });
    });

    describe('file:write-text', () => {
      it('should write file content successfully', async () => {
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        const result = await invokeHandler('file:write-text', {
          filePath: 'C:\\path\\file.txt',
          content: 'new content',
        });

        expect(result).toEqual({
          success: true,
          error: null,
        });
        expect(fs.writeFile).toHaveBeenCalledWith(
          'C:\\path\\file.txt',
          'new content',
          'utf-8'
        );
      });

      it('should return error on write failure', async () => {
        vi.mocked(fs.writeFile).mockRejectedValue(new Error('Disk full'));

        const result = await invokeHandler('file:write-text', {
          filePath: 'C:\\file.txt',
          content: 'content',
        });

        expect(result).toEqual({
          success: false,
          error: 'Disk full',
        });
      });

      it('should expand environment variables in path', async () => {
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        await invokeHandler('file:write-text', {
          filePath: '%USERPROFILE%\\file.txt',
          content: 'content',
        });

        expect(fs.writeFile).toHaveBeenCalledWith(
          'C:\\Users\\TestUser\\file.txt',
          'content',
          'utf-8'
        );
      });

      it('should handle non-Error exceptions', async () => {
        vi.mocked(fs.writeFile).mockRejectedValue({ code: 'EACCES' });

        const result = await invokeHandler('file:write-text', {
          filePath: 'C:\\file.txt',
          content: 'content',
        });

        expect(result).toEqual({
          success: false,
          error: 'Unknown error',
        });
      });
    });
  });

  describe('Logs IPC', () => {
    beforeEach(() => {
      setupLogsIpc();
    });

    describe('logs:get-path', () => {
      it('should return log file path', async () => {
        const result = await invokeHandler('logs:get-path');

        expect(result).toBe('C:\\Users\\TestUser\\AppData\\Roaming\\app\\logs\\main.log');
        expect(getLogFilePath).toHaveBeenCalled();
      });
    });

    describe('logs:open-in-editor', () => {
      it('should open log file in default editor', async () => {
        vi.mocked(shell.openPath).mockResolvedValue('');

        const result = await invokeHandler('logs:open-in-editor');

        expect(result).toEqual({
          success: true,
          error: null,
        });
        expect(shell.openPath).toHaveBeenCalledWith(
          'C:\\Users\\TestUser\\AppData\\Roaming\\app\\logs\\main.log'
        );
      });

      it('should return error on failure', async () => {
        vi.mocked(shell.openPath).mockRejectedValue(new Error('Failed to open'));

        const result = await invokeHandler('logs:open-in-editor');

        expect(result).toEqual({
          success: false,
          error: 'Failed to open',
        });
      });
    });

    describe('logs:copy-path', () => {
      it('should copy log path to clipboard', async () => {
        await invokeHandler('logs:copy-path');

        expect(clipboard.writeText).toHaveBeenCalledWith(
          'C:\\Users\\TestUser\\AppData\\Roaming\\app\\logs\\main.log'
        );
      });
    });
  });
});
