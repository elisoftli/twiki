/**
 * Custom 7-zip utility for Electron apps.
 *
 * Uses bundled 7za binaries from resources/7zip/ for Windows (ia32 and x64).
 * Handles path resolution for both dev and production builds.
 */

import { spawn } from 'child_process';
import { app } from 'electron';
import path from 'path';

// =============================================================================
// Binary Path Resolution
// =============================================================================

function get7zaBinaryPath(): string {
  // Binary name based on architecture: ia32-7za.exe or x64-7za.exe
  const binaryName = process.arch === 'x64' ? 'x64-7za.exe' : 'ia32-7za.exe';

  if (app.isPackaged) {
    // In packaged app: binaries are in resources/7zip/
    return path.join(process.resourcesPath, '7zip', binaryName);
  } else {
    // In development: binaries are in resources/7zip/ relative to app root
    return path.join(app.getAppPath(), 'resources', '7zip', binaryName);
  }
}

// Cache the binary path
let cachedBinaryPath: string | null = null;

function getBinaryPath(): string {
  if (!cachedBinaryPath) {
    cachedBinaryPath = get7zaBinaryPath();
  }
  return cachedBinaryPath;
}

// =============================================================================
// Types
// =============================================================================

export interface ListItem {
  name: string;
  size: string;
  compressed: string;
  date: string;
  time: string;
  attr: string;
  crc: string;
  encrypted: string;
  method: string;
  block: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onceify<T extends (...args: any[]) => void>(fn: T): T {
  let called = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: unknown, ...args: any[]) {
    if (called) return;
    called = true;
    fn.apply(this, args);
  } as T;
}

function parseListOutput(str: string): ListItem[] {
  if (!str.length) return [];

  str = str.replace(/(\r\n|\n|\r)/gm, '\n');
  const items = str.split(/^\s*$/m);
  const result: ListItem[] = [];

  const LIST_MAP: Record<string, string> = {
    Path: 'name',
    Size: 'size',
    'Packed Size': 'compressed',
    Attributes: 'attr',
    Modified: 'dateTime',
    CRC: 'crc',
    Method: 'method',
    Block: 'block',
    Encrypted: 'encrypted',
  };

  for (const item of items) {
    if (!item.length) continue;

    const obj: Record<string, string> = {};
    const lines = item.split('\n');

    if (!lines.length) continue;

    for (const line of lines) {
      const data = line.split(/ = (.*)/s);
      if (data.length !== 3) continue;

      const name = data[0].trim();
      const val = data[1].trim();

      if (LIST_MAP[name]) {
        if (LIST_MAP[name] === 'dateTime') {
          const dtArr = val.split(' ');
          if (dtArr.length !== 2) continue;
          obj['date'] = dtArr[0];
          obj['time'] = dtArr[1];
        } else {
          obj[LIST_MAP[name]] = val;
        }
      }
    }

    if (Object.keys(obj).length) {
      result.push(obj as unknown as ListItem);
    }
  }

  return result;
}

function run(
  args: string[],
  callback: (err: Error | null, output?: string | ListItem[]) => void,
): void {
  const cb = onceify(callback);
  const binaryPath = getBinaryPath();

  const proc = spawn(binaryPath, args, { windowsHide: true });
  let output = '';

  proc.on('error', (err: Error) => {
    cb(err);
  });

  proc.on('exit', (code: number | null) => {
    if (code) {
      cb(new Error(`7-zip exited with code ${code}\n${output}`));
    } else if (args[0] === 'l') {
      cb(null, parseListOutput(output));
    } else {
      cb(null, output);
    }
  });

  proc.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Unpack an archive to a destination directory.
 * @param archivePath - Path to the archive to extract
 * @param destPath - Destination directory (optional, extracts to current dir if not provided)
 * @param callback - Callback function
 */
export function unpack(archivePath: string, destPath: string, callback: (err: Error | null) => void): void;
export function unpack(archivePath: string, callback: (err: Error | null) => void): void;
export function unpack(
  archivePath: string,
  destPathOrCallback: string | ((err: Error | null) => void),
  callback?: (err: Error | null) => void,
): void {
  if (typeof destPathOrCallback === 'function') {
    run(['x', archivePath, '-y'], destPathOrCallback);
  } else {
    run(['x', archivePath, '-y', '-o' + destPathOrCallback], callback!);
  }
}

/**
 * Pack files/folders into an archive.
 * @param srcPath - Path to file or folder to compress
 * @param destPath - Path to the archive to create
 * @param callback - Callback function
 */
export function pack(
  srcPath: string,
  destPath: string,
  callback: (err: Error | null) => void,
): void {
  run(['a', destPath, srcPath], callback);
}

/**
 * List contents of an archive.
 * @param archivePath - Path to the archive
 * @param callback - Callback function with list items
 */
export function list(
  archivePath: string,
  callback: (err: Error | null, items?: ListItem[]) => void,
): void {
  run(['l', '-slt', '-ba', archivePath], callback as (err: Error | null, output?: string | ListItem[]) => void);
}

/**
 * Run a custom 7za command.
 * @param args - Array of command arguments
 * @param callback - Callback function
 */
export function cmd(
  args: string[],
  callback: (err: Error | null, output?: string) => void,
): void {
  run(args, callback as (err: Error | null, output?: string | ListItem[]) => void);
}

// =============================================================================
// Promise-based API
// =============================================================================

/**
 * Unpack an archive to a destination directory (Promise version).
 */
export function unpackAsync(archivePath: string, destPath?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    };

    if (destPath) {
      unpack(archivePath, destPath, cb);
    } else {
      unpack(archivePath, cb);
    }
  });
}

/**
 * Pack files/folders into an archive (Promise version).
 */
export function packAsync(srcPath: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    pack(srcPath, destPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * List contents of an archive (Promise version).
 */
export function listAsync(archivePath: string): Promise<ListItem[]> {
  return new Promise((resolve, reject) => {
    list(archivePath, (err, items) => {
      if (err) reject(err);
      else resolve(items || []);
    });
  });
}

/**
 * Run a custom 7za command (Promise version).
 */
export function cmdAsync(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    cmd(args, (err, output) => {
      if (err) reject(err);
      else resolve(output || '');
    });
  });
}
