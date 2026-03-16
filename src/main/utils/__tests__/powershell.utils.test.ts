/**
 * PowerShell Utils Tests
 *
 * Tests for PowerShell execution utilities:
 * - getDisplayInfoFromPowerShell function
 * - Script execution with timeout
 * - Output parsing and validation
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock logger
vi.mock('../logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Import after mocks
import { getDisplayInfoFromPowerShell } from '../powershell.utils';

// =============================================================================
// Test Helpers
// =============================================================================

interface MockProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: {
    write: typeof vi.fn;
    end: typeof vi.fn;
  };
  kill: typeof vi.fn;
}

function createMockProcess(): MockProcess {
  const process = new EventEmitter() as MockProcess;
  process.stdout = new EventEmitter();
  process.stderr = new EventEmitter();
  process.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  process.kill = vi.fn();
  return process;
}

// =============================================================================
// Tests
// =============================================================================

describe('PowerShell Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  describe('getDisplayInfoFromPowerShell', () => {
    it('should parse single display info', async () => {
      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const resultPromise = getDisplayInfoFromPowerShell();

      // Simulate successful output
      const displayData = {
        model: 'DELL U2718Q',
        main: true,
        connection: 'DisplayPort',
        resolutionX: 3840,
        resolutionY: 2160,
        currentRefreshRate: 60,
      };

      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(displayData)));
      mockProcess.emit('close', 0);

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(1);
      expect(result![0]).toEqual({
        model: 'DELL U2718Q',
        main: true,
        connection: 'DisplayPort',
        resolutionX: 3840,
        resolutionY: 2160,
        currentRefreshRate: 60,
      });
    });

    it('should parse multiple displays', async () => {
      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const resultPromise = getDisplayInfoFromPowerShell();

      const displays = [
        {
          model: 'Primary Monitor',
          main: true,
          connection: 'HDMI',
          resolutionX: 1920,
          resolutionY: 1080,
          currentRefreshRate: 144,
        },
        {
          model: 'Secondary Monitor',
          main: false,
          connection: 'DisplayPort',
          resolutionX: 2560,
          resolutionY: 1440,
          currentRefreshRate: 60,
        },
      ];

      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(displays)));
      mockProcess.emit('close', 0);

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(2);
      expect(result![0].main).toBe(true);
      expect(result![1].main).toBe(false);
    });

    it('should return null on PowerShell error', async () => {
      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const resultPromise = getDisplayInfoFromPowerShell();

      mockProcess.stderr.emit('data', Buffer.from('PowerShell error'));
      mockProcess.emit('close', 1);

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBeNull();
    });

    it('should return null on spawn error', async () => {
      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const resultPromise = getDisplayInfoFromPowerShell();

      mockProcess.emit('error', new Error('spawn error'));

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBeNull();
    });

    it('should return null on timeout', async () => {
      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const resultPromise = getDisplayInfoFromPowerShell();

      // Advance time past the timeout (10 seconds)
      await vi.advanceTimersByTimeAsync(11000);

      const result = await resultPromise;

      expect(result).toBeNull();
      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('should return null on invalid JSON', async () => {
      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const resultPromise = getDisplayInfoFromPowerShell();

      mockProcess.stdout.emit('data', Buffer.from('not valid json'));
      mockProcess.emit('close', 0);

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBeNull();
    });

    it('should normalize missing/invalid fields', async () => {
      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const resultPromise = getDisplayInfoFromPowerShell();

      const invalidDisplay = {
        model: 123, // Should be string
        main: 'yes', // Should be boolean
        connection: null,
        resolutionX: '1920', // Should be number
        resolutionY: undefined,
        currentRefreshRate: 'fast',
      };

      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(invalidDisplay)));
      mockProcess.emit('close', 0);

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(1);
      expect(result![0].model).toBe('Unknown'); // Non-string becomes Unknown
      expect(result![0].main).toBe(true); // Truthy string becomes true
      expect(result![0].connection).toBeNull();
      expect(result![0].resolutionX).toBeNull(); // Non-number becomes null
      expect(result![0].resolutionY).toBeNull();
      expect(result![0].currentRefreshRate).toBeNull();
    });

    it('should call spawn with correct arguments', async () => {
      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      getDisplayInfoFromPowerShell();

      expect(spawn).toHaveBeenCalledWith(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        }
      );
    });

    it('should write script to stdin and close it', async () => {
      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      getDisplayInfoFromPowerShell();

      expect(mockProcess.stdin.write).toHaveBeenCalled();
      expect(mockProcess.stdin.end).toHaveBeenCalled();
    });

    it('should accumulate stdout chunks', async () => {
      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const resultPromise = getDisplayInfoFromPowerShell();

      // Send JSON in multiple chunks
      mockProcess.stdout.emit('data', Buffer.from('[{"model":'));
      mockProcess.stdout.emit('data', Buffer.from('"Monitor","main":true,'));
      mockProcess.stdout.emit('data', Buffer.from('"connection":"HDMI","resolutionX":1920,'));
      mockProcess.stdout.emit('data', Buffer.from('"resolutionY":1080,"currentRefreshRate":60}]'));
      mockProcess.emit('close', 0);

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(1);
      expect(result![0].model).toBe('Monitor');
    });

    it('should handle whitespace in output', async () => {
      const mockProcess = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const resultPromise = getDisplayInfoFromPowerShell();

      const display = { model: 'Test', main: true, connection: null, resolutionX: 1920, resolutionY: 1080, currentRefreshRate: 60 };
      mockProcess.stdout.emit('data', Buffer.from(`\n  ${JSON.stringify(display)}  \n`));
      mockProcess.emit('close', 0);

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toHaveLength(1);
      expect(result![0].model).toBe('Test');
    });
  });
});
