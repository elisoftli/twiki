/**
 * Tests for set-process-affinity utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createExecError,
  processFixtures,
  setupCommonMocks,
} from '../../../__tests__/test-utils';

// Use vi.hoisted to declare mock state that can be used in vi.mock factories
const { execMockState, mockCpuCountRef } = vi.hoisted(() => {
  return {
    execMockState: {
      responses: [] as Array<{ stdout: string; stderr: string } | Error>,
      callIndex: 0,
    },
    mockCpuCountRef: { value: 8 },
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

vi.mock('os', () => ({
  default: {
    cpus: () =>
      Array.from({ length: mockCpuCountRef.value }, (_, i) => ({
        model: `Mock CPU ${i}`,
        speed: 3200,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      })),
  },
}));

// Import after mocks are set up
import { setProcessAffinity } from '../set-process-affinity.utils';
import { exec } from 'child_process';

// Helper to set mock responses
function setMockExecResponses(
  responses: Array<{ stdout: string; stderr: string } | Error>
) {
  execMockState.responses = responses;
  execMockState.callIndex = 0;
}

describe('setProcessAffinity', () => {
  let cleanupMocks: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    cleanupMocks = setupCommonMocks();
    mockCpuCountRef.value = 8;
    execMockState.callIndex = 0;
    execMockState.responses = [];

    // Default mock behavior - process found immediately, then PowerShell succeeds
    setMockExecResponses([
      { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
      { stdout: '', stderr: '' }, // PowerShell command
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupMocks();
  });

  // Helper to get mock exec calls
  const getMockExecCalls = () => (exec as unknown as ReturnType<typeof vi.fn>).mock.calls;

  describe('process name handling', () => {
    it('should append .exe to process name if not present', async () => {
      // Setup mock to return process found
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const resultPromise = setProcessAffinity({ processName: 'game' });

      // Fast-forward timers for the wait loop
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.numCPUs).toBe(8);
      // Verify tasklist was called with .exe suffix
      const calls = getMockExecCalls();
      expect(calls[0][0]).toContain('game.exe');
    });

    it('should not double-append .exe if already present', async () => {
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const resultPromise = setProcessAffinity({ processName: 'game.exe' });
      await vi.advanceTimersByTimeAsync(100);
      await resultPromise;

      // Should not contain game.exe.exe
      const calls = getMockExecCalls();
      const tasklistCall = calls.find((call) =>
        String(call[0]).includes('tasklist')
      );
      expect(tasklistCall?.[0]).not.toContain('game.exe.exe');
    });

    it('should handle process names with special characters', async () => {
      const processName = 'My-Game_v1.0';
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.processFound(`${processName}.exe`), stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const resultPromise = setProcessAffinity({ processName });
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.numCPUs).toBe(8);
    });
  });

  describe('wait for process behavior', () => {
    it('should wait for process when waitForProcess is true (default)', async () => {
      // First call: process not found, second call: found, third: PowerShell
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.processNotFound, stderr: '' },
        { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const resultPromise = setProcessAffinity({ processName: 'game' });

      // First check - process not found
      await vi.advanceTimersByTimeAsync(100);
      // Wait for setTimeout (1000ms) and next check
      await vi.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;
      expect(result.numCPUs).toBe(8);
      // Should have called exec at least 3 times: 2 tasklist + 1 powershell
      expect(getMockExecCalls().length).toBe(3);
    });

    it('should not wait for process when waitForProcess is false', async () => {
      setMockExecResponses([
        { stdout: '', stderr: '' },
      ]);

      const resultPromise = setProcessAffinity({
        processName: 'game',
        waitForProcess: false,
      });

      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.numCPUs).toBe(8);
      // Should only call powershell, not tasklist
      const calls = getMockExecCalls();
      const tasklistCalls = calls.filter((call) =>
        String(call[0]).includes('tasklist')
      );
      expect(tasklistCalls).toHaveLength(0);
    });

    it('should throw error if process not found within timeout', async () => {
      // Keep returning process not found
      setMockExecResponses(
        Array(10).fill({ stdout: processFixtures.tasklistOutputs.processNotFound, stderr: '' })
      );

      const resultPromise = setProcessAffinity({
        processName: 'nonexistent',
        maxWaitSeconds: 2,
      });
      // Attach empty catch to prevent unhandled rejection warning
      resultPromise.catch(() => {});

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(3000);

      await expect(resultPromise).rejects.toThrow(
        'Process nonexistent.exe not found after waiting 2 seconds'
      );
    });

    it('should respect custom maxWaitSeconds', async () => {
      // Keep returning process not found
      setMockExecResponses(
        Array(10).fill({ stdout: processFixtures.tasklistOutputs.processNotFound, stderr: '' })
      );

      const resultPromise = setProcessAffinity({
        processName: 'game',
        maxWaitSeconds: 5,
      });
      // Attach empty catch to prevent unhandled rejection warning
      resultPromise.catch(() => {});

      // Should not throw at 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      // Should throw after 5 seconds
      await vi.advanceTimersByTimeAsync(3000);

      await expect(resultPromise).rejects.toThrow(
        'Process game.exe not found after waiting 5 seconds'
      );
    });
  });

  describe('affinity mask calculation', () => {
    it('should calculate correct affinity mask for 8 CPUs when no custom mask provided', async () => {
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const resultPromise = setProcessAffinity({
        processName: 'game',
        waitForProcess: false,
      });
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.numCPUs).toBe(8);
      expect(result.affinityMask).toBe(255);

      // Check PowerShell command contains correct affinity mask
      // For 8 CPUs: (1 << 8) - 1 = 255
      const calls = getMockExecCalls();
      const psCall = calls.find((call) =>
        String(call[0]).includes('powershell')
      );
      expect(psCall?.[0]).toContain('ProcessorAffinity = 255');
    });

    it('should use custom affinityMask when provided', async () => {
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const resultPromise = setProcessAffinity({
        processName: 'game',
        affinityMask: 1,
        waitForProcess: false,
      });
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.numCPUs).toBe(8);
      expect(result.affinityMask).toBe(1);

      const calls = getMockExecCalls();
      const psCall = calls.find((call) =>
        String(call[0]).includes('powershell')
      );
      // affinityMask=1 means only core 0
      expect(psCall?.[0]).toContain('ProcessorAffinity = 1');
    });

    it('should use custom affinityMask for multi-core subset', async () => {
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      // 0b1111 = 15 = cores 0-3
      const resultPromise = setProcessAffinity({
        processName: 'game',
        affinityMask: 15,
        waitForProcess: false,
      });
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.affinityMask).toBe(15);

      const calls = getMockExecCalls();
      const psCall = calls.find((call) =>
        String(call[0]).includes('powershell')
      );
      expect(psCall?.[0]).toContain('ProcessorAffinity = 15');
    });
  });

  describe('PowerShell command execution', () => {
    it('should execute PowerShell command with correct process name', async () => {
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const resultPromise = setProcessAffinity({
        processName: 'game',
        waitForProcess: false,
      });
      await vi.advanceTimersByTimeAsync(100);
      await resultPromise;

      const calls = getMockExecCalls();
      const psCall = calls.find((call) =>
        String(call[0]).includes('powershell')
      );

      expect(psCall).toBeDefined();
      // The quotes are escaped as \" in the command line
      expect(psCall?.[0]).toContain('Get-Process -Name \\"game\\"');
    });

    it('should handle multiple process instances', async () => {
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.multipleProcesses('game.exe'), stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const resultPromise = setProcessAffinity({
        processName: 'game',
        waitForProcess: false,
      });
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.numCPUs).toBe(8);

      // PowerShell command should iterate over all processes
      const calls = getMockExecCalls();
      const psCall = calls.find((call) =>
        String(call[0]).includes('powershell')
      );
      expect(psCall?.[0]).toContain('foreach ($proc in $processes)');
    });
  });

  describe('error handling', () => {
    it('should handle tasklist command errors gracefully during wait', async () => {
      // First call throws, second finds process, third is PowerShell
      setMockExecResponses([
        createExecError('Command failed'),
        { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const resultPromise = setProcessAffinity({ processName: 'game' });

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;
      expect(result.numCPUs).toBe(8);
    });

    it('should throw error if PowerShell command fails', async () => {
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
        createExecError('PowerShell error: Process not found', { stderr: 'Process not found' }),
      ]);

      const resultPromise = setProcessAffinity({ processName: 'game' });
      // Attach empty catch to prevent unhandled rejection warning
      resultPromise.catch(() => {});
      await vi.advanceTimersByTimeAsync(100);

      await expect(resultPromise).rejects.toThrow('PowerShell error');
    });

    it('should throw error when process disappears before affinity can be set', async () => {
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
        createExecError('Process not found', { stderr: 'throw "Process not found"' }),
      ]);

      const resultPromise = setProcessAffinity({ processName: 'game' });
      // Attach empty catch to prevent unhandled rejection warning
      resultPromise.catch(() => {});
      await vi.advanceTimersByTimeAsync(100);

      await expect(resultPromise).rejects.toThrow();
    });
  });

  describe('return value', () => {
    it('should return numCPUs and affinityMask', async () => {
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const resultPromise = setProcessAffinity({
        processName: 'game',
        waitForProcess: false,
      });
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result).toEqual({ numCPUs: 8, affinityMask: 255 });
    });

    it('should return custom affinityMask when provided', async () => {
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const resultPromise = setProcessAffinity({
        processName: 'game',
        affinityMask: 1,
        waitForProcess: false,
      });
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result).toEqual({ numCPUs: 8, affinityMask: 1 });
    });
  });

  describe('edge cases', () => {
    it('should handle process names with spaces', async () => {
      const processName = 'My Game';
      setMockExecResponses([
        { stdout: `"Image Name","PID","Session Name","Session#","Mem Usage"\n"${processName}.exe","1234","Console","1","50,000 K"`, stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      const resultPromise = setProcessAffinity({
        processName,
        waitForProcess: false,
      });
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.numCPUs).toBe(8);
    });

    it('should use default values for optional parameters', async () => {
      setMockExecResponses([
        { stdout: processFixtures.tasklistOutputs.processFound('game.exe'), stderr: '' },
        { stdout: '', stderr: '' },
      ]);

      // Only pass required parameter
      const resultPromise = setProcessAffinity({ processName: 'game' });
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.numCPUs).toBe(8);
    });
  });
});
