/**
 * Tweak IPC Handler Tests
 *
 * Tests the tweak IPC handlers including:
 * - PCGW tweaks fetching
 * - Applied tweaks CRUD operations
 * - Revert operations
 * - Tweak metadata fetching
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppliedTweak, TweakSummary, GameLauncher } from '../../interfaces';

// Store registered handlers for testing
const registeredHandlers: Map<string, Function> = new Map();

// Mock ipc-handler.factory
vi.mock('../ipc-handler.factory', () => ({
  createIpcHandlers: (configs: Array<{ channel: string; handler: Function }>) => {
    for (const config of configs) {
      registeredHandlers.set(config.channel, config.handler);
    }
  },
}));

// Mock PCGamingWikiService
vi.mock('../../services/game/pcgamingwiki.service', () => ({
  PCGamingWikiService: {
    getGameFixes: vi.fn(),
  },
}));

// Mock AppliedTweaksService
vi.mock('../../services/tweak/applied-tweaks.service', () => ({
  AppliedTweaksService: {
    getByGame: vi.fn(),
    getAll: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
  },
}));

// Mock RevertService
vi.mock('../../services/tweak/revert.service', () => ({
  RevertService: {
    execute: vi.fn(),
    preCheck: vi.fn(),
  },
}));

// Mock TweakMetadataService
vi.mock('../../services/tweak/tweak-metadata.service', () => ({
  TweakMetadataService: {
    fetchTweakMetadata: vi.fn(),
  },
}));

// Mock GameLibraryService (used by applied-tweaks:get-by-game to resolve composite ID to launcherId)
const mockGetGameForTweak = vi.fn();
vi.mock('../../services/game/game-library.service', () => ({
  GameLibraryService: {
    getInstance: () => ({
      getGame: mockGetGameForTweak,
    }),
  },
}));

// Import after mocks
import {
  setupPcgwIpc,
  setupAppliedTweaksIpc,
  setupRevertIpc,
  setupTweakMetadataIpc,
} from '../tweak.ipc';
import { PCGamingWikiService } from '../../services/game/pcgamingwiki.service';
import { AppliedTweaksService } from '../../services/tweak/applied-tweaks.service';
import { RevertService } from '../../services/tweak/revert.service';
import { TweakMetadataService } from '../../services/tweak/tweak-metadata.service';

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockAppliedTweak = (hash = 'tweak-hash-123'): AppliedTweak => ({
  pcgwPageId: 12345,
  launcherGameId: 'steam-123',
  tweak: {
    hash,
    groupTitle: 'Test Group',
    title: 'Test Tweak',
    body: 'Test body',
    notes: [],
  },
  status: 'success',
  summary: {
    status: 'success',
    message: 'Applied successfully',
    toolCalls: [],
  },
  appliedAt: '2024-01-15T12:00:00Z',
});

const createMockTweakSummary = (): TweakSummary => ({
  status: 'success',
  message: 'Applied',
  toolCalls: [],
});

// Helper to invoke a registered handler
const invokeHandler = async (channel: string, args?: unknown) => {
  const handler = registeredHandlers.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  const mockEvent = { sender: {} };
  return handler(mockEvent, args);
};

// =============================================================================
// Tests
// =============================================================================

describe('Tweak IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers.clear();
  });

  describe('PCGW IPC', () => {
    beforeEach(() => {
      setupPcgwIpc();
    });

    describe('pcgw:get-tweaks', () => {
      it('should fetch game fixes from PCGamingWikiService', async () => {
        const mockFixes = [
          { name: 'Fix 1', hash: 'hash-1' },
          { name: 'Fix 2', hash: 'hash-2' },
        ];
        vi.mocked(PCGamingWikiService.getGameFixes).mockResolvedValue(mockFixes as any);

        const result = await invokeHandler('pcgw:get-tweaks', {
          gameId: '12345',
          launcher: 'steam' as GameLauncher,
        });

        expect(result).toEqual(mockFixes);
        expect(PCGamingWikiService.getGameFixes).toHaveBeenCalledWith('12345', 'steam');
      });

      it('should pass launcher parameter correctly', async () => {
        vi.mocked(PCGamingWikiService.getGameFixes).mockResolvedValue(null as any);

        await invokeHandler('pcgw:get-tweaks', {
          gameId: '67890',
          launcher: 'gog' as GameLauncher,
        });

        expect(PCGamingWikiService.getGameFixes).toHaveBeenCalledWith('67890', 'gog');
      });
    });
  });

  describe('Applied Tweaks IPC', () => {
    beforeEach(() => {
      setupAppliedTweaksIpc();
    });

    describe('applied-tweaks:get-by-game', () => {
      it('should get applied tweaks for a game', async () => {
        const mockTweaks = [createMockAppliedTweak()];
        vi.mocked(AppliedTweaksService.getByGame).mockResolvedValue(mockTweaks);
        // Mock GameLibraryService to resolve the composite ID to the launcher-specific ID
        mockGetGameForTweak.mockReturnValue({ launcherId: 'steam-123' });

        const result = await invokeHandler('applied-tweaks:get-by-game', 'steam:steam-123:abcd1234');

        expect(result).toEqual(mockTweaks);
        expect(AppliedTweaksService.getByGame).toHaveBeenCalledWith('steam-123');
      });

      it('should return empty array when no tweaks applied', async () => {
        vi.mocked(AppliedTweaksService.getByGame).mockResolvedValue([]);
        // Mock GameLibraryService returning undefined (game not found) - falls back to gameId as-is
        mockGetGameForTweak.mockReturnValue(undefined);

        const result = await invokeHandler('applied-tweaks:get-by-game', 'unknown-game');

        expect(result).toEqual([]);
      });
    });

    describe('applied-tweaks:get-all', () => {
      it('should get all applied tweaks', async () => {
        const mockTweaks = [
          createMockAppliedTweak('hash-1'),
          createMockAppliedTweak('hash-2'),
        ];
        vi.mocked(AppliedTweaksService.getAll).mockResolvedValue(mockTweaks);

        const result = await invokeHandler('applied-tweaks:get-all');

        expect(result).toEqual(mockTweaks);
        expect(AppliedTweaksService.getAll).toHaveBeenCalled();
      });
    });

    describe('applied-tweaks:add', () => {
      it('should add an applied tweak', async () => {
        const mockTweak = createMockAppliedTweak();
        vi.mocked(AppliedTweaksService.add).mockResolvedValue(undefined);

        await invokeHandler('applied-tweaks:add', mockTweak);

        expect(AppliedTweaksService.add).toHaveBeenCalledWith(mockTweak);
      });
    });

    describe('applied-tweaks:remove', () => {
      it('should remove an applied tweak by hash', async () => {
        vi.mocked(AppliedTweaksService.remove).mockResolvedValue(true);

        await invokeHandler('applied-tweaks:remove', 'tweak-hash-123');

        expect(AppliedTweaksService.remove).toHaveBeenCalledWith('tweak-hash-123');
      });
    });
  });

  describe('Revert IPC', () => {
    beforeEach(() => {
      setupRevertIpc();
    });

    describe('revert:execute', () => {
      it('should execute revert for a tweak summary', async () => {
        const mockSummary = createMockTweakSummary();
        const mockResult = { success: true, revertedCount: 3 };
        vi.mocked(RevertService.execute).mockResolvedValue(mockResult as any);

        const result = await invokeHandler('revert:execute', mockSummary);

        expect(result).toEqual(mockResult);
        expect(RevertService.execute).toHaveBeenCalledWith(mockSummary);
      });
    });

    describe('revert:pre-check', () => {
      it('should perform pre-check for revert conflicts', async () => {
        const mockTweak = createMockAppliedTweak();
        const allTweaks = [mockTweak, createMockAppliedTweak('other-hash')];
        const mockPreCheckResult = {
          canRevert: true,
          conflicts: [],
        };

        vi.mocked(AppliedTweaksService.getAll).mockResolvedValue(allTweaks);
        vi.mocked(RevertService.preCheck).mockReturnValue(mockPreCheckResult as any);

        const result = await invokeHandler('revert:pre-check', mockTweak);

        expect(result).toEqual(mockPreCheckResult);
        expect(AppliedTweaksService.getAll).toHaveBeenCalled();
        expect(RevertService.preCheck).toHaveBeenCalledWith(mockTweak, allTweaks);
      });
    });

    describe('revert:execute-with-fallback', () => {
      it('should execute revert with fallback option', async () => {
        const mockTweak = createMockAppliedTweak();
        const mockResult = { success: true };
        vi.mocked(RevertService.execute).mockResolvedValue(mockResult as any);

        const result = await invokeHandler('revert:execute-with-fallback', {
          tweak: mockTweak,
          useFallback: true,
        });

        expect(result).toEqual(mockResult);
        expect(RevertService.execute).toHaveBeenCalledWith(mockTweak.summary, false, true);
      });

      it('should execute revert without fallback', async () => {
        const mockTweak = createMockAppliedTweak();
        vi.mocked(RevertService.execute).mockResolvedValue({ success: true } as any);

        await invokeHandler('revert:execute-with-fallback', {
          tweak: mockTweak,
          useFallback: false,
        });

        expect(RevertService.execute).toHaveBeenCalledWith(mockTweak.summary, false, false);
      });
    });
  });

  describe('Tweak Metadata IPC', () => {
    beforeEach(() => {
      setupTweakMetadataIpc();
    });

    describe('tweak-metadata:fetch', () => {
      it('should fetch tweak metadata and return as object', async () => {
        const mockMetadata = new Map([
          ['hash-1', { upvotes: 10, downvotes: 2 }],
          ['hash-2', { upvotes: 5, downvotes: 1 }],
        ]);
        vi.mocked(TweakMetadataService.fetchTweakMetadata).mockResolvedValue(mockMetadata as any);

        const result = await invokeHandler('tweak-metadata:fetch', {
          hashes: ['hash-1', 'hash-2'],
          pcgwPageId: 12345,
        });

        expect(result).toEqual({
          'hash-1': { upvotes: 10, downvotes: 2 },
          'hash-2': { upvotes: 5, downvotes: 1 },
        });
        expect(TweakMetadataService.fetchTweakMetadata).toHaveBeenCalledWith(['hash-1', 'hash-2'], 12345, undefined);
      });

      it('should pass launcher to fetchTweakMetadata when provided', async () => {
        const mockMetadata = new Map([
          ['hash-1', { canApply: true }],
        ]);
        vi.mocked(TweakMetadataService.fetchTweakMetadata).mockResolvedValue(mockMetadata as any);

        await invokeHandler('tweak-metadata:fetch', {
          hashes: ['hash-1'],
          pcgwPageId: 12345,
          launcher: 'xbox',
        });

        expect(TweakMetadataService.fetchTweakMetadata).toHaveBeenCalledWith(['hash-1'], 12345, 'xbox');
      });

      it('should handle empty metadata response', async () => {
        vi.mocked(TweakMetadataService.fetchTweakMetadata).mockResolvedValue(new Map() as any);

        const result = await invokeHandler('tweak-metadata:fetch', {
          hashes: ['unknown-hash'],
          pcgwPageId: 12345,
        });

        expect(result).toEqual({});
      });
    });
  });
});
