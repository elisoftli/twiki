/**
 * System Specifications interfaces - Gaming-relevant hardware and OS information
 * Used for providing context to the AI agent when applying game tweaks.
 */

export interface CpuSpecs {
  manufacturer: string;
  brand: string;
  speed: number; // Base speed in GHz
  speedMax: number; // Max speed in GHz
  cores: number; // Logical cores (threads)
  physicalCores: number; // Physical cores
}

export interface GpuSpecs {
  vendor: string;
  model: string;
  vram: number; // VRAM in MB
  driverVersion: string;
}

export interface MemorySpecs {
  total: number; // Total RAM in bytes
}

export interface OsSpecs {
  platform: string; // e.g., 'win32', 'darwin', 'linux'
  distro: string; // e.g., 'Windows 11', 'Ubuntu'
  release: string; // e.g., '22H2'
  build: string; // e.g., '22621'
  arch: string; // e.g., 'x64'
}

export interface DisplayInfo {
  model: string;
  main: boolean;
  connection: string | null; // e.g., DisplayPort, HDMI
  resolutionX: number | null;
  resolutionY: number | null;
  currentRefreshRate: number | null;
}

export interface DisplaySpecs {
  displays: DisplayInfo[];
}

/**
 * Complete system specifications (gaming-relevant only)
 */
export interface SystemSpecs {
  cpu: CpuSpecs | null;
  gpu: GpuSpecs[];
  memory: MemorySpecs | null;
  os: OsSpecs | null;
  display: DisplaySpecs | null;
  collectedAt: string; // ISO timestamp
}

/**
 * Status of the system specs service
 */
export interface SystemSpecsStatus {
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
}
