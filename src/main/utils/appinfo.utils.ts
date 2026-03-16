/**
 * Steam appinfo.vdf binary file parser
 * Parses the binary VDF format to extract launch configurations for Steam games
 *
 * Reference: https://github.com/SteamDatabase/SteamAppInfo
 */

import { promises as fs } from 'fs';
import { createLogger } from './logger.utils';

const logger = createLogger('AppInfo');

// Binary VDF type bytes
const BIN_NONE = 0x00; // Nested object
const BIN_STRING = 0x01; // Null-terminated UTF-8 string
const BIN_INT32 = 0x02; // 32-bit signed integer
const BIN_FLOAT32 = 0x03; // 32-bit float
const BIN_POINTER = 0x04; // Pointer (int32)
const BIN_WIDESTRING = 0x05; // UTF-16 string
const BIN_COLOR = 0x06; // Color (int32)
const BIN_UINT64 = 0x07; // 64-bit unsigned integer
const BIN_END = 0x08; // End of object
const BIN_INT64 = 0x0a; // 64-bit signed integer

// Supported appinfo.vdf versions
const MAGIC_29 = 0x07564429; // Version 41 (current as of June 2024)
const MAGIC_28 = 0x07564428; // Version 40
const MAGIC_27 = 0x07564427; // Version 39

/**
 * Launch configuration extracted from appinfo.vdf
 */
export interface AppInfoLaunchConfig {
  executable: string;
  type?: string;
  description?: string;
  oslist?: string;
  osarch?: string;
  workingdir?: string;
}

/**
 * App entry with launch configurations
 */
export interface AppInfoEntry {
  appId: string;
  installDir?: string;
  launchConfigs: AppInfoLaunchConfig[];
}

/**
 * Header information from appinfo.vdf
 */
interface AppInfoHeader {
  version: number;
  stringTableOffset: bigint;
}

/**
 * Parses Steam's binary appinfo.vdf file and extracts launch configurations
 * @param appInfoPath - Full path to appinfo.vdf file
 * @returns Map of appId -> AppInfoEntry with launch configs
 */
export async function parseAppInfo(appInfoPath: string): Promise<Map<string, AppInfoEntry>> {
  const result = new Map<string, AppInfoEntry>();

  try {
    const buffer = await fs.readFile(appInfoPath);

    // Read and validate header
    const header = readHeader(buffer);
    if (!header) {
      logger.error('Invalid appinfo.vdf header');
      return result;
    }

    // Parse string table for version 41+
    let stringTable: string[] = [];
    if (header.version >= 41 && header.stringTableOffset > 0n) {
      stringTable = parseStringTable(buffer, Number(header.stringTableOffset));
    }

    // Parse app entries
    const headerSize = header.version >= 41 ? 16 : 8; // 16 bytes for v41+ (includes string table offset)
    parseAppEntries(buffer, headerSize, stringTable, result);

    return result;
  } catch (error) {
    logger.error('Failed to parse appinfo.vdf:', error);
    return result;
  }
}

/**
 * Reads and validates the appinfo.vdf header
 */
function readHeader(buffer: Buffer): AppInfoHeader | null {
  if (buffer.length < 8) {
    return null;
  }

  const magic = buffer.readUInt32LE(0);

  // Check for supported versions
  if (magic !== MAGIC_29 && magic !== MAGIC_28 && magic !== MAGIC_27) {
    logger.error(`Unsupported appinfo.vdf version: 0x${magic.toString(16)}`);
    return null;
  }

  // Extract version from magic (lower byte)
  const version = magic & 0xff;

  // Read string table offset for version 41+
  let stringTableOffset = 0n;
  if (version >= 41 && buffer.length >= 16) {
    stringTableOffset = buffer.readBigInt64LE(8);
  }

  return { version, stringTableOffset };
}

/**
 * Parses the string table used for string deduplication in version 41+
 */
function parseStringTable(buffer: Buffer, offset: number): string[] {
  const strings: string[] = [];

  if (offset <= 0 || offset >= buffer.length) {
    return strings;
  }

  try {
    const stringCount = buffer.readUInt32LE(offset);
    let pos = offset + 4;

    for (let i = 0; i < stringCount && pos < buffer.length; i++) {
      const strEnd = buffer.indexOf(0x00, pos);
      if (strEnd === -1) break;

      strings.push(buffer.toString('utf8', pos, strEnd));
      pos = strEnd + 1;
    }
  } catch (error) {
    logger.error('Error parsing string table:', error);
  }

  return strings;
}

/**
 * Parses all app entries from the buffer
 */
function parseAppEntries(
  buffer: Buffer,
  startOffset: number,
  stringTable: string[],
  result: Map<string, AppInfoEntry>
): void {
  let pos = startOffset;
  let entryCount = 0;

  while (pos < buffer.length - 4) {
    // Read app ID (0 means end of entries)
    const appId = buffer.readUInt32LE(pos);
    pos += 4;

    if (appId === 0) {
      break;
    }

    entryCount++;

    try {
      // Read entry metadata
      const size = buffer.readUInt32LE(pos);
      pos += 4;

      const metadataStart = pos;

      // Skip infoState (4 bytes)
      pos += 4;

      // Skip lastUpdated (4 bytes)
      pos += 4;

      // Skip token (8 bytes)
      pos += 8;

      // Skip SHA-1 hash (20 bytes)
      pos += 20;

      // Skip changeNumber (4 bytes)
      pos += 4;

      // Skip binary data SHA-1 hash (20 bytes) for version 40+
      pos += 20;

      // Parse the binary VDF data
      const { value: vdfData } = parseBinaryVdf(buffer, pos, stringTable);

      // Extract launch configs from the parsed data
      const entry = extractLaunchConfigs(appId.toString(), vdfData);
      if (entry.launchConfigs.length > 0 || entry.installDir) {
        result.set(appId.toString(), entry);
      }

      // Move to next entry using size field
      // Size includes everything after appId (metadata + VDF data)
      pos = metadataStart + size;
    } catch (error) {
      logger.error(`Error parsing app ${appId} at position ${pos}:`, error);
      break;
    }
  }
}

/**
 * Parses binary VDF keyvalue data using iterative approach (avoids stack overflow)
 * For version 41+, string table indices are used for keys and string values
 */
function parseBinaryVdf(
  buffer: Buffer,
  offset: number,
  stringTable: string[]
): { value: Record<string, unknown>; bytesRead: number } {
  const useStringTable = stringTable.length > 0;

  // Use iterative approach with explicit stack to avoid recursion limits
  const root: Record<string, unknown> = {};
  const stack: { obj: Record<string, unknown>; key?: string }[] = [{ obj: root }];
  let pos = offset;
  let iteration = 0;

  while (pos < buffer.length && stack.length > 0) {
    const typeByte = buffer.readUInt8(pos);
    pos++;
    iteration++;

    if (typeByte === BIN_END) {
      // End of current object - pop from stack
      stack.pop();
      if (stack.length === 0) break;
      continue;
    }

    // Read key
    let key: string;
    if (useStringTable) {
      const keyIndex = buffer.readUInt32LE(pos);
      pos += 4;
      key = stringTable[keyIndex] ?? `unknown_${keyIndex}`;
    } else {
      const keyEnd = buffer.indexOf(0x00, pos);
      if (keyEnd === -1) break;
      key = buffer.toString('utf8', pos, keyEnd);
      pos = keyEnd + 1;
    }

    const current = stack[stack.length - 1].obj;

    switch (typeByte) {
      case BIN_NONE: {
        // Nested object - push new object onto stack
        const nested: Record<string, unknown> = {};
        current[key] = nested;
        stack.push({ obj: nested, key });
        break;
      }

      case BIN_STRING: {
        // String VALUES are always inline null-terminated strings
        // (Only KEYS use string table indices in v41)
        const strEnd = buffer.indexOf(0x00, pos);
        if (strEnd === -1) {
          current[key] = '';
          break;
        }
        current[key] = buffer.toString('utf8', pos, strEnd);
        pos = strEnd + 1;
        break;
      }

      case BIN_INT32:
      case BIN_POINTER:
      case BIN_COLOR: {
        current[key] = buffer.readInt32LE(pos);
        pos += 4;
        break;
      }

      case BIN_FLOAT32: {
        current[key] = buffer.readFloatLE(pos);
        pos += 4;
        break;
      }

      case BIN_WIDESTRING: {
        let strEnd = pos;
        while (strEnd < buffer.length - 1) {
          if (buffer.readUInt16LE(strEnd) === 0) break;
          strEnd += 2;
        }
        current[key] = buffer.toString('utf16le', pos, strEnd);
        pos = strEnd + 2;
        break;
      }

      case BIN_UINT64: {
        current[key] = buffer.readBigUInt64LE(pos).toString();
        pos += 8;
        break;
      }

      case BIN_INT64: {
        current[key] = buffer.readBigInt64LE(pos).toString();
        pos += 8;
        break;
      }

      default: {
        // Unknown type - skip
        break;
      }
    }
  }

  return { value: root, bytesRead: pos - offset };
}

/**
 * Extracts launch configurations from parsed VDF data
 */
function extractLaunchConfigs(appId: string, vdfData: Record<string, unknown>): AppInfoEntry {
  const entry: AppInfoEntry = {
    appId,
    launchConfigs: [],
  };

  try {
    // The VDF structure is: { appinfo: { appid, common, config, ... } }
    const appinfo = vdfData['appinfo'] as Record<string, unknown> | undefined;
    if (!appinfo) return entry;

    // Navigate to config section
    const config = appinfo['config'] as Record<string, unknown> | undefined;
    if (!config) return entry;

    // Get install directory
    const installDir = config['installdir'] as string | undefined;
    if (installDir) {
      entry.installDir = installDir;
    }

    // Navigate to launch section
    const launch = config['launch'] as Record<string, unknown> | undefined;
    if (!launch) return entry;

    // Iterate through launch configurations (keys are "0", "1", "2", etc.)
    for (const [, launchEntry] of Object.entries(launch)) {
      if (typeof launchEntry !== 'object' || launchEntry === null) continue;

      const launchData = launchEntry as Record<string, unknown>;
      const executable = launchData['executable'] as string | undefined;

      if (!executable) continue;

      const launchConfig: AppInfoLaunchConfig = {
        executable,
      };

      // Extract optional fields
      const type = launchData['type'] as string | undefined;
      if (type) launchConfig.type = type;

      const description = launchData['description'] as string | undefined;
      if (description) launchConfig.description = description;

      const workingdir = launchData['workingdir'] as string | undefined;
      if (workingdir) launchConfig.workingdir = workingdir;

      // OS list and arch can be in the launch entry or in a nested config object
      const nestedConfig = launchData['config'] as Record<string, unknown> | undefined;

      let oslist = launchData['oslist'] as string | undefined;
      if (!oslist && nestedConfig) {
        oslist = nestedConfig['oslist'] as string | undefined;
      }
      if (oslist) launchConfig.oslist = oslist;

      let osarch = launchData['osarch'] as string | undefined;
      if (!osarch && nestedConfig) {
        osarch = nestedConfig['osarch'] as string | undefined;
      }
      if (osarch) launchConfig.osarch = osarch;

      entry.launchConfigs.push(launchConfig);
    }
  } catch (error) {
    logger.error(`Error extracting launch configs for app ${appId}:`, error);
  }

  return entry;
}
