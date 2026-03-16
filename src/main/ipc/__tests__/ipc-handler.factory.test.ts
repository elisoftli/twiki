/**
 * IPC Handler Factory Tests
 *
 * Tests the IPC handler factory functions including:
 * - Handler registration (ipcMain.handle)
 * - Listener registration (ipcMain.on)
 * - Error handling in handlers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ipcMain
const mockHandle = vi.fn();
const mockOn = vi.fn();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (...args: unknown[]) => mockHandle(...args),
    on: (...args: unknown[]) => mockOn(...args),
  },
}));

import { createIpcHandlers, createIpcListeners } from '../ipc-handler.factory';

describe('IPC Handler Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createIpcHandlers', () => {
    it('should register single handler', () => {
      const handler = vi.fn().mockReturnValue('result');

      createIpcHandlers([{ channel: 'test:channel', handler }]);

      expect(mockHandle).toHaveBeenCalledTimes(1);
      expect(mockHandle).toHaveBeenCalledWith('test:channel', expect.any(Function));
    });

    it('should register multiple handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      createIpcHandlers([
        { channel: 'channel1', handler: handler1 },
        { channel: 'channel2', handler: handler2 },
        { channel: 'channel3', handler: handler3 },
      ]);

      expect(mockHandle).toHaveBeenCalledTimes(3);
      expect(mockHandle).toHaveBeenCalledWith('channel1', expect.any(Function));
      expect(mockHandle).toHaveBeenCalledWith('channel2', expect.any(Function));
      expect(mockHandle).toHaveBeenCalledWith('channel3', expect.any(Function));
    });

    it('should call handler with event and args', async () => {
      const handler = vi.fn().mockResolvedValue('result');

      createIpcHandlers([{ channel: 'test:channel', handler }]);

      // Get the registered handler wrapper
      const registeredWrapper = mockHandle.mock.calls[0][1];
      const mockEvent = { sender: {} };
      const mockArgs = { data: 'test' };

      await registeredWrapper(mockEvent, mockArgs);

      expect(handler).toHaveBeenCalledWith(mockEvent, mockArgs);
    });

    it('should return handler result', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true });

      createIpcHandlers([{ channel: 'test:channel', handler }]);

      const registeredWrapper = mockHandle.mock.calls[0][1];
      const result = await registeredWrapper({}, {});

      expect(result).toEqual({ success: true });
    });

    it('should handle async handlers', async () => {
      const asyncHandler = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'async result';
      });

      createIpcHandlers([{ channel: 'test:async', handler: asyncHandler }]);

      const registeredWrapper = mockHandle.mock.calls[0][1];
      const result = await registeredWrapper({}, {});

      expect(result).toBe('async result');
    });

    it('should handle sync handlers', async () => {
      const syncHandler = vi.fn().mockReturnValue('sync result');

      createIpcHandlers([{ channel: 'test:sync', handler: syncHandler }]);

      const registeredWrapper = mockHandle.mock.calls[0][1];
      const result = await registeredWrapper({}, {});

      expect(result).toBe('sync result');
    });

    it('should propagate errors from handler', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'));

      createIpcHandlers([{ channel: 'test:error', handler: errorHandler }]);

      const registeredWrapper = mockHandle.mock.calls[0][1];

      await expect(registeredWrapper({}, {})).rejects.toThrow('Handler error');
    });

    it('should handle empty configs array', () => {
      createIpcHandlers([]);

      expect(mockHandle).not.toHaveBeenCalled();
    });
  });

  describe('createIpcListeners', () => {
    it('should register single listener', () => {
      const handler = vi.fn();

      createIpcListeners([{ channel: 'test:channel', handler }]);

      expect(mockOn).toHaveBeenCalledTimes(1);
      expect(mockOn).toHaveBeenCalledWith('test:channel', expect.any(Function));
    });

    it('should register multiple listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      createIpcListeners([
        { channel: 'channel1', handler: handler1 },
        { channel: 'channel2', handler: handler2 },
      ]);

      expect(mockOn).toHaveBeenCalledTimes(2);
      expect(mockOn).toHaveBeenCalledWith('channel1', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('channel2', expect.any(Function));
    });

    it('should call handler with event and args', () => {
      const handler = vi.fn();

      createIpcListeners([{ channel: 'test:channel', handler }]);

      const registeredWrapper = mockOn.mock.calls[0][1];
      const mockEvent = { sender: {} };
      const mockArgs = { data: 'test' };

      registeredWrapper(mockEvent, mockArgs);

      expect(handler).toHaveBeenCalledWith(mockEvent, mockArgs);
    });

    it('should not return handler result (fire-and-forget)', () => {
      const handler = vi.fn().mockReturnValue('result');

      createIpcListeners([{ channel: 'test:channel', handler }]);

      const registeredWrapper = mockOn.mock.calls[0][1];
      const result = registeredWrapper({}, {});

      // Listeners don't return values
      expect(result).toBeUndefined();
    });

    it('should handle empty configs array', () => {
      createIpcListeners([]);

      expect(mockOn).not.toHaveBeenCalled();
    });
  });

  describe('Integration', () => {
    it('should handle mixed handlers and listeners', () => {
      const invokeHandler = vi.fn();
      const listenerHandler = vi.fn();

      createIpcHandlers([{ channel: 'invoke:channel', handler: invokeHandler }]);
      createIpcListeners([{ channel: 'listen:channel', handler: listenerHandler }]);

      expect(mockHandle).toHaveBeenCalledTimes(1);
      expect(mockOn).toHaveBeenCalledTimes(1);
      expect(mockHandle).toHaveBeenCalledWith('invoke:channel', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('listen:channel', expect.any(Function));
    });
  });
});
