/**
 * Tests for PE (Portable Executable) parsing utilities
 * Tests architecture detection, version info extraction, and 7z validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to define mock functions
const { mockOpenSync, mockReadSync, mockCloseSync, mockReadFileSync, mockSevenZipList } = vi.hoisted(
  () => ({
    mockOpenSync: vi.fn(),
    mockReadSync: vi.fn(),
    mockCloseSync: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockSevenZipList: vi.fn(),
  }),
);

// Mock fs module
vi.mock('fs', () => ({
  openSync: mockOpenSync,
  readSync: mockReadSync,
  closeSync: mockCloseSync,
  readFileSync: mockReadFileSync,
}));

// Mock the local 7zip utility module
vi.mock('../../../../utils/7zip.utils', () => ({
  list: mockSevenZipList,
}));

import { detectArchitecture, detectGraphicsApi, getVersionInfo, isReshadeFile, is7zArchiveAsync } from '../pe-utils';

describe('pe-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectArchitecture', () => {
    // PE Header constants
    const DOS_MAGIC = 0x5a4d; // 'MZ'
    const PE_SIGNATURE = 0x00004550; // 'PE\0\0'
    const MACHINE_I386 = 0x014c; // 32-bit
    const MACHINE_AMD64 = 0x8664; // 64-bit

    /**
     * Creates a mock DOS header buffer
     */
    function createDosHeader(peOffset: number): Buffer {
      const buffer = Buffer.alloc(64);
      buffer.writeUInt16LE(DOS_MAGIC, 0); // DOS magic
      buffer.writeUInt32LE(peOffset, 0x3c); // PE header offset
      return buffer;
    }

    /**
     * Creates a mock PE header buffer
     */
    function createPeHeader(machineType: number): Buffer {
      const buffer = Buffer.alloc(8);
      buffer.writeUInt32LE(PE_SIGNATURE, 0); // PE signature
      buffer.writeUInt16LE(machineType, 4); // Machine type
      return buffer;
    }

    it('should detect 64-bit architecture (AMD64)', () => {
      const peOffset = 0x80;
      const dosHeader = createDosHeader(peOffset);
      const peHeader = createPeHeader(MACHINE_AMD64);

      mockOpenSync.mockReturnValue(1);
      mockReadSync
        .mockImplementationOnce((_fd, buffer) => {
          dosHeader.copy(buffer);
          return 64;
        })
        .mockImplementationOnce((_fd, buffer) => {
          peHeader.copy(buffer);
          return 8;
        });
      mockCloseSync.mockReturnValue(undefined);

      const result = detectArchitecture('C:\\game\\game.exe');

      expect(result).toBe('64');
      expect(mockOpenSync).toHaveBeenCalledWith('C:\\game\\game.exe', 'r');
      expect(mockCloseSync).toHaveBeenCalledWith(1);
    });

    it('should detect 32-bit architecture (i386)', () => {
      const peOffset = 0x80;
      const dosHeader = createDosHeader(peOffset);
      const peHeader = createPeHeader(MACHINE_I386);

      mockOpenSync.mockReturnValue(1);
      mockReadSync
        .mockImplementationOnce((_fd, buffer) => {
          dosHeader.copy(buffer);
          return 64;
        })
        .mockImplementationOnce((_fd, buffer) => {
          peHeader.copy(buffer);
          return 8;
        });
      mockCloseSync.mockReturnValue(undefined);

      const result = detectArchitecture('C:\\game\\game32.exe');

      expect(result).toBe('32');
    });

    it('should throw error for invalid DOS magic', () => {
      const invalidHeader = Buffer.alloc(64);
      invalidHeader.writeUInt16LE(0x0000, 0); // Invalid magic

      mockOpenSync.mockReturnValue(1);
      mockReadSync.mockImplementationOnce((_fd, buffer) => {
        invalidHeader.copy(buffer);
        return 64;
      });
      mockCloseSync.mockReturnValue(undefined);

      expect(() => detectArchitecture('C:\\invalid.exe')).toThrow(
        'Invalid executable: DOS magic not found'
      );
      expect(mockCloseSync).toHaveBeenCalledWith(1);
    });

    it('should throw error for invalid PE signature', () => {
      const peOffset = 0x80;
      const dosHeader = createDosHeader(peOffset);
      const invalidPeHeader = Buffer.alloc(8);
      invalidPeHeader.writeUInt32LE(0x00000000, 0); // Invalid PE signature

      mockOpenSync.mockReturnValue(1);
      mockReadSync
        .mockImplementationOnce((_fd, buffer) => {
          dosHeader.copy(buffer);
          return 64;
        })
        .mockImplementationOnce((_fd, buffer) => {
          invalidPeHeader.copy(buffer);
          return 8;
        });
      mockCloseSync.mockReturnValue(undefined);

      expect(() => detectArchitecture('C:\\invalid.exe')).toThrow(
        'Invalid executable: PE signature not found'
      );
    });

    it('should throw error for unknown machine type', () => {
      const peOffset = 0x80;
      const dosHeader = createDosHeader(peOffset);
      const unknownPeHeader = createPeHeader(0x9999); // Unknown machine type

      mockOpenSync.mockReturnValue(1);
      mockReadSync
        .mockImplementationOnce((_fd, buffer) => {
          dosHeader.copy(buffer);
          return 64;
        })
        .mockImplementationOnce((_fd, buffer) => {
          unknownPeHeader.copy(buffer);
          return 8;
        });
      mockCloseSync.mockReturnValue(undefined);

      expect(() => detectArchitecture('C:\\unknown.exe')).toThrow('Unknown machine type: 0x9999');
    });

    it('should close file descriptor even on error', () => {
      mockOpenSync.mockReturnValue(42);
      mockReadSync.mockImplementation(() => {
        throw new Error('Read failed');
      });
      mockCloseSync.mockReturnValue(undefined);

      expect(() => detectArchitecture('C:\\error.exe')).toThrow('Read failed');
      expect(mockCloseSync).toHaveBeenCalledWith(42);
    });
  });

  describe('detectGraphicsApi', () => {
    // PE Header constants
    const DOS_MAGIC = 0x5a4d; // 'MZ'
    const PE_SIGNATURE = 0x00004550; // 'PE\0\0'
    const PE32_MAGIC = 0x10b; // 32-bit optional header
    const PE32_PLUS_MAGIC = 0x20b; // 64-bit optional header

    /**
     * Creates a minimal valid PE buffer with a DLL name in the import table.
     * This creates a simplified but valid PE structure for testing.
     */
    function createPeWithImport(dllName: string, is64Bit = true): Buffer {
      const peOffset = 0x80;
      const coffHeaderSize = 20;
      const optionalHeaderSize = is64Bit ? 240 : 224;
      const sectionHeaderOffset = peOffset + 4 + coffHeaderSize + optionalHeaderSize;
      const sectionStart = 0x200; // Section data starts at 0x200
      const importDirRva = sectionStart; // Import directory at section start
      const dllNameRva = sectionStart + 40; // DLL name after import descriptor

      // Allocate enough space for everything
      const buffer = Buffer.alloc(sectionStart + 256);

      // DOS Header
      buffer.writeUInt16LE(DOS_MAGIC, 0);
      buffer.writeUInt32LE(peOffset, 0x3c);

      // PE Signature
      buffer.writeUInt32LE(PE_SIGNATURE, peOffset);

      // COFF Header (20 bytes)
      const coffHeader = peOffset + 4;
      buffer.writeUInt16LE(0x8664, coffHeader); // Machine (AMD64)
      buffer.writeUInt16LE(1, coffHeader + 2); // NumberOfSections
      buffer.writeUInt32LE(0, coffHeader + 4); // TimeDateStamp
      buffer.writeUInt32LE(0, coffHeader + 8); // PointerToSymbolTable
      buffer.writeUInt32LE(0, coffHeader + 12); // NumberOfSymbols
      buffer.writeUInt16LE(optionalHeaderSize, coffHeader + 16); // SizeOfOptionalHeader
      buffer.writeUInt16LE(0, coffHeader + 18); // Characteristics

      // Optional Header
      const optionalHeader = coffHeader + coffHeaderSize;
      buffer.writeUInt16LE(is64Bit ? PE32_PLUS_MAGIC : PE32_MAGIC, optionalHeader);

      // Data Directory (import directory is at index 1)
      // For PE32+, data directory starts at optional header + 112
      // For PE32, data directory starts at optional header + 96
      const dataDirectoryOffset = optionalHeader + (is64Bit ? 112 : 96);
      // Import directory entry (index 1) = offset + 8
      buffer.writeUInt32LE(importDirRva, dataDirectoryOffset + 8); // Import RVA
      buffer.writeUInt32LE(40, dataDirectoryOffset + 12); // Import Size

      // Section Header (.text section)
      buffer.write('.text\0\0\0', sectionHeaderOffset, 'ascii');
      buffer.writeUInt32LE(256, sectionHeaderOffset + 8); // VirtualSize
      buffer.writeUInt32LE(sectionStart, sectionHeaderOffset + 12); // VirtualAddress
      buffer.writeUInt32LE(256, sectionHeaderOffset + 16); // SizeOfRawData
      buffer.writeUInt32LE(sectionStart, sectionHeaderOffset + 20); // PointerToRawData

      // Import Descriptor (20 bytes) at sectionStart
      buffer.writeUInt32LE(0, sectionStart); // OriginalFirstThunk
      buffer.writeUInt32LE(0, sectionStart + 4); // TimeDateStamp
      buffer.writeUInt32LE(0, sectionStart + 8); // ForwarderChain
      buffer.writeUInt32LE(dllNameRva, sectionStart + 12); // Name RVA
      buffer.writeUInt32LE(0, sectionStart + 16); // FirstThunk

      // Null terminator descriptor (marks end of import descriptors)
      buffer.writeUInt32LE(0, sectionStart + 20);
      buffer.writeUInt32LE(0, sectionStart + 24);
      buffer.writeUInt32LE(0, sectionStart + 28);
      buffer.writeUInt32LE(0, sectionStart + 32);
      buffer.writeUInt32LE(0, sectionStart + 36);

      // DLL Name (null-terminated ASCII string)
      buffer.write(dllName + '\0', sectionStart + 40, 'ascii');

      return buffer;
    }

    /**
     * Creates a minimal PE buffer without any graphics DLL imports.
     * Uses kernel32.dll as a non-graphics import.
     */
    function createPeWithoutGraphicsImport(): Buffer {
      return createPeWithImport('kernel32.dll');
    }

    /**
     * Creates a PE buffer that contains a DLL name string but not in the import table.
     * This tests the fallback string scanning behavior.
     */
    function createPeWithEmbeddedString(dllName: string): Buffer {
      const buffer = createPeWithImport('kernel32.dll');
      // Embed the DLL name string somewhere in the buffer
      buffer.write(dllName, 0x180, 'ascii');
      return buffer;
    }

    describe('import table detection', () => {
      it('should detect d3d9 from import table', () => {
        mockReadFileSync.mockReturnValue(createPeWithImport('d3d9.dll'));
        expect(detectGraphicsApi('C:\\game\\game.exe')).toBe('d3d9');
      });

      it('should detect d3d10 from import table', () => {
        mockReadFileSync.mockReturnValue(createPeWithImport('d3d10.dll'));
        expect(detectGraphicsApi('C:\\game\\game.exe')).toBe('d3d10');
      });

      it('should detect d3d10_1 as d3d10', () => {
        mockReadFileSync.mockReturnValue(createPeWithImport('d3d10_1.dll'));
        expect(detectGraphicsApi('C:\\game\\game.exe')).toBe('d3d10');
      });

      it('should detect d3d11 from import table', () => {
        mockReadFileSync.mockReturnValue(createPeWithImport('d3d11.dll'));
        expect(detectGraphicsApi('C:\\game\\game.exe')).toBe('d3d11');
      });

      it('should detect d3d12 from import table', () => {
        mockReadFileSync.mockReturnValue(createPeWithImport('d3d12.dll'));
        expect(detectGraphicsApi('C:\\game\\game.exe')).toBe('d3d12');
      });

      it('should detect opengl from import table', () => {
        mockReadFileSync.mockReturnValue(createPeWithImport('opengl32.dll'));
        expect(detectGraphicsApi('C:\\game\\game.exe')).toBe('opengl');
      });

      it('should work with 32-bit PE files', () => {
        mockReadFileSync.mockReturnValue(createPeWithImport('d3d11.dll', false));
        expect(detectGraphicsApi('C:\\game\\game32.exe')).toBe('d3d11');
      });
    });

    describe('fallback string detection', () => {
      it('should detect d3d11 from embedded string when not in import table', () => {
        mockReadFileSync.mockReturnValue(createPeWithEmbeddedString('d3d11.dll'));
        expect(detectGraphicsApi('C:\\game\\game.exe')).toBe('d3d11');
      });

      it('should detect d3d12 from embedded string when not in import table', () => {
        mockReadFileSync.mockReturnValue(createPeWithEmbeddedString('d3d12.dll'));
        expect(detectGraphicsApi('C:\\game\\game.exe')).toBe('d3d12');
      });
    });

    describe('detection priority', () => {
      it('should prioritize d3d12 over d3d11 when both present', () => {
        // Create buffer with d3d12 in import table
        const buffer = createPeWithImport('d3d12.dll');
        // Also embed d3d11 string
        buffer.write('d3d11.dll', 0x180, 'ascii');
        mockReadFileSync.mockReturnValue(buffer);

        expect(detectGraphicsApi('C:\\game\\game.exe')).toBe('d3d12');
      });

      it('should prioritize d3d11 over d3d10 when both present', () => {
        const buffer = createPeWithImport('d3d11.dll');
        buffer.write('d3d10.dll', 0x180, 'ascii');
        mockReadFileSync.mockReturnValue(buffer);

        expect(detectGraphicsApi('C:\\game\\game.exe')).toBe('d3d11');
      });

      it('should prioritize d3d10 over d3d9 when both present', () => {
        const buffer = createPeWithImport('d3d10.dll');
        buffer.write('d3d9.dll', 0x180, 'ascii');
        mockReadFileSync.mockReturnValue(buffer);

        expect(detectGraphicsApi('C:\\game\\game.exe')).toBe('d3d10');
      });
    });

    describe('no graphics API found', () => {
      it('should return null when no graphics DLLs are imported', () => {
        mockReadFileSync.mockReturnValue(createPeWithoutGraphicsImport());
        expect(detectGraphicsApi('C:\\game\\game.exe')).toBeNull();
      });

      it('should return null for empty buffer', () => {
        mockReadFileSync.mockReturnValue(Buffer.alloc(0));
        expect(detectGraphicsApi('C:\\game\\game.exe')).toBeNull();
      });

      it('should return null for buffer smaller than DOS header', () => {
        mockReadFileSync.mockReturnValue(Buffer.alloc(32));
        expect(detectGraphicsApi('C:\\game\\game.exe')).toBeNull();
      });
    });

    describe('invalid PE files', () => {
      it('should return null for invalid DOS magic', () => {
        const buffer = Buffer.alloc(256);
        buffer.writeUInt16LE(0x0000, 0); // Invalid magic
        mockReadFileSync.mockReturnValue(buffer);

        expect(detectGraphicsApi('C:\\game\\notpe.exe')).toBeNull();
      });

      it('should return null for invalid PE signature', () => {
        const buffer = Buffer.alloc(256);
        buffer.writeUInt16LE(0x5a4d, 0); // Valid DOS magic
        buffer.writeUInt32LE(0x80, 0x3c); // PE offset
        buffer.writeUInt32LE(0x00000000, 0x80); // Invalid PE signature
        mockReadFileSync.mockReturnValue(buffer);

        expect(detectGraphicsApi('C:\\game\\notpe.exe')).toBeNull();
      });

      it('should return null for invalid optional header magic', () => {
        const buffer = Buffer.alloc(256);
        buffer.writeUInt16LE(0x5a4d, 0); // DOS magic
        buffer.writeUInt32LE(0x80, 0x3c); // PE offset
        buffer.writeUInt32LE(0x00004550, 0x80); // PE signature
        buffer.writeUInt16LE(20, 0x80 + 4 + 16); // SizeOfOptionalHeader
        buffer.writeUInt16LE(0x9999, 0x80 + 24); // Invalid optional header magic
        mockReadFileSync.mockReturnValue(buffer);

        expect(detectGraphicsApi('C:\\game\\invalid.exe')).toBeNull();
      });
    });

    describe('error handling', () => {
      it('should return null on read error', () => {
        mockReadFileSync.mockImplementation(() => {
          throw new Error('ENOENT: no such file');
        });

        expect(detectGraphicsApi('C:\\game\\nonexistent.exe')).toBeNull();
      });

      it('should return null on access denied error', () => {
        mockReadFileSync.mockImplementation(() => {
          throw new Error('EACCES: permission denied');
        });

        expect(detectGraphicsApi('C:\\game\\locked.exe')).toBeNull();
      });
    });
  });

  describe('getVersionInfo', () => {
    it('should extract ProductName from PE version info', () => {
      // Create a buffer with UTF-16LE encoded version info
      const content = 'SomeDataProductName\x00ReShade\x00MoreData';
      mockReadFileSync.mockReturnValue(Buffer.from(content, 'utf16le'));

      const result = getVersionInfo('C:\\dll\\reshade.dll');

      expect(result.productName).toBe('ReShade');
    });

    it('should extract FileDescription from PE version info', () => {
      const content = 'SomeDataFileDescription\x00Graphics Injector\x00MoreData';
      mockReadFileSync.mockReturnValue(Buffer.from(content, 'utf16le'));

      const result = getVersionInfo('C:\\dll\\mod.dll');

      expect(result.fileDescription).toBe('Graphics Injector');
    });

    it('should extract both ProductName and FileDescription', () => {
      const content =
        'ProductName\x00ReShade\x00FileDescription\x00Graphics Post-Processing\x00End';
      mockReadFileSync.mockReturnValue(Buffer.from(content, 'utf16le'));

      const result = getVersionInfo('C:\\dll\\reshade.dll');

      expect(result.productName).toBe('ReShade');
      expect(result.fileDescription).toBe('Graphics Post-Processing');
    });

    it('should return empty object if no version info found', () => {
      mockReadFileSync.mockReturnValue(Buffer.from('NoVersionInfoHere', 'utf16le'));

      const result = getVersionInfo('C:\\dll\\unknown.dll');

      expect(result).toEqual({});
    });

    it('should return empty object on read error', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      });

      const result = getVersionInfo('C:\\dll\\nonexistent.dll');

      expect(result).toEqual({});
    });
  });

  describe('isReshadeFile', () => {
    it('should return true when ProductName contains ReShade', () => {
      const content = 'ProductName\x00ReShade\x00';
      mockReadFileSync.mockReturnValue(Buffer.from(content, 'utf16le'));

      expect(isReshadeFile('C:\\game\\dxgi.dll')).toBe(true);
    });

    it('should return true when FileDescription contains ReShade', () => {
      const content = 'FileDescription\x00ReShade Addon\x00';
      mockReadFileSync.mockReturnValue(Buffer.from(content, 'utf16le'));

      expect(isReshadeFile('C:\\game\\d3d11.dll')).toBe(true);
    });

    it('should be case-insensitive', () => {
      const content = 'ProductName\x00RESHADE\x00';
      mockReadFileSync.mockReturnValue(Buffer.from(content, 'utf16le'));

      expect(isReshadeFile('C:\\game\\dxgi.dll')).toBe(true);
    });

    it('should return false for non-ReShade DLLs', () => {
      const content = 'ProductName\x00ENBSeries\x00';
      mockReadFileSync.mockReturnValue(Buffer.from(content, 'utf16le'));

      expect(isReshadeFile('C:\\game\\d3d9.dll')).toBe(false);
    });

    it('should return false when no version info present', () => {
      mockReadFileSync.mockReturnValue(Buffer.from('BinaryData', 'utf16le'));

      expect(isReshadeFile('C:\\game\\unknown.dll')).toBe(false);
    });

    it('should return false on read error', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Access denied');
      });

      expect(isReshadeFile('C:\\game\\locked.dll')).toBe(false);
    });
  });

  describe('is7zArchiveAsync', () => {
    it('should return true for valid 7z archive', async () => {
      mockSevenZipList.mockImplementation((_path, callback) => {
        callback(null, [{ name: 'ReShade64.dll' }]);
      });

      expect(await is7zArchiveAsync('C:\\downloads\\ReShade_Setup.exe')).toBe(true);
      expect(mockSevenZipList).toHaveBeenCalledWith('C:\\downloads\\ReShade_Setup.exe', expect.any(Function));
    });

    it('should return false for non-7z file', async () => {
      mockSevenZipList.mockImplementation((_path, callback) => {
        callback(new Error('Not a 7z archive'));
      });

      expect(await is7zArchiveAsync('C:\\downloads\\mod.zip')).toBe(false);
    });

    it('should return false when file cannot be opened', async () => {
      mockSevenZipList.mockImplementation((_path, callback) => {
        callback(new Error('ENOENT: no such file'));
      });

      expect(await is7zArchiveAsync('C:\\nonexistent.7z')).toBe(false);
    });

    it('should return false for corrupted archive', async () => {
      mockSevenZipList.mockImplementation((_path, callback) => {
        callback(new Error('Archive is corrupted'));
      });

      expect(await is7zArchiveAsync('C:\\corrupted.7z')).toBe(false);
    });
  });
});
