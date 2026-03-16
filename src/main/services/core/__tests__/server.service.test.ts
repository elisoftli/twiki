/**
 * ServerService Tests
 *
 * Tests the server service including:
 * - Server initialization (production vs dev mode)
 * - Window serving (dev mode - loads from dev server)
 * - Path handling
 *
 * Note: Production mode tests for electron-serve are limited because
 * vi.mock hoisting makes it difficult to track calls across vi.resetModules().
 * The development mode behavior is fully tested.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserWindow } from 'electron';

// Mock is.dev state
let mockIsDev = false;

// Mock electron module (needed by electron-serve)
vi.mock('electron', () => ({
  default: {
    app: {
      getAppPath: () => '/mock/app/path',
      on: vi.fn(),
    },
    protocol: {
      registerSchemesAsPrivileged: vi.fn(),
    },
    session: {
      defaultSession: {
        protocol: {
          registerFileProtocol: vi.fn(),
        },
      },
    },
  },
  app: {
    getAppPath: () => '/mock/app/path',
    on: vi.fn(),
  },
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
  },
  session: {
    defaultSession: {
      protocol: {
        registerFileProtocol: vi.fn(),
      },
    },
  },
}));

// Mock electron-serve - returns a function that loads a URL
vi.mock('../../electron-serve', () => ({
  default: () => {
    return async (window: BrowserWindow, path: string) => {
      await window.loadURL(`app://-${path}`);
    };
  },
}));

// Mock @electron-toolkit/utils
vi.mock('@electron-toolkit/utils', () => ({
  is: {
    get dev() {
      return mockIsDev;
    },
  },
}));

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockBrowserWindow = (): BrowserWindow => {
  return {
    loadURL: vi.fn().mockResolvedValue(undefined),
  } as unknown as BrowserWindow;
};

// =============================================================================
// Tests
// =============================================================================

let ServerService: typeof import('../server.service').ServerService;

describe('ServerService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsDev = false;
  });

  describe('initServer', () => {
    it('should complete without error in development mode', async () => {
      mockIsDev = true;

      const module = await import('../server.service');
      ServerService = module.ServerService;

      // Should not throw
      await expect(ServerService.initServer()).resolves.not.toThrow();
    });

    it('should complete without error in production mode', async () => {
      mockIsDev = false;

      const module = await import('../server.service');
      ServerService = module.ServerService;

      // Should not throw
      await expect(ServerService.initServer()).resolves.not.toThrow();
    });
  });

  describe('serveWindow', () => {
    describe('development mode', () => {
      beforeEach(async () => {
        vi.resetModules();
        mockIsDev = true;

        const module = await import('../server.service');
        ServerService = module.ServerService;
      });

      it('should load from SvelteKit dev server', async () => {
        const window = createMockBrowserWindow();

        await ServerService.serveWindow(window);

        expect(window.loadURL).toHaveBeenCalledWith('http://localhost:5173/');
      });

      it('should append path to dev server URL', async () => {
        const window = createMockBrowserWindow();

        await ServerService.serveWindow(window, '/settings');

        expect(window.loadURL).toHaveBeenCalledWith('http://localhost:5173/settings');
      });

      it('should handle root path explicitly', async () => {
        const window = createMockBrowserWindow();

        await ServerService.serveWindow(window, '/');

        expect(window.loadURL).toHaveBeenCalledWith('http://localhost:5173/');
      });

      it('should handle complex paths', async () => {
        const window = createMockBrowserWindow();

        await ServerService.serveWindow(window, '/game/123/tweaks');

        expect(window.loadURL).toHaveBeenCalledWith('http://localhost:5173/game/123/tweaks');
      });

      it('should retry if dev server is not ready', async () => {
        vi.useFakeTimers();
        const window = createMockBrowserWindow();
        (window.loadURL as ReturnType<typeof vi.fn>)
          .mockRejectedValueOnce(new Error('Connection refused'))
          .mockResolvedValueOnce(undefined);

        const promise = ServerService.serveWindow(window);

        // First call fails, should schedule retry
        await vi.advanceTimersByTimeAsync(200);

        await promise;

        expect(window.loadURL).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
      });

      it('should retry multiple times if needed', async () => {
        vi.useFakeTimers();
        const window = createMockBrowserWindow();
        (window.loadURL as ReturnType<typeof vi.fn>)
          .mockRejectedValueOnce(new Error('Connection refused'))
          .mockRejectedValueOnce(new Error('Connection refused'))
          .mockResolvedValueOnce(undefined);

        const promise = ServerService.serveWindow(window);

        // Advance through retries
        await vi.advanceTimersByTimeAsync(200);
        await vi.advanceTimersByTimeAsync(200);

        await promise;

        expect(window.loadURL).toHaveBeenCalledTimes(3);
        vi.useRealTimers();
      });
    });

    describe('production mode', () => {
      beforeEach(async () => {
        vi.resetModules();
        mockIsDev = false;

        const module = await import('../server.service');
        ServerService = module.ServerService;

        await ServerService.initServer();
      });

      it('should use app protocol to serve window', async () => {
        const window = createMockBrowserWindow();

        await ServerService.serveWindow(window);

        expect(window.loadURL).toHaveBeenCalledWith('app://-/');
      });

      it('should pass path correctly', async () => {
        const window = createMockBrowserWindow();

        await ServerService.serveWindow(window, '/game/123');

        expect(window.loadURL).toHaveBeenCalledWith('app://-/game/123');
      });
    });
  });
});
