/**
 * Updater IPC Handler Tests
 *
 * Tests the updater IPC handlers including:
 * - Get update status
 * - Retry update
 * - Update and relaunch
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Store registered handlers and listeners for testing
const registeredHandlers: Map<string, Function> = new Map();
const registeredListeners: Map<string, Function> = new Map();

// Mock ipc-handler.factory
vi.mock('../ipc-handler.factory', () => ({
  createIpcHandlers: (configs: Array<{ channel: string; handler: Function }>) => {
    for (const config of configs) {
      registeredHandlers.set(config.channel, config.handler);
    }
  },
  createIpcListeners: (configs: Array<{ channel: string; handler: Function }>) => {
    for (const config of configs) {
      registeredListeners.set(config.channel, config.handler);
    }
  },
}));

// Mock UpdaterService
const mockUpdaterService = {
  status: 'idle',
  retry: vi.fn(),
  updateAndRelaunch: vi.fn(),
};
vi.mock('../../services/system/updater.service', () => ({
  UpdaterService: {
    getInstance: () => mockUpdaterService,
  },
}));

// Import after mocks
import { setupUpdaterIpc } from '../updater.ipc';

// Helper to invoke a registered handler
const invokeHandler = async (channel: string, args?: unknown) => {
  const handler = registeredHandlers.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  const mockEvent = { sender: {} };
  return handler(mockEvent, args);
};

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

describe('Updater IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers.clear();
    registeredListeners.clear();
    mockUpdaterService.status = 'idle';
    setupUpdaterIpc();
  });

  describe('updater:get-status', () => {
    it('should return idle status', async () => {
      mockUpdaterService.status = 'idle';

      const result = await invokeHandler('updater:get-status');

      expect(result).toBe('idle');
    });

    it('should return checking status', async () => {
      mockUpdaterService.status = 'checking';

      const result = await invokeHandler('updater:get-status');

      expect(result).toBe('checking');
    });

    it('should return downloading status', async () => {
      mockUpdaterService.status = 'downloading';

      const result = await invokeHandler('updater:get-status');

      expect(result).toBe('downloading');
    });

    it('should return ready status', async () => {
      mockUpdaterService.status = 'ready';

      const result = await invokeHandler('updater:get-status');

      expect(result).toBe('ready');
    });

    it('should return error status', async () => {
      mockUpdaterService.status = 'error';

      const result = await invokeHandler('updater:get-status');

      expect(result).toBe('error');
    });
  });

  describe('updater:retry', () => {
    it('should call retry on UpdaterService', async () => {
      mockUpdaterService.retry.mockResolvedValue(undefined);

      await invokeHandler('updater:retry');

      expect(mockUpdaterService.retry).toHaveBeenCalled();
    });

    it('should propagate retry errors', async () => {
      mockUpdaterService.retry.mockRejectedValue(new Error('Retry failed'));

      await expect(invokeHandler('updater:retry')).rejects.toThrow('Retry failed');
    });
  });

  describe('updater:update-and-relaunch-app', () => {
    it('should call updateAndRelaunch on UpdaterService', async () => {
      await invokeListener('updater:update-and-relaunch-app');

      expect(mockUpdaterService.updateAndRelaunch).toHaveBeenCalled();
    });
  });
});
