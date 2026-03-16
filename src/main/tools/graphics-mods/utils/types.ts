/**
 * Type definitions for graphics-mods tools
 */

// =============================================================================
// Graphics API and Architecture Types
// =============================================================================

/** Supported graphics APIs for ReShade installation */
export type GraphicsApi = 'd3d9' | 'd3d10' | 'd3d11' | 'd3d12' | 'opengl';

/** Architecture type (32-bit or 64-bit) */
export type Architecture = '32' | '64';

// =============================================================================
// Install ReShade Types
// =============================================================================

/** Parameters for the installReshade function */
export interface InstallReshadeParams {
  /** Path to the addon file (any extension supported) */
  addonFilePath: string;
  /** Path to the game executable (determines install directory + architecture) */
  gameExePath: string;
  /** Graphics API the game uses (optional - auto-detected from game EXE if not provided) */
  graphicsApi?: GraphicsApi;
  /** Path to the ReShade installer (ReShade_Setup.exe - 7z self-extracting archive) */
  reshadeInstallerPath: string;
}

/** Record of an installed file for reversion tracking */
export interface InstalledFileRecord {
  /** Full path where the file was installed */
  destPath: string;
  /** Path to the backup file (.bak), null if file was new */
  backupPath: string | null;
  /** True if no file existed before (file is new) */
  wasNewFile: boolean;
}

/** Result of the installReshade function */
export interface InstallReshadeResult {
  /** Game directory where files were installed */
  gameDirectory: string;
  /** List of installed files for reversion tracking */
  installedFiles: InstalledFileRecord[];
  /** The actual DLL name used (may differ from default due to fallback) */
  actualDllName: string;
  /** Architecture detected from game EXE */
  detectedArchitecture: Architecture;
  /** Graphics API used for installation (provided or auto-detected) */
  graphicsApi: GraphicsApi;
}

// =============================================================================
// PE Utilities Types
// =============================================================================

/** Version info extracted from PE file */
export interface PEVersionInfo {
  productName?: string;
  fileDescription?: string;
}

// =============================================================================
// DLL Mapping Types
// =============================================================================

/** Mapping of graphics API to DLL names with fallback chain */
export interface DllMapping {
  /** Default DLL name for this API */
  default: string;
  /** Fallback DLL names to try if default is occupied (empty if no fallbacks) */
  fallbacks: string[];
}

/** Complete DLL mapping for all graphics APIs */
export const DLL_MAPPINGS: Record<GraphicsApi, DllMapping> = {
  d3d9: { default: 'd3d9.dll', fallbacks: [] },
  d3d10: { default: 'dxgi.dll', fallbacks: ['d3d11.dll', 'd3d10.dll'] },
  d3d11: { default: 'dxgi.dll', fallbacks: ['d3d11.dll', 'd3d10.dll'] },
  d3d12: { default: 'dxgi.dll', fallbacks: ['d3d11.dll', 'd3d10.dll'] },
  opengl: { default: 'opengl32.dll', fallbacks: [] },
};
