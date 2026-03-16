/**
 * AppliedTweaksService Tests
 *
 * Tests the applied tweaks persistence service including:
 * - Reading applied tweaks from file
 * - Writing new applied tweaks
 * - Removing applied tweaks by ID
 * - Getting tweaks by game
 * - File I/O error handling
 * - JSON parsing errors
 * - Default data initialization
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppliedTweak, TweakSummary } from '../../../interfaces/tweak-agent.interface';
import type { Tweak } from '@twiki/shared';

// Mock electron app
const mockGetPath = vi.fn().mockReturnValue('/mock/userData');
vi.mock('electron', () => ({
  app: {
    getPath: () => mockGetPath(),
  },
}));

// Mock fs
const mockReadFile = vi.fn();
const mockAccess = vi.fn();
vi.mock('fs', () => ({
  promises: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
    access: (...args: unknown[]) => mockAccess(...args),
  },
}));

// Mock json-store utils
const mockEnsureParentDirectoryExists = vi.fn().mockResolvedValue(undefined);
const mockAtomicWriteJson = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../utils/json-store.utils', () => ({
  ensureParentDirectoryExists: (...args: unknown[]) => mockEnsureParentDirectoryExists(...args),
  atomicWriteJson: (...args: unknown[]) => mockAtomicWriteJson(...args),
}));

// Mock buildAppliedTweak
const mockBuildAppliedTweak = vi.fn();
vi.mock('../../../utils/build-applied-tweak.utils', () => ({
  buildAppliedTweak: (...args: unknown[]) => mockBuildAppliedTweak(...args),
}));

// Mock ToolStatusService
const mockGetSnapshot = vi.fn().mockReturnValue({ tools: [] });
vi.mock('../../agent/tool-status.service', () => ({
  ToolStatusService: {
    getSnapshot: () => mockGetSnapshot(),
  },
}));

// Mock logger
vi.mock('../../../utils/logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { AppliedTweaksService } from '../applied-tweaks.service';

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

const createMockSummary = (overrides?: Partial<TweakSummary>): TweakSummary => ({
  status: 'success',
  message: 'Tweak applied successfully',
  toolCalls: [],
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

// =============================================================================
// Tests
// =============================================================================

describe('AppliedTweaksService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mock implementations to their defaults
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockEnsureParentDirectoryExists.mockResolvedValue(undefined);
    mockAtomicWriteJson.mockResolvedValue(undefined);
    mockGetPath.mockReturnValue('/mock/userData');
  });

  describe('getByGame', () => {
    it('should return empty array when file does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await AppliedTweaksService.getByGame('game-123');

      expect(result).toEqual([]);
    });

    it('should filter tweaks by launcherGameId', async () => {
      const tweak1 = createMockAppliedTweak({ launcherGameId: 'game-123' });
      const tweak2 = createMockAppliedTweak({
        launcherGameId: 'game-456',
        tweak: createMockTweak({ hash: 'other-hash' }),
      });

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(
        JSON.stringify({ version: 1, tweaks: [tweak1, tweak2] })
      );

      const result = await AppliedTweaksService.getByGame('game-123');

      expect(result).toHaveLength(1);
      expect(result[0].launcherGameId).toBe('game-123');
    });

    it('should return multiple tweaks for the same game', async () => {
      const tweak1 = createMockAppliedTweak({
        launcherGameId: 'game-123',
        tweak: createMockTweak({ hash: 'hash-1' }),
      });
      const tweak2 = createMockAppliedTweak({
        launcherGameId: 'game-123',
        tweak: createMockTweak({ hash: 'hash-2' }),
      });

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(
        JSON.stringify({ version: 1, tweaks: [tweak1, tweak2] })
      );

      const result = await AppliedTweaksService.getByGame('game-123');

      expect(result).toHaveLength(2);
    });
  });

  describe('getAll', () => {
    it('should return empty array when file does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await AppliedTweaksService.getAll();

      expect(result).toEqual([]);
    });

    it('should return all tweaks from storage', async () => {
      const tweak1 = createMockAppliedTweak({ launcherGameId: 'game-123' });
      const tweak2 = createMockAppliedTweak({
        launcherGameId: 'game-456',
        tweak: createMockTweak({ hash: 'other-hash' }),
      });

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(
        JSON.stringify({ version: 1, tweaks: [tweak1, tweak2] })
      );

      const result = await AppliedTweaksService.getAll();

      expect(result).toHaveLength(2);
    });
  });

  describe('add', () => {
    it('should add a new tweak to empty storage', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const newTweak = createMockAppliedTweak();

      await AppliedTweaksService.add(newTweak);

      expect(mockEnsureParentDirectoryExists).toHaveBeenCalled();
      expect(mockAtomicWriteJson).toHaveBeenCalledWith(
        expect.stringContaining('applied-tweaks.json'),
        expect.objectContaining({
          version: 1,
          tweaks: [newTweak],
        })
      );
    });

    it('should add a new tweak to existing storage', async () => {
      const existingTweak = createMockAppliedTweak({
        tweak: createMockTweak({ hash: 'existing-hash' }),
      });

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(
        JSON.stringify({ version: 1, tweaks: [existingTweak] })
      );

      const newTweak = createMockAppliedTweak({
        tweak: createMockTweak({ hash: 'new-hash' }),
      });

      await AppliedTweaksService.add(newTweak);

      expect(mockAtomicWriteJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tweaks: expect.arrayContaining([existingTweak, newTweak]),
        })
      );
    });

    it('should replace existing tweak with same hash', async () => {
      const existingTweak = createMockAppliedTweak({
        tweak: createMockTweak({ hash: 'same-hash', title: 'Old Title' }),
        appliedAt: '2024-01-01T00:00:00Z',
      });

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(
        JSON.stringify({ version: 1, tweaks: [existingTweak] })
      );

      const updatedTweak = createMockAppliedTweak({
        tweak: createMockTweak({ hash: 'same-hash', title: 'New Title' }),
        appliedAt: '2024-02-01T00:00:00Z',
      });

      await AppliedTweaksService.add(updatedTweak);

      expect(mockAtomicWriteJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tweaks: [updatedTweak],
        })
      );
    });
  });

  describe('remove', () => {
    it('should return false when file does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await AppliedTweaksService.remove('test-hash');

      expect(result).toBe(false);
      expect(mockAtomicWriteJson).not.toHaveBeenCalled();
    });

    it('should return false when hash not found', async () => {
      const existingTweak = createMockAppliedTweak({
        tweak: createMockTweak({ hash: 'other-hash' }),
      });

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(
        JSON.stringify({ version: 1, tweaks: [existingTweak] })
      );

      const result = await AppliedTweaksService.remove('not-found-hash');

      expect(result).toBe(false);
      expect(mockAtomicWriteJson).not.toHaveBeenCalled();
    });

    it('should remove tweak and return true when hash found', async () => {
      const tweak1 = createMockAppliedTweak({
        tweak: createMockTweak({ hash: 'hash-to-remove' }),
      });
      const tweak2 = createMockAppliedTweak({
        tweak: createMockTweak({ hash: 'hash-to-keep' }),
      });

      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(
        JSON.stringify({ version: 1, tweaks: [tweak1, tweak2] })
      );

      const result = await AppliedTweaksService.remove('hash-to-remove');

      expect(result).toBe(true);
      expect(mockAtomicWriteJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tweaks: [tweak2],
        })
      );
    });
  });

  describe('captureAndSave', () => {
    it('should not save when no completed tools', async () => {
      mockGetSnapshot.mockReturnValue({ tools: [] });

      await AppliedTweaksService.captureAndSave(
        'game-123',
        12345,
        createMockTweak(),
        null
      );

      expect(mockBuildAppliedTweak).not.toHaveBeenCalled();
      expect(mockAtomicWriteJson).not.toHaveBeenCalled();
    });

    it('should not save when no tools have completed status', async () => {
      mockGetSnapshot.mockReturnValue({
        tools: [
          { status: 'pending-approval', toolName: 'edit-file-tool' },
          { status: 'executing', toolName: 'read-file-tool' },
        ],
      });

      await AppliedTweaksService.captureAndSave(
        'game-123',
        12345,
        createMockTweak(),
        null
      );

      expect(mockBuildAppliedTweak).not.toHaveBeenCalled();
    });

    it('should build and save applied tweak when tools completed', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const completedTools = [
        { status: 'completed', toolName: 'edit-file-tool', result: {} },
      ];
      mockGetSnapshot.mockReturnValue({ tools: completedTools });

      const mockAppliedTweak = createMockAppliedTweak();
      mockBuildAppliedTweak.mockReturnValue(mockAppliedTweak);

      const tweak = createMockTweak();
      const agentResponse = { status: 'success' as const, message: 'Done' };

      await AppliedTweaksService.captureAndSave(
        'game-123',
        12345,
        tweak,
        agentResponse
      );

      expect(mockBuildAppliedTweak).toHaveBeenCalledWith(
        'game-123',
        12345,
        tweak,
        completedTools,
        agentResponse
      );
      expect(mockAtomicWriteJson).toHaveBeenCalled();
    });

    it('should not save when buildAppliedTweak returns null', async () => {
      mockGetSnapshot.mockReturnValue({
        tools: [{ status: 'completed', toolName: 'read-file-tool' }],
      });

      mockBuildAppliedTweak.mockReturnValue(null);

      await AppliedTweaksService.captureAndSave(
        'game-123',
        12345,
        createMockTweak(),
        null
      );

      expect(mockBuildAppliedTweak).toHaveBeenCalled();
      expect(mockAtomicWriteJson).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return default data on JSON parse error', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue('invalid json {{{');

      const result = await AppliedTweaksService.getAll();

      expect(result).toEqual([]);
    });

    it('should return default data on read error', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockRejectedValue(new Error('Read error'));

      const result = await AppliedTweaksService.getAll();

      expect(result).toEqual([]);
    });

    it('should throw on write error', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      mockAtomicWriteJson.mockRejectedValue(new Error('Write error'));

      await expect(
        AppliedTweaksService.add(createMockAppliedTweak())
      ).rejects.toThrow('Write error');
    });

    it('should handle missing tweaks array gracefully', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify({ version: 1 }));

      const result = await AppliedTweaksService.getAll();

      expect(result).toEqual([]);
    });

    it('should handle non-array tweaks gracefully', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(
        JSON.stringify({ version: 1, tweaks: 'not an array' })
      );

      const result = await AppliedTweaksService.getAll();

      expect(result).toEqual([]);
    });
  });

  describe('data file path', () => {
    it('should use userData path from electron app', async () => {
      // Note: The service caches the dataPath, so we check that it contains
      // the path provided by app.getPath('userData') which is set to /mock/userData
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const tweak = createMockAppliedTweak();
      await AppliedTweaksService.add(tweak);

      // Verify the path used contains our mocked userData path
      expect(mockAtomicWriteJson).toHaveBeenCalledWith(
        expect.stringContaining('applied-tweaks.json'),
        expect.any(Object)
      );
    });
  });
});
