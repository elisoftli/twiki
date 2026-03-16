/**
 * Graphics Mods Utilities
 *
 * Exports utility functions and types for graphics mod tools.
 */

// Types
export type {
  GraphicsApi,
  Architecture,
  InstallReshadeParams,
  InstallReshadeResult,
  InstalledFileRecord,
  PEVersionInfo,
  DllMapping,
} from './types';

export { DLL_MAPPINGS } from './types';

// PE utilities
export { detectArchitecture, detectGraphicsApi, getVersionInfo, isReshadeFile, is7zArchiveAsync } from './pe-utils';

// Install ReShade
export { installReshade, validateReshadeInstaller } from './install-reshade.utils';
export type { ValidateReshadeInstallerResult } from './install-reshade.utils';
