/**
 * Minimal PE (Portable Executable) header parsing utilities
 *
 * Used for:
 * - Detecting executable architecture (32-bit vs 64-bit)
 * - Reading version info from DLLs to detect ReShade
 * - Validating 7z archive headers
 */

import { readFileSync, openSync, readSync, closeSync } from 'fs';
import { list } from '../../../utils/7zip.utils';
// Note: fs sync functions still used by detectArchitecture and getVersionInfo
import type { Architecture, PEVersionInfo, GraphicsApi } from './types';

// =============================================================================
// PE Header Constants
// =============================================================================

/** DOS header magic number: 'MZ' */
const DOS_MAGIC = 0x5a4d;

/** PE signature: 'PE\0\0' */
const PE_SIGNATURE = 0x00004550;

/** Machine type for 32-bit (i386) */
const IMAGE_FILE_MACHINE_I386 = 0x014c;

/** Machine type for 64-bit (AMD64) */
const IMAGE_FILE_MACHINE_AMD64 = 0x8664;

/** PE32 optional header magic (32-bit) */
const PE32_MAGIC = 0x10b;

/** PE32+ optional header magic (64-bit) */
const PE32_PLUS_MAGIC = 0x20b;

/**
 * Graphics-related DLLs used to detect graphics API
 * Order matters: first match wins, so more specific APIs come first
 */
const GRAPHICS_DLL_MAPPINGS: Array<{ dll: string; api: GraphicsApi }> = [
  // DirectX 12 (check first as games may import multiple)
  { dll: 'd3d12.dll', api: 'd3d12' },
  // DirectX 11
  { dll: 'd3d11.dll', api: 'd3d11' },
  // DirectX 10
  { dll: 'd3d10.dll', api: 'd3d10' },
  { dll: 'd3d10_1.dll', api: 'd3d10' },
  // DirectX 9
  { dll: 'd3d9.dll', api: 'd3d9' },
  // OpenGL
  { dll: 'opengl32.dll', api: 'opengl' },
  // Vulkan - not directly supported by ReShade DLL naming, skip for now
];

// =============================================================================
// Architecture Detection
// =============================================================================

/**
 * Detects the architecture of a PE executable (EXE or DLL)
 *
 * Reads the minimal PE header (~64 bytes) to determine if the file is 32-bit or 64-bit.
 *
 * @param exePath - Path to the executable file
 * @returns Architecture ('32' or '64')
 * @throws Error if file cannot be read or is not a valid PE file
 */
export function detectArchitecture(exePath: string): Architecture {
  // Read first 64 bytes for DOS header
  const fd = openSync(exePath, 'r');
  try {
    const dosHeader = Buffer.alloc(64);
    readSync(fd, dosHeader, 0, 64, 0);

    // Check DOS magic
    const dosMagic = dosHeader.readUInt16LE(0);
    if (dosMagic !== DOS_MAGIC) {
      throw new Error('Invalid executable: DOS magic not found');
    }

    // Get PE header offset from DOS header at offset 0x3C
    const peOffset = dosHeader.readUInt32LE(0x3c);

    // Read PE signature and machine type (8 bytes starting at PE offset)
    const peHeader = Buffer.alloc(8);
    readSync(fd, peHeader, 0, 8, peOffset);

    // Check PE signature
    const peSignature = peHeader.readUInt32LE(0);
    if (peSignature !== PE_SIGNATURE) {
      throw new Error('Invalid executable: PE signature not found');
    }

    // Read machine type (2 bytes after PE signature)
    const machineType = peHeader.readUInt16LE(4);

    switch (machineType) {
      case IMAGE_FILE_MACHINE_I386:
        return '32';
      case IMAGE_FILE_MACHINE_AMD64:
        return '64';
      default:
        throw new Error(`Unknown machine type: 0x${machineType.toString(16)}`);
    }
  } finally {
    closeSync(fd);
  }
}

// =============================================================================
// Graphics API Detection
// =============================================================================

/**
 * Detects the graphics API used by a PE executable by analyzing its import table.
 *
 * Scans the PE import directory for graphics-related DLLs (d3d9.dll, d3d11.dll, etc.)
 * to determine which graphics API the game uses.
 *
 * Detection priority (first match wins):
 * 1. d3d12.dll → DirectX 12
 * 2. d3d11.dll → DirectX 11
 * 3. d3d10.dll / d3d10_1.dll → DirectX 10
 * 4. d3d9.dll → DirectX 9
 * 5. opengl32.dll → OpenGL
 *
 * @param exePath - Path to the executable file
 * @returns Detected graphics API or null if unable to detect
 */
export function detectGraphicsApi(exePath: string): GraphicsApi | null {
  try {
    const buffer = readFileSync(exePath);

    // Check DOS magic
    if (buffer.length < 64) return null;
    const dosMagic = buffer.readUInt16LE(0);
    if (dosMagic !== DOS_MAGIC) return null;

    // Get PE header offset
    const peOffset = buffer.readUInt32LE(0x3c);
    if (peOffset + 24 > buffer.length) return null;

    // Check PE signature
    const peSignature = buffer.readUInt32LE(peOffset);
    if (peSignature !== PE_SIGNATURE) return null;

    // Read COFF header
    const coffHeader = peOffset + 4;
    const numberOfSections = buffer.readUInt16LE(coffHeader + 2);
    const sizeOfOptionalHeader = buffer.readUInt16LE(coffHeader + 16);

    if (sizeOfOptionalHeader === 0) return null;

    // Optional header starts after COFF header (20 bytes)
    const optionalHeaderOffset = coffHeader + 20;

    // Check optional header magic to determine PE32 or PE32+
    const magic = buffer.readUInt16LE(optionalHeaderOffset);
    const is64Bit = magic === PE32_PLUS_MAGIC;

    if (magic !== PE32_MAGIC && magic !== PE32_PLUS_MAGIC) return null;

    // Data directory offset differs between PE32 and PE32+
    // PE32: optional header + 96 bytes
    // PE32+: optional header + 112 bytes
    const dataDirectoryOffset = optionalHeaderOffset + (is64Bit ? 112 : 96);

    // Import directory is the second entry in data directory (index 1)
    // Each entry is 8 bytes (4 bytes RVA + 4 bytes Size)
    const importDirRva = buffer.readUInt32LE(dataDirectoryOffset + 8);
    const importDirSize = buffer.readUInt32LE(dataDirectoryOffset + 12);

    if (importDirRva === 0 || importDirSize === 0) return null;

    // Read section headers to convert RVA to file offset
    const sectionHeadersOffset = optionalHeaderOffset + sizeOfOptionalHeader;

    // Find the section containing the import directory
    let importDirFileOffset = 0;
    for (let i = 0; i < numberOfSections; i++) {
      const sectionOffset = sectionHeadersOffset + i * 40;
      const virtualAddress = buffer.readUInt32LE(sectionOffset + 12);
      const sizeOfRawData = buffer.readUInt32LE(sectionOffset + 16);
      const pointerToRawData = buffer.readUInt32LE(sectionOffset + 20);
      const virtualSize = buffer.readUInt32LE(sectionOffset + 8);

      const sectionEnd = virtualAddress + Math.max(virtualSize, sizeOfRawData);

      if (importDirRva >= virtualAddress && importDirRva < sectionEnd) {
        importDirFileOffset = pointerToRawData + (importDirRva - virtualAddress);
        break;
      }
    }

    if (importDirFileOffset === 0) return null;

    // Parse import descriptors (each is 20 bytes)
    // Structure: OriginalFirstThunk (4), TimeDateStamp (4), ForwarderChain (4), Name (4), FirstThunk (4)
    const importedDlls: string[] = [];
    let descriptorOffset = importDirFileOffset;

    while (descriptorOffset + 20 <= buffer.length) {
      const nameRva = buffer.readUInt32LE(descriptorOffset + 12);

      // End of import descriptors (null entry)
      if (nameRva === 0) break;

      // Convert name RVA to file offset
      let nameFileOffset = 0;
      for (let i = 0; i < numberOfSections; i++) {
        const sectionOffset = sectionHeadersOffset + i * 40;
        const virtualAddress = buffer.readUInt32LE(sectionOffset + 12);
        const sizeOfRawData = buffer.readUInt32LE(sectionOffset + 16);
        const pointerToRawData = buffer.readUInt32LE(sectionOffset + 20);
        const virtualSize = buffer.readUInt32LE(sectionOffset + 8);

        const sectionEnd = virtualAddress + Math.max(virtualSize, sizeOfRawData);

        if (nameRva >= virtualAddress && nameRva < sectionEnd) {
          nameFileOffset = pointerToRawData + (nameRva - virtualAddress);
          break;
        }
      }

      if (nameFileOffset > 0 && nameFileOffset < buffer.length) {
        // Read null-terminated string
        let dllName = '';
        for (let i = nameFileOffset; i < buffer.length && buffer[i] !== 0; i++) {
          dllName += String.fromCharCode(buffer[i]);
        }
        if (dllName) {
          importedDlls.push(dllName.toLowerCase());
        }
      }

      descriptorOffset += 20;
    }

    // Also scan for DLL name strings in the executable (catches dynamic loading)
    const bufferStr = buffer.toString('ascii');
    for (const mapping of GRAPHICS_DLL_MAPPINGS) {
      // Check import table first (more reliable)
      if (importedDlls.includes(mapping.dll)) {
        return mapping.api;
      }
    }

    // Fallback: check for DLL name strings in the binary (for dynamic loading)
    for (const mapping of GRAPHICS_DLL_MAPPINGS) {
      if (bufferStr.toLowerCase().includes(mapping.dll)) {
        return mapping.api;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// Version Info Extraction
// =============================================================================

/**
 * Extracts version info from a PE file's version resource
 *
 * This is a simplified implementation that looks for common version string patterns.
 * Works for any PE file (EXE, DLL, etc.) by checking ProductName/FileDescription.
 *
 * @param filePath - Path to the PE file (EXE, DLL, etc.)
 * @returns Version info object with productName and fileDescription (if found)
 */
export function getVersionInfo(filePath: string): PEVersionInfo {
  try {
    const buffer = readFileSync(filePath);
    const content = buffer.toString('utf16le');

    const result: PEVersionInfo = {};

    // Look for ProductName
    const productNameMatch = content.match(/ProductName[\x00\s]*([^\x00]+)/);
    if (productNameMatch) {
      result.productName = productNameMatch[1].trim();
    }

    // Look for FileDescription
    const fileDescMatch = content.match(/FileDescription[\x00\s]*([^\x00]+)/);
    if (fileDescMatch) {
      result.fileDescription = fileDescMatch[1].trim();
    }

    return result;
  } catch {
    // If we can't read version info, return empty object
    return {};
  }
}

/**
 * Checks if a PE file belongs to ReShade by examining its version info
 *
 * @param filePath - Path to the PE file (EXE, DLL, etc.)
 * @returns True if the file appears to be a ReShade file
 */
export function isReshadeFile(filePath: string): boolean {
  const versionInfo = getVersionInfo(filePath);

  // Check if 'ReShade' appears in ProductName or FileDescription
  const searchText = 'reshade';
  const productName = (versionInfo.productName || '').toLowerCase();
  const fileDescription = (versionInfo.fileDescription || '').toLowerCase();

  return productName.includes(searchText) || fileDescription.includes(searchText);
}

// =============================================================================
// 7-Zip Archive Validation
// =============================================================================

/**
 * Validates if a file is extractable by 7zip by attempting to list its contents.
 * This is fast because it only reads the archive header/metadata, not the full file.
 *
 * Accepts both:
 * - Pure 7z archives
 * - Self-extracting archives (SFX)
 *
 * @param filePath - Path to the file to check
 * @returns Promise resolving to true if the file is a valid 7z archive
 */
export async function is7zArchiveAsync(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    list(filePath, (err: Error | null) => {
      resolve(err === null);
    });
  });
}
