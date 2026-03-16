/**
 * Tests for read-edit-registry utility
 * Tests Windows registry read, set, and delete operations
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
// Note: exec can be called as exec(cmd, callback) or exec(cmd, options, callback)
vi.mock('child_process', () => ({
  exec: vi.fn((...args: unknown[]) => {
    // Handle both exec(cmd, callback) and exec(cmd, options, callback) signatures
    const callback = (typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined) as
      | ((error: Error | null, result: { stdout: string; stderr: string }) => void)
      | undefined;

    if (!callback) {
      return; // No callback provided, nothing to do
    }

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
  }),
}));

import { readEditRegistry } from '../read-edit-registry.utils';
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

describe('readEditRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execMockState.callIndex = 0;
    execMockState.responses = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('read operations', () => {
    it('should read a REG_SZ value successfully', async () => {
      setMockExecResponses([{
        stdout: `
HKEY_CURRENT_USER\\Software\\TestApp
    TestValue    REG_SZ    Hello World
`,
        stderr: '',
      }]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'read',
            keyPath: 'HKCU\\Software\\TestApp',
            valueName: 'TestValue',
          },
        ],
      });

      expect(result.successfulOperations).toBe(1);
      expect(result.failedOperations).toBe(0);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].value).toBe('Hello World');
      expect(result.results[0].valueType).toBe('REG_SZ');
    });

    it('should read a REG_DWORD value and parse hex correctly', async () => {
      setMockExecResponses([{
        stdout: `
HKEY_CURRENT_USER\\Software\\TestApp
    DwordValue    REG_DWORD    0x1a
`,
        stderr: '',
      }]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'read',
            keyPath: 'HKEY_CURRENT_USER\\Software\\TestApp',
            valueName: 'DwordValue',
          },
        ],
      });

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].value).toBe(26); // 0x1a = 26
      expect(result.results[0].valueType).toBe('REG_DWORD');
    });

    it('should handle (Default) value correctly', async () => {
      setMockExecResponses([{
        stdout: `
HKEY_CURRENT_USER\\Software\\TestApp
    (Default)    REG_SZ    DefaultValue
`,
        stderr: '',
      }]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'read',
            keyPath: 'HKCU\\Software\\TestApp',
            valueName: '(Default)',
          },
        ],
      });

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].value).toBe('DefaultValue');
    });

    it('should handle empty value "(value not set)"', async () => {
      setMockExecResponses([{
        stdout: `
HKEY_CURRENT_USER\\Software\\TestApp
    EmptyValue    REG_SZ    (value not set)
`,
        stderr: '',
      }]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'read',
            keyPath: 'HKCU\\Software\\TestApp',
            valueName: 'EmptyValue',
          },
        ],
      });

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].value).toBe('');
    });

    it('should return null for non-existent registry value', async () => {
      setMockExecResponses([
        new Error('ERROR: The system was unable to find the specified registry key or value.'),
      ]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'read',
            keyPath: 'HKCU\\Software\\NonExistent',
            valueName: 'TestValue',
          },
        ],
      });

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].value).toBeNull();
    });
  });

  describe('set operations', () => {
    it('should set a REG_SZ value successfully', async () => {
      setMockExecResponses([
        new Error('Not found'),
        { stdout: '', stderr: '' },
      ]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'set',
            keyPath: 'HKCU\\Software\\TestApp',
            valueName: 'NewValue',
            valueType: 'REG_SZ',
            data: 'Test Data',
          },
        ],
      });

      expect(result.successfulOperations).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].value).toBe('Test Data');
      expect(result.results[0].previousValue).toBeNull();
    });

    it('should capture previous value when overwriting', async () => {
      setMockExecResponses([
        {
          stdout: `
HKEY_CURRENT_USER\\Software\\TestApp
    ExistingValue    REG_SZ    Old Data
`,
          stderr: '',
        },
        { stdout: '', stderr: '' },
      ]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'set',
            keyPath: 'HKCU\\Software\\TestApp',
            valueName: 'ExistingValue',
            valueType: 'REG_SZ',
            data: 'New Data',
          },
        ],
      });

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].value).toBe('New Data');
      expect(result.results[0].previousValue).toBe('Old Data');
      expect(result.results[0].previousType).toBe('REG_SZ');
    });

    it('should set a REG_DWORD value', async () => {
      setMockExecResponses([
        new Error('Not found'),
        { stdout: '', stderr: '' },
      ]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'set',
            keyPath: 'HKCU\\Software\\TestApp',
            valueName: 'DwordValue',
            valueType: 'REG_DWORD',
            data: 42,
          },
        ],
      });

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].value).toBe(42);
      expect(result.results[0].valueType).toBe('REG_DWORD');
    });

    it('should fail when data is not provided for set operation', async () => {
      setMockExecResponses([new Error('Not found')]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'set',
            keyPath: 'HKCU\\Software\\TestApp',
            valueName: 'TestValue',
            valueType: 'REG_SZ',
            // data is missing
          },
        ],
      });

      expect(result.failedOperations).toBe(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('Data is required');
    });
  });

  describe('delete operations', () => {
    it('should delete a registry value successfully', async () => {
      setMockExecResponses([
        {
          stdout: `
HKEY_CURRENT_USER\\Software\\TestApp
    ToDelete    REG_SZ    Delete Me
`,
          stderr: '',
        },
        { stdout: '', stderr: '' },
      ]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'delete',
            keyPath: 'HKCU\\Software\\TestApp',
            valueName: 'ToDelete',
          },
        ],
      });

      expect(result.successfulOperations).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].previousValue).toBe('Delete Me');
    });

    it('should capture previous type when deleting DWORD', async () => {
      setMockExecResponses([
        {
          stdout: `
HKEY_CURRENT_USER\\Software\\TestApp
    DwordToDelete    REG_DWORD    0xff
`,
          stderr: '',
        },
        { stdout: '', stderr: '' },
      ]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'delete',
            keyPath: 'HKCU\\Software\\TestApp',
            valueName: 'DwordToDelete',
          },
        ],
      });

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].previousValue).toBe(255); // 0xff = 255
      expect(result.results[0].previousType).toBe('REG_DWORD');
    });
  });

  describe('path normalization', () => {
    it('should normalize HKLM to HKEY_LOCAL_MACHINE', async () => {
      setMockExecResponses([new Error('Not found')]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'read',
            keyPath: 'HKLM\\Software\\Test',
            valueName: 'Value',
          },
        ],
      });

      expect(result.results[0].keyPath).toBe('HKEY_LOCAL_MACHINE\\Software\\Test');
    });

    it('should normalize HKCR to HKEY_CLASSES_ROOT', async () => {
      setMockExecResponses([new Error('Not found')]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'read',
            keyPath: 'HKCR\\.txt',
            valueName: '(Default)',
          },
        ],
      });

      expect(result.results[0].keyPath).toBe('HKEY_CLASSES_ROOT\\.txt');
    });

    it('should normalize HKU to HKEY_USERS', async () => {
      setMockExecResponses([new Error('Not found')]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'read',
            keyPath: 'HKU\\Test',
            valueName: 'Value',
          },
        ],
      });

      expect(result.results[0].keyPath).toBe('HKEY_USERS\\Test');
    });

    it('should normalize HKCC to HKEY_CURRENT_CONFIG', async () => {
      setMockExecResponses([new Error('Not found')]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'read',
            keyPath: 'HKCC\\Test',
            valueName: 'Value',
          },
        ],
      });

      expect(result.results[0].keyPath).toBe('HKEY_CURRENT_CONFIG\\Test');
    });
  });

  describe('batch operations', () => {
    it('should handle multiple operations in a batch', async () => {
      setMockExecResponses([
        {
          stdout: `
HKEY_CURRENT_USER\\Software\\TestApp
    Value1    REG_SZ    Data1
`,
          stderr: '',
        },
        {
          stdout: `
HKEY_CURRENT_USER\\Software\\TestApp
    Value2    REG_DWORD    0x10
`,
          stderr: '',
        },
        new Error('Not found'),
      ]);

      const result = await readEditRegistry({
        operations: [
          { operationType: 'read', keyPath: 'HKCU\\Software\\TestApp', valueName: 'Value1' },
          { operationType: 'read', keyPath: 'HKCU\\Software\\TestApp', valueName: 'Value2' },
          { operationType: 'read', keyPath: 'HKCU\\Software\\TestApp', valueName: 'Value3' },
        ],
      });

      expect(result.successfulOperations).toBe(3);
      expect(result.results[0].value).toBe('Data1');
      expect(result.results[1].value).toBe(16); // 0x10 = 16
      expect(result.results[2].value).toBeNull();
    });

    it('should count successful and failed operations correctly', async () => {
      setMockExecResponses([
        {
          stdout: `
HKEY_CURRENT_USER\\Software\\TestApp
    Value1    REG_SZ    Data1
`,
          stderr: '',
        },
        new Error('Not found'),
        new Error('Access denied'),
      ]);

      const result = await readEditRegistry({
        operations: [
          { operationType: 'read', keyPath: 'HKCU\\Software\\TestApp', valueName: 'Value1' },
          { operationType: 'set', keyPath: 'HKLM\\Software\\Restricted', valueName: 'Value2', valueType: 'REG_SZ', data: 'test' },
        ],
      });

      expect(result.successfulOperations).toBe(1);
      expect(result.failedOperations).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toContain('Access denied');
    });
  });

  describe('error handling', () => {
    it('should handle UAC cancellation gracefully', async () => {
      setMockExecResponses([
        new Error('Not found'),
        Object.assign(new Error('The operation was canceled by the user.'), { code: 1223 }),
      ]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'set',
            keyPath: 'HKLM\\Software\\Test',
            valueName: 'Value',
            valueType: 'REG_SZ',
            data: 'test',
          },
        ],
      });

      expect(result.failedOperations).toBe(1);
      expect(result.results[0].success).toBe(false);
    });

    it('should handle permission denied errors', async () => {
      setMockExecResponses([
        new Error('Not found'),
        new Error('ERROR: Access is denied.'),
      ]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'set',
            keyPath: 'HKLM\\Software\\Test',
            valueName: 'Value',
            valueType: 'REG_SZ',
            data: 'test',
          },
        ],
      });

      expect(result.failedOperations).toBe(1);
      expect(result.results[0].error).toContain('Access is denied');
    });

    it('should escape special characters in data', async () => {
      setMockExecResponses([
        new Error('Not found'),
        { stdout: '', stderr: '' },
      ]);

      await readEditRegistry({
        operations: [
          {
            operationType: 'set',
            keyPath: 'HKCU\\Software\\TestApp',
            valueName: 'TestValue',
            valueType: 'REG_SZ',
            data: 'Value with "quotes"',
          },
        ],
      });

      // The captured command should have escaped the quotes
      const callArg = getMockExecCalls()[1][0] as string;
      expect(callArg).toContain('\\"quotes\\"');
    });
  });

  describe('edge cases', () => {
    it('should handle empty operations array', async () => {
      const result = await readEditRegistry({
        operations: [],
      });

      expect(result.successfulOperations).toBe(0);
      expect(result.failedOperations).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should handle values with spaces correctly', async () => {
      setMockExecResponses([{
        stdout: `
HKEY_CURRENT_USER\\Software\\Test App
    Space Value    REG_SZ    Data with spaces
`,
        stderr: '',
      }]);

      const result = await readEditRegistry({
        operations: [
          {
            operationType: 'read',
            keyPath: 'HKCU\\Software\\Test App',
            valueName: 'Space Value',
          },
        ],
      });

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].value).toBe('Data with spaces');
    });

    it('should use default REG_SZ type when valueType not specified', async () => {
      setMockExecResponses([
        new Error('Not found'),
        { stdout: '', stderr: '' },
      ]);

      await readEditRegistry({
        operations: [
          {
            operationType: 'set',
            keyPath: 'HKCU\\Software\\Test',
            valueName: 'Value',
            data: 'test',
          },
        ],
      });

      const callArg = getMockExecCalls()[1][0] as string;
      expect(callArg).toContain('/t REG_SZ');
    });
  });
});
