/**
 * Tests for system.utils — expandWindowsEnvVars and known folder redirection
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Use vi.hoisted so mock state is available inside vi.mock factories
const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
  execSync: execSyncMock,
}));

vi.mock('../logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { expandWindowsEnvVars, _resetKnownFolderCache } from '../system.utils';

// =============================================================================
// Helpers
// =============================================================================

/** Simulated `reg query` output for OneDrive KFM */
function makeRegOutput(entries: Record<string, string>): string {
  let output =
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders\r\n';
  for (const [name, value] of Object.entries(entries)) {
    output += `    ${name}    REG_EXPAND_SZ    ${value}\r\n`;
  }
  return output;
}

// =============================================================================
// Tests
// =============================================================================

describe('system.utils', () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    _resetKnownFolderCache();
    // Restore env
    process.env = { ...originalEnv };
    // Default to win32 with a USERPROFILE
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.USERPROFILE = 'C:\\Users\\TestUser';
    process.env.APPDATA = 'C:\\Users\\TestUser\\AppData\\Roaming';
    process.env.LOCALAPPDATA = 'C:\\Users\\TestUser\\AppData\\Local';
    // Default: no redirection (registry returns default paths)
    execSyncMock.mockReturnValue(
      makeRegOutput({
        Personal: '%USERPROFILE%\\Documents',
        Desktop: '%USERPROFILE%\\Desktop',
        'My Pictures': '%USERPROFILE%\\Pictures',
      })
    );
  });

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = originalEnv;
  });

  // ---------------------------------------------------------------------------
  // Basic env var expansion
  // ---------------------------------------------------------------------------

  describe('expandWindowsEnvVars — basic env var expansion', () => {
    it('expands %USERPROFILE%', () => {
      expect(expandWindowsEnvVars('%USERPROFILE%\\Documents\\game.ini')).toBe(
        'C:\\Users\\TestUser\\Documents\\game.ini'
      );
    });

    it('expands %APPDATA%', () => {
      expect(expandWindowsEnvVars('%APPDATA%\\GameStudio\\config.xml')).toBe(
        'C:\\Users\\TestUser\\AppData\\Roaming\\GameStudio\\config.xml'
      );
    });

    it('leaves unknown variables as-is', () => {
      expect(expandWindowsEnvVars('%UNKNOWN_VAR%\\foo')).toBe('%UNKNOWN_VAR%\\foo');
    });

    it('expands multiple variables in one path', () => {
      process.env.SYSTEMDRIVE = 'C:';
      expect(expandWindowsEnvVars('%SYSTEMDRIVE%\\Users\\%USERNAME%')).toContain('C:\\Users\\');
    });
  });

  // ---------------------------------------------------------------------------
  // OneDrive known folder redirection
  // ---------------------------------------------------------------------------

  describe('expandWindowsEnvVars — known folder redirection', () => {
    it.each([
      {
        folder: 'Documents',
        regKey: 'Personal',
        regValue: '%USERPROFILE%\\OneDrive\\Documents',
        input: '%USERPROFILE%\\Documents\\My Games\\config.ini',
        expected: 'C:\\Users\\TestUser\\OneDrive\\Documents\\My Games\\config.ini',
      },
      {
        folder: 'Desktop',
        regKey: 'Desktop',
        regValue: '%USERPROFILE%\\OneDrive\\Desktop',
        input: '%USERPROFILE%\\Desktop\\shortcut.lnk',
        expected: 'C:\\Users\\TestUser\\OneDrive\\Desktop\\shortcut.lnk',
      },
      {
        folder: 'Pictures',
        regKey: 'My Pictures',
        regValue: '%USERPROFILE%\\OneDrive\\Pictures',
        input: '%USERPROFILE%\\Pictures\\screenshot.png',
        expected: 'C:\\Users\\TestUser\\OneDrive\\Pictures\\screenshot.png',
      },
    ])('redirects $folder when OneDrive KFM is active', ({ regKey, regValue, input, expected }) => {
      execSyncMock.mockReturnValue(makeRegOutput({ [regKey]: regValue }));
      expect(expandWindowsEnvVars(input)).toBe(expected);
    });

    it('does not redirect when actual path equals default', () => {
      // Default mock already returns non-redirected paths
      expect(expandWindowsEnvVars('%USERPROFILE%\\Documents\\game.ini')).toBe(
        'C:\\Users\\TestUser\\Documents\\game.ini'
      );
    });

    it('does not redirect non-matching paths like %APPDATA%', () => {
      execSyncMock.mockReturnValue(
        makeRegOutput({
          Personal: '%USERPROFILE%\\OneDrive\\Documents',
        })
      );

      expect(expandWindowsEnvVars('%APPDATA%\\GameStudio\\config.xml')).toBe(
        'C:\\Users\\TestUser\\AppData\\Roaming\\GameStudio\\config.xml'
      );
    });

    it('respects path boundary — does not match Documents2', () => {
      execSyncMock.mockReturnValue(
        makeRegOutput({
          Personal: '%USERPROFILE%\\OneDrive\\Documents',
        })
      );

      expect(expandWindowsEnvVars('%USERPROFILE%\\Documents2\\file.txt')).toBe(
        'C:\\Users\\TestUser\\Documents2\\file.txt'
      );
    });

    it('matches case-insensitively when registry uses literal path with different casing', () => {
      // Registry returns a literal path (no %VAR%) with different casing than USERPROFILE
      execSyncMock.mockReturnValue(
        makeRegOutput({
          Personal: 'C:\\users\\testuser\\OneDrive\\Documents',
        })
      );

      // Cache default key: "c:\users\testuser\documents"
      // Expanded path:     "C:\Users\TestUser\Documents\game.ini"
      // Should still match due to case-insensitive comparison
      expect(expandWindowsEnvVars('%USERPROFILE%\\Documents\\game.ini')).toBe(
        'C:\\users\\testuser\\OneDrive\\Documents\\game.ini'
      );
    });

    it('redirects exact folder path (no trailing content)', () => {
      execSyncMock.mockReturnValue(
        makeRegOutput({
          Personal: '%USERPROFILE%\\OneDrive\\Documents',
        })
      );

      expect(expandWindowsEnvVars('%USERPROFILE%\\Documents')).toBe(
        'C:\\Users\\TestUser\\OneDrive\\Documents'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Platform / error guards
  // ---------------------------------------------------------------------------

  describe('expandWindowsEnvVars — platform and error guards', () => {
    it('skips registry query on non-Windows platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      expect(expandWindowsEnvVars('%USERPROFILE%\\Documents\\game.ini')).toBe(
        'C:\\Users\\TestUser\\Documents\\game.ini'
      );
      expect(execSyncMock).not.toHaveBeenCalled();
    });

    it('handles registry query failure gracefully', () => {
      execSyncMock.mockImplementation(() => {
        throw new Error('reg.exe not found');
      });

      // Should not throw, just return expanded path without redirection
      expect(expandWindowsEnvVars('%USERPROFILE%\\Documents\\game.ini')).toBe(
        'C:\\Users\\TestUser\\Documents\\game.ini'
      );
    });

    it('skips registry query when USERPROFILE is not set', () => {
      delete process.env.USERPROFILE;

      // expandWindowsEnvVars will leave %USERPROFILE% as-is since the env var is gone
      expect(expandWindowsEnvVars('%USERPROFILE%\\Documents\\game.ini')).toBe(
        '%USERPROFILE%\\Documents\\game.ini'
      );
      expect(execSyncMock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Caching
  // ---------------------------------------------------------------------------

  describe('expandWindowsEnvVars — caching', () => {
    it('queries registry only once across multiple calls', () => {
      execSyncMock.mockReturnValue(
        makeRegOutput({
          Personal: '%USERPROFILE%\\OneDrive\\Documents',
        })
      );

      expandWindowsEnvVars('%USERPROFILE%\\Documents\\a.ini');
      expandWindowsEnvVars('%USERPROFILE%\\Documents\\b.ini');
      expandWindowsEnvVars('%USERPROFILE%\\Documents\\c.ini');

      expect(execSyncMock).toHaveBeenCalledTimes(1);
    });

    it('re-queries registry after _resetKnownFolderCache()', () => {
      execSyncMock.mockReturnValue(
        makeRegOutput({
          Personal: '%USERPROFILE%\\OneDrive\\Documents',
        })
      );

      expandWindowsEnvVars('%USERPROFILE%\\Documents\\a.ini');
      expect(execSyncMock).toHaveBeenCalledTimes(1);

      _resetKnownFolderCache();

      expandWindowsEnvVars('%USERPROFILE%\\Documents\\b.ini');
      expect(execSyncMock).toHaveBeenCalledTimes(2);
    });
  });
});
