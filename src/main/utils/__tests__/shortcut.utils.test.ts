/**
 * Tests for shortcut utilities
 *
 * Tests Windows shortcut (.lnk) operations:
 * - getDesktopPath: retrieving desktop folder path
 * - getTwikiShortcutName: generating sanitized shortcut filenames
 * - findTwikiShortcuts: locating existing shortcuts
 * - readShortcut: reading shortcut properties
 * - createShortcut: creating new shortcuts
 * - updateShortcutArgs: updating shortcut arguments
 * - deleteShortcut: removing shortcuts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Hoisted Mocks
// =============================================================================

const { mockSpawn, mockFsReaddir, mockFsUnlink } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockFsReaddir: vi.fn(),
  mockFsUnlink: vi.fn(),
}));

// Mock child_process
vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    readdir: mockFsReaddir,
    unlink: mockFsUnlink,
  },
}));

// Mock logger
vi.mock('../logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks are set up
import {
  getDesktopPath,
  getTwikiShortcutName,
  findTwikiShortcuts,
  readShortcut,
  createShortcut,
  updateShortcutArgs,
  deleteShortcut,
} from '../shortcut.utils';

// =============================================================================
// Helper to mock PowerShell execution
// =============================================================================

interface MockPsProcess {
  stdout: { on: (event: string, cb: (data: Buffer) => void) => void };
  stderr: { on: (event: string, cb: (data: Buffer) => void) => void };
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  on: (event: string, cb: (code?: number) => void) => void;
  kill: ReturnType<typeof vi.fn>;
}

function createMockPsProcess(
  stdoutData: string,
  exitCode: number = 0,
  stderrData: string = ''
): MockPsProcess {
  const stdoutCallbacks: ((data: Buffer) => void)[] = [];
  const stderrCallbacks: ((data: Buffer) => void)[] = [];
  const closeCallbacks: ((code: number) => void)[] = [];
  const errorCallbacks: ((err: Error) => void)[] = [];

  return {
    stdout: {
      on: (event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') {
          stdoutCallbacks.push(cb);
          // Simulate async data arrival
          setTimeout(() => cb(Buffer.from(stdoutData)), 0);
        }
      },
    },
    stderr: {
      on: (event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') {
          stderrCallbacks.push(cb);
          if (stderrData) {
            setTimeout(() => cb(Buffer.from(stderrData)), 0);
          }
        }
      },
    },
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
    },
    on: (event: string, cb: (code?: number) => void) => {
      if (event === 'close') {
        closeCallbacks.push(cb as (code: number) => void);
        // Simulate process completion
        setTimeout(() => cb(exitCode), 10);
      }
      if (event === 'error') {
        errorCallbacks.push(cb as unknown as (err: Error) => void);
      }
    },
    kill: vi.fn(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('shortcut.utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default environment
    process.env.USERPROFILE = 'C:\\Users\\TestUser';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDesktopPath', () => {
    it('should return Desktop path based on USERPROFILE', () => {
      process.env.USERPROFILE = 'C:\\Users\\TestUser';
      const result = getDesktopPath();
      expect(result).toBe('C:\\Users\\TestUser\\Desktop');
    });

    it('should throw error when USERPROFILE is not set', () => {
      delete process.env.USERPROFILE;
      expect(() => getDesktopPath()).toThrow('USERPROFILE environment variable not found');
    });
  });

  describe('getTwikiShortcutName', () => {
    it('should generate shortcut name with Twiki prefix', () => {
      const result = getTwikiShortcutName('My Game');
      expect(result).toBe('Twiki - My Game.lnk');
    });

    it('should sanitize invalid filesystem characters', () => {
      const result = getTwikiShortcutName('Game: The "Revenge" <Part 1>');
      expect(result).toBe('Twiki - Game_ The _Revenge_ _Part 1_.lnk');
    });

    it('should handle empty game name', () => {
      const result = getTwikiShortcutName('');
      expect(result).toBe('Twiki - .lnk');
    });

    it('should replace all invalid characters', () => {
      // Test all invalid characters: < > : " / \ | ? *
      const result = getTwikiShortcutName('A<B>C:D"E/F\\G|H?I*J');
      expect(result).toBe('Twiki - A_B_C_D_E_F_G_H_I_J.lnk');
    });
  });

  describe('findTwikiShortcuts', () => {
    it('should find exact match shortcut', async () => {
      mockFsReaddir.mockResolvedValue(['Twiki - Test Game.lnk', 'Other.lnk']);

      const result = await findTwikiShortcuts('Test Game');

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk');
    });

    it('should find shortcuts containing the game name', async () => {
      mockFsReaddir.mockResolvedValue([
        'Twiki - Test Game.lnk',
        'Twiki - Test Game (Modded).lnk',
        'Other.lnk',
      ]);

      const result = await findTwikiShortcuts('Test Game');

      expect(result).toHaveLength(2);
      expect(result).toContain('C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk');
      expect(result).toContain('C:\\Users\\TestUser\\Desktop\\Twiki - Test Game (Modded).lnk');
    });

    it('should be case insensitive', async () => {
      mockFsReaddir.mockResolvedValue(['TWIKI - TEST GAME.lnk']);

      const result = await findTwikiShortcuts('test game');

      expect(result).toHaveLength(1);
    });

    it('should return empty array when no shortcuts found', async () => {
      mockFsReaddir.mockResolvedValue(['Unrelated.lnk']);

      const result = await findTwikiShortcuts('Test Game');

      expect(result).toHaveLength(0);
    });

    it('should return empty array on read error', async () => {
      mockFsReaddir.mockRejectedValue(new Error('ENOENT'));

      const result = await findTwikiShortcuts('Test Game');

      expect(result).toHaveLength(0);
    });

    it('should handle sanitized game name matching', async () => {
      mockFsReaddir.mockResolvedValue(['Twiki - Game_ The Sequel.lnk']);

      const result = await findTwikiShortcuts('Game: The Sequel');

      expect(result).toHaveLength(1);
    });
  });

  describe('readShortcut', () => {
    it('should read shortcut properties', async () => {
      const mockOutput = JSON.stringify({
        path: 'C:\\Users\\TestUser\\Desktop\\Test.lnk',
        targetPath: 'C:\\Games\\Game.exe',
        arguments: '-fullscreen',
        workingDirectory: 'C:\\Games',
        description: 'Test description',
        iconLocation: 'C:\\Games\\Game.exe,0',
      });

      mockSpawn.mockReturnValue(createMockPsProcess(mockOutput));

      const result = await readShortcut('C:\\Users\\TestUser\\Desktop\\Test.lnk');

      expect(result.path).toBe('C:\\Users\\TestUser\\Desktop\\Test.lnk');
      expect(result.targetPath).toBe('C:\\Games\\Game.exe');
      expect(result.arguments).toBe('-fullscreen');
      expect(result.workingDirectory).toBe('C:\\Games');
      expect(result.description).toBe('Test description');
      expect(result.iconLocation).toBe('C:\\Games\\Game.exe,0');
    });

    it('should handle shortcut without arguments', async () => {
      const mockOutput = JSON.stringify({
        path: 'C:\\Test.lnk',
        targetPath: 'C:\\Game.exe',
        arguments: '',
        workingDirectory: '',
        description: '',
        iconLocation: '',
      });

      mockSpawn.mockReturnValue(createMockPsProcess(mockOutput));

      const result = await readShortcut('C:\\Test.lnk');

      expect(result.arguments).toBe('');
    });

    it('should throw error on PowerShell failure', async () => {
      mockSpawn.mockReturnValue(createMockPsProcess('', 1, 'PowerShell error'));

      await expect(readShortcut('C:\\Invalid.lnk')).rejects.toThrow('Failed to read shortcut');
    });

    it('should handle single quotes in path', async () => {
      const mockOutput = JSON.stringify({
        path: "C:\\User's Data\\Test.lnk",
        targetPath: 'C:\\Game.exe',
        arguments: '',
        workingDirectory: '',
        description: '',
        iconLocation: '',
      });

      mockSpawn.mockReturnValue(createMockPsProcess(mockOutput));

      const result = await readShortcut("C:\\User's Data\\Test.lnk");

      expect(result.path).toBe("C:\\User's Data\\Test.lnk");
      // Verify spawn was called with PowerShell
      expect(mockSpawn).toHaveBeenCalledWith(
        'powershell',
        expect.arrayContaining(['-Command']),
        expect.any(Object)
      );
    });

    it('should throw error on empty PowerShell output', async () => {
      mockSpawn.mockReturnValue(createMockPsProcess(''));

      await expect(readShortcut('C:\\Test.lnk')).rejects.toThrow(
        'PowerShell returned empty output'
      );
    });

    it('should handle JSON with extra whitespace or BOM', async () => {
      // Simulate BOM and whitespace before/after JSON
      const mockOutput =
        '\ufeff  \n{"path":"C:\\\\Test.lnk","targetPath":"C:\\\\Game.exe","arguments":"","workingDirectory":"","description":"","iconLocation":""}  \n';

      mockSpawn.mockReturnValue(createMockPsProcess(mockOutput));

      const result = await readShortcut('C:\\Test.lnk');

      expect(result.targetPath).toBe('C:\\Game.exe');
    });

    it('should throw error when output has no valid JSON', async () => {
      mockSpawn.mockReturnValue(createMockPsProcess('Some error message without JSON'));

      await expect(readShortcut('C:\\Test.lnk')).rejects.toThrow(
        'PowerShell output does not contain valid JSON'
      );
    });

    it('should throw error when shortcut file not found', async () => {
      mockSpawn.mockReturnValue(
        createMockPsProcess('', 1, 'Shortcut file not found: C:\\Missing.lnk')
      );

      await expect(readShortcut('C:\\Missing.lnk')).rejects.toThrow(
        'Failed to read shortcut'
      );
    });
  });

  describe('createShortcut', () => {
    it('should create shortcut with all parameters', async () => {
      mockSpawn.mockReturnValue(createMockPsProcess('OK'));

      const result = await createShortcut({
        targetPath: 'C:\\Games\\Game.exe',
        arguments: '-fullscreen -skipintro',
        name: 'Twiki - My Game',
        location: 'C:\\Users\\TestUser\\Desktop',
        workingDirectory: 'C:\\Games',
        description: 'Launch with Twiki options',
        iconLocation: 'C:\\Games\\Game.exe',
      });

      expect(result).toBe('C:\\Users\\TestUser\\Desktop\\Twiki - My Game.lnk');
    });

    it('should create shortcut without optional parameters', async () => {
      mockSpawn.mockReturnValue(createMockPsProcess('OK'));

      const result = await createShortcut({
        targetPath: 'C:\\Games\\Game.exe',
        name: 'Twiki - My Game',
        location: 'C:\\Users\\TestUser\\Desktop',
      });

      expect(result).toBe('C:\\Users\\TestUser\\Desktop\\Twiki - My Game.lnk');
    });

    it('should throw error when PowerShell fails', async () => {
      mockSpawn.mockReturnValue(createMockPsProcess('', 1, 'COM error'));

      await expect(
        createShortcut({
          targetPath: 'C:\\Game.exe',
          name: 'Test',
          location: 'C:\\Desktop',
        })
      ).rejects.toThrow('Failed to create shortcut');
    });

    it('should throw error when output does not contain OK', async () => {
      mockSpawn.mockReturnValue(createMockPsProcess('Something else'));

      await expect(
        createShortcut({
          targetPath: 'C:\\Game.exe',
          name: 'Test',
          location: 'C:\\Desktop',
        })
      ).rejects.toThrow('Shortcut creation did not complete successfully');
    });
  });

  describe('updateShortcutArgs', () => {
    it('should update shortcut arguments and return old args', async () => {
      mockSpawn.mockReturnValue(createMockPsProcess('-oldarg'));

      const result = await updateShortcutArgs(
        'C:\\Users\\TestUser\\Desktop\\Test.lnk',
        '-newarg'
      );

      expect(result).toBe('-oldarg');
      // Verify spawn was called with PowerShell
      expect(mockSpawn).toHaveBeenCalledWith(
        'powershell',
        expect.arrayContaining(['-Command']),
        expect.any(Object)
      );
    });

    it('should return empty string when no previous args', async () => {
      mockSpawn.mockReturnValue(createMockPsProcess(''));

      const result = await updateShortcutArgs('C:\\Test.lnk', '-newarg');

      expect(result).toBe('');
    });

    it('should throw error on PowerShell failure', async () => {
      mockSpawn.mockReturnValue(createMockPsProcess('', 1, 'Access denied'));

      await expect(updateShortcutArgs('C:\\Test.lnk', '-args')).rejects.toThrow(
        'Failed to update shortcut'
      );
    });

    it('should handle single quotes in arguments', async () => {
      mockSpawn.mockReturnValue(createMockPsProcess(''));

      await updateShortcutArgs('C:\\Test.lnk', "-arg 'value'");

      // Verify spawn was called - single quotes should be escaped in the command
      expect(mockSpawn).toHaveBeenCalledWith(
        'powershell',
        expect.arrayContaining(['-Command']),
        expect.any(Object)
      );
    });
  });

  describe('deleteShortcut', () => {
    it('should delete shortcut file', async () => {
      mockFsUnlink.mockResolvedValue(undefined);

      await deleteShortcut('C:\\Users\\TestUser\\Desktop\\Test.lnk');

      expect(mockFsUnlink).toHaveBeenCalledWith('C:\\Users\\TestUser\\Desktop\\Test.lnk');
    });

    it('should throw error when file does not exist', async () => {
      mockFsUnlink.mockRejectedValue(new Error('ENOENT: no such file'));

      await expect(deleteShortcut('C:\\Nonexistent.lnk')).rejects.toThrow(
        'Failed to delete shortcut'
      );
    });

    it('should throw error on permission denied', async () => {
      mockFsUnlink.mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(deleteShortcut('C:\\Protected.lnk')).rejects.toThrow(
        'Failed to delete shortcut'
      );
    });
  });
});
