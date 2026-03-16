/**
 * Shell IPC Handler Tests
 *
 * Tests the shell IPC handlers including:
 * - Opening external URLs
 * - Opening paths in Explorer
 * - Opening registry paths in regedit
 * - Path type detection
 * - Finding existing ancestor directories
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exec, execSync } from 'child_process';
import { shell } from 'electron';
import { promises as fs } from 'fs';

// Store registered listeners for testing
const registeredListeners: Map<string, Function> = new Map();

// Mock ipc-handler.factory
vi.mock('../ipc-handler.factory', () => ({
  createIpcListeners: (configs: Array<{ channel: string; handler: Function }>) => {
    for (const config of configs) {
      registeredListeners.set(config.channel, config.handler);
    }
  },
}));

// Mock electron - inline to avoid hoisting issues
vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
}));

// Mock child_process - inline to avoid hoisting issues
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    stat: vi.fn(),
  },
}));

// Mock utils
vi.mock('../../utils', () => ({
  expandWindowsEnvVars: vi.fn((path: string) => path.replace(/%USERPROFILE%/g, 'C:\\Users\\TestUser')),
}));

// Mock GameLibraryService
vi.mock('../../services/game/game-library.service', () => ({
  GameLibraryService: {
    getInstance: () => ({
      expandLauncherPath: vi.fn((path: string) => path),
    }),
  },
}));

// Mock logger
vi.mock('../../utils/logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock constants
vi.mock('../../constants', () => ({
  BINARY_FILE_EXTENSIONS: ['exe', 'dll', 'bin'],
}));

// Import after mocks
import { setupShellIpc } from '../shell.ipc';

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

describe('Shell IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredListeners.clear();
    setupShellIpc();
  });

  describe('shell:open-external', () => {
    it('should open external URL', async () => {
      await invokeListener('shell:open-external', 'https://example.com');

      expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
    });

    it('should open PCGW URL', async () => {
      await invokeListener('shell:open-external', 'https://www.pcgamingwiki.com/wiki/Grand_Theft_Auto_V');

      expect(shell.openExternal).toHaveBeenCalledWith('https://www.pcgamingwiki.com/wiki/Grand_Theft_Auto_V');
    });
  });

  describe('shell:open-path', () => {
    it('should open existing file path in explorer', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => false,
      } as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await invokeListener('shell:open-path', 'C:\\Game\\config.ini');

      expect(exec).toHaveBeenCalledWith(expect.stringContaining('explorer'));
    });

    it('should open existing directory in explorer', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await invokeListener('shell:open-path', 'C:\\Game\\Config');

      expect(exec).toHaveBeenCalledWith(expect.stringContaining('explorer'));
    });

    it('should open registry path in regedit', async () => {
      await invokeListener('shell:open-path', 'HKEY_CURRENT_USER\\Software\\MyApp');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('reg add'),
        expect.any(Object)
      );
      expect(exec).toHaveBeenCalledWith('regedit');
    });

    it('should handle short registry prefixes', async () => {
      await invokeListener('shell:open-path', 'HKCU\\Software\\MyApp');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('HKEY_CURRENT_USER'),
        expect.any(Object)
      );
    });

    it('should handle HKLM prefix', async () => {
      await invokeListener('shell:open-path', 'HKLM\\SOFTWARE\\Microsoft');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('HKEY_LOCAL_MACHINE'),
        expect.any(Object)
      );
    });

    it('should open plain regedit on registry set error', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Registry error');
      });

      await invokeListener('shell:open-path', 'HKEY_CURRENT_USER\\Software\\MyApp');

      expect(exec).toHaveBeenCalledWith('regedit');
    });

    it('should find existing ancestor when path does not exist', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.access)
        .mockRejectedValueOnce(new Error('ENOENT')) // C:\Game\NonExistent\file.ini
        .mockRejectedValueOnce(new Error('ENOENT')) // C:\Game\NonExistent
        .mockResolvedValueOnce(undefined); // C:\Game exists

      vi.mocked(fs.stat).mockImplementation(async (path) => {
        if (path === 'C:\\Game') {
          return { isDirectory: () => true, isFile: () => false } as any;
        }
        throw new Error('ENOENT');
      });

      await invokeListener('shell:open-path', 'C:\\Game\\NonExistent\\file.ini');

      expect(exec).toHaveBeenCalled();
    });

    it('should strip wildcards from path', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await invokeListener('shell:open-path', 'C:\\Game\\Saves\\*.sav');

      // Should strip the wildcard and open C:\Game\Saves
      expect(exec).toHaveBeenCalledWith(expect.stringContaining('C:\\Game\\Saves'));
    });

    it('should expand environment variables', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await invokeListener('shell:open-path', '%USERPROFILE%\\Documents');

      expect(exec).toHaveBeenCalledWith(expect.stringContaining('TestUser'));
    });

    it('should not open binary files directly', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await invokeListener('shell:open-path', 'C:\\Game\\game.exe');

      // Should try to find ancestor or open explorer
      expect(exec).toHaveBeenCalled();
    });

    it('should open plain explorer when no ancestor found', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await invokeListener('shell:open-path', 'Z:\\NonExistent\\Path\\file.txt');

      expect(exec).toHaveBeenCalledWith('explorer');
    });

    it('should handle HKEY_LOCAL_MACHINE path', async () => {
      await invokeListener('shell:open-path', 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows');

      expect(exec).toHaveBeenCalledWith('regedit');
    });

    it('should handle HKEY_CLASSES_ROOT path', async () => {
      await invokeListener('shell:open-path', 'HKEY_CLASSES_ROOT\\.txt');

      expect(exec).toHaveBeenCalledWith('regedit');
    });

    it('should convert forward slashes to backslashes', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await invokeListener('shell:open-path', 'C:/Game/Config');

      // Forward slashes should be converted to backslashes in explorer command
      expect(exec).toHaveBeenCalledWith(expect.stringContaining('C:\\Game\\Config'));
    });
  });
});
