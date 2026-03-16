/**
 * RecipeService Tests
 *
 * Tests the recipe lookup, validation, and execution service including:
 * - Recipe lookup by hash and gameId
 * - Recipe compatibility checking (semver)
 * - Hash validation for edit-file-tool
 * - Step output resolution (path templates)
 * - Tool argument resolution
 * - Recipe execution flow
 * - Error handling and fallback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TweakRecipe } from '@twiki/shared';
import type { ProcessTweakRequest } from '../../../interfaces';
import { GameLauncher } from '../../../interfaces';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock EnvService
vi.mock('../../core/env.service', () => ({
  EnvService: {
    get: (key: string) => {
      if (key === 'API_URL') return 'http://localhost:4111/api';
      return undefined;
    },
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

// Mock ToolStatusService
const mockToolStatusReset = vi.fn();
const mockIsSessionAborting = vi.fn().mockReturnValue(false);
vi.mock('../../agent/tool-status.service', () => ({
  ToolStatusService: {
    reset: () => mockToolStatusReset(),
    isSessionAborting: () => mockIsSessionAborting(),
  },
}));

// Mock file-hash utils
const mockComputeFileHash = vi.fn();
vi.mock('../../../utils/file-hash.utils', () => ({
  computeFileHash: (...args: unknown[]) => mockComputeFileHash(...args),
  FILE_NOT_EXISTS_HASH: '__FILE_NOT_EXISTS__',
}));

// Mock path-template utils
const mockResolvePath = vi.fn().mockImplementation((path: string) => path);
const mockResolveArgsWithStepOutputs = vi.fn().mockImplementation((args: unknown) => args);
const mockBuildPathContext = vi.fn().mockImplementation((request: ProcessTweakRequest) => ({
  installPath: request.game.installPath,
  launcherInstallPath: request.game.launcherInstallPath,
}));
vi.mock('../../../utils/path-template.utils', () => ({
  resolvePath: (...args: unknown[]) => mockResolvePath(...args),
  resolveArgsWithStepOutputs: (...args: unknown[]) => mockResolveArgsWithStepOutputs(...args),
  buildPathContext: (...args: unknown[]) => mockBuildPathContext(...args),
}));

// Mock TRANSIENT_OUTPUT_TOOLS
vi.mock('../../../constants', () => ({
  TRANSIENT_OUTPUT_TOOLS: {
    'download-file-tool': ['downloadPath', 'extractPath'],
  },
}));

// Mock shared module
vi.mock('@twiki/shared', () => ({
  CURRENT_CONTRACT_VERSION: '1.2.0',
  resolveToolName: (toolName: string) => toolName,
}));

// Mock tool registry
const mockToolExecute = vi.fn();
vi.mock('../../../tools', () => ({
  toolRegistry: {
    'edit-file-tool': {
      execute: (...args: unknown[]) => mockToolExecute(...args),
    },
    'download-file-tool': {
      execute: (...args: unknown[]) => mockToolExecute(...args),
    },
    'read-file-tool': {
      execute: (...args: unknown[]) => mockToolExecute(...args),
    },
  },
}));

import { RecipeService } from '../recipe.service';

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockRequest = (overrides?: Partial<ProcessTweakRequest>): ProcessTweakRequest => ({
  game: {
    id: 'game-123',
    launcherId: 'game-123',
    name: 'Test Game',
    installPath: 'C:\\Games\\TestGame',
    pcgwPageId: 12345,
    launcher: GameLauncher.STEAM,
    launcherInstallPath: 'C:\\Program Files\\Steam',
    posterPath: null,
    heroPath: null,
    launchConfigs: [],
    lastPlayed: null,
    pinnedAt: null,
  },
  groupTitle: 'Test Group',
  tweak: {
    hash: 'test-hash-123',
    groupTitle: 'Test Group',
    title: 'Test Tweak',
    body: 'Test body',
    notes: [],
  },
  configPaths: [],
  ...overrides,
});

const createMockRecipe = (overrides?: Partial<TweakRecipe>): TweakRecipe => ({
  id: 123,
  pcgwPageId: 12345,
  tweak: {
    hash: 'test-hash-123',
    groupTitle: 'Test Group',
    title: 'Test Tweak',
    body: 'Test body',
    notes: [],
  },
  version: 1,
  steps: [],
  approved: true,
  metadata: {
    capturedAt: new Date().toISOString(),
    clientVersion: '1.0.0',
    submissionCount: 1,
    replayCount: 0,
  },
  agentResponse: { status: 'success', message: 'Recipe completed' },
  contractVersion: '1.0.0',
  ...overrides,
});

// =============================================================================
// Tests
// =============================================================================

describe('RecipeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockToolExecute.mockReset();
    mockComputeFileHash.mockReset();
  });

  describe('lookupRecipe', () => {
    it('should return recipe when found', async () => {
      const mockRecipe = createMockRecipe();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ recipe: mockRecipe }),
      });

      const result = await RecipeService.lookupRecipe('test-hash', 12345);

      expect(result).toEqual(mockRecipe);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/recipes/lookup?')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('hash=test-hash')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('pcgwPageId=12345')
      );
    });

    it('should return null when no recipe found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ recipe: null }),
      });

      const result = await RecipeService.lookupRecipe('unknown-hash', 12345);

      expect(result).toBeNull();
    });

    it('should return null on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await RecipeService.lookupRecipe('test-hash', 12345);

      expect(result).toBeNull();
    });

    it('should return null when response has no recipe field', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await RecipeService.lookupRecipe('test-hash', 12345);

      expect(result).toBeNull();
    });
  });

  describe('executeRecipe - Contract Version Compatibility', () => {
    it('should execute recipe with older contract version (forward compatible)', async () => {
      const recipe = createMockRecipe({ contractVersion: '1.0.0' }); // Older than client 1.2.0
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(true);
      expect(mockToolStatusReset).toHaveBeenCalled();
    });

    it('should execute recipe with same contract version', async () => {
      const recipe = createMockRecipe({ contractVersion: '1.2.0' }); // Same as client
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(true);
    });

    it('should fail recipe with newer contract version', async () => {
      const recipe = createMockRecipe({ contractVersion: '2.0.0' }); // Newer than client 1.2.0
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('newer client version');
      expect(mockToolStatusReset).not.toHaveBeenCalled();
    });

    it('should treat legacy recipes without contractVersion as compatible', async () => {
      const recipe = createMockRecipe();
      delete (recipe as any).contractVersion; // Legacy recipe
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(true);
    });
  });

  describe('executeRecipe - Step Execution', () => {
    it('should execute all steps successfully', async () => {
      mockToolExecute.mockResolvedValue({ success: true, message: 'Done' });

      const recipe = createMockRecipe({
        steps: [
          {
            stepNumber: 1,
            toolName: 'edit-file-tool',
            templatedArgs: { path: 'C:\\test.txt', content: 'test' },
            flags: { requiresUserInput: false, isDownload: false },
          },
          {
            stepNumber: 2,
            toolName: 'read-file-tool',
            templatedArgs: { path: 'C:\\test.txt' },
            flags: { requiresUserInput: false, isDownload: false },
          },
        ],
      });
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(true);
      expect(result.stepsCompleted).toBe(2);
      expect(mockToolExecute).toHaveBeenCalledTimes(2);
    });

    it('should stop on step failure and return error', async () => {
      mockToolExecute
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, message: 'File not found' });

      const recipe = createMockRecipe({
        steps: [
          { stepNumber: 1, toolName: 'edit-file-tool', templatedArgs: {}, flags: { requiresUserInput: false, isDownload: false } },
          { stepNumber: 2, toolName: 'edit-file-tool', templatedArgs: {}, flags: { requiresUserInput: false, isDownload: false } },
          { stepNumber: 3, toolName: 'edit-file-tool', templatedArgs: {}, flags: { requiresUserInput: false, isDownload: false } },
        ],
      });
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Step 2 failed');
      expect(result.stepsCompleted).toBe(1);
      expect(mockToolExecute).toHaveBeenCalledTimes(2);
    });

    it('should return declined error when user declines', async () => {
      mockToolExecute.mockResolvedValue({
        success: false,
        message: 'User declined the operation',
      });

      const recipe = createMockRecipe({
        steps: [{ stepNumber: 1, toolName: 'edit-file-tool', templatedArgs: {}, flags: { requiresUserInput: false, isDownload: false } }],
      });
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('declined by user');
      expect(result.stepsCompleted).toBe(0);
    });

    it('should handle unknown tool', async () => {
      const recipe = createMockRecipe({
        steps: [
          { stepNumber: 1, toolName: 'unknown-tool', templatedArgs: {}, flags: { requiresUserInput: false, isDownload: false } },
        ],
      });
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });

    it('should use original download URL for download steps', async () => {
      mockToolExecute.mockResolvedValue({ success: true, downloadPath: '/tmp/file.zip' });
      mockResolveArgsWithStepOutputs.mockImplementation((args: Record<string, unknown>) => ({
        ...args,
        downloadUrl: 'resolved-url',
      }));

      const recipe = createMockRecipe({
        steps: [{
          stepNumber: 1,
          toolName: 'download-file-tool',
          templatedArgs: { downloadUrl: 'resolved-url' },
          flags: { requiresUserInput: false, isDownload: true, downloadUrl: 'original-url' },
        }],
      });
      const request = createMockRequest();

      await RecipeService.executeRecipe(recipe, request);

      expect(mockToolExecute).toHaveBeenCalledWith(
        expect.objectContaining({ downloadUrl: 'original-url' })
      );
    });
  });

  describe('executeRecipe - Hash Validation', () => {
    it('should validate beforeHash for edit-file-tool steps', async () => {
      mockComputeFileHash.mockResolvedValue('correct-hash');
      mockToolExecute.mockResolvedValue({ success: true });
      mockResolvePath.mockImplementation((path: string) => path);

      const recipe = createMockRecipe({
        steps: [{
          stepNumber: 1,
          toolName: 'edit-file-tool',
          templatedArgs: { path: 'C:\\test.txt' },
          flags: { requiresUserInput: false, isDownload: false },
          fileHashes: [{
            filePath: 'C:\\test.txt',
            beforeHash: 'correct-hash',
            afterHash: 'new-hash',
          }],
        }],
      });
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(true);
      expect(mockComputeFileHash).toHaveBeenCalledWith('C:\\test.txt');
    });

    it('should fail on hash mismatch and require agent mode', async () => {
      mockComputeFileHash.mockResolvedValue('different-hash');
      mockResolvePath.mockImplementation((path: string) => path);

      const recipe = createMockRecipe({
        steps: [{
          stepNumber: 1,
          toolName: 'edit-file-tool',
          templatedArgs: { path: 'C:\\test.txt' },
          flags: { requiresUserInput: false, isDownload: false },
          fileHashes: [{
            filePath: 'C:\\test.txt',
            beforeHash: 'expected-hash',
            afterHash: 'new-hash',
          }],
        }],
      });
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(false);
      expect(result.requiresAgentMode).toBe(true);
      expect(result.error).toContain('beforeHash validation failed');
      expect(mockToolExecute).not.toHaveBeenCalled();
    });

    it('should fail when file does not exist but expected hash', async () => {
      mockComputeFileHash.mockResolvedValue(null);
      mockResolvePath.mockImplementation((path: string) => path);

      const recipe = createMockRecipe({
        steps: [{
          stepNumber: 1,
          toolName: 'edit-file-tool',
          templatedArgs: { path: 'C:\\missing.txt' },
          flags: { requiresUserInput: false, isDownload: false },
          fileHashes: [{
            filePath: 'C:\\missing.txt',
            beforeHash: 'some-hash',
            afterHash: 'new-hash',
          }],
        }],
      });
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File does not exist');
    });

    it('should skip hash validation for non-edit tools', async () => {
      mockToolExecute.mockResolvedValue({ success: true });

      const recipe = createMockRecipe({
        steps: [{
          stepNumber: 1,
          toolName: 'read-file-tool',
          templatedArgs: { path: 'C:\\test.txt' },
          flags: { requiresUserInput: false, isDownload: false },
          fileHashes: [{
            filePath: 'C:\\test.txt',
            beforeHash: 'any-hash',
            afterHash: 'any-hash',
          }],
        }],
      });
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(true);
      expect(mockComputeFileHash).not.toHaveBeenCalled();
    });

    it('should skip hash validation when no fileHashes provided', async () => {
      mockToolExecute.mockResolvedValue({ success: true });

      const recipe = createMockRecipe({
        steps: [{
          stepNumber: 1,
          toolName: 'edit-file-tool',
          templatedArgs: { path: 'C:\\test.txt' },
          flags: { requiresUserInput: false, isDownload: false },
          // No fileHashes
        }],
      });
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(true);
      expect(mockComputeFileHash).not.toHaveBeenCalled();
    });
  });

  describe('executeRecipe - Step Output Capture', () => {
    it('should capture and pass outputs between steps', async () => {
      mockToolExecute
        .mockResolvedValueOnce({
          success: true,
          downloadPath: '/tmp/downloaded.zip',
          extractPath: '/tmp/extracted',
        })
        .mockResolvedValueOnce({ success: true });

      const recipe = createMockRecipe({
        steps: [
          {
            stepNumber: 1,
            toolName: 'download-file-tool',
            templatedArgs: { url: 'http://example.com/file.zip' },
            flags: { requiresUserInput: false, isDownload: false },
          },
          {
            stepNumber: 2,
            toolName: 'edit-file-tool',
            templatedArgs: { path: '{STEP_1_OUTPUT.extractPath}/config.ini' },
            flags: { requiresUserInput: false, isDownload: false },
          },
        ],
      });
      const request = createMockRequest();

      await RecipeService.executeRecipe(recipe, request);

      // Verify step outputs were passed to resolveArgsWithStepOutputs
      expect(mockResolveArgsWithStepOutputs).toHaveBeenLastCalledWith(
        { path: '{STEP_1_OUTPUT.extractPath}/config.ini' },
        expect.any(Object),
        expect.any(Map)
      );
    });
  });

  describe('buildPathContext', () => {
    it('should delegate to shared utility', () => {
      const request = createMockRequest();

      const result = RecipeService.buildPathContext(request);

      expect(mockBuildPathContext).toHaveBeenCalledWith(request);
      expect(result).toEqual({
        installPath: request.game.installPath,
        launcherInstallPath: request.game.launcherInstallPath,
      });
    });
  });

  describe('isAborting', () => {
    it('should delegate to ToolStatusService', () => {
      mockIsSessionAborting.mockReturnValue(true);

      const result = RecipeService.isAborting();

      expect(result).toBe(true);
      expect(mockIsSessionAborting).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should catch and return tool execution errors', async () => {
      mockToolExecute.mockRejectedValue(new Error('Execution error'));

      const recipe = createMockRecipe({
        steps: [{ stepNumber: 1, toolName: 'edit-file-tool', templatedArgs: {}, flags: { requiresUserInput: false, isDownload: false } }],
      });
      const request = createMockRequest();

      const result = await RecipeService.executeRecipe(recipe, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Execution error');
    });
  });
});
