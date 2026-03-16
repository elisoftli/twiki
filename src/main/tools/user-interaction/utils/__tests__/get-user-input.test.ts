/**
 * Tests for get-user-input utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockIpcEvent,
  userInputFixtures,
  setupCommonMocks,
} from '../../../__tests__/test-utils';
import type { UserInputIpcResponse } from '../types';

// Use vi.hoisted to declare mock functions that can be used in vi.mock factories
const { mockIpcMainOn, mockIpcMainRemoveListener, mockWebContentsSend } = vi.hoisted(() => {
  return {
    mockIpcMainOn: vi.fn(),
    mockIpcMainRemoveListener: vi.fn(),
    mockWebContentsSend: vi.fn(),
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    on: mockIpcMainOn,
    once: vi.fn(),
    removeListener: mockIpcMainRemoveListener,
    handle: vi.fn(),
    handleOnce: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock('../../../../windows', () => ({
  MainWindow: {
    getWindow: () => ({
      webContents: {
        send: mockWebContentsSend,
      },
    }),
  },
}));

// Import after mocks are set up
import { getUserInput } from '../get-user-input.utils';

describe('getUserInput', () => {
  let cleanupMocks: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanupMocks = setupCommonMocks();
  });

  afterEach(() => {
    cleanupMocks();
  });

  describe('sending request to renderer', () => {
    it('should send user input request to renderer with correct channel', async () => {
      const params = userInputFixtures.validParams;

      // Start the request
      const resultPromise = getUserInput(params);

      // Verify request was sent
      expect(mockWebContentsSend).toHaveBeenCalledWith(
        'agent:user-input-request',
        expect.objectContaining({
          title: params.title,
          message: params.message,
          options: params.options,
        })
      );

      // Simulate response to resolve the promise
      const requestId = mockWebContentsSend.mock.calls[0][1].requestId;
      const response: UserInputIpcResponse = {
        requestId,
        userInput: 'Option 1',
        cancelled: false,
      };

      // Get the handler that was registered and call it
      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];
      handler?.(createMockIpcEvent(), response);

      await resultPromise;
    });

    it('should include a unique requestId in the request', async () => {
      const resultPromise = getUserInput(userInputFixtures.validParams);

      const sentData = mockWebContentsSend.mock.calls[0][1];
      expect(sentData.requestId).toBeDefined();
      expect(typeof sentData.requestId).toBe('string');
      expect(sentData.requestId.length).toBeGreaterThan(0);

      // Resolve the promise
      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];
      handler?.(createMockIpcEvent(), {
        requestId: sentData.requestId,
        userInput: 'test',
        cancelled: false,
      });

      await resultPromise;
    });

    it('should pass empty options array when options not provided', async () => {
      const params = userInputFixtures.textInputParams;

      const resultPromise = getUserInput(params);

      const sentData = mockWebContentsSend.mock.calls[0][1];
      expect(sentData.options).toEqual([]);

      // Resolve the promise
      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];
      handler?.(createMockIpcEvent(), {
        requestId: sentData.requestId,
        userInput: 'text input',
        cancelled: false,
      });

      await resultPromise;
    });

    it('should pass all options when provided', async () => {
      const params = userInputFixtures.longOptions;

      const resultPromise = getUserInput(params);

      const sentData = mockWebContentsSend.mock.calls[0][1];
      expect(sentData.options).toEqual(params.options);
      expect(sentData.options).toHaveLength(10);

      // Resolve the promise
      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];
      handler?.(createMockIpcEvent(), {
        requestId: sentData.requestId,
        userInput: 'Option 1',
        cancelled: false,
      });

      await resultPromise;
    });
  });

  describe('successful user input', () => {
    it('should resolve with user input when option is selected', async () => {
      const params = userInputFixtures.validParams;

      const resultPromise = getUserInput(params);

      // Get request ID and simulate response
      const requestId = mockWebContentsSend.mock.calls[0][1].requestId;
      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];

      handler?.(createMockIpcEvent(), {
        requestId,
        userInput: 'Option 2',
        cancelled: false,
      });

      const result = await resultPromise;

      expect(result.userInput).toBe('Option 2');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should resolve with text input when no options are provided', async () => {
      const params = userInputFixtures.textInputParams;

      const resultPromise = getUserInput(params);

      const requestId = mockWebContentsSend.mock.calls[0][1].requestId;
      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];

      handler?.(createMockIpcEvent(), {
        requestId,
        userInput: 'Custom user text',
        cancelled: false,
      });

      const result = await resultPromise;

      expect(result.userInput).toBe('Custom user text');
    });

    it('should return timestamp close to current time', async () => {
      const beforeTime = new Date();

      const resultPromise = getUserInput(userInputFixtures.validParams);

      const requestId = mockWebContentsSend.mock.calls[0][1].requestId;
      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];

      handler?.(createMockIpcEvent(), {
        requestId,
        userInput: 'test',
        cancelled: false,
      });

      const result = await resultPromise;
      const afterTime = new Date();

      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('user cancellation', () => {
    it('should reject with error when user cancels the dialog', async () => {
      const resultPromise = getUserInput(userInputFixtures.validParams);

      const requestId = mockWebContentsSend.mock.calls[0][1].requestId;
      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];

      handler?.(createMockIpcEvent(), {
        requestId,
        userInput: '',
        cancelled: true,
      });

      await expect(resultPromise).rejects.toThrow('User cancelled the input dialog');
    });

    it('should reject with cancellation error even if userInput is provided', async () => {
      const resultPromise = getUserInput(userInputFixtures.validParams);

      const requestId = mockWebContentsSend.mock.calls[0][1].requestId;
      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];

      // User selected something but then cancelled
      handler?.(createMockIpcEvent(), {
        requestId,
        userInput: 'Option 1',
        cancelled: true,
      });

      await expect(resultPromise).rejects.toThrow('User cancelled the input dialog');
    });
  });

  describe('IPC listener cleanup', () => {
    it('should remove listener after successful response', async () => {
      const resultPromise = getUserInput(userInputFixtures.validParams);

      const requestId = mockWebContentsSend.mock.calls[0][1].requestId;
      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];

      handler?.(createMockIpcEvent(), {
        requestId,
        userInput: 'Option 1',
        cancelled: false,
      });

      await resultPromise;

      expect(mockIpcMainRemoveListener).toHaveBeenCalledWith(
        'agent:user-input-response',
        expect.any(Function)
      );
    });

    it('should remove listener after cancellation', async () => {
      const resultPromise = getUserInput(userInputFixtures.validParams);

      const requestId = mockWebContentsSend.mock.calls[0][1].requestId;
      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];

      handler?.(createMockIpcEvent(), {
        requestId,
        userInput: '',
        cancelled: true,
      });

      try {
        await resultPromise;
      } catch {
        // Expected to throw
      }

      expect(mockIpcMainRemoveListener).toHaveBeenCalledWith(
        'agent:user-input-response',
        expect.any(Function)
      );
    });

    it('should ignore responses with different requestId', async () => {
      const resultPromise = getUserInput(userInputFixtures.validParams);

      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];

      // Send response with wrong requestId
      handler?.(createMockIpcEvent(), {
        requestId: 'wrong-id',
        userInput: 'Should be ignored',
        cancelled: false,
      });

      // Listener should not be removed yet
      expect(mockIpcMainRemoveListener).not.toHaveBeenCalled();

      // Now send correct response
      const correctRequestId = mockWebContentsSend.mock.calls[0][1].requestId;
      handler?.(createMockIpcEvent(), {
        requestId: correctRequestId,
        userInput: 'Correct response',
        cancelled: false,
      });

      const result = await resultPromise;
      expect(result.userInput).toBe('Correct response');
    });
  });

  describe('multiple simultaneous requests', () => {
    it('should handle multiple requests with unique IDs when called at different times', async () => {
      // Use fake timers to control Date.now()
      vi.useFakeTimers();

      const promise1 = getUserInput({
        title: 'First',
        message: 'First message',
      });

      // Advance time to ensure different requestId
      vi.advanceTimersByTime(1);

      const promise2 = getUserInput({
        title: 'Second',
        message: 'Second message',
      });

      // Both should have been sent
      expect(mockWebContentsSend).toHaveBeenCalledTimes(2);

      const requestId1 = mockWebContentsSend.mock.calls[0][1].requestId;
      const requestId2 = mockWebContentsSend.mock.calls[1][1].requestId;

      // IDs should be different
      expect(requestId1).not.toBe(requestId2);

      // Get all handlers
      const handlers = mockIpcMainOn.mock.calls
        .filter((call) => call[0] === 'agent:user-input-response')
        .map((call) => call[1]);

      // Respond to second request first
      handlers.forEach((h) =>
        h?.(createMockIpcEvent(), {
          requestId: requestId2,
          userInput: 'Response 2',
          cancelled: false,
        })
      );

      // Respond to first request
      handlers.forEach((h) =>
        h?.(createMockIpcEvent(), {
          requestId: requestId1,
          userInput: 'Response 1',
          cancelled: false,
        })
      );

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.userInput).toBe('Response 1');
      expect(result2.userInput).toBe('Response 2');

      vi.useRealTimers();
    });

  });

  describe('edge cases', () => {
    it('should handle empty string user input', async () => {
      const resultPromise = getUserInput(userInputFixtures.textInputParams);

      const requestId = mockWebContentsSend.mock.calls[0][1].requestId;
      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];

      handler?.(createMockIpcEvent(), {
        requestId,
        userInput: '',
        cancelled: false,
      });

      const result = await resultPromise;
      expect(result.userInput).toBe('');
    });

    it('should handle special characters in message', async () => {
      const params = {
        title: 'Test <script>alert("xss")</script>',
        message: 'Message with "quotes" and \'apostrophes\' and <html>',
        options: ['Option "1"', "Option '2'"],
      };

      const resultPromise = getUserInput(params);

      const sentData = mockWebContentsSend.mock.calls[0][1];
      expect(sentData.title).toBe(params.title);
      expect(sentData.message).toBe(params.message);
      expect(sentData.options).toEqual(params.options);

      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];
      handler?.(createMockIpcEvent(), {
        requestId: sentData.requestId,
        userInput: 'Option "1"',
        cancelled: false,
      });

      const result = await resultPromise;
      expect(result.userInput).toBe('Option "1"');
    });

    it('should handle unicode characters', async () => {
      const params = {
        title: 'Unicode Test',
        message: 'Select: emoji and symbols',
        options: ['Yes', 'No', 'Maybe'],
      };

      const resultPromise = getUserInput(params);

      const requestId = mockWebContentsSend.mock.calls[0][1].requestId;
      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];

      handler?.(createMockIpcEvent(), {
        requestId,
        userInput: 'Yes',
        cancelled: false,
      });

      const result = await resultPromise;
      expect(result.userInput).toBe('Yes');
    });

    it('should handle very long option lists', async () => {
      const params = {
        title: 'Many Options',
        message: 'Choose:',
        options: Array.from({ length: 100 }, (_, i) => `Option ${i + 1}`),
      };

      const resultPromise = getUserInput(params);

      const sentData = mockWebContentsSend.mock.calls[0][1];
      expect(sentData.options).toHaveLength(100);

      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];
      handler?.(createMockIpcEvent(), {
        requestId: sentData.requestId,
        userInput: 'Option 50',
        cancelled: false,
      });

      const result = await resultPromise;
      expect(result.userInput).toBe('Option 50');
    });

    it('should handle empty options array', async () => {
      const params = {
        title: 'Test',
        message: 'Enter text:',
        options: [],
      };

      const resultPromise = getUserInput(params);

      const sentData = mockWebContentsSend.mock.calls[0][1];
      expect(sentData.options).toEqual([]);

      const handler = mockIpcMainOn.mock.calls.find(
        (call) => call[0] === 'agent:user-input-response'
      )?.[1];
      handler?.(createMockIpcEvent(), {
        requestId: sentData.requestId,
        userInput: 'Free text',
        cancelled: false,
      });

      const result = await resultPromise;
      expect(result.userInput).toBe('Free text');
    });
  });
});
