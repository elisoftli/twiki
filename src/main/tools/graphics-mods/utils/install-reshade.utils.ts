/**
 * ReShade Installation Utility
 *
 * Automates the installation of ReShade + addons to game directories.
 * Supports:
 * - Architecture detection from game EXE
 * - DLL conflict detection with automatic fallback for DX10+
 * - Backup creation for safe reversion
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { unpack } from '../../../utils/7zip.utils';
import { expandWindowsEnvVars } from '../../../utils';
import { createBackup } from '../../tool.utils';
import { detectArchitecture, detectGraphicsApi, is7zArchiveAsync, isReshadeFile, getVersionInfo } from './pe-utils';
import type {
  InstallReshadeParams,
  InstallReshadeResult,
  InstalledFileRecord,
  GraphicsApi,
  Architecture,
} from './types';
import { DLL_MAPPINGS } from './types';

// =============================================================================
// ReShade Installer Validation
// =============================================================================

export interface ValidateReshadeInstallerResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that a file is a valid ReShade installer by checking:
 * 1. The file is a valid 7z/SFX archive (extractable by 7zip-min)
 * 2. The file's version info mentions "ReShade"
 *
 * @param filePath - Path to the potential ReShade installer
 * @returns Validation result with error message if invalid
 */
export async function validateReshadeInstaller(
  filePath: string,
): Promise<ValidateReshadeInstallerResult> {
  // Check if it's a valid 7z archive
  const isValidArchive = await is7zArchiveAsync(filePath);
  if (!isValidArchive) {
    return {
      valid: false,
      error: 'File is not a valid 7z archive or self-extracting executable',
    };
  }

  // Check if version info mentions ReShade
  if (!isReshadeFile(filePath)) {
    return {
      valid: false,
      error: `File does not appear to be a ReShade installer`,
    };
  }

  return { valid: true };
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default ReShade.ini content matching what the official installer creates.
 * Contains standard depth buffer preprocessor definitions needed for depth-based effects.
 */
const DEFAULT_RESHADE_INI = `[GENERAL]
PreprocessorDefinitions=RESHADE_DEPTH_LINEARIZATION_FAR_PLANE=1000.0,RESHADE_DEPTH_INPUT_IS_UPSIDE_DOWN=0,RESHADE_DEPTH_INPUT_IS_REVERSED=0,RESHADE_DEPTH_INPUT_IS_LOGARITHMIC=0

[INPUT]
GamepadNavigation=0
KeyOverlay=36,0,0,0
`;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a path exists
 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a temporary directory for extraction
 */
async function createTempDir(): Promise<string> {
  const tempBase = process.env.TEMP || process.env.TMP || '/tmp';
  const tempDir = path.join(tempBase, `reshade-extract-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Remove a directory and all its contents
 */
async function removeDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}

/**
 * Extract a 7z archive
 */
async function extract7z(archivePath: string, extractPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    unpack(archivePath, extractPath, (err: Error | null) => {
      if (err) {
        reject(new Error(`Failed to extract archive: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Find ReShade DLLs in extracted directory using glob pattern
 */
async function findReshadeDlls(extractPath: string): Promise<{ dll32?: string; dll64?: string }> {
  const entries = await fs.readdir(extractPath);
  const result: { dll32?: string; dll64?: string } = {};

  for (const entry of entries) {
    const lowerEntry = entry.toLowerCase();
    if (lowerEntry.match(/^reshade\d*32\.dll$/i) || lowerEntry === 'reshade32.dll') {
      result.dll32 = path.join(extractPath, entry);
    } else if (lowerEntry.match(/^reshade\d*64\.dll$/i) || lowerEntry === 'reshade64.dll') {
      result.dll64 = path.join(extractPath, entry);
    }
  }

  return result;
}

/**
 * Check if a DLL slot is occupied by another mod (not ReShade)
 * Returns the detected mod name if occupied, null if available or is ReShade
 */
async function checkDllSlot(dllPath: string): Promise<string | null> {
  if (!(await pathExists(dllPath))) {
    return null; // Slot is available
  }

  if (isReshadeFile(dllPath)) {
    return null; // It's ReShade, we can overwrite
  }

  // Try to get the product name of the existing DLL
  const versionInfo = getVersionInfo(dllPath);
  return versionInfo.productName || versionInfo.fileDescription || 'Unknown mod';
}

/**
 * Find an available DLL slot for the given graphics API
 * Returns the DLL name to use, or throws if all slots are occupied
 */
async function findAvailableDllSlot(
  gameDir: string,
  graphicsApi: GraphicsApi
): Promise<{ dllName: string; occupiedSlots: Record<string, string> }> {
  const mapping = DLL_MAPPINGS[graphicsApi];
  const occupiedSlots: Record<string, string> = {};

  // Try default first
  const defaultPath = path.join(gameDir, mapping.default);
  const defaultMod = await checkDllSlot(defaultPath);

  if (defaultMod === null) {
    return { dllName: mapping.default, occupiedSlots };
  }

  occupiedSlots[mapping.default] = defaultMod;

  // Try fallbacks
  for (const fallback of mapping.fallbacks) {
    const fallbackPath = path.join(gameDir, fallback);
    const fallbackMod = await checkDllSlot(fallbackPath);

    if (fallbackMod === null) {
      return { dllName: fallback, occupiedSlots };
    }

    occupiedSlots[fallback] = fallbackMod;
  }

  // All slots occupied - build error message
  if (mapping.fallbacks.length === 0) {
    // DX9 or OpenGL - no fallbacks available
    const apiName = graphicsApi === 'd3d9' ? 'DX9' : 'OpenGL';
    throw new Error(
      `Cannot install ReShade: ${mapping.default} is occupied by another mod (${occupiedSlots[mapping.default]}). ` +
        `${apiName} has no alternative DLL options - manual removal required.`
    );
  }

  // DX10/11/12 - all fallbacks exhausted
  const slotList = Object.entries(occupiedSlots)
    .map(([dll, mod]) => `${dll}: ${mod}`)
    .join(', ');

  throw new Error(
    `Cannot install ReShade: all DLL slots are occupied. ${slotList}. Manual intervention required.`
  );
}

// =============================================================================
// Main Installation Function
// =============================================================================

/**
 * Install ReShade and addon to a game directory
 *
 * @param params - Installation parameters
 * @returns Installation result with installed files for reversion
 * @throws Error if installation fails
 */
export async function installReshade(params: InstallReshadeParams): Promise<InstallReshadeResult> {
  const { addonFilePath, gameExePath, graphicsApi: providedGraphicsApi, reshadeInstallerPath } = params;

  // Expand environment variables
  const expandedAddonPath = expandWindowsEnvVars(addonFilePath);
  const expandedGameExePath = expandWindowsEnvVars(gameExePath);
  const expandedInstallerPath = expandWindowsEnvVars(reshadeInstallerPath);

  // ==========================================================================
  // Step 1: Validate inputs
  // ==========================================================================

  // Check ReShade installer exists and is valid
  if (!(await pathExists(expandedInstallerPath))) {
    throw new Error(`ReShade installer not found: ${expandedInstallerPath}`);
  }

  const installerValidation = await validateReshadeInstaller(expandedInstallerPath);
  if (!installerValidation.valid) {
    throw new Error(installerValidation.error);
  }

  // Check addon file exists
  if (!(await pathExists(expandedAddonPath))) {
    throw new Error(`Addon file not found: ${expandedAddonPath}`);
  }

  // Check game EXE exists
  if (!(await pathExists(expandedGameExePath))) {
    throw new Error(`Game executable not found: ${expandedGameExePath}`);
  }

  // ==========================================================================
  // Step 2: Detect architecture from game EXE
  // ==========================================================================

  let detectedArchitecture: Architecture;
  try {
    detectedArchitecture = detectArchitecture(expandedGameExePath);
  } catch (error) {
    // Check if this is a permission error (common with Xbox/Game Pass games)
    const isPermissionError =
      error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EPERM';

    if (isPermissionError) {
      // Try to infer architecture from addon file name or extension
      // Common patterns:
      // - addon_x64.dll, addon_64.dll, addon_x86.dll, addon_32.dll
      // - addon.addon64, addon.addon32 (RenoDX style)
      const addonFileName = path.basename(expandedAddonPath).toLowerCase();
      if (
        addonFileName.includes('x64') ||
        addonFileName.includes('_64') ||
        addonFileName.includes('64bit') ||
        addonFileName.endsWith('.addon64')
      ) {
        detectedArchitecture = '64';
      } else if (
        addonFileName.includes('x86') ||
        addonFileName.includes('_32') ||
        addonFileName.includes('32bit') ||
        addonFileName.endsWith('.addon32')
      ) {
        detectedArchitecture = '32';
      } else {
        throw new Error(
          'Cannot read game executable (permission denied - this is expected for Xbox/Game Pass games). ' +
            'Unable to infer architecture from addon file name. ' +
            'Please ensure the addon file name contains architecture info (e.g., addon_x64.dll, addon.addon64).'
        );
      }
    } else {
      throw new Error(
        `Failed to detect game architecture: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ==========================================================================
  // Step 3: Detect or use provided graphics API
  // ==========================================================================

  let graphicsApi: GraphicsApi;
  if (providedGraphicsApi) {
    graphicsApi = providedGraphicsApi;
  } else {
    // Auto-detect from game executable
    const detected = detectGraphicsApi(expandedGameExePath);
    if (!detected) {
      throw new Error(
        'Unable to detect graphics API from game executable. ' +
          'Please specify the graphics API manually (d3d9, d3d10, d3d11, d3d12, or opengl).'
      );
    }
    graphicsApi = detected;
  }

  // ==========================================================================
  // Step 4: Extract ReShade installer to temp directory
  // ==========================================================================

  const tempDir = await createTempDir();
  const installedFiles: InstalledFileRecord[] = [];

  try {
    await extract7z(expandedInstallerPath, tempDir);

    // Find ReShade DLLs
    const reshadeDlls = await findReshadeDlls(tempDir);

    const sourceReshadeDll =
      detectedArchitecture === '64' ? reshadeDlls.dll64 : reshadeDlls.dll32;

    if (!sourceReshadeDll) {
      throw new Error(
        `ReShade ${detectedArchitecture}-bit DLL not found in extracted contents ` +
          `(expected ReShade${detectedArchitecture}.dll)`
      );
    }

    // ==========================================================================
    // Step 5: Find available DLL slot
    // ==========================================================================

    const gameDir = path.dirname(expandedGameExePath);
    const { dllName, occupiedSlots: _ } = await findAvailableDllSlot(gameDir, graphicsApi);

    // ==========================================================================
    // Step 6: Install ReShade DLL
    // ==========================================================================

    const destReshadePath = path.join(gameDir, dllName);
    const reshadeExisted = await pathExists(destReshadePath);

    // Create backup if file exists
    let reshadeBackupPath: string | undefined;
    if (reshadeExisted) {
      reshadeBackupPath = await createBackup(destReshadePath);
    }

    // Copy ReShade DLL
    await fs.copyFile(sourceReshadeDll, destReshadePath);

    installedFiles.push({
      destPath: destReshadePath,
      backupPath: reshadeBackupPath || null,
      wasNewFile: !reshadeExisted,
    });

    // ==========================================================================
    // Step 7: Install addon file
    // ==========================================================================

    const addonFileName = path.basename(expandedAddonPath);
    const destAddonPath = path.join(gameDir, addonFileName);
    const addonExisted = await pathExists(destAddonPath);

    // Create backup if file exists
    let addonBackupPath: string | undefined;
    if (addonExisted) {
      addonBackupPath = await createBackup(destAddonPath);
    }

    // Copy addon file
    await fs.copyFile(expandedAddonPath, destAddonPath);

    installedFiles.push({
      destPath: destAddonPath,
      backupPath: addonBackupPath || null,
      wasNewFile: !addonExisted,
    });

    // ==========================================================================
    // Step 8: Create default ReShade.ini (if it doesn't exist)
    // ==========================================================================

    const iniPath = path.join(gameDir, 'ReShade.ini');
    const iniExisted = await pathExists(iniPath);

    if (!iniExisted) {
      // Create default INI with standard depth buffer settings
      await fs.writeFile(iniPath, DEFAULT_RESHADE_INI, 'utf-8');

      installedFiles.push({
        destPath: iniPath,
        backupPath: null,
        wasNewFile: true,
      });
    }

    // ==========================================================================
    // Step 9: Return result
    // ==========================================================================

    return {
      gameDirectory: gameDir,
      installedFiles,
      actualDllName: dllName,
      detectedArchitecture,
      graphicsApi,
    };
  } finally {
    // Always clean up temp directory
    await removeDir(tempDir);
  }
}
