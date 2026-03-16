/**
 * Tests for set-file-attributes utility
 * Tests Windows file attribute manipulation (ReadOnly, Hidden, System, Archive)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to declare mock state that can be used in vi.mock factories
const { execMockState } = vi.hoisted(() => {
  return {
    execMockState: {
      responses: [] as Array<{ stdout: string; stderr: string } | Error>,
      callIndex: 0,
    },
  };
});

// Mock child_process.exec with a callback-style function that works with promisify
vi.mock('child_process', () => ({
  exec: vi.fn(
    (
      _cmd: string,
      callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
    ) => {
      const response = execMockState.responses[execMockState.callIndex];
      execMockState.callIndex++;

      // Use setImmediate to simulate async behavior
      setImmediate(() => {
        if (response instanceof Error) {
          callback(response, { stdout: '', stderr: '' });
        } else if (response) {
          callback(null, response);
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      });
    }
  ),
}));

// Mock expandWindowsEnvVars
vi.mock('../../../../utils', () => ({
  expandWindowsEnvVars: (path: string) => {
    return path
      .replace(/%USERPROFILE%/gi, 'C:\\Users\\TestUser')
      .replace(/%APPDATA%/gi, 'C:\\Users\\TestUser\\AppData\\Roaming')
      .replace(/%LOCALAPPDATA%/gi, 'C:\\Users\\TestUser\\AppData\\Local');
  },
}));

import { setFileAttributes } from '../set-file-attributes.utils';
import { exec } from 'child_process';

// Helper to set mock responses
function setMockExecResponses(
  responses: Array<{ stdout: string; stderr: string } | Error>
) {
  execMockState.responses = responses;
  execMockState.callIndex = 0;
}

// Helper to get mock exec calls
const getMockExecCalls = () => (exec as unknown as ReturnType<typeof vi.fn>).mock.calls;

describe('setFileAttributes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execMockState.callIndex = 0;
    execMockState.responses = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setting single attributes', () => {
    it('should set ReadOnly attribute when currently not set', async () => {
      setMockExecResponses([
        { stdout: 'A           C:\\test\\file.txt', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: 'C:\\test\\file.txt',
        readOnly: true,
      });

      expect(result.path).toBe('C:\\test\\file.txt');
      expect(result.attributes).toContain('ReadOnly');
      const setCmd = getMockExecCalls()[1][0] as string;
      expect(setCmd).toContain('+R');
    });

    it('should remove ReadOnly attribute when currently set', async () => {
      setMockExecResponses([
        { stdout: 'A    R      C:\\test\\file.txt', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: 'C:\\test\\file.txt',
        readOnly: false,
      });

      expect(result.attributes).toContain('-ReadOnly');
      const setCmd = getMockExecCalls()[1][0] as string;
      expect(setCmd).toContain('-R');
    });

    it('should set Hidden attribute', async () => {
      setMockExecResponses([
        { stdout: 'A           C:\\test\\file.txt', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: 'C:\\test\\file.txt',
        hidden: true,
      });

      expect(result.attributes).toContain('Hidden');
      const setCmd = getMockExecCalls()[1][0] as string;
      expect(setCmd).toContain('+H');
    });

    it('should set System attribute', async () => {
      setMockExecResponses([
        { stdout: 'A           C:\\test\\file.txt', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: 'C:\\test\\file.txt',
        system: true,
      });

      expect(result.attributes).toContain('System');
      const setCmd = getMockExecCalls()[1][0] as string;
      expect(setCmd).toContain('+S');
    });

    it('should set Archive attribute', async () => {
      setMockExecResponses([
        { stdout: '            C:\\test\\file.txt', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: 'C:\\test\\file.txt',
        archive: true,
      });

      expect(result.attributes).toContain('Archive');
      const setCmd = getMockExecCalls()[1][0] as string;
      expect(setCmd).toContain('+A');
    });
  });

  describe('setting multiple attributes', () => {
    it('should set multiple attributes at once', async () => {
      setMockExecResponses([
        { stdout: '            C:\\test\\file.txt', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: 'C:\\test\\file.txt',
        readOnly: true,
        hidden: true,
        system: true,
        archive: true,
      });

      expect(result.attributes).toContain('ReadOnly');
      expect(result.attributes).toContain('Hidden');
      expect(result.attributes).toContain('System');
      expect(result.attributes).toContain('Archive');
      const setCmd = getMockExecCalls()[1][0] as string;
      expect(setCmd).toContain('+R');
      expect(setCmd).toContain('+H');
      expect(setCmd).toContain('+S');
      expect(setCmd).toContain('+A');
    });

    it('should handle mixed add/remove operations', async () => {
      setMockExecResponses([
        { stdout: 'A    R    H    C:\\test\\file.txt', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: 'C:\\test\\file.txt',
        readOnly: false, // Remove
        hidden: false, // Remove
        system: true, // Add
      });

      expect(result.attributes).toContain('-ReadOnly');
      expect(result.attributes).toContain('-Hidden');
      expect(result.attributes).toContain('System');
      const setCmd = getMockExecCalls()[1][0] as string;
      expect(setCmd).toContain('-R');
      expect(setCmd).toContain('-H');
      expect(setCmd).toContain('+S');
    });
  });

  describe('no-op scenarios', () => {
    it('should return empty attributes when no changes needed', async () => {
      setMockExecResponses([
        { stdout: 'A    R      C:\\test\\file.txt', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: 'C:\\test\\file.txt',
        readOnly: true, // Already set, no change needed
      });

      expect(result.attributes).toHaveLength(0);
    });

    it('should return empty attributes when attribute already removed', async () => {
      setMockExecResponses([
        { stdout: 'A           C:\\test\\file.txt', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: 'C:\\test\\file.txt',
        readOnly: false, // Already not set
      });

      expect(result.attributes).toHaveLength(0);
    });

    it('should not call attrib command when no changes needed', async () => {
      setMockExecResponses([
        { stdout: 'A    R    H  S  C:\\test\\file.txt', stderr: '' },
      ]);

      await setFileAttributes({
        filePath: 'C:\\test\\file.txt',
        readOnly: true,
        hidden: true,
        system: true,
        archive: true,
      });

      // Should only call once to get current attributes, no second call to set
      expect(getMockExecCalls().length).toBe(1);
    });
  });

  describe('environment variable expansion', () => {
    it('should expand %USERPROFILE% in path', async () => {
      setMockExecResponses([
        { stdout: '            C:\\Users\\TestUser\\file.txt', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: '%USERPROFILE%\\file.txt',
        readOnly: true,
      });

      expect(result.path).toBe('C:\\Users\\TestUser\\file.txt');
      const getCmd = getMockExecCalls()[0][0] as string;
      expect(getCmd).toContain('C:\\Users\\TestUser\\file.txt');
    });

    it('should expand %APPDATA% in path', async () => {
      setMockExecResponses([
        { stdout: '            C:\\Users\\TestUser\\AppData\\Roaming\\config.ini', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: '%APPDATA%\\config.ini',
        hidden: true,
      });

      expect(result.path).toBe('C:\\Users\\TestUser\\AppData\\Roaming\\config.ini');
    });

    it('should expand %LOCALAPPDATA% in path', async () => {
      setMockExecResponses([
        { stdout: '            C:\\Users\\TestUser\\AppData\\Local\\game.cfg', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: '%LOCALAPPDATA%\\game.cfg',
        readOnly: true,
      });

      expect(result.path).toBe('C:\\Users\\TestUser\\AppData\\Local\\game.cfg');
    });
  });

  describe('error handling', () => {
    it('should throw error when file does not exist', async () => {
      setMockExecResponses([new Error('File Not Found')]);

      await expect(
        setFileAttributes({
          filePath: 'C:\\nonexistent\\file.txt',
          readOnly: true,
        })
      ).rejects.toThrow('File Not Found');
    });

    it('should throw error when permission denied', async () => {
      setMockExecResponses([
        { stdout: '            C:\\system\\file.txt', stderr: '' },
        new Error('Access is denied'),
      ]);

      await expect(
        setFileAttributes({
          filePath: 'C:\\system\\file.txt',
          system: true,
        })
      ).rejects.toThrow('Access is denied');
    });

    it('should handle invalid path characters', async () => {
      setMockExecResponses([
        new Error('The filename, directory name, or volume label syntax is incorrect'),
      ]);

      await expect(
        setFileAttributes({
          filePath: 'C:\\invalid<>path\\file.txt',
          readOnly: true,
        })
      ).rejects.toThrow('syntax is incorrect');
    });
  });

  describe('attribute parsing', () => {
    it('should parse full attribute line correctly', async () => {
      setMockExecResponses([
        { stdout: 'A    R    H  S  C:\\test\\file.txt', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: 'C:\\test\\file.txt',
        readOnly: false, // Should remove
        hidden: false, // Should remove
        system: false, // Should remove
        archive: false, // Should remove
      });

      expect(result.attributes).toContain('-ReadOnly');
      expect(result.attributes).toContain('-Hidden');
      expect(result.attributes).toContain('-System');
      expect(result.attributes).toContain('-Archive');
      const setCmd = getMockExecCalls()[1][0] as string;
      expect(setCmd).toContain('-R');
      expect(setCmd).toContain('-H');
      expect(setCmd).toContain('-S');
      expect(setCmd).toContain('-A');
    });

    it('should handle paths with spaces in attribute parsing', async () => {
      setMockExecResponses([
        { stdout: 'A    R      C:\\Users\\Test User\\Documents\\My File.txt', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: 'C:\\Users\\Test User\\Documents\\My File.txt',
        readOnly: false,
      });

      expect(result.attributes).toContain('-ReadOnly');
    });
  });

  describe('command construction', () => {
    it('should quote file path in command', async () => {
      setMockExecResponses([
        { stdout: '            C:\\path with spaces\\file.txt', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      await setFileAttributes({
        filePath: 'C:\\path with spaces\\file.txt',
        readOnly: true,
      });

      // The second command (attrib set) should have quoted path
      const setCmd = getMockExecCalls()[1][0] as string;
      expect(setCmd).toContain('"C:\\path with spaces\\file.txt"');
    });

    it('should join multiple attribute flags with spaces', async () => {
      setMockExecResponses([
        { stdout: '            C:\\test\\file.txt', stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      await setFileAttributes({
        filePath: 'C:\\test\\file.txt',
        readOnly: true,
        hidden: true,
      });

      const setCmd = getMockExecCalls()[1][0] as string;
      expect(setCmd).toMatch(/attrib \+R \+H/);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined attribute parameters', async () => {
      setMockExecResponses([
        { stdout: 'A           C:\\test\\file.txt', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: 'C:\\test\\file.txt',
        // All attributes undefined - should result in no changes
      });

      expect(result.attributes).toHaveLength(0);
    });

    it('should handle very long file paths', async () => {
      const longPath = 'C:\\' + 'very\\'.repeat(50) + 'deep\\path\\file.txt';

      setMockExecResponses([
        { stdout: `            ${longPath}`, stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: longPath,
        readOnly: true,
      });

      expect(result.path).toBe(longPath);
      expect(result.attributes).toContain('ReadOnly');
    });

    it('should handle UNC paths', async () => {
      const uncPath = '\\\\server\\share\\file.txt';

      setMockExecResponses([
        { stdout: `A           ${uncPath}`, stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const result = await setFileAttributes({
        filePath: uncPath,
        readOnly: true,
      });

      expect(result.path).toBe(uncPath);
    });
  });
});
