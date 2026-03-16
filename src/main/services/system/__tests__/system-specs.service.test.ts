/**
 * SystemSpecsService Tests
 *
 * Tests the system specs service including:
 * - Initial state
 * - Loading specs
 * - GPU filtering (integrated vs dedicated)
 * - Status tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock systeminformation
const mockCpu = vi.fn();
const mockGraphics = vi.fn();
const mockMem = vi.fn();
const mockOsInfo = vi.fn();
vi.mock('systeminformation', () => ({
  default: {
    cpu: () => mockCpu(),
    graphics: () => mockGraphics(),
    mem: () => mockMem(),
    osInfo: () => mockOsInfo(),
  },
}));

// Mock PowerShell display info
const mockGetDisplayInfoFromPowerShell = vi.fn();
vi.mock('../../../utils/powershell.utils', () => ({
  getDisplayInfoFromPowerShell: () => mockGetDisplayInfoFromPowerShell(),
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

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockCpuData = () => ({
  manufacturer: 'AMD',
  brand: 'Ryzen 7 5800X',
  speed: 3.8,
  speedMax: 4.7,
  cores: 16,
  physicalCores: 8,
});

const createMockGraphicsData = (controllers: any[] = [], displays: any[] = []) => ({
  controllers,
  displays,
});

const createMockMemData = () => ({
  total: 34359738368, // 32GB
});

const createMockOsData = () => ({
  platform: 'Windows',
  distro: 'Windows 11',
  release: '10.0.22631',
  build: '22631',
  arch: 'x64',
});

const createMockDedicatedGpu = () => ({
  vendor: 'NVIDIA',
  model: 'GeForce RTX 4080',
  vram: 16384,
  driverVersion: '545.84',
});

const createMockIntegratedGpu = (model: string) => ({
  vendor: 'Intel',
  model,
  vram: 128,
  driverVersion: '31.0.101.4255',
});

const createMockDisplay = (overrides: any = {}) => ({
  model: 'Generic Monitor',
  main: true,
  connection: 'DisplayPort',
  resolutionX: 2560,
  resolutionY: 1440,
  currentRefreshRate: 165,
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

// Reset static state between tests
let SystemSpecsService: typeof import('../system-specs.service').SystemSpecsService;

describe('SystemSpecsService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset singleton by re-importing
    vi.resetModules();

    // Default mocks
    mockCpu.mockResolvedValue(createMockCpuData());
    mockGraphics.mockResolvedValue(
      createMockGraphicsData([createMockDedicatedGpu()], [createMockDisplay()])
    );
    mockMem.mockResolvedValue(createMockMemData());
    mockOsInfo.mockResolvedValue(createMockOsData());
    mockGetDisplayInfoFromPowerShell.mockResolvedValue(null);

    const module = await import('../system-specs.service');
    SystemSpecsService = module.SystemSpecsService;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Initial State', () => {
    it('should have null specs before loading', () => {
      expect(SystemSpecsService.specs).toBeNull();
    });

    it('should report not loaded in status', () => {
      const status = SystemSpecsService.status;
      expect(status.isLoaded).toBe(false);
      expect(status.isLoading).toBe(false);
      expect(status.error).toBeNull();
    });
  });

  describe('loadSpecs', () => {
    it('should load all system specs successfully', async () => {
      await SystemSpecsService.loadSpecs();

      expect(SystemSpecsService.specs).not.toBeNull();
      expect(SystemSpecsService.status.isLoaded).toBe(true);
      expect(SystemSpecsService.status.error).toBeNull();
    });

    it('should collect CPU information', async () => {
      await SystemSpecsService.loadSpecs();

      const specs = SystemSpecsService.specs;
      expect(specs?.cpu).toEqual({
        manufacturer: 'AMD',
        brand: 'Ryzen 7 5800X',
        speed: 3.8,
        speedMax: 4.7,
        cores: 16,
        physicalCores: 8,
      });
    });

    it('should collect GPU information', async () => {
      await SystemSpecsService.loadSpecs();

      const specs = SystemSpecsService.specs;
      expect(specs?.gpu).toHaveLength(1);
      expect(specs?.gpu[0]).toEqual({
        vendor: 'NVIDIA',
        model: 'GeForce RTX 4080',
        vram: 16384,
        driverVersion: '545.84',
      });
    });

    it('should collect memory information', async () => {
      await SystemSpecsService.loadSpecs();

      const specs = SystemSpecsService.specs;
      expect(specs?.memory).toEqual({
        total: 34359738368,
      });
    });

    it('should collect OS information', async () => {
      await SystemSpecsService.loadSpecs();

      const specs = SystemSpecsService.specs;
      expect(specs?.os).toEqual({
        platform: 'Windows',
        distro: 'Windows 11',
        release: '10.0.22631',
        build: '22631',
        arch: 'x64',
      });
    });

    it('should include collectedAt timestamp', async () => {
      await SystemSpecsService.loadSpecs();

      const specs = SystemSpecsService.specs;
      expect(specs?.collectedAt).toBeDefined();
      expect(new Date(specs?.collectedAt ?? '').getTime()).not.toBeNaN();
    });
  });

  describe('GPU Filtering', () => {
    it('should filter out integrated GPU when dedicated GPU present', async () => {
      mockGraphics.mockResolvedValue(
        createMockGraphicsData([
          createMockIntegratedGpu('Intel UHD Graphics 630'),
          createMockDedicatedGpu(),
        ])
      );

      await SystemSpecsService.loadSpecs();

      const specs = SystemSpecsService.specs;
      expect(specs?.gpu).toHaveLength(1);
      expect(specs?.gpu[0].model).toBe('GeForce RTX 4080');
    });

    it('should filter out AMD integrated graphics', async () => {
      mockGraphics.mockResolvedValue(
        createMockGraphicsData([
          createMockIntegratedGpu('AMD Radeon(TM) Graphics'),
          createMockDedicatedGpu(),
        ])
      );

      await SystemSpecsService.loadSpecs();

      const specs = SystemSpecsService.specs;
      expect(specs?.gpu).toHaveLength(1);
      expect(specs?.gpu[0].model).toBe('GeForce RTX 4080');
    });

    it('should keep integrated GPU when no dedicated GPU present', async () => {
      mockGraphics.mockResolvedValue(
        createMockGraphicsData([createMockIntegratedGpu('Intel UHD Graphics 630')])
      );

      await SystemSpecsService.loadSpecs();

      const specs = SystemSpecsService.specs;
      expect(specs?.gpu).toHaveLength(1);
      expect(specs?.gpu[0].model).toBe('Intel UHD Graphics 630');
    });

    it('should handle null VRAM', async () => {
      mockGraphics.mockResolvedValue(
        createMockGraphicsData([{ ...createMockDedicatedGpu(), vram: null }])
      );

      await SystemSpecsService.loadSpecs();

      const specs = SystemSpecsService.specs;
      expect(specs?.gpu[0].vram).toBe(0);
    });

    it('should handle missing driver version', async () => {
      mockGraphics.mockResolvedValue(
        createMockGraphicsData([{ ...createMockDedicatedGpu(), driverVersion: '' }])
      );

      await SystemSpecsService.loadSpecs();

      const specs = SystemSpecsService.specs;
      expect(specs?.gpu[0].driverVersion).toBe('Unknown');
    });
  });

  describe('Error Handling', () => {
    it('should set error status on failure', async () => {
      mockCpu.mockRejectedValue(new Error('Hardware access denied'));

      await SystemSpecsService.loadSpecs();

      const status = SystemSpecsService.status;
      expect(status.error).toBe('Hardware access denied');
      expect(status.isLoaded).toBe(false);
    });

    it('should clear isLoading after error', async () => {
      mockCpu.mockRejectedValue(new Error('Error'));

      await SystemSpecsService.loadSpecs();

      expect(SystemSpecsService.status.isLoading).toBe(false);
    });
  });
});
