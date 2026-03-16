/**
 * IntegrityService Tests
 *
 * Tests the integrity service including:
 * - Tampering detection
 * - Debug flag detection
 * - Inspector detection
 * - Manual tampering marking
 * - Reset functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock is.dev state
let mockIsDev = false;

// Mock @electron-toolkit/utils
vi.mock('@electron-toolkit/utils', () => ({
  is: {
    get dev() {
      return mockIsDev;
    },
  },
}));

// Mock logger
vi.mock('../../../utils/logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Store original process.execArgv
const originalExecArgv = process.execArgv;

// =============================================================================
// Tests
// =============================================================================

let IntegrityService: typeof import('../integrity.service').IntegrityService;

describe('IntegrityService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsDev = false;
    process.execArgv = [];

    const module = await import('../integrity.service');
    IntegrityService = module.IntegrityService;
    IntegrityService.resetForTesting();
  });

  afterEach(() => {
    process.execArgv = originalExecArgv;
  });

  describe('isTampered', () => {
    it('should return false initially', () => {
      expect(IntegrityService.isTampered()).toBe(false);
    });

    it('should return true after tampering is detected', () => {
      IntegrityService.markTampered();

      expect(IntegrityService.isTampered()).toBe(true);
    });
  });

  describe('checkIntegrity', () => {
    it('should skip all checks in development mode', async () => {
      vi.resetModules();
      mockIsDev = true;
      process.execArgv = ['--inspect'];

      const module = await import('../integrity.service');
      IntegrityService = module.IntegrityService;
      IntegrityService.resetForTesting();

      IntegrityService.checkIntegrity();

      expect(IntegrityService.isTampered()).toBe(false);
    });

    it('should run checks in production mode', async () => {
      vi.resetModules();
      mockIsDev = false;
      process.execArgv = ['--inspect'];

      const module = await import('../integrity.service');
      IntegrityService = module.IntegrityService;
      IntegrityService.resetForTesting();

      IntegrityService.checkIntegrity();

      expect(IntegrityService.isTampered()).toBe(true);
    });
  });

  describe('checkDebuggerFlags', () => {
    it('should detect --inspect flag', async () => {
      vi.resetModules();
      mockIsDev = false;
      process.execArgv = ['--inspect'];

      const module = await import('../integrity.service');
      IntegrityService = module.IntegrityService;
      IntegrityService.resetForTesting();

      IntegrityService.checkDebuggerFlags();

      expect(IntegrityService.isTampered()).toBe(true);
    });

    it('should detect --inspect-brk flag', async () => {
      vi.resetModules();
      mockIsDev = false;
      process.execArgv = ['--inspect-brk=9229'];

      const module = await import('../integrity.service');
      IntegrityService = module.IntegrityService;
      IntegrityService.resetForTesting();

      IntegrityService.checkDebuggerFlags();

      expect(IntegrityService.isTampered()).toBe(true);
    });

    it('should detect --debug flag', async () => {
      vi.resetModules();
      mockIsDev = false;
      process.execArgv = ['--debug'];

      const module = await import('../integrity.service');
      IntegrityService = module.IntegrityService;
      IntegrityService.resetForTesting();

      IntegrityService.checkDebuggerFlags();

      expect(IntegrityService.isTampered()).toBe(true);
    });

    it('should detect --debug-brk flag', async () => {
      vi.resetModules();
      mockIsDev = false;
      process.execArgv = ['--debug-brk'];

      const module = await import('../integrity.service');
      IntegrityService = module.IntegrityService;
      IntegrityService.resetForTesting();

      IntegrityService.checkDebuggerFlags();

      expect(IntegrityService.isTampered()).toBe(true);
    });

    it('should detect --remote-debugging-port flag', async () => {
      vi.resetModules();
      mockIsDev = false;
      process.execArgv = ['--remote-debugging-port=9222'];

      const module = await import('../integrity.service');
      IntegrityService = module.IntegrityService;
      IntegrityService.resetForTesting();

      IntegrityService.checkDebuggerFlags();

      expect(IntegrityService.isTampered()).toBe(true);
    });

    it('should not flag normal arguments', async () => {
      vi.resetModules();
      mockIsDev = false;
      process.execArgv = ['--max-old-space-size=4096', '--no-warnings'];

      const module = await import('../integrity.service');
      IntegrityService = module.IntegrityService;
      IntegrityService.resetForTesting();

      IntegrityService.checkDebuggerFlags();

      expect(IntegrityService.isTampered()).toBe(false);
    });

    it('should not flag when no arguments present', async () => {
      vi.resetModules();
      mockIsDev = false;
      process.execArgv = [];

      const module = await import('../integrity.service');
      IntegrityService = module.IntegrityService;
      IntegrityService.resetForTesting();

      IntegrityService.checkDebuggerFlags();

      expect(IntegrityService.isTampered()).toBe(false);
    });
  });

  describe('checkInspector', () => {
    it('should handle inspector module not available', () => {
      // In test environment, inspector may or may not be available
      // The method should not throw
      expect(() => IntegrityService.checkInspector()).not.toThrow();
    });
  });

  describe('markTampered', () => {
    it('should set tampered flag', () => {
      IntegrityService.markTampered();

      expect(IntegrityService.isTampered()).toBe(true);
    });

    it('should be idempotent', () => {
      IntegrityService.markTampered();
      IntegrityService.markTampered();
      IntegrityService.markTampered();

      expect(IntegrityService.isTampered()).toBe(true);
    });
  });

  describe('resetForTesting', () => {
    it('should reset tampering flag', () => {
      IntegrityService.markTampered();
      expect(IntegrityService.isTampered()).toBe(true);

      IntegrityService.resetForTesting();

      expect(IntegrityService.isTampered()).toBe(false);
    });
  });
});
