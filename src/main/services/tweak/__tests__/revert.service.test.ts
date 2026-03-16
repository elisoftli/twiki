/**
 * RevertService Tests
 *
 * Tests the revert service that orchestrates tweak revert operations including:
 * - Pre-check for conflicts before revert
 * - Revert operation execution
 * - Backup file cleanup
 * - Error recovery
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AppliedTweak,
  TweakSummary,
  RevertSummary,
  FileConflict,
  EditOperation,
} from '../../../interfaces/tweak-agent.interface';
import type { Tweak } from '@twiki/shared';

// Mock fs
const mockUnlink = vi.fn();
vi.mock('fs', () => ({
  promises: {
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
}));

// Mock expandWindowsEnvVars
vi.mock('../../../utils', () => ({
  expandWindowsEnvVars: (path: string) => path.replace(/%([^%]+)%/g, '/mock/$1'),
}));

// Mock revert utilities
const mockRevertTweak = vi.fn();
const mockDetectFileConflicts = vi.fn();
const mockVerifyChangesExist = vi.fn();
vi.mock('../../../tools/io/utils/revert.utils', () => ({
  revertTweak: (...args: unknown[]) => mockRevertTweak(...args),
  detectFileConflicts: (...args: unknown[]) => mockDetectFileConflicts(...args),
  verifyChangesExist: (...args: unknown[]) => mockVerifyChangesExist(...args),
}));

import { RevertService } from '../revert.service';

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockTweak = (overrides?: Partial<Tweak>): Tweak => ({
  hash: 'test-hash-123',
  groupTitle: 'Test Group',
  title: 'Test Tweak',
  body: 'Test body content',
  notes: [],
  ...overrides,
});

const createMockEditOperation = (overrides?: Partial<EditOperation>): EditOperation => ({
  oldString: 'old value',
  newString: 'new value',
  ...overrides,
});

const createMockSummary = (overrides?: Partial<TweakSummary>): TweakSummary => ({
  status: 'success',
  message: 'Tweak applied successfully',
  toolCalls: [
    {
      toolCallId: 'call-1',
      toolName: 'edit-file-tool',
      description: 'Edit config file',
      status: 'success',
      timestamp: new Date().toISOString(),
      result: {
        toolName: 'edit-file-tool',
        success: true,
        message: 'File edited',
        timestamp: new Date().toISOString(),
        path: 'C:\\Games\\TestGame\\config.ini',
        backupPath: 'C:\\Games\\TestGame\\config.ini.bak',
        operationsApplied: [createMockEditOperation()],
      },
    },
  ],
  ...overrides,
});

const createMockAppliedTweak = (overrides?: Partial<AppliedTweak>): AppliedTweak => ({
  pcgwPageId: 12345,
  launcherGameId: 'game-123',
  tweak: createMockTweak(),
  status: 'success',
  summary: createMockSummary(),
  appliedAt: new Date().toISOString(),
  ...overrides,
});

const createMockRevertSummary = (overrides?: Partial<RevertSummary>): RevertSummary => ({
  status: 'success',
  message: 'All operations reverted',
  results: [
    {
      success: true,
      toolName: 'edit-file-tool',
      toolCallId: 'call-1',
      target: 'C:\\Games\\TestGame\\config.ini',
    },
  ],
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

describe('RevertService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRevertTweak.mockResolvedValue(createMockRevertSummary());
    mockDetectFileConflicts.mockReturnValue([]);
    mockVerifyChangesExist.mockResolvedValue({ allFound: true, notFound: [] });
    mockUnlink.mockResolvedValue(undefined);
  });

  describe('preCheck', () => {
    it('should return canProceed true when no conflicts', async () => {
      const tweak = createMockAppliedTweak();
      mockDetectFileConflicts.mockReturnValue([]);
      mockVerifyChangesExist.mockResolvedValue({ allFound: true, notFound: [] });

      const result = await RevertService.preCheck(tweak, [tweak]);

      expect(result.canProceed).toBe(true);
      expect(result.fileConflicts).toEqual([]);
      expect(result.blockedOperations).toEqual([]);
      expect(result.warning).toBeUndefined();
      expect(result.blockedReason).toBeUndefined();
    });

    it('should detect file conflicts with other tweaks', async () => {
      const tweak = createMockAppliedTweak();
      const otherTweak = createMockAppliedTweak({
        tweak: createMockTweak({ hash: 'other-hash' }),
      });

      const conflicts: FileConflict[] = [
        {
          filePath: 'C:\\Games\\TestGame\\config.ini',
          conflictType: 'content_modified',
          otherTweaks: [
            {
              hash: 'other-hash',
              title: 'Other Tweak',
              appliedAt: new Date().toISOString(),
            },
          ],
        },
      ];
      mockDetectFileConflicts.mockReturnValue(conflicts);
      mockVerifyChangesExist.mockResolvedValue({ allFound: true, notFound: [] });

      const result = await RevertService.preCheck(tweak, [tweak, otherTweak]);

      expect(result.canProceed).toBe(true);
      expect(result.warning).toContain('Other tweaks also modified');
      expect(result.fileConflicts).toEqual(conflicts);
    });

    it('should block revert when changes not found', async () => {
      const tweak = createMockAppliedTweak();
      const notFoundOperations = [
        {
          filePath: 'C:\\Games\\TestGame\\config.ini',
          operation: createMockEditOperation(),
        },
      ];
      mockVerifyChangesExist.mockResolvedValue({
        allFound: false,
        notFound: notFoundOperations,
      });

      const result = await RevertService.preCheck(tweak, [tweak]);

      expect(result.canProceed).toBe(false);
      expect(result.blockedReason).toContain('modified or removed');
      expect(result.blockedOperations).toHaveLength(1);
      expect(result.blockedOperations[0].reason).toContain('Content not found');
    });

    it('should show blocked operations for replace operations', async () => {
      const tweak = createMockAppliedTweak();
      const operation = createMockEditOperation({
        oldString: 'original content that is quite long',
        newString: 'replacement',
      });
      mockVerifyChangesExist.mockResolvedValue({
        allFound: false,
        notFound: [{ filePath: 'C:\\test.txt', operation }],
      });

      const result = await RevertService.preCheck(tweak, [tweak]);

      expect(result.blockedOperations[0].description).toContain('Replace');
      expect(result.blockedOperations[0].description).toContain('original content');
    });

    it('should show blocked operations for append operations', async () => {
      const tweak = createMockAppliedTweak();
      const operation = createMockEditOperation({
        appendToEnd: true,
        oldString: '',
        newString: 'appended content that is long',
      });
      mockVerifyChangesExist.mockResolvedValue({
        allFound: false,
        notFound: [{ filePath: 'C:\\test.txt', operation }],
      });

      const result = await RevertService.preCheck(tweak, [tweak]);

      expect(result.blockedOperations[0].description).toContain('Append');
      expect(result.blockedOperations[0].description).toContain('appended content');
    });

    it('should truncate long operation descriptions', async () => {
      const tweak = createMockAppliedTweak();
      const longString = 'x'.repeat(100);
      const operation = createMockEditOperation({
        oldString: longString,
        newString: 'replacement',
      });
      mockVerifyChangesExist.mockResolvedValue({
        allFound: false,
        notFound: [{ filePath: 'C:\\test.txt', operation }],
      });

      const result = await RevertService.preCheck(tweak, [tweak]);

      expect(result.blockedOperations[0].description).toContain('...');
      expect(result.blockedOperations[0].description.length).toBeLessThan(100);
    });
  });

  describe('execute', () => {
    it('should execute revert and return summary', async () => {
      const summary = createMockSummary();
      const revertSummary = createMockRevertSummary();
      mockRevertTweak.mockResolvedValue(revertSummary);

      const result = await RevertService.execute(summary);

      expect(result).toEqual(revertSummary);
      expect(mockRevertTweak).toHaveBeenCalledWith(summary, { useFallback: false });
    });

    it('should pass useFallback option to revertTweak', async () => {
      const summary = createMockSummary();

      await RevertService.execute(summary, false, true);

      expect(mockRevertTweak).toHaveBeenCalledWith(summary, { useFallback: true });
    });

    it('should cleanup backups after successful revert when requested', async () => {
      const summary = createMockSummary({
        toolCalls: [
          {
            toolCallId: 'call-1',
            toolName: 'edit-file-tool',
            description: 'Edit file',
            status: 'success',
            timestamp: new Date().toISOString(),
            result: {
              toolName: 'edit-file-tool',
              success: true,
              message: 'Done',
              timestamp: new Date().toISOString(),
              path: 'C:\\test.txt',
              backupPath: 'C:\\test.txt.bak',
              operationsApplied: [],
            },
          },
        ],
      });
      mockRevertTweak.mockResolvedValue(createMockRevertSummary({ status: 'success' }));

      await RevertService.execute(summary, true);

      expect(mockUnlink).toHaveBeenCalledWith('C:\\test.txt.bak');
    });

    it('should cleanup backups after partial revert when requested', async () => {
      const summary = createMockSummary();
      mockRevertTweak.mockResolvedValue(createMockRevertSummary({ status: 'partial' }));

      await RevertService.execute(summary, true);

      expect(mockUnlink).toHaveBeenCalled();
    });

    it('should NOT cleanup backups when revert fails completely', async () => {
      const summary = createMockSummary();
      mockRevertTweak.mockResolvedValue(createMockRevertSummary({ status: 'error' }));

      await RevertService.execute(summary, true);

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should NOT cleanup backups when cleanupBackups is false', async () => {
      const summary = createMockSummary();
      mockRevertTweak.mockResolvedValue(createMockRevertSummary({ status: 'success' }));

      await RevertService.execute(summary, false);

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      const summary = createMockSummary();
      mockRevertTweak.mockResolvedValue(createMockRevertSummary({ status: 'success' }));
      mockUnlink.mockRejectedValue(new Error('File not found'));

      // Should not throw
      const result = await RevertService.execute(summary, true);

      expect(result.status).toBe('success');
    });

    it('should cleanup backups from move-copy operations', async () => {
      const summary = createMockSummary({
        toolCalls: [
          {
            toolCallId: 'call-1',
            toolName: 'move-copy-file-or-directory-tool',
            description: 'Move file',
            status: 'success',
            timestamp: new Date().toISOString(),
            result: {
              toolName: 'move-copy-file-or-directory-tool',
              success: true,
              message: 'Done',
              timestamp: new Date().toISOString(),
              path: 'C:\\dest',
              results: [
                {
                  sourcePath: 'C:\\source.txt',
                  destinationPath: 'C:\\dest\\source.txt',
                  backupPath: 'C:\\dest\\source.txt.bak',
                  success: true,
                },
                {
                  sourcePath: 'C:\\source2.txt',
                  destinationPath: 'C:\\dest\\source2.txt',
                  backupPath: 'C:\\dest\\source2.txt.bak',
                  success: true,
                },
              ],
              successfulOperations: 2,
              failedOperations: 0,
            },
          },
        ],
      });
      mockRevertTweak.mockResolvedValue(createMockRevertSummary({ status: 'success' }));

      await RevertService.execute(summary, true);

      expect(mockUnlink).toHaveBeenCalledTimes(2);
      expect(mockUnlink).toHaveBeenCalledWith('C:\\dest\\source.txt.bak');
      expect(mockUnlink).toHaveBeenCalledWith('C:\\dest\\source2.txt.bak');
    });

    it('should expand Windows environment variables in backup paths', async () => {
      const summary = createMockSummary({
        toolCalls: [
          {
            toolCallId: 'call-1',
            toolName: 'edit-file-tool',
            description: 'Edit file',
            status: 'success',
            timestamp: new Date().toISOString(),
            result: {
              toolName: 'edit-file-tool',
              success: true,
              message: 'Done',
              timestamp: new Date().toISOString(),
              path: '%APPDATA%\\test.txt',
              backupPath: '%APPDATA%\\test.txt.bak',
              operationsApplied: [],
            },
          },
        ],
      });
      mockRevertTweak.mockResolvedValue(createMockRevertSummary({ status: 'success' }));

      await RevertService.execute(summary, true);

      expect(mockUnlink).toHaveBeenCalledWith('/mock/APPDATA\\test.txt.bak');
    });

    it('should skip cleanup when no backup path available', async () => {
      const summary = createMockSummary({
        toolCalls: [
          {
            toolCallId: 'call-1',
            toolName: 'create-file-tool',
            description: 'Create file',
            status: 'success',
            timestamp: new Date().toISOString(),
            result: {
              toolName: 'create-file-tool',
              success: true,
              message: 'Done',
              timestamp: new Date().toISOString(),
              path: 'C:\\new-file.txt',
              bytesWritten: 100,
              // No backupPath
            },
          },
        ],
      });
      mockRevertTweak.mockResolvedValue(createMockRevertSummary({ status: 'success' }));

      await RevertService.execute(summary, true);

      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });
});
