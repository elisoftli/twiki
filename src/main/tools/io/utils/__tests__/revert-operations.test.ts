/**
 * Tests for revert-operations utility
 * Tests reverting various tool operations: file edits, file creations, file moves,
 * registry changes, Steam launch options, and file attributes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { revertTweak } from '../revert.utils';
import type {
  TweakSummary,
  ToolCallEntry,
  EditFileToolResult,
  CreateFileToolResult,
  MoveCopyFileOrDirectoryToolResult,
  ReadEditRegistryToolResult,
  ModifyGameLaunchOptionsToolResult,
  SetFileAttributesToolResult,
  InsertAtPatternToolResult,
  AppendToFileToolResult,
  CreateArchiveToolResult,
  DownloadFileToolResult,
  ExtractArchiveToolResult,
  InstallReshadeToolResult,
} from '../../../../interfaces/tweak-agent.interface';

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    copyFile: vi.fn(),
    unlink: vi.fn(),
    stat: vi.fn(),
    rm: vi.fn(),
    readdir: vi.fn(),
    rmdir: vi.fn(),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

// Mock expandWindowsEnvVars
vi.mock('../../../../utils', () => ({
  expandWindowsEnvVars: (path: string) => {
    return path
      .replace(/%USERPROFILE%/gi, 'C:\\Users\\TestUser')
      .replace(/%APPDATA%/gi, 'C:\\Users\\TestUser\\AppData\\Roaming')
      .replace(/%LOCALAPPDATA%/gi, 'C:\\Users\\TestUser\\AppData\\Local');
  },
}));

// Mock setFileAttributes
vi.mock('../../../system/utils', () => ({
  readEditRegistry: vi.fn(),
  setFileAttributes: vi.fn(),
}));

// Mock Steam utils
vi.mock('../../../game-launcher/utils', () => ({
  killSteam: vi.fn(),
  waitForSteamTermination: vi.fn(),
  startSteam: vi.fn(),
}));

// Mock shortcut utils for manual game revert
vi.mock('../../../../utils/shortcut.utils', () => ({
  deleteShortcut: vi.fn(),
  updateShortcutArgs: vi.fn(),
}));

// Mock GameLibraryService for manual game revert
vi.mock('../../../../services/game/game-library.service', () => ({
  GameLibraryService: {
    getInstance: vi.fn().mockReturnValue({
      removeTwikiLaunchConfig: vi.fn().mockResolvedValue(true),
    }),
  },
}));

// Mock moveCopyFileOrDirectory
vi.mock('../move-copy-file-or-directory.utils', () => ({
  moveCopyFileOrDirectory: vi.fn(),
}));

// Mock file read/write utilities for surgical revert (from tool.utils)
vi.mock('../../../tool.utils', () => ({
  readFileNormalized: vi.fn(),
  writeFileWithLineEnding: vi.fn(),
  unescapeString: (str: string) =>
    str
      .replace(/\\r\\n/g, '\r\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t'),
  normalizeLineEndings: (str: string) => str.replace(/\r\n/g, '\n'),
}));

import { promises as fs } from 'fs';
import { readEditRegistry, setFileAttributes } from '../../../system/utils';
import { killSteam, waitForSteamTermination, startSteam } from '../../../game-launcher/utils';
import { moveCopyFileOrDirectory } from '../move-copy-file-or-directory.utils';
import { readFileNormalized, writeFileWithLineEnding } from '../../../tool.utils';
import { deleteShortcut, updateShortcutArgs } from '../../../../utils/shortcut.utils';
import { GameLibraryService } from '../../../../services/game/game-library.service';

const mockedFs = vi.mocked(fs);
const mockedReadFileNormalized = vi.mocked(readFileNormalized);
const mockedWriteFileWithLineEnding = vi.mocked(writeFileWithLineEnding);
const mockedReadEditRegistry = vi.mocked(readEditRegistry);
const mockedSetFileAttributes = vi.mocked(setFileAttributes);
const mockedKillSteam = vi.mocked(killSteam);
const mockedWaitForSteamTermination = vi.mocked(waitForSteamTermination);
const mockedStartSteam = vi.mocked(startSteam);
const mockedMoveCopyFileOrDirectory = vi.mocked(moveCopyFileOrDirectory);
const mockedDeleteShortcut = vi.mocked(deleteShortcut);
const mockedUpdateShortcutArgs = vi.mocked(updateShortcutArgs);
const mockedGameLibraryService = vi.mocked(GameLibraryService);

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

// Helper to create a TweakSummary
function createTweakSummary(toolCalls: ToolCallEntry[]): TweakSummary {
  return {
    status: 'success',
    message: 'Test tweak',
    toolCalls,
  };
}

describe('revertTweak', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default successful mocks
    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.copyFile.mockResolvedValue(undefined);
    mockedFs.unlink.mockResolvedValue(undefined);
    mockedFs.stat.mockResolvedValue({ isDirectory: () => false } as any);
    mockedFs.rm.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue([]);
    mockedFs.rmdir.mockResolvedValue(undefined);
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedSetFileAttributes.mockResolvedValue({ path: '', attributes: [] });
    mockedKillSteam.mockResolvedValue(undefined);
    mockedWaitForSteamTermination.mockResolvedValue(undefined);
    mockedStartSteam.mockResolvedValue(undefined);
    mockedReadEditRegistry.mockResolvedValue({
      results: [{ success: true, keyPath: '', valueName: '', operationType: 'set' }],
      successfulOperations: 1,
      failedOperations: 0,
    });
    mockedMoveCopyFileOrDirectory.mockResolvedValue({
      results: [{ sourcePath: '', destinationPath: '', success: true }],
      successfulOperations: 1,
      failedOperations: 0,
    });
    // Mock for surgical revert
    mockedReadFileNormalized.mockResolvedValue({ content: '', lineEnding: '\n' });
    mockedWriteFileWithLineEnding.mockResolvedValue(undefined);
    // Mock for manual game revert
    mockedDeleteShortcut.mockResolvedValue(undefined);
    mockedUpdateShortcutArgs.mockResolvedValue('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('revertEditFileOperations (surgical revert for edit-file-tool)', () => {
    it('should surgically revert edit-file-tool by applying inverse operations', async () => {
      // Mock file content with the "new" value that was set by the tweak
      mockedReadFileNormalized.mockResolvedValue({
        content: 'key=newValue',
        lineEnding: '\n',
      });

      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        operationsApplied: [
          { oldString: 'key=oldValue', newString: 'key=newValue', replaceAll: false },
        ],
      } as EditFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      // Should read the file, write the reverted content, and delete backup
      expect(mockedReadFileNormalized).toHaveBeenCalledWith('C:\\game\\config.ini');
      expect(mockedWriteFileWithLineEnding).toHaveBeenCalledWith(
        'C:\\game\\config.ini',
        'key=oldValue',
        '\n'
      );
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\config.ini.backup');
    });

    it('should fall back to backup restore for legacy edit-file-tool (operationsApplied is number)', async () => {
      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        operationsApplied: 1, // Legacy format: number instead of array
      } as unknown as EditFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      // Should use backup restore
      expect(mockedFs.copyFile).toHaveBeenCalledWith(
        'C:\\game\\config.ini.backup',
        'C:\\game\\config.ini'
      );
    });

    it('should succeed with empty operationsApplied (nothing to revert)', async () => {
      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        operationsApplied: [],
      } as EditFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      // Should clean up backup even with no operations
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\config.ini.backup');
    });

    it('should fail surgical revert if newString not found in file', async () => {
      // File content doesn't contain the expected newString
      mockedReadFileNormalized.mockResolvedValue({
        content: 'key=someOtherValue',
        lineEnding: '\n',
      });

      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        operationsApplied: [
          { oldString: 'key=oldValue', newString: 'key=newValue', replaceAll: false },
        ],
      } as EditFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('error');
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('not found in file');
    });

    it('should handle CRLF in stored operation matching LF-normalized content', async () => {
      // File content is normalized to LF
      mockedReadFileNormalized.mockResolvedValue({
        content: 'line1\nline2\nline3',
        lineEnding: '\r\n', // Original file had CRLF
      });

      // Operation was stored with escaped CRLF (\\r\\n)
      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        operationsApplied: [
          { oldString: 'original', newString: 'line1\\r\\nline2', replaceAll: false },
        ],
      } as EditFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      // The CRLF in newString should be normalized to LF and match the content
      expect(mockedWriteFileWithLineEnding).toHaveBeenCalledWith(
        'C:\\game\\config.ini',
        'original\nline3',
        '\r\n'
      );
    });
  });

  describe('removeAppendedContent (appendToEnd operations)', () => {
    it('should remove content appended at end of file (with leading newline)', async () => {
      mockedReadFileNormalized.mockResolvedValue({
        content: 'original content\nappended section',
        lineEnding: '\n',
      });

      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        operationsApplied: [
          { oldString: '', newString: 'appended section', appendToEnd: true },
        ],
      } as EditFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedWriteFileWithLineEnding).toHaveBeenCalledWith(
        'C:\\game\\config.ini',
        'original content',
        '\n'
      );
    });

    it('should remove content appended at end of file (without leading newline)', async () => {
      mockedReadFileNormalized.mockResolvedValue({
        content: 'original contentappended',
        lineEnding: '\n',
      });

      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        operationsApplied: [
          { oldString: '', newString: 'appended', appendToEnd: true },
        ],
      } as EditFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedWriteFileWithLineEnding).toHaveBeenCalledWith(
        'C:\\game\\config.ini',
        'original content',
        '\n'
      );
    });

    it('should remove last occurrence if appended content moved from end', async () => {
      // Content was appended but is now in the middle (file was modified after)
      mockedReadFileNormalized.mockResolvedValue({
        content: 'start appended_text middle appended_text end',
        lineEnding: '\n',
      });

      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        operationsApplied: [
          { oldString: '', newString: 'appended_text', appendToEnd: true },
        ],
      } as EditFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      // Should remove the LAST occurrence
      expect(mockedWriteFileWithLineEnding).toHaveBeenCalledWith(
        'C:\\game\\config.ini',
        'start appended_text middle  end',
        '\n'
      );
    });

    it('should fail if appended content not found anywhere', async () => {
      mockedReadFileNormalized.mockResolvedValue({
        content: 'completely different content',
        lineEnding: '\n',
      });

      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        operationsApplied: [
          { oldString: '', newString: 'missing content', appendToEnd: true },
        ],
      } as EditFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('error');
      expect(result.results[0].success).toBe(false);
    });

    it('should handle multiline appended content with CRLF normalization', async () => {
      mockedReadFileNormalized.mockResolvedValue({
        content: 'header\n[NewSection]\nkey=value',
        lineEnding: '\r\n',
      });

      // Operation stored with escaped CRLF
      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        operationsApplied: [
          { oldString: '', newString: '[NewSection]\\r\\nkey=value', appendToEnd: true },
        ],
      } as EditFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedWriteFileWithLineEnding).toHaveBeenCalledWith(
        'C:\\game\\config.ini',
        'header',
        '\r\n'
      );
    });

    it('should handle content that is the entire file', async () => {
      mockedReadFileNormalized.mockResolvedValue({
        content: 'entire file content',
        lineEnding: '\n',
      });

      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        operationsApplied: [
          { oldString: '', newString: 'entire file content', appendToEnd: true },
        ],
      } as EditFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedWriteFileWithLineEnding).toHaveBeenCalledWith(
        'C:\\game\\config.ini',
        '',
        '\n'
      );
    });
  });

  describe('revertFromBackup (insert-at-pattern-tool, append-to-file-tool, create-archive-tool)', () => {
    it('should revert insert-at-pattern-tool from backup', async () => {
      const toolCall = createToolCallEntry('insert-at-pattern-tool', {
        toolName: 'insert-at-pattern-tool',
        success: true,
        message: 'Pattern inserted',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\settings.cfg',
        backupPath: 'C:\\game\\settings.cfg.bak',
        matchedLine: 10,
      } as InsertAtPatternToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedFs.copyFile).toHaveBeenCalledWith(
        'C:\\game\\settings.cfg.bak',
        'C:\\game\\settings.cfg'
      );
    });

    it('should revert append-to-file-tool from backup', async () => {
      const toolCall = createToolCallEntry('append-to-file-tool', {
        toolName: 'append-to-file-tool',
        success: true,
        message: 'Content appended',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\log.txt',
        backupPath: 'C:\\game\\log.txt.backup',
        linesAppended: 5,
      } as AppendToFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
    });

    it('should revert create-archive-tool from backup', async () => {
      const toolCall = createToolCallEntry('create-archive-tool', {
        toolName: 'create-archive-tool',
        success: true,
        message: 'Archive created',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\backup.zip',
        backupPath: 'C:\\game\\original.backup',
        sourceCleanedUp: true,
      } as CreateArchiveToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
    });

    it('should fail when backup path is not available (for non-edit-file tools)', async () => {
      const toolCall = createToolCallEntry('insert-at-pattern-tool', {
        toolName: 'insert-at-pattern-tool',
        success: true,
        message: 'Pattern inserted',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        // No backupPath
        matchedLine: 10,
      } as InsertAtPatternToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('error');
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('No backup path available');
    });

    it('should fail when backup file does not exist', async () => {
      mockedFs.access.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const toolCall = createToolCallEntry('insert-at-pattern-tool', {
        toolName: 'insert-at-pattern-tool',
        success: true,
        message: 'Pattern inserted',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        matchedLine: 10,
      } as InsertAtPatternToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('error');
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('ENOENT');
    });

    it('should remove read-only attribute before restoring backup', async () => {
      const toolCall = createToolCallEntry('insert-at-pattern-tool', {
        toolName: 'insert-at-pattern-tool',
        success: true,
        message: 'Pattern inserted',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        matchedLine: 10,
      } as InsertAtPatternToolResult);

      const summary = createTweakSummary([toolCall]);
      await revertTweak(summary);

      expect(mockedSetFileAttributes).toHaveBeenCalledWith({
        filePath: 'C:\\game\\config.ini',
        readOnly: false,
      });
    });
  });

  describe('revertFileCreation (create-file-tool)', () => {
    it('should delete a created file', async () => {
      const toolCall = createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'File created',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\newfile.txt',
        bytesWritten: 100,
      } as CreateFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\newfile.txt');
    });

    it('should remove a created directory recursively', async () => {
      mockedFs.stat.mockResolvedValue({ isDirectory: () => true } as any);

      const toolCall = createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'Directory created',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\newfolder',
        bytesWritten: 0,
      } as CreateFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedFs.rm).toHaveBeenCalledWith('C:\\game\\newfolder', { recursive: true });
    });

    it('should succeed if file already deleted (ENOENT)', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockedFs.stat.mockRejectedValue(error);

      const toolCall = createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'File created',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\alreadydeleted.txt',
        bytesWritten: 100,
      } as CreateFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(result.results[0].success).toBe(true);
    });

    it('should fail on permission error', async () => {
      const error = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      mockedFs.stat.mockRejectedValue(error);

      const toolCall = createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'File created',
        timestamp: new Date().toISOString(),
        path: 'C:\\system\\protected.txt',
        bytesWritten: 100,
      } as CreateFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('error');
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('EACCES');
    });
  });

  describe('revertFileMoves (move-copy-file-or-directory-tool)', () => {
    it('should reverse a move operation', async () => {
      const toolCall = createToolCallEntry('move-copy-file-or-directory-tool', {
        toolName: 'move-copy-file-or-directory-tool',
        success: true,
        message: 'File moved',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\oldname.txt',
        results: [
          {
            sourcePath: 'C:\\game\\oldname.txt',
            destinationPath: 'C:\\game\\newname.txt',
            success: true,
            wasCopy: false,
          },
        ],
        successfulOperations: 1,
        failedOperations: 0,
      } as MoveCopyFileOrDirectoryToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      // Should call moveCopyFileOrDirectory to reverse the move
      expect(mockedMoveCopyFileOrDirectory).toHaveBeenCalledWith({
        operations: [
          {
            sourcePath: 'C:\\game\\newname.txt',
            destinationPath: 'C:\\game\\oldname.txt',
            skipBackup: true,
          },
        ],
      });
    });

    it('should delete copied files without reversing', async () => {
      mockedFs.stat.mockResolvedValue({ isDirectory: () => false } as any);

      const toolCall = createToolCallEntry('move-copy-file-or-directory-tool', {
        toolName: 'move-copy-file-or-directory-tool',
        success: true,
        message: 'File copied',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\source.txt',
        results: [
          {
            sourcePath: 'C:\\game\\source.txt',
            destinationPath: 'C:\\game\\copy.txt',
            success: true,
            wasCopy: true,
          },
        ],
        successfulOperations: 1,
        failedOperations: 0,
      } as MoveCopyFileOrDirectoryToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\copy.txt');
    });

    it('should restore from backup when overwrite occurred', async () => {
      const toolCall = createToolCallEntry('move-copy-file-or-directory-tool', {
        toolName: 'move-copy-file-or-directory-tool',
        success: true,
        message: 'File moved with overwrite',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\file.txt',
        results: [
          {
            sourcePath: 'C:\\game\\newfile.txt',
            destinationPath: 'C:\\game\\existing.txt',
            backupPath: 'C:\\game\\existing.txt.backup',
            success: true,
            wasCopy: false,
          },
        ],
        successfulOperations: 1,
        failedOperations: 0,
      } as MoveCopyFileOrDirectoryToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedMoveCopyFileOrDirectory).toHaveBeenCalledWith({
        operations: [
          {
            sourcePath: 'C:\\game\\existing.txt.backup',
            destinationPath: 'C:\\game\\existing.txt',
            skipBackup: true,
          },
        ],
      });
    });

    it('should handle granular file transfers for directory merge', async () => {
      const toolCall = createToolCallEntry('move-copy-file-or-directory-tool', {
        toolName: 'move-copy-file-or-directory-tool',
        success: true,
        message: 'Directory merged',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\source',
        results: [
          {
            sourcePath: 'C:\\game\\source',
            destinationPath: 'C:\\game\\dest',
            success: true,
            wasCopy: false,
            fileTransfers: [
              {
                sourcePath: 'C:\\game\\source\\file1.txt',
                destinationPath: 'C:\\game\\dest\\file1.txt',
                wasOverwrite: false,
              },
              {
                sourcePath: 'C:\\game\\source\\file2.txt',
                destinationPath: 'C:\\game\\dest\\file2.txt',
                wasOverwrite: true,
                backupPath: 'C:\\game\\dest\\file2.txt.backup',
              },
            ],
            directoriesCreated: [{ path: 'C:\\game\\dest\\subdir' }],
          },
        ],
        successfulOperations: 1,
        failedOperations: 0,
      } as MoveCopyFileOrDirectoryToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
    });

    it('should skip failed operations in the original results', async () => {
      const toolCall = createToolCallEntry('move-copy-file-or-directory-tool', {
        toolName: 'move-copy-file-or-directory-tool',
        success: true,
        message: 'Partial move',
        timestamp: new Date().toISOString(),
        path: 'C:\\game',
        results: [
          {
            sourcePath: 'C:\\game\\good.txt',
            destinationPath: 'C:\\game\\moved.txt',
            success: true,
            wasCopy: false,
          },
          {
            sourcePath: 'C:\\game\\bad.txt',
            destinationPath: 'C:\\game\\failed.txt',
            success: false,
            error: 'Permission denied',
          },
        ],
        successfulOperations: 1,
        failedOperations: 1,
      } as MoveCopyFileOrDirectoryToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      // Should only revert the successful operation
      expect(mockedMoveCopyFileOrDirectory).toHaveBeenCalledTimes(1);
    });
  });

  describe('revertRegistryChanges (read-edit-registry-tool)', () => {
    it('should restore previous registry value', async () => {
      const toolCall = createToolCallEntry('read-edit-registry-tool', {
        toolName: 'read-edit-registry-tool',
        success: true,
        message: 'Registry modified',
        timestamp: new Date().toISOString(),
        path: 'HKCU\\Software\\Game',
        results: [
          {
            keyPath: 'HKEY_CURRENT_USER\\Software\\Game',
            valueName: 'Setting',
            operationType: 'set',
            success: true,
            value: 1,
            previousValue: 0,
            previousType: 'REG_DWORD',
          },
        ],
        successfulOperations: 1,
        failedOperations: 0,
      } as ReadEditRegistryToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedReadEditRegistry).toHaveBeenCalledWith({
        operations: [
          {
            operationType: 'set',
            keyPath: 'HKEY_CURRENT_USER\\Software\\Game',
            valueName: 'Setting',
            valueType: 'REG_DWORD',
            data: 0,
          },
        ],
      });
    });

    it('should delete registry value if it did not exist before', async () => {
      const toolCall = createToolCallEntry('read-edit-registry-tool', {
        toolName: 'read-edit-registry-tool',
        success: true,
        message: 'Registry created',
        timestamp: new Date().toISOString(),
        path: 'HKCU\\Software\\Game',
        results: [
          {
            keyPath: 'HKEY_CURRENT_USER\\Software\\Game',
            valueName: 'NewSetting',
            operationType: 'set',
            success: true,
            value: 'NewValue',
            previousValue: null,
          },
        ],
        successfulOperations: 1,
        failedOperations: 0,
      } as ReadEditRegistryToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedReadEditRegistry).toHaveBeenCalledWith({
        operations: [
          {
            operationType: 'delete',
            keyPath: 'HKEY_CURRENT_USER\\Software\\Game',
            valueName: 'NewSetting',
          },
        ],
      });
    });

    it('should skip read operations', async () => {
      const toolCall = createToolCallEntry('read-edit-registry-tool', {
        toolName: 'read-edit-registry-tool',
        success: true,
        message: 'Registry read',
        timestamp: new Date().toISOString(),
        path: 'HKCU\\Software\\Game',
        results: [
          {
            keyPath: 'HKEY_CURRENT_USER\\Software\\Game',
            valueName: 'Setting',
            operationType: 'read',
            success: true,
            value: 1,
          },
        ],
        successfulOperations: 1,
        failedOperations: 0,
      } as ReadEditRegistryToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedReadEditRegistry).not.toHaveBeenCalled();
    });

    it('should handle registry revert errors', async () => {
      mockedReadEditRegistry.mockResolvedValue({
        results: [{ success: false, error: 'Access denied', keyPath: '', valueName: '', operationType: 'set' }],
        successfulOperations: 0,
        failedOperations: 1,
      });

      const toolCall = createToolCallEntry('read-edit-registry-tool', {
        toolName: 'read-edit-registry-tool',
        success: true,
        message: 'Registry modified',
        timestamp: new Date().toISOString(),
        path: 'HKLM\\Software\\Game',
        results: [
          {
            keyPath: 'HKEY_LOCAL_MACHINE\\Software\\Game',
            valueName: 'Setting',
            operationType: 'set',
            success: true,
            value: 1,
            previousValue: 0,
            previousType: 'REG_DWORD',
          },
        ],
        successfulOperations: 1,
        failedOperations: 0,
      } as ReadEditRegistryToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('error');
      expect(result.results[0].error).toContain('Failed to restore');
    });
  });

  describe('revertLaunchOptions (modify-game-launch-options-tool)', () => {
    it('should restore Steam launch options from backup', async () => {
      const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
        toolName: 'modify-game-launch-options-tool',
        success: true,
        message: 'Launch options modified',
        timestamp: new Date().toISOString(),
        path: 'C:\\Steam\\userdata\\123\\config\\localconfig.vdf',
        launcher: 'steam',
        backupPath: 'C:\\Steam\\userdata\\123\\config\\localconfig.vdf.backup_1234567890',
        modificationDetails: 'Added -fullscreen',
      } as ModifyGameLaunchOptionsToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedKillSteam).toHaveBeenCalled();
      expect(mockedWaitForSteamTermination).toHaveBeenCalledWith(10000);
      expect(mockedFs.copyFile).toHaveBeenCalledWith(
        'C:\\Steam\\userdata\\123\\config\\localconfig.vdf.backup_1234567890',
        'C:\\Steam\\userdata\\123\\config\\localconfig.vdf'
      );
      expect(mockedFs.unlink).toHaveBeenCalledWith(
        'C:\\Steam\\userdata\\123\\config\\localconfig.vdf.backup_1234567890'
      );
      expect(mockedStartSteam).toHaveBeenCalled();
    });

    it('should fail when no backup path available', async () => {
      const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
        toolName: 'modify-game-launch-options-tool',
        success: true,
        message: 'Launch options modified',
        timestamp: new Date().toISOString(),
        path: 'C:\\Steam\\userdata\\123\\config\\localconfig.vdf',
        launcher: 'steam',
        // No backupPath
        modificationDetails: 'Added -fullscreen',
      } as ModifyGameLaunchOptionsToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('error');
      expect(result.results[0].error).toContain('No backup path available');
    });

    it('should restart Steam even if restore fails', async () => {
      mockedFs.copyFile.mockRejectedValue(new Error('Copy failed'));

      const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
        toolName: 'modify-game-launch-options-tool',
        success: true,
        message: 'Launch options modified',
        timestamp: new Date().toISOString(),
        path: 'C:\\Steam\\userdata\\123\\config\\localconfig.vdf',
        launcher: 'steam',
        backupPath: 'C:\\Steam\\userdata\\123\\config\\localconfig.vdf.backup_1234567890',
        modificationDetails: 'Added -fullscreen',
      } as ModifyGameLaunchOptionsToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('error');
      expect(mockedStartSteam).toHaveBeenCalled(); // Steam should still be restarted
    });

    it('should handle missing launcher field (backwards compatibility)', async () => {
      // Simulate a result from before the launcher field was added
      const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
        toolName: 'modify-game-launch-options-tool',
        success: true,
        message: 'Launch options modified',
        timestamp: new Date().toISOString(),
        path: 'C:\\Steam\\userdata\\123\\config\\localconfig.vdf',
        // No launcher field - should default to 'steam'
        backupPath: 'C:\\Steam\\userdata\\123\\config\\localconfig.vdf.backup_1234567890',
        modificationDetails: 'Added -fullscreen',
      } as ModifyGameLaunchOptionsToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedKillSteam).toHaveBeenCalled();
      expect(mockedStartSteam).toHaveBeenCalled();
    });

    // Manual game launcher tests
    describe('manual launcher', () => {
      it('should delete shortcut when shortcutCreated is true', async () => {
        const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
          toolName: 'modify-game-launch-options-tool',
          success: true,
          message: 'Launch options modified',
          timestamp: new Date().toISOString(),
          path: 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk',
          launcher: 'manual',
          modificationDetails: 'Created new desktop shortcut',
          shortcutCreated: true,
          gameId: 'manual-game-123',
        } as ModifyGameLaunchOptionsToolResult);

        const summary = createTweakSummary([toolCall]);
        const result = await revertTweak(summary);

        expect(result.status).toBe('success');
        expect(mockedDeleteShortcut).toHaveBeenCalledWith(
          'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk'
        );
        expect(mockedUpdateShortcutArgs).not.toHaveBeenCalled();
      });

      it('should restore original args when shortcutCreated is false', async () => {
        const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
          toolName: 'modify-game-launch-options-tool',
          success: true,
          message: 'Launch options modified',
          timestamp: new Date().toISOString(),
          path: 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk',
          launcher: 'manual',
          modificationDetails: 'Updated existing shortcut',
          shortcutCreated: false,
          originalArgs: '-existingArg',
          gameId: 'manual-game-123',
        } as ModifyGameLaunchOptionsToolResult);

        const summary = createTweakSummary([toolCall]);
        const result = await revertTweak(summary);

        expect(result.status).toBe('success');
        expect(mockedUpdateShortcutArgs).toHaveBeenCalledWith(
          'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk',
          '-existingArg'
        );
        expect(mockedDeleteShortcut).not.toHaveBeenCalled();
      });

      it('should restore empty args when originalArgs was empty string', async () => {
        const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
          toolName: 'modify-game-launch-options-tool',
          success: true,
          message: 'Launch options modified',
          timestamp: new Date().toISOString(),
          path: 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk',
          launcher: 'manual',
          modificationDetails: 'Updated existing shortcut',
          shortcutCreated: false,
          originalArgs: '',
          gameId: 'manual-game-123',
        } as ModifyGameLaunchOptionsToolResult);

        const summary = createTweakSummary([toolCall]);
        const result = await revertTweak(summary);

        expect(result.status).toBe('success');
        expect(mockedUpdateShortcutArgs).toHaveBeenCalledWith(
          'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk',
          ''
        );
      });

      it('should call removeTwikiLaunchConfig when gameId is provided', async () => {
        const mockRemoveTwikiLaunchConfig = vi.fn().mockResolvedValue(true);
        mockedGameLibraryService.getInstance.mockReturnValue({
          removeTwikiLaunchConfig: mockRemoveTwikiLaunchConfig,
        } as any);

        const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
          toolName: 'modify-game-launch-options-tool',
          success: true,
          message: 'Launch options modified',
          timestamp: new Date().toISOString(),
          path: 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk',
          launcher: 'manual',
          modificationDetails: 'Created new desktop shortcut',
          shortcutCreated: true,
          gameId: 'manual-game-123',
        } as ModifyGameLaunchOptionsToolResult);

        const summary = createTweakSummary([toolCall]);
        await revertTweak(summary);

        expect(mockRemoveTwikiLaunchConfig).toHaveBeenCalledWith('manual-game-123');
      });

      it('should succeed even if removeTwikiLaunchConfig fails', async () => {
        const mockRemoveTwikiLaunchConfig = vi.fn().mockRejectedValue(new Error('DB error'));
        mockedGameLibraryService.getInstance.mockReturnValue({
          removeTwikiLaunchConfig: mockRemoveTwikiLaunchConfig,
        } as any);

        const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
          toolName: 'modify-game-launch-options-tool',
          success: true,
          message: 'Launch options modified',
          timestamp: new Date().toISOString(),
          path: 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk',
          launcher: 'manual',
          modificationDetails: 'Created new desktop shortcut',
          shortcutCreated: true,
          gameId: 'manual-game-123',
        } as ModifyGameLaunchOptionsToolResult);

        const summary = createTweakSummary([toolCall]);
        const result = await revertTweak(summary);

        // Should still succeed - removeTwikiLaunchConfig is best effort
        expect(result.status).toBe('success');
      });

      it('should succeed if shortcut was already deleted (ENOENT)', async () => {
        const error = new Error('ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        mockedDeleteShortcut.mockRejectedValue(error);

        const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
          toolName: 'modify-game-launch-options-tool',
          success: true,
          message: 'Launch options modified',
          timestamp: new Date().toISOString(),
          path: 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk',
          launcher: 'manual',
          modificationDetails: 'Created new desktop shortcut',
          shortcutCreated: true,
          gameId: 'manual-game-123',
        } as ModifyGameLaunchOptionsToolResult);

        const summary = createTweakSummary([toolCall]);
        const result = await revertTweak(summary);

        // ENOENT should be treated as success (file already deleted)
        expect(result.status).toBe('success');
      });

      it('should fail on non-ENOENT delete errors', async () => {
        mockedDeleteShortcut.mockRejectedValue(new Error('Permission denied'));

        const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
          toolName: 'modify-game-launch-options-tool',
          success: true,
          message: 'Launch options modified',
          timestamp: new Date().toISOString(),
          path: 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk',
          launcher: 'manual',
          modificationDetails: 'Created new desktop shortcut',
          shortcutCreated: true,
          gameId: 'manual-game-123',
        } as ModifyGameLaunchOptionsToolResult);

        const summary = createTweakSummary([toolCall]);
        const result = await revertTweak(summary);

        expect(result.status).toBe('error');
        expect(result.results[0].error).toContain('Permission denied');
      });

      it('should fail on updateShortcutArgs error', async () => {
        mockedUpdateShortcutArgs.mockRejectedValue(new Error('PowerShell error'));

        const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
          toolName: 'modify-game-launch-options-tool',
          success: true,
          message: 'Launch options modified',
          timestamp: new Date().toISOString(),
          path: 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk',
          launcher: 'manual',
          modificationDetails: 'Updated existing shortcut',
          shortcutCreated: false,
          originalArgs: '-original',
          gameId: 'manual-game-123',
        } as ModifyGameLaunchOptionsToolResult);

        const summary = createTweakSummary([toolCall]);
        const result = await revertTweak(summary);

        expect(result.status).toBe('error');
        expect(result.results[0].error).toContain('PowerShell error');
      });

      it('should handle missing gameId gracefully', async () => {
        const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
          toolName: 'modify-game-launch-options-tool',
          success: true,
          message: 'Launch options modified',
          timestamp: new Date().toISOString(),
          path: 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk',
          launcher: 'manual',
          modificationDetails: 'Created new desktop shortcut',
          shortcutCreated: true,
          // No gameId
        } as ModifyGameLaunchOptionsToolResult);

        const summary = createTweakSummary([toolCall]);
        const result = await revertTweak(summary);

        expect(result.status).toBe('success');
        // removeTwikiLaunchConfig should not be called without gameId
        expect(mockedGameLibraryService.getInstance).not.toHaveBeenCalled();
      });

      it('should handle missing originalArgs by using empty string', async () => {
        const toolCall = createToolCallEntry('modify-game-launch-options-tool', {
          toolName: 'modify-game-launch-options-tool',
          success: true,
          message: 'Launch options modified',
          timestamp: new Date().toISOString(),
          path: 'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk',
          launcher: 'manual',
          modificationDetails: 'Updated existing shortcut',
          shortcutCreated: false,
          // No originalArgs - should default to empty string
          gameId: 'manual-game-123',
        } as ModifyGameLaunchOptionsToolResult);

        const summary = createTweakSummary([toolCall]);
        const result = await revertTweak(summary);

        expect(result.status).toBe('success');
        expect(mockedUpdateShortcutArgs).toHaveBeenCalledWith(
          'C:\\Users\\TestUser\\Desktop\\Twiki - Test Game.lnk',
          '' // Empty string default
        );
      });
    });
  });

  describe('revertFileAttributes (set-file-attributes-tool)', () => {
    it('should reverse ReadOnly attribute (set -> remove)', async () => {
      const toolCall = createToolCallEntry('set-file-attributes-tool', {
        toolName: 'set-file-attributes-tool',
        success: true,
        message: 'Attributes set',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        attributes: ['ReadOnly'],
      } as SetFileAttributesToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedSetFileAttributes).toHaveBeenCalledWith({
        filePath: 'C:\\game\\config.ini',
        readOnly: false, // Reverse of setting ReadOnly
      });
    });

    it('should reverse -ReadOnly attribute (remove -> set)', async () => {
      const toolCall = createToolCallEntry('set-file-attributes-tool', {
        toolName: 'set-file-attributes-tool',
        success: true,
        message: 'Attributes removed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        attributes: ['-ReadOnly'],
      } as SetFileAttributesToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedSetFileAttributes).toHaveBeenCalledWith({
        filePath: 'C:\\game\\config.ini',
        readOnly: true, // Reverse of removing ReadOnly
      });
    });

    it('should reverse multiple attributes', async () => {
      const toolCall = createToolCallEntry('set-file-attributes-tool', {
        toolName: 'set-file-attributes-tool',
        success: true,
        message: 'Multiple attributes set',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        attributes: ['ReadOnly', 'Hidden', '-System', '-Archive'],
      } as SetFileAttributesToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedSetFileAttributes).toHaveBeenCalledWith({
        filePath: 'C:\\game\\config.ini',
        readOnly: false, // Reverse ReadOnly
        hidden: false, // Reverse Hidden
        system: true, // Reverse -System
        archive: true, // Reverse -Archive
      });
    });

    it('should succeed with empty attributes array', async () => {
      const toolCall = createToolCallEntry('set-file-attributes-tool', {
        toolName: 'set-file-attributes-tool',
        success: true,
        message: 'No changes',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        attributes: [],
      } as SetFileAttributesToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedSetFileAttributes).not.toHaveBeenCalled();
    });

    it('should handle attribute revert errors', async () => {
      mockedSetFileAttributes.mockRejectedValue(new Error('Access denied'));

      const toolCall = createToolCallEntry('set-file-attributes-tool', {
        toolName: 'set-file-attributes-tool',
        success: true,
        message: 'Attributes set',
        timestamp: new Date().toISOString(),
        path: 'C:\\system\\protected.txt',
        attributes: ['ReadOnly'],
      } as SetFileAttributesToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('error');
      expect(result.results[0].error).toContain('Access denied');
    });
  });

  describe('revertDownloadFile (download-file-tool)', () => {
    it('should delete a downloaded file', async () => {
      const toolCall = createToolCallEntry('download-file-tool', {
        toolName: 'download-file-tool',
        success: true,
        message: 'File downloaded',
        timestamp: new Date().toISOString(),
        downloadPath: 'C:\\downloads\\mod.zip',
        resolvedUrl: 'https://example.com/mod.zip',
        hosterUsed: 'direct',
        fileSize: 1024,
      } as DownloadFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\downloads\\mod.zip');
    });

    it('should delete extracted files and the downloaded file', async () => {
      const toolCall = createToolCallEntry('download-file-tool', {
        toolName: 'download-file-tool',
        success: true,
        message: 'File downloaded and extracted',
        timestamp: new Date().toISOString(),
        downloadPath: 'C:\\downloads\\mod.zip',
        extractPath: 'C:\\downloads\\mod.zip_extracted',
        extractedFiles: [
          'C:\\downloads\\mod.zip_extracted\\file1.dll',
          'C:\\downloads\\mod.zip_extracted\\file2.dll',
        ],
        resolvedUrl: 'https://example.com/mod.zip',
        hosterUsed: 'direct',
        fileSize: 1024,
      } as DownloadFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      // Should delete extracted files
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\downloads\\mod.zip_extracted\\file1.dll');
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\downloads\\mod.zip_extracted\\file2.dll');
      // Should delete downloaded file
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\downloads\\mod.zip');
    });

    it('should succeed if downloaded file already deleted (ENOENT)', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockedFs.access.mockRejectedValue(error);

      const toolCall = createToolCallEntry('download-file-tool', {
        toolName: 'download-file-tool',
        success: true,
        message: 'File downloaded',
        timestamp: new Date().toISOString(),
        downloadPath: 'C:\\downloads\\deleted.zip',
        resolvedUrl: 'https://example.com/deleted.zip',
        hosterUsed: 'direct',
        fileSize: 1024,
      } as DownloadFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
    });

    it('should handle permission errors when deleting downloaded file', async () => {
      mockedFs.access.mockResolvedValue(undefined);
      const permError = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
      permError.code = 'EACCES';
      mockedFs.unlink.mockRejectedValue(permError);

      const toolCall = createToolCallEntry('download-file-tool', {
        toolName: 'download-file-tool',
        success: true,
        message: 'File downloaded',
        timestamp: new Date().toISOString(),
        downloadPath: 'C:\\downloads\\protected.zip',
        resolvedUrl: 'https://example.com/protected.zip',
        hosterUsed: 'direct',
        fileSize: 1024,
      } as DownloadFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('error');
      expect(result.results[0].error).toContain('Failed to delete downloaded file');
    });

    it('should try to remove empty extract directory', async () => {
      mockedFs.readdir.mockResolvedValue([]); // Empty directory

      const toolCall = createToolCallEntry('download-file-tool', {
        toolName: 'download-file-tool',
        success: true,
        message: 'File downloaded and extracted',
        timestamp: new Date().toISOString(),
        downloadPath: 'C:\\downloads\\mod.zip',
        extractPath: 'C:\\downloads\\mod.zip_extracted',
        extractedFiles: ['C:\\downloads\\mod.zip_extracted\\file.dll'],
        resolvedUrl: 'https://example.com/mod.zip',
        hosterUsed: 'direct',
        fileSize: 1024,
      } as DownloadFileToolResult);

      const summary = createTweakSummary([toolCall]);
      await revertTweak(summary);

      // Should try to remove the empty extract directory
      expect(mockedFs.rmdir).toHaveBeenCalledWith('C:\\downloads\\mod.zip_extracted');
    });
  });

  describe('revertExtractArchive (extract-archive-tool)', () => {
    it('should delete extracted files with granular tracking', async () => {
      const toolCall = createToolCallEntry('extract-archive-tool', {
        toolName: 'extract-archive-tool',
        success: true,
        message: 'Archive extracted',
        timestamp: new Date().toISOString(),
        path: 'C:\\downloads\\mod.zip',
        extractPath: 'C:\\game\\mods',
        extractedFiles: ['C:\\game\\mods\\file1.dll', 'C:\\game\\mods\\file2.dll'],
        fileTransfers: [
          {
            sourcePath: 'file1.dll',
            destinationPath: 'C:\\game\\mods\\file1.dll',
            wasOverwrite: false,
          },
          {
            sourcePath: 'file2.dll',
            destinationPath: 'C:\\game\\mods\\file2.dll',
            wasOverwrite: false,
          },
        ],
        directoriesCreated: [],
      } as ExtractArchiveToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\mods\\file1.dll');
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\mods\\file2.dll');
    });

    it('should restore backed up files that were overwritten', async () => {
      const toolCall = createToolCallEntry('extract-archive-tool', {
        toolName: 'extract-archive-tool',
        success: true,
        message: 'Archive extracted',
        timestamp: new Date().toISOString(),
        path: 'C:\\downloads\\patch.zip',
        extractPath: 'C:\\game',
        extractedFiles: ['C:\\game\\config.ini'],
        fileTransfers: [
          {
            sourcePath: 'config.ini',
            destinationPath: 'C:\\game\\config.ini',
            wasOverwrite: true,
            backupPath: 'C:\\game\\config.ini.backup',
          },
        ],
        directoriesCreated: [],
      } as ExtractArchiveToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedFs.copyFile).toHaveBeenCalledWith(
        'C:\\game\\config.ini.backup',
        'C:\\game\\config.ini'
      );
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\config.ini.backup');
    });

    it('should clean up created directories', async () => {
      mockedFs.readdir.mockResolvedValue([]); // Empty directories

      const toolCall = createToolCallEntry('extract-archive-tool', {
        toolName: 'extract-archive-tool',
        success: true,
        message: 'Archive extracted',
        timestamp: new Date().toISOString(),
        path: 'C:\\downloads\\mod.zip',
        extractPath: 'C:\\game\\mods',
        extractedFiles: ['C:\\game\\mods\\subdir\\file.dll'],
        fileTransfers: [
          {
            sourcePath: 'subdir/file.dll',
            destinationPath: 'C:\\game\\mods\\subdir\\file.dll',
            wasOverwrite: false,
          },
        ],
        directoriesCreated: [
          { path: 'C:\\game\\mods' },
          { path: 'C:\\game\\mods\\subdir' },
        ],
      } as ExtractArchiveToolResult);

      const summary = createTweakSummary([toolCall]);
      await revertTweak(summary);

      // Should remove directories in reverse order (deepest first)
      expect(mockedFs.rmdir).toHaveBeenCalledWith('C:\\game\\mods\\subdir');
      expect(mockedFs.rmdir).toHaveBeenCalledWith('C:\\game\\mods');
    });

    it('should fall back to legacy mode without granular tracking', async () => {
      const toolCall = createToolCallEntry('extract-archive-tool', {
        toolName: 'extract-archive-tool',
        success: true,
        message: 'Archive extracted',
        timestamp: new Date().toISOString(),
        path: 'C:\\downloads\\old.zip',
        extractPath: 'C:\\game\\legacy',
        extractedFiles: ['C:\\game\\legacy\\file1.dll', 'C:\\game\\legacy\\file2.dll'],
        // No fileTransfers or directoriesCreated (legacy data)
      } as ExtractArchiveToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\legacy\\file1.dll');
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\legacy\\file2.dll');
    });
  });

  describe('batch operations and ordering', () => {
    it('should revert operations in reverse chronological order', async () => {
      const callOrder: string[] = [];

      mockedFs.stat.mockResolvedValue({ isDirectory: () => false } as any);
      mockedFs.unlink.mockImplementation(async (path) => {
        callOrder.push(`unlink:${path}`);
      });
      mockedFs.copyFile.mockImplementation(async (src, dest) => {
        callOrder.push(`copy:${src}->${dest}`);
      });

      // Both are create-file-tool so both use unlink for revert
      // Note: timestamp in options is the ToolCallEntry.timestamp (used for sorting)
      const toolCall1 = createToolCallEntry(
        'create-file-tool',
        {
          toolName: 'create-file-tool',
          success: true,
          message: 'File 1 created',
          timestamp: '2024-01-01T10:00:00Z',
          path: 'C:\\game\\file1.txt',
          bytesWritten: 100,
        } as CreateFileToolResult,
        { timestamp: '2024-01-01T10:00:00Z' } // Earlier - set on ToolCallEntry
      );

      const toolCall2 = createToolCallEntry(
        'create-file-tool',
        {
          toolName: 'create-file-tool',
          success: true,
          message: 'File 2 created',
          timestamp: '2024-01-01T11:00:00Z',
          path: 'C:\\game\\file2.txt',
          bytesWritten: 100,
        } as CreateFileToolResult,
        { timestamp: '2024-01-01T11:00:00Z' } // Later - set on ToolCallEntry
      );

      const summary = createTweakSummary([toolCall1, toolCall2]);
      await revertTweak(summary);

      // toolCall2 should be reverted first (newer timestamp) - both use unlink
      expect(callOrder[0]).toContain('file2.txt');
      expect(callOrder[1]).toContain('file1.txt');
    });

    it('should handle multiple tool calls with partial failures', async () => {
      // First revert succeeds, second fails
      mockedFs.stat.mockResolvedValue({ isDirectory: () => false } as any);
      mockedFs.unlink
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Permission denied'));

      const toolCall1 = createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'File 1',
        timestamp: '2024-01-01T10:00:00Z',
        path: 'C:\\game\\file1.txt',
        bytesWritten: 100,
      } as CreateFileToolResult);

      const toolCall2 = createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'File 2',
        timestamp: '2024-01-01T09:00:00Z', // Earlier
        path: 'C:\\game\\file2.txt',
        bytesWritten: 100,
      } as CreateFileToolResult);

      const summary = createTweakSummary([toolCall1, toolCall2]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('partial');
      expect(result.results.filter((r) => r.success)).toHaveLength(1);
      expect(result.results.filter((r) => !r.success)).toHaveLength(1);
    });

    it('should return success when no operations to revert', async () => {
      const summary = createTweakSummary([]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(result.message).toBe('No operations to revert');
      expect(result.results).toHaveLength(0);
    });
  });

  describe('filtering non-revertible operations', () => {
    it('should skip read-file-tool (not revertible)', async () => {
      const toolCall = createToolCallEntry('read-file-tool' as any, {
        toolName: 'read-file-tool',
        success: true,
        message: 'File read',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        content: 'file content',
        lineCount: 10,
        sizeBytes: 100,
      });

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(result.results).toHaveLength(0);
    });

    it('should skip failed original operations', async () => {
      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: false, // Original operation failed
        message: 'Edit failed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        operationsApplied: [],
      } as EditFileToolResult);
      toolCall.status = 'error';

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(result.results).toHaveLength(0);
    });

    it('should skip operations with error status', async () => {
      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        operationsApplied: [],
      } as EditFileToolResult);
      toolCall.status = 'error'; // Status is error despite success flag

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(result.results).toHaveLength(0);
    });

    it('should include warning status operations', async () => {
      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited with warning',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\config.ini',
        backupPath: 'C:\\game\\config.ini.backup',
        operationsApplied: [],
      } as EditFileToolResult);
      toolCall.status = 'warning'; // Warning status should still be reverted

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.results).toHaveLength(1);
    });
  });

  describe('environment variable expansion', () => {
    it('should expand environment variables in paths', async () => {
      // Mock file content for surgical revert
      mockedReadFileNormalized.mockResolvedValue({
        content: 'key=newValue',
        lineEnding: '\n',
      });

      const toolCall = createToolCallEntry('edit-file-tool', {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: '%APPDATA%\\Game\\config.ini',
        backupPath: '%APPDATA%\\Game\\config.ini.backup',
        operationsApplied: [
          { oldString: 'key=oldValue', newString: 'key=newValue', replaceAll: false },
        ],
      } as EditFileToolResult);

      const summary = createTweakSummary([toolCall]);
      await revertTweak(summary);

      // Should read the expanded path
      expect(mockedReadFileNormalized).toHaveBeenCalledWith(
        'C:\\Users\\TestUser\\AppData\\Roaming\\Game\\config.ini'
      );
      // Should delete the backup at the expanded path
      expect(mockedFs.unlink).toHaveBeenCalledWith(
        'C:\\Users\\TestUser\\AppData\\Roaming\\Game\\config.ini.backup'
      );
    });
  });

  describe('revert summary messages', () => {
    it('should report success message correctly', async () => {
      const toolCall = createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'File created',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\file.txt',
        bytesWritten: 100,
      } as CreateFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.message).toBe('Successfully reverted 1 operation');
    });

    it('should report plural success message', async () => {
      const toolCall1 = createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'File 1',
        timestamp: '2024-01-01T10:00:00Z',
        path: 'C:\\game\\file1.txt',
        bytesWritten: 100,
      } as CreateFileToolResult);

      const toolCall2 = createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'File 2',
        timestamp: '2024-01-01T11:00:00Z',
        path: 'C:\\game\\file2.txt',
        bytesWritten: 100,
      } as CreateFileToolResult);

      const summary = createTweakSummary([toolCall1, toolCall2]);
      const result = await revertTweak(summary);

      expect(result.message).toBe('Successfully reverted 2 operations');
    });

    it('should report partial failure message', async () => {
      mockedFs.stat.mockResolvedValue({ isDirectory: () => false } as any);
      mockedFs.unlink
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Failed'));

      const toolCall1 = createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'File 1',
        timestamp: '2024-01-01T10:00:00Z',
        path: 'C:\\game\\file1.txt',
        bytesWritten: 100,
      } as CreateFileToolResult);

      const toolCall2 = createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'File 2',
        timestamp: '2024-01-01T11:00:00Z',
        path: 'C:\\game\\file2.txt',
        bytesWritten: 100,
      } as CreateFileToolResult);

      const summary = createTweakSummary([toolCall1, toolCall2]);
      const result = await revertTweak(summary);

      expect(result.message).toContain('Reverted 1 of 2 operations');
      expect(result.message).toContain('1 failed');
    });

    it('should report all failed message', async () => {
      mockedFs.stat.mockRejectedValue(new Error('Failed'));

      const toolCall = createToolCallEntry('create-file-tool', {
        toolName: 'create-file-tool',
        success: true,
        message: 'File created',
        timestamp: new Date().toISOString(),
        path: 'C:\\game\\file.txt',
        bytesWritten: 100,
      } as CreateFileToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.message).toBe('Failed to revert all 1 operation');
    });
  });

  describe('revertInstallReshade (install-reshade-tool)', () => {
    it('should delete new files that were installed', async () => {
      const toolCall = createToolCallEntry('install-reshade-tool', {
        toolName: 'install-reshade-tool',
        success: true,
        message: 'ReShade installed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game',
        gameDirectory: 'C:\\game',
        installedFiles: [
          {
            destPath: 'C:\\game\\dxgi.dll',
            backupPath: null,
            wasNewFile: true,
          },
          {
            destPath: 'C:\\game\\FreePIE.addon64',
            backupPath: null,
            wasNewFile: true,
          },
        ],
        actualDllName: 'dxgi.dll',
        detectedArchitecture: '64',
      } as InstallReshadeToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\dxgi.dll');
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\FreePIE.addon64');
    });

    it('should restore backed up files when overwriting occurred', async () => {
      const toolCall = createToolCallEntry('install-reshade-tool', {
        toolName: 'install-reshade-tool',
        success: true,
        message: 'ReShade installed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game',
        gameDirectory: 'C:\\game',
        installedFiles: [
          {
            destPath: 'C:\\game\\dxgi.dll',
            backupPath: 'C:\\game\\dxgi.dll.bak',
            wasNewFile: false,
          },
        ],
        actualDllName: 'dxgi.dll',
        detectedArchitecture: '64',
      } as InstallReshadeToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedFs.access).toHaveBeenCalledWith('C:\\game\\dxgi.dll.bak');
      expect(mockedFs.copyFile).toHaveBeenCalledWith(
        'C:\\game\\dxgi.dll.bak',
        'C:\\game\\dxgi.dll'
      );
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\dxgi.dll.bak');
    });

    it('should handle mixed scenario: some new files, some with backups', async () => {
      const toolCall = createToolCallEntry('install-reshade-tool', {
        toolName: 'install-reshade-tool',
        success: true,
        message: 'ReShade installed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game',
        gameDirectory: 'C:\\game',
        installedFiles: [
          {
            destPath: 'C:\\game\\dxgi.dll',
            backupPath: 'C:\\game\\dxgi.dll.bak',
            wasNewFile: false,
          },
          {
            destPath: 'C:\\game\\addon.addon64',
            backupPath: null,
            wasNewFile: true,
          },
        ],
        actualDllName: 'dxgi.dll',
        detectedArchitecture: '64',
      } as InstallReshadeToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      // First file: restore from backup
      expect(mockedFs.copyFile).toHaveBeenCalledWith(
        'C:\\game\\dxgi.dll.bak',
        'C:\\game\\dxgi.dll'
      );
      // Second file: delete
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\addon.addon64');
    });

    it('should fail gracefully when backup file is missing', async () => {
      mockedFs.access.mockRejectedValue(new Error('ENOENT'));

      const toolCall = createToolCallEntry('install-reshade-tool', {
        toolName: 'install-reshade-tool',
        success: true,
        message: 'ReShade installed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game',
        gameDirectory: 'C:\\game',
        installedFiles: [
          {
            destPath: 'C:\\game\\dxgi.dll',
            backupPath: 'C:\\game\\dxgi.dll.bak',
            wasNewFile: false,
          },
        ],
        actualDllName: 'dxgi.dll',
        detectedArchitecture: '64',
      } as InstallReshadeToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('error');
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('Backup not found');
    });

    it('should succeed when new file is already deleted (ENOENT)', async () => {
      mockedFs.access.mockRejectedValue(new Error('ENOENT'));

      const toolCall = createToolCallEntry('install-reshade-tool', {
        toolName: 'install-reshade-tool',
        success: true,
        message: 'ReShade installed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game',
        gameDirectory: 'C:\\game',
        installedFiles: [
          {
            destPath: 'C:\\game\\dxgi.dll',
            backupPath: null,
            wasNewFile: true,
          },
        ],
        actualDllName: 'dxgi.dll',
        detectedArchitecture: '64',
      } as InstallReshadeToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
    });

    it('should handle 32-bit architecture installations', async () => {
      const toolCall = createToolCallEntry('install-reshade-tool', {
        toolName: 'install-reshade-tool',
        success: true,
        message: 'ReShade installed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game',
        gameDirectory: 'C:\\game',
        installedFiles: [
          {
            destPath: 'C:\\game\\d3d9.dll',
            backupPath: null,
            wasNewFile: true,
          },
          {
            destPath: 'C:\\game\\addon.addon32',
            backupPath: null,
            wasNewFile: true,
          },
        ],
        actualDllName: 'd3d9.dll',
        detectedArchitecture: '32',
      } as InstallReshadeToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\d3d9.dll');
      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\game\\addon.addon32');
    });

    it('should expand environment variables in paths', async () => {
      const toolCall = createToolCallEntry('install-reshade-tool', {
        toolName: 'install-reshade-tool',
        success: true,
        message: 'ReShade installed',
        timestamp: new Date().toISOString(),
        path: '%USERPROFILE%\\game',
        gameDirectory: '%USERPROFILE%\\game',
        installedFiles: [
          {
            destPath: '%USERPROFILE%\\game\\dxgi.dll',
            backupPath: null,
            wasNewFile: true,
          },
        ],
        actualDllName: 'dxgi.dll',
        detectedArchitecture: '64',
      } as InstallReshadeToolResult);

      const summary = createTweakSummary([toolCall]);
      await revertTweak(summary);

      expect(mockedFs.unlink).toHaveBeenCalledWith('C:\\Users\\TestUser\\game\\dxgi.dll');
    });

    it('should process files in reverse order', async () => {
      const callOrder: string[] = [];
      mockedFs.unlink.mockImplementation(async (path) => {
        callOrder.push(path as string);
      });

      const toolCall = createToolCallEntry('install-reshade-tool', {
        toolName: 'install-reshade-tool',
        success: true,
        message: 'ReShade installed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game',
        gameDirectory: 'C:\\game',
        installedFiles: [
          {
            destPath: 'C:\\game\\first.dll',
            backupPath: null,
            wasNewFile: true,
          },
          {
            destPath: 'C:\\game\\second.addon64',
            backupPath: null,
            wasNewFile: true,
          },
        ],
        actualDllName: 'first.dll',
        detectedArchitecture: '64',
      } as InstallReshadeToolResult);

      const summary = createTweakSummary([toolCall]);
      await revertTweak(summary);

      // Files should be processed in reverse order (second then first)
      expect(callOrder[0]).toContain('second.addon64');
      expect(callOrder[1]).toContain('first.dll');
    });

    it('should handle empty installedFiles array', async () => {
      const toolCall = createToolCallEntry('install-reshade-tool', {
        toolName: 'install-reshade-tool',
        success: true,
        message: 'ReShade installed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game',
        gameDirectory: 'C:\\game',
        installedFiles: [],
        actualDllName: 'dxgi.dll',
        detectedArchitecture: '64',
        graphicsApi: 'd3d9',
      } as InstallReshadeToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('success');
      expect(mockedFs.unlink).not.toHaveBeenCalled();
      expect(mockedFs.copyFile).not.toHaveBeenCalled();
    });

    it('should report error when backup restore fails', async () => {
      // First backup access fails (backup missing)
      mockedFs.access.mockRejectedValue(new Error('ENOENT: backup not found'));

      const toolCall = createToolCallEntry('install-reshade-tool', {
        toolName: 'install-reshade-tool',
        success: true,
        message: 'ReShade installed',
        timestamp: new Date().toISOString(),
        path: 'C:\\game',
        gameDirectory: 'C:\\game',
        installedFiles: [
          {
            destPath: 'C:\\game\\dxgi.dll',
            backupPath: 'C:\\game\\dxgi.dll.bak',
            wasNewFile: false,
          },
        ],
        actualDllName: 'dxgi.dll',
        detectedArchitecture: '64',
      } as InstallReshadeToolResult);

      const summary = createTweakSummary([toolCall]);
      const result = await revertTweak(summary);

      expect(result.status).toBe('error');
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('Backup not found');
    });
  });
});
