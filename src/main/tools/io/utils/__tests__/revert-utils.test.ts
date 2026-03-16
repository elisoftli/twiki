/**
 * Tests for revert-utils utility functions
 * Tests surgical revert utilities: inverse operations, file path extraction,
 * conflict detection, and content verification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  AppliedTweak,
  ToolCallEntry,
  EditFileToolResult,
  CreateFileToolResult,
  MoveCopyFileOrDirectoryToolResult,
  ExtractArchiveToolResult,
  DownloadFileToolResult,
  ModifyGameLaunchOptionsToolResult,
  InstallReshadeToolResult,
  AppendToFileToolResult,
  InsertAtPatternToolResult,
  CreateArchiveToolResult,
} from '../../../../interfaces/tweak-agent.interface';
import type { EditOperation } from '../types';

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

// Mock expandWindowsEnvVars and createLogger
vi.mock('../../../../utils', () => ({
  expandWindowsEnvVars: (path: string) => {
    return path
      .replace(/%USERPROFILE%/gi, 'C:\\Users\\TestUser')
      .replace(/%APPDATA%/gi, 'C:\\Users\\TestUser\\AppData\\Roaming')
      .replace(/%LOCALAPPDATA%/gi, 'C:\\Users\\TestUser\\AppData\\Local');
  },
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock unescapeString and normalizeLineEndings
vi.mock('../../../utils', () => ({
  unescapeString: (str: string) =>
    str
      .replace(/\\r\\n/g, '\r\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t'),
  normalizeLineEndings: (str: string) => str.replace(/\r\n/g, '\n'),
}));

import { promises as fs } from 'fs';
import {
  extractModifiedFilePaths,
  detectFileConflicts,
  verifyChangesExist,
} from '../revert.utils';

const mockedFs = vi.mocked(fs);

// Helper to create a base tool call entry
function createToolCallEntry<T extends ToolCallEntry['result']>(
  toolName: ToolCallEntry['toolName'],
  result: T,
  options: Partial<Omit<ToolCallEntry, 'toolName' | 'result'>> = {}
): ToolCallEntry {
  return {
    toolCallId: `call-${Math.random().toString(36).slice(2, 11)}`,
    toolName,
    description: 'Test operation',
    status: 'success',
    timestamp: new Date().toISOString(),
    result,
    ...options,
  };
}

// Helper to create an AppliedTweak
function createAppliedTweak(
  toolCalls: ToolCallEntry[],
  overrides: Partial<AppliedTweak> = {}
): AppliedTweak {
  return {
    pcgwPageId: 12345,
    launcherGameId: 'steam_123',
    tweak: {
      groupTitle: 'Test Group',
      title: 'Test Tweak',
      body: 'Test instructions',
      notes: [],
      hash: 'tweak-1',
    },
    status: 'success',
    summary: {
      status: 'success',
      message: 'Test tweak applied',
      toolCalls,
    },
    appliedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('extractModifiedFilePaths', () => {
  describe('edit-file-tool', () => {
    it('should extract path from edit-file-tool', () => {
      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        operationsApplied: [],
      } as EditFileToolResult);

      const paths = extractModifiedFilePaths([toolCall]);

      expect(paths).toContain('C:\\game\\config.ini');
    });

    it('should expand environment variables', () => {
      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: '%APPDATA%\\Game\\config.ini',
        operationsApplied: [],
      } as EditFileToolResult);

      const paths = extractModifiedFilePaths([toolCall]);

      expect(paths).toContain('C:\\Users\\TestUser\\AppData\\Roaming\\Game\\config.ini');
    });
  });

  describe('create-file-tool', () => {
    it('should extract path from create-file-tool', () => {
      const toolCall = createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'File created',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\newfile.txt',
        bytesWritten: 100,
      } as CreateFileToolResult);

      const paths = extractModifiedFilePaths([toolCall]);

      expect(paths).toContain('C:\\game\\newfile.txt');
    });
  });

  describe('move-copy-file-or-directory-tool', () => {
    it('should extract destination paths from move operations', () => {
      const toolCall = createToolCallEntry('move-copy-file-or-directory-tool', {
        toolName: 'move-copy-file-or-directory-tool',
        success: true,
        message: 'Files moved',
        timestamp: new Date().toISOString(),
        path: 'C:\\game',
        results: [
          { sourcePath: 'C:\\source\\file1.txt', destinationPath: 'C:\\game\\file1.txt', success: true },
          { sourcePath: 'C:\\source\\file2.txt', destinationPath: 'C:\\game\\file2.txt', success: true },
        ],
        successfulOperations: 2,
        failedOperations: 0,
      } as MoveCopyFileOrDirectoryToolResult);

      const paths = extractModifiedFilePaths([toolCall]);

      expect(paths).toContain('C:\\game\\file1.txt');
      expect(paths).toContain('C:\\game\\file2.txt');
    });

    it('should skip failed operations', () => {
      const toolCall = createToolCallEntry('move-copy-file-or-directory-tool', {
        toolName: 'move-copy-file-or-directory-tool',
        success: true,
        message: 'Partial move',
        timestamp: new Date().toISOString(),
        path: 'C:\\game',
        results: [
          { sourcePath: 'C:\\source\\ok.txt', destinationPath: 'C:\\game\\ok.txt', success: true },
          { sourcePath: 'C:\\source\\fail.txt', destinationPath: 'C:\\game\\fail.txt', success: false, error: 'Permission denied' },
        ],
        successfulOperations: 1,
        failedOperations: 1,
      } as MoveCopyFileOrDirectoryToolResult);

      const paths = extractModifiedFilePaths([toolCall]);

      expect(paths).toContain('C:\\game\\ok.txt');
      expect(paths).not.toContain('C:\\game\\fail.txt');
    });
  });

  describe('extract-archive-tool', () => {
    it('should extract extractPath and extractedFiles', () => {
      const toolCall = createToolCallEntry('extract-archive-tool', {
        toolName: 'extract-archive-tool',
        success: true,
        message: 'Archive extracted',
        timestamp: new Date().toISOString(),
        path: 'C:\\downloads\\mod.zip',
        extractPath: 'C:\\game\\mods',
        extractedFiles: ['C:\\game\\mods\\file1.dll', 'C:\\game\\mods\\file2.dll'],
        fileTransfers: [],
        directoriesCreated: [],
      } as ExtractArchiveToolResult);

      const paths = extractModifiedFilePaths([toolCall]);

      expect(paths).toContain('C:\\game\\mods');
      expect(paths).toContain('C:\\game\\mods\\file1.dll');
      expect(paths).toContain('C:\\game\\mods\\file2.dll');
    });
  });

  describe('download-file-tool', () => {
    it('should extract downloadPath and extractedFiles', () => {
      const toolCall = createToolCallEntry('download-file-tool', {
        toolName: 'download-file-tool',
        success: true,
        message: 'File downloaded',
        timestamp: new Date().toISOString(),
        downloadPath: 'C:\\downloads\\mod.zip',
        extractPath: 'C:\\downloads\\mod',
        extractedFiles: ['C:\\downloads\\mod\\plugin.dll'],
        resolvedUrl: 'https://example.com/mod.zip',
        hosterUsed: 'direct',
        fileSize: 1024,
      } as DownloadFileToolResult);

      const paths = extractModifiedFilePaths([toolCall]);

      expect(paths).toContain('C:\\downloads\\mod.zip');
      expect(paths).toContain('C:\\downloads\\mod\\plugin.dll');
    });
  });

  describe('modify-game-launch-options-tool', () => {
    it('should extract path from launch options modification', () => {
      const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
        toolName: 'modify-game-launch-options-tool',
        success: true,
        message: 'Launch options modified',
        timestamp: new Date().toISOString(),
        path: 'C:\\Steam\\userdata\\123\\config\\localconfig.vdf',
        launcher: 'steam',
        modificationDetails: 'Added -fullscreen',
      } as ModifyGameLaunchOptionsToolResult);

      const paths = extractModifiedFilePaths([toolCall]);

      expect(paths).toContain('C:\\Steam\\userdata\\123\\config\\localconfig.vdf');
    });
  });

  describe('install-reshade-tool', () => {
    it('should extract all installed file paths', () => {
      const toolCall = createToolCallEntry('install-reshade-tool', {
        toolName: 'install-reshade-tool',
        success: true,
        message: 'ReShade installed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game',
        gameDirectory: 'C:\\game',
        installedFiles: [
          { destPath: 'C:\\game\\dxgi.dll', backupPath: null, wasNewFile: true },
          { destPath: 'C:\\game\\addon.addon64', backupPath: null, wasNewFile: true },
        ],
        actualDllName: 'dxgi.dll',
        detectedArchitecture: '64',
        graphicsApi: 'd3d11',
      } as InstallReshadeToolResult);

      const paths = extractModifiedFilePaths([toolCall]);

      expect(paths).toContain('C:\\game\\dxgi.dll');
      expect(paths).toContain('C:\\game\\addon.addon64');
    });
  });

  describe('other tool types', () => {
    it('should extract paths from append-to-file-tool', () => {
      const toolCall = createToolCallEntry('append-to-file-tool', {
        toolName: 'append-to-file-tool',
        success: true,
        message: 'Content appended',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\log.txt',
        linesAppended: 5,
      } as AppendToFileToolResult);

      const paths = extractModifiedFilePaths([toolCall]);

      expect(paths).toContain('C:\\game\\log.txt');
    });

    it('should extract paths from insert-at-pattern-tool', () => {
      const toolCall = createToolCallEntry('insert-at-pattern-tool', {
        toolName: 'insert-at-pattern-tool',
        success: true,
        message: 'Content inserted',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        matchedLine: 10,
      } as InsertAtPatternToolResult);

      const paths = extractModifiedFilePaths([toolCall]);

      expect(paths).toContain('C:\\game\\config.ini');
    });

    it('should extract paths from create-archive-tool', () => {
      const toolCall = createToolCallEntry('create-archive-tool', {
        toolName: 'create-archive-tool',
        success: true,
        message: 'Archive created',
        timestamp: new Date().toISOString(),
        path: 'C:\\backups\\backup.zip',
        sourceCleanedUp: false,
      } as CreateArchiveToolResult);

      const paths = extractModifiedFilePaths([toolCall]);

      expect(paths).toContain('C:\\backups\\backup.zip');
    });
  });

  describe('deduplication', () => {
    it('should deduplicate paths across multiple tool calls', () => {
      const toolCall1 = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'First edit',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        operationsApplied: [],
      } as EditFileToolResult);

      const toolCall2 = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Second edit',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini', // Same path
        operationsApplied: [],
      } as EditFileToolResult);

      const paths = extractModifiedFilePaths([toolCall1, toolCall2]);

      expect(paths).toHaveLength(1);
      expect(paths).toContain('C:\\game\\config.ini');
    });
  });

  describe('skipping failed operations', () => {
    it('should skip tool calls with success=false', () => {
      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: false,
        message: 'Edit failed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        operationsApplied: [],
      } as EditFileToolResult);

      const paths = extractModifiedFilePaths([toolCall]);

      expect(paths).toHaveLength(0);
    });
  });
});

describe('detectFileConflicts', () => {
  it('should detect conflicts when same file modified by multiple tweaks', () => {
    const targetTweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        operationsApplied: [],
      } as EditFileToolResult),
    ], { pcgwPageId: 100 });

    const otherTweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Also edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini', // Same file
        operationsApplied: [],
      } as EditFileToolResult),
    ], { pcgwPageId: 200, tweak: { groupTitle: 'Other Group', title: 'Other Tweak', body: null, notes: [], hash: 'tweak-2' } });

    const conflicts = detectFileConflicts(targetTweak, [targetTweak, otherTweak]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].filePath.toLowerCase()).toBe('c:\\game\\config.ini');
    expect(conflicts[0].conflictType).toBe('content_modified');
    expect(conflicts[0].otherTweaks).toHaveLength(1);
    expect(conflicts[0].otherTweaks[0].hash).toBe('tweak-2');
    expect(conflicts[0].otherTweaks[0].title).toBe('Other Tweak');
  });

  it('should not detect conflict with itself', () => {
    const tweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        operationsApplied: [],
      } as EditFileToolResult),
    ]);

    const conflicts = detectFileConflicts(tweak, [tweak]);

    expect(conflicts).toHaveLength(0);
  });

  it('should not detect conflict for different files', () => {
    const targetTweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Edited file A',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config_a.ini',
        operationsApplied: [],
      } as EditFileToolResult),
    ], { pcgwPageId: 100 });

    const otherTweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Edited file B',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config_b.ini', // Different file
        operationsApplied: [],
      } as EditFileToolResult),
    ], { pcgwPageId: 200 });

    const conflicts = detectFileConflicts(targetTweak, [targetTweak, otherTweak]);

    expect(conflicts).toHaveLength(0);
  });

  it('should handle case-insensitive path comparison', () => {
    const targetTweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\Game\\Config.ini',
        operationsApplied: [],
      } as EditFileToolResult),
    ], { pcgwPageId: 100 });

    const otherTweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Also edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\GAME\\CONFIG.INI', // Same file, different case
        operationsApplied: [],
      } as EditFileToolResult),
    ], { pcgwPageId: 200, tweak: { groupTitle: 'Other Group', title: 'Other', body: null, notes: [], hash: 'tweak-2' } });

    const conflicts = detectFileConflicts(targetTweak, [targetTweak, otherTweak]);

    expect(conflicts).toHaveLength(1);
  });

  it('should detect multiple conflicts', () => {
    const targetTweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Edited 1',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\file1.ini',
        operationsApplied: [],
      } as EditFileToolResult),
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Edited 2',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\file2.ini',
        operationsApplied: [],
      } as EditFileToolResult),
    ], { pcgwPageId: 100 });

    const otherTweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Conflicting edit',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\file1.ini',
        operationsApplied: [],
      } as EditFileToolResult),
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Another conflicting edit',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\file2.ini',
        operationsApplied: [],
      } as EditFileToolResult),
    ], { pcgwPageId: 200, tweak: { groupTitle: 'Conflict Group', title: 'Conflicting Tweak', body: null, notes: [], hash: 'tweak-2' } });

    const conflicts = detectFileConflicts(targetTweak, [targetTweak, otherTweak]);

    expect(conflicts).toHaveLength(2);
  });
});

describe('verifyChangesExist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return allFound=true when all changes exist', async () => {
    mockedFs.readFile.mockResolvedValue('content with newString here');

    const tweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        operationsApplied: [
          { oldString: 'oldValue', newString: 'newString' },
        ],
      } as EditFileToolResult),
    ]);

    const result = await verifyChangesExist(tweak);

    expect(result.allFound).toBe(true);
    expect(result.notFound).toHaveLength(0);
  });

  it('should detect when changes are not found', async () => {
    mockedFs.readFile.mockResolvedValue('content without the expected string');

    const operation: EditOperation = { oldString: 'old', newString: 'missing_new' };
    const tweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        operationsApplied: [operation],
      } as EditFileToolResult),
    ]);

    const result = await verifyChangesExist(tweak);

    expect(result.allFound).toBe(false);
    expect(result.notFound).toHaveLength(1);
    expect(result.notFound[0].filePath).toBe('C:\\game\\config.ini');
    expect(result.notFound[0].operation).toEqual(operation);
  });

  it('should handle appendToEnd operations', async () => {
    mockedFs.readFile.mockResolvedValue('original content\nappended content');

    const tweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Appended',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        operationsApplied: [
          { oldString: '', newString: 'appended content', appendToEnd: true },
        ],
      } as EditFileToolResult),
    ]);

    const result = await verifyChangesExist(tweak);

    expect(result.allFound).toBe(true);
  });

  it('should detect missing appendToEnd content', async () => {
    mockedFs.readFile.mockResolvedValue('original content only');

    const operation: EditOperation = { oldString: '', newString: 'missing appended', appendToEnd: true };
    const tweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Appended',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        operationsApplied: [operation],
      } as EditFileToolResult),
    ]);

    const result = await verifyChangesExist(tweak);

    expect(result.allFound).toBe(false);
    expect(result.notFound).toHaveLength(1);
  });

  it('should skip non-edit-file-tool operations', async () => {
    const tweak = createAppliedTweak([
      createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'File created',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\newfile.txt',
        bytesWritten: 100,
      } as CreateFileToolResult),
    ]);

    const result = await verifyChangesExist(tweak);

    expect(result.allFound).toBe(true);
    expect(result.notFound).toHaveLength(0);
    expect(mockedFs.readFile).not.toHaveBeenCalled();
  });

  it('should skip failed tool calls', async () => {
    const tweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: false,
        message: 'Failed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        operationsApplied: [],
      } as EditFileToolResult),
    ]);

    const result = await verifyChangesExist(tweak);

    expect(result.allFound).toBe(true);
    expect(mockedFs.readFile).not.toHaveBeenCalled();
  });

  it('should handle file read errors and report operations as not found', async () => {
    mockedFs.readFile.mockRejectedValue(new Error('ENOENT: file not found'));

    const operation: EditOperation = { oldString: 'old', newString: 'new' };
    const tweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\deleted_config.ini',
        operationsApplied: [operation],
      } as EditFileToolResult),
    ]);

    // Should not throw, but operations should be reported as not found
    const result = await verifyChangesExist(tweak);

    expect(result.allFound).toBe(false);
    expect(result.notFound).toHaveLength(1);
    expect(result.notFound[0].filePath).toBe('C:\\game\\deleted_config.ini');
  });

  it('should handle empty operationsApplied array', async () => {
    const tweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        operationsApplied: [],
      } as EditFileToolResult),
    ]);

    mockedFs.readFile.mockResolvedValue('some content');

    const result = await verifyChangesExist(tweak);

    expect(result.allFound).toBe(true);
    expect(mockedFs.readFile).not.toHaveBeenCalled();
  });

  it('should expand environment variables in paths', async () => {
    mockedFs.readFile.mockResolvedValue('content with expected_value');

    const tweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Edited',
        timestamp: new Date().toISOString(),
        path: '%APPDATA%\\Game\\config.ini',
        operationsApplied: [{ oldString: 'old', newString: 'expected_value' }],
      } as EditFileToolResult),
    ]);

    await verifyChangesExist(tweak);

    expect(mockedFs.readFile).toHaveBeenCalledWith(
      'C:\\Users\\TestUser\\AppData\\Roaming\\Game\\config.ini',
      'utf-8'
    );
  });

  it('should normalize CRLF line endings to match stored LF operations', async () => {
    // File has CRLF line endings (Windows)
    mockedFs.readFile.mockResolvedValue('[Section]\r\nkey=value\r\n');

    const tweak = createAppliedTweak([
      createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'Edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        // Stored operation has LF line endings (as saved by edit-file)
        operationsApplied: [{ oldString: '[OldSection]', newString: '[Section]\nkey=value\n' }],
      } as EditFileToolResult),
    ]);

    const result = await verifyChangesExist(tweak);

    // Should find the content despite CRLF vs LF difference
    expect(result.allFound).toBe(true);
    expect(result.notFound).toHaveLength(0);
  });
});
