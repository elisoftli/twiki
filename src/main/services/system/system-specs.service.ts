import si, { type Systeminformation } from 'systeminformation';
import type {
  SystemSpecs,
  SystemSpecsStatus,
  CpuSpecs,
  GpuSpecs,
  MemorySpecs,
  OsSpecs,
  DisplaySpecs,
  DisplayInfo,
} from '../../interfaces/system-specs.interface';
import { getDisplayInfoFromPowerShell } from '../../utils/powershell.utils';
import { createLogger } from '../../utils/logger.utils';

const logger = createLogger('SystemSpecsService');

// Known integrated GPU model patterns
const INTEGRATED_GPU_PATTERNS = [
  /^amd radeon.*graphics$/i, // "AMD Radeon(TM) Graphics" - integrated, no RX model
  /radeon vega.*graphics/i, // "Radeon Vega 8 Graphics" - APU integrated
  /intel.*(uhd|iris|hd) graphics/i, // "Intel UHD Graphics 630", "Intel Iris Xe"
];

/**
 * Checks if a GPU is an integrated/onboard graphics chip based on model name.
 */
function isIntegratedGpu(model: string): boolean {
  return INTEGRATED_GPU_PATTERNS.some((pattern) => pattern.test(model));
}

/**
 * Filters out virtual/software GPUs (0 VRAM) when real GPUs are present.
 * If only virtual GPUs exist, returns all of them.
 */
function filterVirtualGpus(
  controllers: Systeminformation.GraphicsControllerData[]
): Systeminformation.GraphicsControllerData[] {
  if (controllers.length <= 1) return controllers;

  const real = controllers.filter((gpu) => gpu.vram != null && gpu.vram > 0);
  return real.length > 0 ? real : controllers;
}

/**
 * Filters out integrated GPUs when dedicated GPUs are present.
 * If only integrated GPUs exist, returns all of them.
 */
function filterIntegratedGpus(
  controllers: Systeminformation.GraphicsControllerData[]
): Systeminformation.GraphicsControllerData[] {
  if (controllers.length <= 1) return controllers;

  const dominated = controllers.filter((gpu) => !isIntegratedGpu(gpu.model));
  const hasDedicatedGpu = dominated.length > 0;

  return hasDedicatedGpu ? dominated : controllers;
}

/**
 * Service that collects static system hardware specifications once at startup.
 * This is a singleton service - specs are loaded once and cached.
 * Only collects gaming-relevant specs for AI agent context.
 */
export class SystemSpecsService {
  private static _specs: SystemSpecs | null = null;
  private static _isLoading: boolean = false;
  private static _error: string | null = null;

  /**
   * Get the current specs (may be null if not loaded yet)
   */
  public static get specs(): SystemSpecs | null {
    return SystemSpecsService._specs;
  }

  /**
   * Get the current loading status
   */
  public static get status(): SystemSpecsStatus {
    return {
      isLoaded: SystemSpecsService._specs !== null,
      isLoading: SystemSpecsService._isLoading,
      error: SystemSpecsService._error,
    };
  }

  /**
   * Load all system specifications. Should be called once at startup.
   */
  public static async loadSpecs(): Promise<void> {
    if (SystemSpecsService._isLoading) return;

    SystemSpecsService._isLoading = true;
    SystemSpecsService._error = null;

    try {
      const [cpu, graphics, mem, osInfo] = await Promise.all([
        si.cpu(),
        si.graphics(),
        si.mem(),
        si.osInfo(),
      ]);

      // Process CPU
      const cpuSpecs: CpuSpecs = {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        speed: cpu.speed,
        speedMax: cpu.speedMax,
        cores: cpu.cores,
        physicalCores: cpu.physicalCores,
      };

      // Process GPUs (filter out virtual adapters, then integrated GPUs)
      const dedicatedGraphicsControllers = filterIntegratedGpus(filterVirtualGpus(graphics.controllers));
      const gpuSpecs: GpuSpecs[] = dedicatedGraphicsControllers.map((ctrl) => ({
        vendor: ctrl.vendor,
        model: ctrl.model,
        vram: ctrl.vram ?? 0,
        driverVersion: ctrl.driverVersion || 'Unknown',
      }));

      // Process Memory
      const memorySpecs: MemorySpecs = {
        total: mem.total,
      };

      // Process OS
      const osSpecs: OsSpecs = {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        build: osInfo.build,
        arch: osInfo.arch,
      };

      // Process Displays - try PowerShell first for accurate refresh rates, fallback to systeminformation
      let displayInfoList: DisplayInfo[] | null = null;

      // On Windows, use PowerShell for accurate refresh rates in multi-monitor setups
      if (process.platform === 'win32') {
        displayInfoList = await getDisplayInfoFromPowerShell();
      }

      // Fallback to systeminformation if PowerShell failed or not on Windows
      if (!displayInfoList) {
        displayInfoList = graphics.displays.map((disp) => ({
          model: disp.model,
          main: disp.main,
          connection: disp.connection,
          resolutionX: disp.resolutionX,
          resolutionY: disp.resolutionY,
          currentRefreshRate: disp.currentRefreshRate,
        }));
      }

      const displaySpecs: DisplaySpecs = {
        displays: displayInfoList.sort((a, b) => (a.main === b.main ? 0 : a.main ? -1 : 1)), // Main display first
      };

      SystemSpecsService._specs = {
        cpu: cpuSpecs,
        gpu: gpuSpecs,
        memory: memorySpecs,
        os: osSpecs,
        display: displaySpecs,
        collectedAt: new Date().toISOString(),
      };
    } catch (err) {
      SystemSpecsService._error = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load system specs:', err);
    } finally {
      SystemSpecsService._isLoading = false;
    }
  }
}
