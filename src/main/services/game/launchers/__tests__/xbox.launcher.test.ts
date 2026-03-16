/**
 * XboxService Tests
 *
 * Tests the Xbox game launcher service basic functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameLauncher } from '../../../../interfaces/game-library.interface';

// Mock logger
vi.mock('../../../../utils/logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock system utilities
vi.mock('../../../../utils/system.utils', () => ({
  areProcessesRunning: vi.fn().mockResolvedValue(false),
  killProcesses: vi.fn().mockResolvedValue(undefined),
  waitForProcessTermination: vi.fn().mockResolvedValue(undefined),
  expandWindowsEnvVars: vi.fn().mockImplementation((p: string) => p),
}));

// Mock executable finder
vi.mock('../../../../utils/executable-finder.util', () => ({
  findGameExecutable: vi.fn().mockResolvedValue(null),
}));

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn().mockResolvedValue(Buffer.from('')),
    readdir: vi.fn().mockResolvedValue([]),
    access: vi.fn().mockRejectedValue(new Error('File not found')),
  },
}));

// Mock child_process and util together
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// =============================================================================
// Tests
// =============================================================================

describe('XboxService', () => {
  let XboxService: typeof import('../xbox.launcher').XboxService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import('../xbox.launcher');
    XboxService = module.XboxService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Constructor', () => {
    it('should set launcher type to XBOX', () => {
      const service = new XboxService();
      expect(service.launcher).toBe(GameLauncher.XBOX);
    });

    it('should initialize with empty state', () => {
      const service = new XboxService();
      expect(service.isLoaded).toBe(false);
      expect(service.error).toBeNull();
      expect(service.getGames()).toHaveLength(0);
    });
  });

  describe('getGames', () => {
    it('should return empty array when not loaded', () => {
      const service = new XboxService();
      const games = service.getGames();
      expect(games).toHaveLength(0);
    });
  });

  describe('isGameRunning', () => {
    it('should return false for unknown game', async () => {
      const service = new XboxService();
      const running = await service.isGameRunning('unknown-id');
      expect(running).toBe(false);
    });
  });

  describe('terminateGame', () => {
    it('should do nothing for unknown game', async () => {
      const { killProcesses } = await import('../../../../utils/system.utils');
      const service = new XboxService();
      await service.terminateGame('unknown-id');
      expect(killProcesses).not.toHaveBeenCalled();
    });
  });

  describe('expandPath', () => {
    it('should call expandWindowsEnvVars', async () => {
      const { expandWindowsEnvVars } = await import('../../../../utils/system.utils');
      const service = new XboxService();
      service.expandPath('%LOCALAPPDATA%\\TestGame\\config.ini');
      expect(expandWindowsEnvVars).toHaveBeenCalled();
    });
  });
});
