/**
 * Tests for ReShade installation utility
 * Tests the complete installation workflow including:
 * - Input validation
 * - Architecture detection
 * - DLL slot selection with fallback
 * - File copying and backup creation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to define mock functions
const {
  mockAccess,
  mockMkdir,
  mockReaddir,
  mockCopyFile,
  mockRm,
  mockWriteFile,
  mockSevenZipUnpack,
  mockExpandWindowsEnvVars,
  mockCreateBackup,
  mockDetectArchitecture,
  mockDetectGraphicsApi,
  mockIs7zArchiveAsync,
  mockIsReshadeFile,
  mockGetVersionInfo,
  mockPathJoin,
  mockPathDirname,
  mockPathBasename,
} = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockMkdir: vi.fn(),
  mockReaddir: vi.fn(),
  mockCopyFile: vi.fn(),
  mockRm: vi.fn(),
  mockWriteFile: vi.fn(),
  mockSevenZipUnpack: vi.fn(),
  mockExpandWindowsEnvVars: vi.fn((path: string) => path),
  mockCreateBackup: vi.fn(),
  mockDetectArchitecture: vi.fn(),
  mockDetectGraphicsApi: vi.fn(),
  mockIs7zArchiveAsync: vi.fn(),
  mockIsReshadeFile: vi.fn(),
  mockGetVersionInfo: vi.fn(),
  mockPathJoin: vi.fn((...parts: string[]) => parts.join('\\')),
  mockPathDirname: vi.fn((p: string) => {
    const normalized = p.replace(/\//g, '\\');
    const lastSeparator = normalized.lastIndexOf('\\');
    if (lastSeparator === -1) return '.';
    if (lastSeparator === 2 && normalized[1] === ':') {
      return normalized.substring(0, 3);
    }
    return normalized.substring(0, lastSeparator);
  }),
  mockPathBasename: vi.fn((p: string) => {
    const normalized = p.replace(/\//g, '\\');
    const lastSeparator = normalized.lastIndexOf('\\');
    return lastSeparator === -1 ? p : normalized.substring(lastSeparator + 1);
  }),
}));

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    access: mockAccess,
    mkdir: mockMkdir,
    readdir: mockReaddir,
    copyFile: mockCopyFile,
    rm: mockRm,
    writeFile: mockWriteFile,
  },
}));

// Mock path module for Windows paths on Linux
vi.mock('path', () => ({
  default: {
    join: mockPathJoin,
    dirname: mockPathDirname,
    basename: mockPathBasename,
  },
  join: mockPathJoin,
  dirname: mockPathDirname,
  basename: mockPathBasename,
}));

// Mock 7zip utility
vi.mock('../../../../utils/7zip.utils', () => ({
  unpack: mockSevenZipUnpack,
}));

// Mock expand utils
vi.mock('../../../../utils', () => ({
  expandWindowsEnvVars: mockExpandWindowsEnvVars,
}));

// Mock createBackup (from tool.utils)
vi.mock('../../../tool.utils', () => ({
  createBackup: mockCreateBackup,
}));

// Mock PE utils
vi.mock('../pe-utils', () => ({
  detectArchitecture: mockDetectArchitecture,
  detectGraphicsApi: mockDetectGraphicsApi,
  is7zArchiveAsync: mockIs7zArchiveAsync,
  isReshadeFile: mockIsReshadeFile,
  getVersionInfo: mockGetVersionInfo,
}));

import { installReshade } from '../install-reshade.utils';
import type { InstallReshadeParams } from '../types';

describe('installReshade', () => {
  const defaultParams: InstallReshadeParams = {
    addonFilePath: 'C:\\Downloads\\FreePIE.addon64',
    gameExePath: 'C:\\Games\\MyGame\\game.exe',
    graphicsApi: 'd3d11',
    reshadeInstallerPath: 'C:\\Downloads\\ReShade_Setup.exe',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful mocks
    mockExpandWindowsEnvVars.mockImplementation((path: string) => path);
    // Default: input files exist, DLL slots don't exist
    mockAccess.mockImplementation(async (path: string) => {
      // Input files exist
      if (
        path.includes('ReShade_Setup.exe') ||
        path.includes('.addon') ||
        path.includes('game.exe')
      ) {
        return undefined;
      }
      // DLL slots don't exist by default
      throw new Error('ENOENT');
    });
    mockMkdir.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockIs7zArchiveAsync.mockResolvedValue(true);
    mockDetectArchitecture.mockReturnValue('64');
    mockDetectGraphicsApi.mockReturnValue('d3d11');
    // isReshadeFile returns true for installer path, false for game directory DLLs
    mockIsReshadeFile.mockImplementation((filePath: string) => filePath.includes('ReShade_Setup'));
    mockGetVersionInfo.mockReturnValue({ productName: 'ReShade Setup' });
    mockCreateBackup.mockResolvedValue('C:\\Games\\MyGame\\dxgi.dll.bak');

    // Mock 7zip extraction
    mockSevenZipUnpack.mockImplementation(
      (_archive: string, _dest: string, callback: (err: Error | null) => void) => {
        callback(null);
      }
    );

    // Mock readdir to return ReShade DLLs
    mockReaddir.mockResolvedValue(['ReShade64.dll', 'ReShade32.dll']);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('input validation', () => {
    it('should throw error when ReShade installer does not exist', async () => {
      mockAccess.mockImplementation(async (path: string) => {
        if (path.includes('ReShade_Setup.exe')) {
          throw new Error('ENOENT');
        }
        return undefined;
      });

      await expect(installReshade(defaultParams)).rejects.toThrow(
        'ReShade installer not found: C:\\Downloads\\ReShade_Setup.exe'
      );
    });

    it('should throw error when ReShade installer is not a valid 7z archive', async () => {
      mockIs7zArchiveAsync.mockResolvedValue(false);

      await expect(installReshade(defaultParams)).rejects.toThrow(
        'File is not a valid 7z archive or self-extracting executable',
      );
    });

    it('should throw error when file is valid archive but not ReShade installer', async () => {
      mockIs7zArchiveAsync.mockResolvedValue(true);
      mockIsReshadeFile.mockReturnValue(false);
      mockGetVersionInfo.mockReturnValue({ productName: 'Some Other App' });

      await expect(installReshade(defaultParams)).rejects.toThrow(
        'File does not appear to be a ReShade installer',
      );
    });

    it('should throw error when addon file does not exist', async () => {
      mockAccess.mockImplementation(async (path: string) => {
        if (path.includes('.addon')) {
          throw new Error('ENOENT');
        }
        return undefined;
      });

      await expect(installReshade(defaultParams)).rejects.toThrow(
        'Addon file not found: C:\\Downloads\\FreePIE.addon64'
      );
    });

    it('should throw error when game EXE does not exist', async () => {
      mockAccess.mockImplementation(async (path: string) => {
        if (path.includes('game.exe')) {
          throw new Error('ENOENT');
        }
        return undefined;
      });

      await expect(installReshade(defaultParams)).rejects.toThrow(
        'Game executable not found: C:\\Games\\MyGame\\game.exe'
      );
    });
  });

  describe('architecture detection', () => {
    it('should detect 64-bit architecture and use ReShade64.dll', async () => {
      mockDetectArchitecture.mockReturnValue('64');

      const result = await installReshade(defaultParams);

      expect(result.detectedArchitecture).toBe('64');
      expect(mockDetectArchitecture).toHaveBeenCalledWith('C:\\Games\\MyGame\\game.exe');
    });

    it('should detect 32-bit architecture and use ReShade32.dll', async () => {
      mockDetectArchitecture.mockReturnValue('32');

      const result = await installReshade(defaultParams);

      expect(result.detectedArchitecture).toBe('32');
    });

    it('should throw error when architecture detection fails', async () => {
      mockDetectArchitecture.mockImplementation(() => {
        throw new Error('Invalid PE format');
      });

      await expect(installReshade(defaultParams)).rejects.toThrow(
        'Failed to detect game architecture: Invalid PE format'
      );
    });

    it('should throw error when ReShade DLL for detected architecture is missing', async () => {
      mockDetectArchitecture.mockReturnValue('64');
      mockReaddir.mockResolvedValue(['ReShade32.dll']); // Only 32-bit available

      await expect(installReshade(defaultParams)).rejects.toThrow(
        'ReShade 64-bit DLL not found in extracted contents'
      );
    });
  });

  describe('DLL slot selection', () => {
    it('should use default dxgi.dll for DX11 when slot is empty', async () => {
      // Default mock: all files don't exist (set in beforeEach)
      // Override to make input files exist but game dir DLLs don't
      mockAccess.mockImplementation(async (path: string) => {
        // Input files exist
        if (
          path.includes('ReShade_Setup.exe') ||
          path.includes('FreePIE.addon64') ||
          path.includes('game.exe')
        ) {
          return undefined;
        }
        // DLL slots don't exist
        throw new Error('ENOENT');
      });

      const result = await installReshade(defaultParams);

      expect(result.actualDllName).toBe('dxgi.dll');
    });

    it('should fallback to d3d11.dll when dxgi.dll is occupied by another mod', async () => {
      mockAccess.mockImplementation(async (path: string) => {
        // Input files and dxgi.dll exist
        if (
          path.includes('ReShade_Setup.exe') ||
          path.includes('FreePIE.addon64') ||
          path.includes('game.exe') ||
          path.includes('dxgi.dll')
        ) {
          return undefined;
        }
        // d3d11.dll and d3d10.dll don't exist
        throw new Error('ENOENT');
      });
      // Installer is ReShade, but game dir DLLs are not
      mockIsReshadeFile.mockImplementation((filePath: string) => filePath.includes('ReShade_Setup'));
      mockGetVersionInfo.mockReturnValue({ productName: 'ENBSeries' });

      const result = await installReshade(defaultParams);

      expect(result.actualDllName).toBe('d3d11.dll');
    });

    it('should fallback to d3d10.dll when both dxgi.dll and d3d11.dll are occupied', async () => {
      mockAccess.mockImplementation(async (path: string) => {
        // Input files, dxgi.dll, and d3d11.dll exist
        if (
          path.includes('ReShade_Setup.exe') ||
          path.includes('FreePIE.addon64') ||
          path.includes('game.exe') ||
          path.includes('dxgi.dll') ||
          path.includes('d3d11.dll')
        ) {
          return undefined;
        }
        // d3d10.dll doesn't exist
        throw new Error('ENOENT');
      });
      // Installer is ReShade, but game dir DLLs are not
      mockIsReshadeFile.mockImplementation((filePath: string) => filePath.includes('ReShade_Setup'));
      mockGetVersionInfo.mockReturnValue({ productName: 'SomeMod' });

      const result = await installReshade(defaultParams);

      expect(result.actualDllName).toBe('d3d10.dll');
    });

    it('should overwrite existing ReShade DLL (slot available)', async () => {
      mockAccess.mockImplementation(async (path: string) => {
        // All input files and dxgi.dll exist
        if (
          path.includes('ReShade_Setup.exe') ||
          path.includes('FreePIE.addon64') ||
          path.includes('game.exe') ||
          path.includes('dxgi.dll')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockIsReshadeFile.mockReturnValue(true); // It's ReShade, so slot is available

      const result = await installReshade(defaultParams);

      expect(result.actualDllName).toBe('dxgi.dll');
    });

    it('should throw error when all DLL slots are occupied for DX11', async () => {
      // All DLLs exist (dxgi.dll, d3d11.dll, d3d10.dll)
      mockAccess.mockImplementation(async (path: string) => {
        if (
          path.includes('ReShade_Setup.exe') ||
          path.includes('FreePIE.addon64') ||
          path.includes('game.exe') ||
          path.includes('dxgi.dll') ||
          path.includes('d3d11.dll') ||
          path.includes('d3d10.dll')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      // Installer is ReShade, but game dir DLLs are not
      mockIsReshadeFile.mockImplementation((filePath: string) => filePath.includes('ReShade_Setup'));
      mockGetVersionInfo.mockReturnValue({ productName: 'OtherMod' });

      await expect(installReshade(defaultParams)).rejects.toThrow(
        'Cannot install ReShade: all DLL slots are occupied'
      );
    });

    it('should throw error for DX9 when d3d9.dll is occupied (no fallbacks)', async () => {
      mockAccess.mockImplementation(async (path: string) => {
        if (
          path.includes('ReShade_Setup.exe') ||
          path.includes('FreePIE.addon64') ||
          path.includes('game.exe') ||
          path.includes('d3d9.dll')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      // Installer is ReShade, but game dir DLLs are not
      mockIsReshadeFile.mockImplementation((filePath: string) => filePath.includes('ReShade_Setup'));
      mockGetVersionInfo.mockReturnValue({ productName: 'ENB' });

      const dx9Params = { ...defaultParams, graphicsApi: 'd3d9' as const };

      await expect(installReshade(dx9Params)).rejects.toThrow(
        'Cannot install ReShade: d3d9.dll is occupied by another mod (ENB). DX9 has no alternative DLL options'
      );
    });

    it('should throw error for OpenGL when opengl32.dll is occupied (no fallbacks)', async () => {
      mockAccess.mockImplementation(async (path: string) => {
        if (
          path.includes('ReShade_Setup.exe') ||
          path.includes('FreePIE.addon64') ||
          path.includes('game.exe') ||
          path.includes('opengl32.dll')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      // Installer is ReShade, but game dir DLLs are not
      mockIsReshadeFile.mockImplementation((filePath: string) => filePath.includes('ReShade_Setup'));
      mockGetVersionInfo.mockReturnValue({ productName: 'GLIntercept' });

      const openglParams = { ...defaultParams, graphicsApi: 'opengl' as const };

      await expect(installReshade(openglParams)).rejects.toThrow(
        'Cannot install ReShade: opengl32.dll is occupied by another mod (GLIntercept). OpenGL has no alternative DLL options'
      );
    });
  });

  describe('file installation', () => {
    it('should create backup when overwriting existing file', async () => {
      // All files exist including dxgi.dll
      mockAccess.mockImplementation(async (path: string) => {
        if (
          path.includes('ReShade_Setup.exe') ||
          path.includes('FreePIE.addon64') ||
          path.includes('game.exe') ||
          path.includes('dxgi.dll')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockIsReshadeFile.mockReturnValue(true); // It's ReShade, so slot is available

      const result = await installReshade(defaultParams);

      expect(mockCreateBackup).toHaveBeenCalledWith('C:\\Games\\MyGame\\dxgi.dll');
      expect(result.installedFiles[0].backupPath).toBe('C:\\Games\\MyGame\\dxgi.dll.bak');
      expect(result.installedFiles[0].wasNewFile).toBe(false);
    });

    it('should not create backup when file is new', async () => {
      // Input files exist but DLL slots don't
      mockAccess.mockImplementation(async (path: string) => {
        if (
          path.includes('ReShade_Setup.exe') ||
          path.includes('FreePIE.addon64') ||
          path.includes('game.exe')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const result = await installReshade(defaultParams);

      expect(result.installedFiles[0].wasNewFile).toBe(true);
      expect(result.installedFiles[0].backupPath).toBeNull();
    });

    it('should copy ReShade DLL with correct target name', async () => {
      const result = await installReshade(defaultParams);

      expect(mockCopyFile).toHaveBeenCalledWith(
        expect.stringContaining('ReShade64.dll'),
        'C:\\Games\\MyGame\\dxgi.dll'
      );
      expect(result.installedFiles).toContainEqual(
        expect.objectContaining({
          destPath: 'C:\\Games\\MyGame\\dxgi.dll',
        })
      );
    });

    it('should copy addon file with original filename', async () => {
      const result = await installReshade(defaultParams);

      expect(mockCopyFile).toHaveBeenCalledWith(
        'C:\\Downloads\\FreePIE.addon64',
        'C:\\Games\\MyGame\\FreePIE.addon64'
      );
      expect(result.installedFiles).toContainEqual(
        expect.objectContaining({
          destPath: 'C:\\Games\\MyGame\\FreePIE.addon64',
        })
      );
    });

    it('should return correct game directory', async () => {
      const result = await installReshade(defaultParams);

      expect(result.gameDirectory).toBe('C:\\Games\\MyGame');
    });

    it('should return all installed files for reversion tracking', async () => {
      const result = await installReshade(defaultParams);

      // Should include: ReShade DLL, addon file, and ReShade.ini (created when missing)
      expect(result.installedFiles).toHaveLength(3);
      expect(result.installedFiles[0]).toHaveProperty('destPath');
      expect(result.installedFiles[0]).toHaveProperty('backupPath');
      expect(result.installedFiles[0]).toHaveProperty('wasNewFile');
    });
  });

  describe('7z extraction', () => {
    it('should extract to temp directory and clean up', async () => {
      await installReshade(defaultParams);

      expect(mockSevenZipUnpack).toHaveBeenCalledWith(
        'C:\\Downloads\\ReShade_Setup.exe',
        expect.stringContaining('reshade-extract-'),
        expect.any(Function)
      );
      expect(mockRm).toHaveBeenCalledWith(expect.stringContaining('reshade-extract-'), {
        recursive: true,
        force: true,
      });
    });

    it('should throw error when extraction fails', async () => {
      mockSevenZipUnpack.mockImplementation(
        (_archive: string, _dest: string, callback: (err: Error | null) => void) => {
          callback(new Error('Extraction failed'));
        }
      );

      await expect(installReshade(defaultParams)).rejects.toThrow(
        'Failed to extract archive: Extraction failed'
      );
    });

    it('should clean up temp directory even on error', async () => {
      mockSevenZipUnpack.mockImplementation(
        (_archive: string, _dest: string, callback: (err: Error | null) => void) => {
          callback(null);
        }
      );
      mockReaddir.mockResolvedValue([]); // No DLLs found

      await expect(installReshade(defaultParams)).rejects.toThrow();

      // Cleanup should still be called
      expect(mockRm).toHaveBeenCalled();
    });
  });

  describe('environment variable expansion', () => {
    it('should expand environment variables in all paths', async () => {
      mockExpandWindowsEnvVars.mockImplementation((path: string) => {
        return path
          .replace(/%USERPROFILE%/gi, 'C:\\Users\\TestUser')
          .replace(/%TEMP%/gi, 'C:\\Users\\TestUser\\AppData\\Local\\Temp');
      });

      // Update access mock to handle expanded paths
      mockAccess.mockImplementation(async (path: string) => {
        if (
          path.includes('ReShade_Setup.exe') ||
          path.includes('.addon') ||
          path.includes('game.exe')
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const envParams: InstallReshadeParams = {
        addonFilePath: '%USERPROFILE%\\Downloads\\addon.addon64',
        gameExePath: '%USERPROFILE%\\Games\\game.exe',
        graphicsApi: 'd3d11',
        reshadeInstallerPath: '%TEMP%\\ReShade_Setup.exe',
      };

      await installReshade(envParams);

      expect(mockExpandWindowsEnvVars).toHaveBeenCalledWith('%USERPROFILE%\\Downloads\\addon.addon64');
      expect(mockExpandWindowsEnvVars).toHaveBeenCalledWith('%USERPROFILE%\\Games\\game.exe');
      expect(mockExpandWindowsEnvVars).toHaveBeenCalledWith('%TEMP%\\ReShade_Setup.exe');
    });
  });

  describe('graphics API variations', () => {
    it.each([
      ['d3d9', 'd3d9.dll'],
      ['d3d10', 'dxgi.dll'],
      ['d3d11', 'dxgi.dll'],
      ['d3d12', 'dxgi.dll'],
      ['opengl', 'opengl32.dll'],
    ] as const)('should use correct default DLL for %s API', async (api, expectedDll) => {
      const params = { ...defaultParams, graphicsApi: api };

      const result = await installReshade(params);

      expect(result.actualDllName).toBe(expectedDll);
      expect(result.graphicsApi).toBe(api);
    });
  });

  describe('graphics API auto-detection', () => {
    it('should auto-detect graphics API when not provided', async () => {
      mockDetectGraphicsApi.mockReturnValue('d3d12');
      const paramsWithoutApi = {
        addonFilePath: defaultParams.addonFilePath,
        gameExePath: defaultParams.gameExePath,
        reshadeInstallerPath: defaultParams.reshadeInstallerPath,
      };

      const result = await installReshade(paramsWithoutApi);

      expect(mockDetectGraphicsApi).toHaveBeenCalledWith(defaultParams.gameExePath);
      expect(result.graphicsApi).toBe('d3d12');
      expect(result.actualDllName).toBe('dxgi.dll');
    });

    it('should use provided graphics API instead of auto-detecting', async () => {
      mockDetectGraphicsApi.mockReturnValue('d3d12'); // Would return d3d12 if called

      const result = await installReshade(defaultParams); // Has graphicsApi: 'd3d11'

      expect(result.graphicsApi).toBe('d3d11');
    });

    it('should throw error when graphics API cannot be auto-detected', async () => {
      mockDetectGraphicsApi.mockReturnValue(null);
      const paramsWithoutApi = {
        addonFilePath: defaultParams.addonFilePath,
        gameExePath: defaultParams.gameExePath,
        reshadeInstallerPath: defaultParams.reshadeInstallerPath,
      };

      await expect(installReshade(paramsWithoutApi)).rejects.toThrow(
        'Unable to detect graphics API from game executable'
      );
    });
  });
});
