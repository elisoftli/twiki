import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProcessTweakRequest } from '../../interfaces';
import { GameLauncher } from '../../interfaces';
import type { TweakRecipe, Tweak } from '@twiki/shared';

// WebSocket mock state - shared across tests
let wsHandlers: Record<string, Function> = {};
let wsSendMock = vi.fn();
let wsCloseMock = vi.fn();
let wsReadyState = 1; // OPEN

// Mock WebSocket before importing AgentService
vi.mock('ws', () => {
  return {
    default: class MockWebSocket {
      static OPEN = 1;
      static CLOSED = 3;

      readyState = wsReadyState;

      constructor() {
        wsHandlers = {};
        wsSendMock = vi.fn();
        wsCloseMock = vi.fn();
      }

      on(event: string, handler: Function) {
        wsHandlers[event] = handler;
        // Trigger open immediately for testing
        if (event === 'open') {
          setTimeout(() => handler(), 5);
        }
      }

      send(data: string) {
        wsSendMock(data);
      }

      close() {
        wsCloseMock();
      }
    },
  };
});

// Mock MainWindow
vi.mock('../../windows', () => ({
  MainWindow: {
    getWindow: () => ({
      webContents: {
        send: vi.fn(),
      },
    }),
  },
}));

// Mock logger
vi.mock('../../utils/logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock generateInstructions
vi.mock('../../utils/agent-instructions.utils', () => ({
  generateInstructions: vi.fn().mockReturnValue('mock instructions'),
}));

// Mock buildAppliedTweak
vi.mock('../../utils/build-applied-tweak.utils', () => ({
  buildAppliedTweak: vi.fn().mockReturnValue(null),
}));

// Mock toolRegistry and convertAllToolsToAnthropic
vi.mock('../../tools', () => ({
  toolRegistry: [],
}));

vi.mock('@twiki/shared', () => ({
  convertAllToolsToAnthropic: vi.fn().mockReturnValue([]),
  CURRENT_CONTRACT_VERSION: '1.0.0',
}));

// Import after mocks are set up
import { AgentService } from '../agent/agent.service';

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
  tweak: createMockTweak(),
  configPaths: [],
  ...overrides,
});

const createMockRecipe = (overrides?: Partial<TweakRecipe>): TweakRecipe => ({
  id: 123,
  pcgwPageId: 12345,
  tweak: createMockTweak(),
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
  ...overrides,
});

const createMockDeps = () => ({
  toolStatusService: {
    reset: vi.fn(),
    hasCompletedModificationTools: vi.fn().mockReturnValue(false),
    getSnapshot: vi.fn().mockReturnValue({ tools: [] }),
    abortAllTools: vi.fn().mockResolvedValue(undefined),
  },
  toolExecutorService: {
    execute: vi.fn().mockResolvedValue({ success: true, result: {} }),
  },
  settingsService: {
    settings: { specsVisibility: {} },
  },
  systemSpecsService: {
    specs: {},
  },
  appliedTweaksService: {
    captureAndSave: vi.fn(),
  },
  revertService: {
    execute: vi.fn().mockResolvedValue({ status: 'success' }),
  },
  recipeService: {
    lookupRecipe: vi.fn().mockResolvedValue(null),
    executeRecipe: vi.fn().mockResolvedValue({ success: true }),
    captureAndSubmit: vi.fn(),
  },
  failedAttemptService: {
    captureAndSubmit: vi.fn().mockResolvedValue(undefined),
  },
  envService: {
    get: vi.fn().mockReturnValue('ws://localhost:3000'),
  },
  authService: {
    getValidAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
  },
});

// Helper to simulate WebSocket messages
const simulateMessage = (message: object) => {
  if (wsHandlers['message']) {
    wsHandlers['message'](Buffer.from(JSON.stringify(message)));
  }
};

const simulateError = (error: Error) => {
  if (wsHandlers['error']) {
    wsHandlers['error'](error);
  }
};

const simulateClose = () => {
  if (wsHandlers['close']) {
    wsHandlers['close']();
  }
};

const waitForOpen = () => new Promise((r) => setTimeout(r, 15));

// =============================================================================
// Tests
// =============================================================================

describe('AgentService', () => {
  let service: AgentService;
  let mockDeps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    vi.clearAllMocks();
    wsHandlers = {};
    wsSendMock = vi.fn();
    wsCloseMock = vi.fn();
    wsReadyState = 1;
    mockDeps = createMockDeps();
    service = new AgentService(mockDeps as any);
  });

  describe('constructor', () => {
    it('should initialize with idle status', () => {
      const status = service.status;

      expect(status.isRunning).toBe(false);
      expect(status.response).toBeNull();
      expect(status.error).toBeNull();
      expect(status.threadId).toBeNull();
      expect(status.executionMode).toBeNull();
    });

    it('should use provided dependencies', () => {
      const customDeps = createMockDeps();
      const customService = new AgentService(customDeps as any);

      expect(customService).toBeInstanceOf(AgentService);
    });
  });

  describe('status getter', () => {
    it('should return a copy of status (immutable)', () => {
      const status1 = service.status;
      const status2 = service.status;

      expect(status1).not.toBe(status2);
      expect(status1).toEqual(status2);
    });
  });

  describe('processTweak', () => {
    it('should return error if already running', async () => {
      const request = createMockRequest();
      const recipe = createMockRecipe();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(recipe);
      mockDeps.recipeService.executeRecipe.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      // Start first task (don't await)
      service.processTweak(request);

      // Try to start second task
      const result = await service.processTweak(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('A task is already running');
    });

    it('should return error if game has no pcgwPageId', async () => {
      const request = createMockRequest({
        game: {
          id: 'game-123',
          launcherId: 'game-123',
          name: 'Test Game',
          installPath: 'C:\\Games\\TestGame',
          pcgwPageId: undefined as any,
          launcher: GameLauncher.STEAM,
          launcherInstallPath: 'C:\\Program Files\\Steam',
          posterPath: null,
          heroPath: null,
          launchConfigs: [],
          lastPlayed: null,
          pinnedAt: null,
        },
      });

      const result = await service.processTweak(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot process tweak - game has no PCGW page linked');
    });

    it('should always call lookupRecipe for metrics tracking', async () => {
      const request = createMockRequest();
      const recipe = createMockRecipe();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(recipe);
      mockDeps.recipeService.executeRecipe.mockResolvedValue({ success: true });

      await service.processTweak(request);

      expect(mockDeps.recipeService.lookupRecipe).toHaveBeenCalledWith(
        request.tweak.hash,
        request.game.pcgwPageId,
        request.game.launcher
      );
      expect(mockDeps.recipeService.executeRecipe).toHaveBeenCalledWith(recipe, request);
    });

    it('should proceed to agent when no recipe found', async () => {
      const request = createMockRequest();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(null);

      const promise = service.processTweak(request);
      await waitForOpen();

      // Verify we're using agent mode
      expect(service.status.executionMode).toBe('agent');

      // Complete the session
      simulateMessage({
        type: 'agent_done',
        response: { status: 'success', message: 'Done' },
      });

      await promise;
      expect(mockDeps.recipeService.lookupRecipe).toHaveBeenCalled();
    });
  });

  describe('executeRecipe (via processTweak)', () => {
    it('should save applied tweak on success', async () => {
      const request = createMockRequest();
      const recipe = createMockRecipe();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(recipe);
      mockDeps.recipeService.executeRecipe.mockResolvedValue({ success: true });

      const result = await service.processTweak(request);

      expect(result.success).toBe(true);
      expect(mockDeps.appliedTweaksService.captureAndSave).toHaveBeenCalledWith(
        request.game.launcherId,
        request.game.pcgwPageId,
        request.tweak,
        null
      );
    });

    it('should set status to running during recipe execution', async () => {
      const request = createMockRequest();
      const recipe = createMockRecipe();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(recipe);

      let statusDuringExecution: any;
      mockDeps.recipeService.executeRecipe.mockImplementation(async () => {
        statusDuringExecution = service.status;
        return { success: true };
      });

      await service.processTweak(request);

      expect(statusDuringExecution.isRunning).toBe(true);
      expect(statusDuringExecution.executionMode).toBe('recipe');
      expect(statusDuringExecution.threadId).toBe(`recipe_${recipe.id}`);
    });

    it('should return error when user declines', async () => {
      const request = createMockRequest();
      const recipe = createMockRecipe();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(recipe);
      mockDeps.recipeService.executeRecipe.mockResolvedValue({
        success: false,
        error: 'User declined the operation',
      });

      const result = await service.processTweak(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('declined');
      expect(service.status.isRunning).toBe(false);
    });

    it('should reset tool status before execution', async () => {
      const request = createMockRequest();
      const recipe = createMockRecipe();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(recipe);
      mockDeps.recipeService.executeRecipe.mockResolvedValue({ success: true });

      await service.processTweak(request);

      expect(mockDeps.toolStatusService.reset).toHaveBeenCalled();
    });
  });

  describe('abortTask', () => {
    it('should set error status', async () => {
      await service.abortTask();

      expect(service.status.error).toBe('Task was aborted by user');
      expect(service.status.isRunning).toBe(false);
    });

    it('should abort all running tools', async () => {
      await service.abortTask();

      expect(mockDeps.toolStatusService.abortAllTools).toHaveBeenCalled();
    });
  });

  describe('resetStatus', () => {
    it('should reset status to idle', async () => {
      const request = createMockRequest();
      const recipe = createMockRecipe();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(recipe);
      mockDeps.recipeService.executeRecipe.mockResolvedValue({ success: true });

      await service.processTweak(request);
      service.resetStatus();

      const status = service.status;
      expect(status.isRunning).toBe(false);
      expect(status.response).toBeNull();
      expect(status.error).toBeNull();
      expect(status.threadId).toBeNull();
      expect(status.executionMode).toBeNull();
    });

    it('should reset tool status service', () => {
      service.resetStatus();

      expect(mockDeps.toolStatusService.reset).toHaveBeenCalled();
    });
  });

  describe('recipe failure fallback to agent', () => {
    it('should fall back to agent when recipe fails (non-decline)', async () => {
      const request = createMockRequest();
      const recipe = createMockRecipe();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(recipe);

      mockDeps.recipeService.executeRecipe.mockResolvedValue({
        success: false,
        error: 'File not found',
      });

      const promise = service.processTweak(request);
      await waitForOpen();

      // Should now be in agent mode
      expect(service.status.executionMode).toBe('agent');

      // Complete agent session
      simulateMessage({
        type: 'agent_done',
        response: { status: 'success', message: 'Agent completed' },
      });

      await promise;

      // toolStatusService.reset called twice - once for recipe, once for agent
      expect(mockDeps.toolStatusService.reset).toHaveBeenCalledTimes(2);
    });

    it('should revert partial changes before falling back to agent', async () => {
      const request = createMockRequest();
      const recipe = createMockRecipe();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(recipe);

      mockDeps.recipeService.executeRecipe.mockResolvedValue({
        success: false,
        error: 'Partial failure',
      });

      mockDeps.toolStatusService.getSnapshot.mockReturnValue({
        tools: [{ status: 'completed', toolName: 'edit-file-tool' }],
      });

      // Mock buildAppliedTweak to return something revertible
      const { buildAppliedTweak } = await import('../../utils/build-applied-tweak.utils');
      vi.mocked(buildAppliedTweak).mockReturnValue({
        summary: { toolCalls: [{ toolCallId: '1' }] },
      } as any);

      const promise = service.processTweak(request);
      await waitForOpen();

      simulateMessage({
        type: 'agent_done',
        response: { status: 'success', message: 'Done' },
      });

      await promise;

      expect(mockDeps.revertService.execute).toHaveBeenCalled();
    });
  });

  describe('agent execution', () => {
    it('should save applied tweak after successful agent execution', async () => {
      const request = createMockRequest();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(null);

      const promise = service.processTweak(request);
      await waitForOpen();

      simulateMessage({
        type: 'agent_done',
        response: { status: 'success', message: 'Completed' },
      });

      await promise;

      // Recipe submission is handled by the server, not the client
      expect(mockDeps.appliedTweaksService.captureAndSave).toHaveBeenCalled();
    });

    it('should handle agent error response', async () => {
      const request = createMockRequest();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(null);

      const promise = service.processTweak(request);
      await waitForOpen();

      simulateMessage({
        type: 'agent_done',
        response: { status: 'error', message: 'Could not find config' },
      });

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Could not find config');
      // Revert is only called if there were completed tools
      // Failed attempt reporting is handled by the server, not the client
    });

    it('should handle WebSocket errors', async () => {
      const request = createMockRequest();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(null);

      const promise = service.processTweak(request);
      await waitForOpen();

      simulateError(new Error('Connection failed'));

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection failed');
    });

    it('should handle unexpected WebSocket close', async () => {
      const request = createMockRequest();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(null);

      const promise = service.processTweak(request);
      await waitForOpen();

      simulateClose();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('WebSocket connection closed unexpectedly');
    });

    it('should handle server error messages', async () => {
      const request = createMockRequest();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(null);

      const promise = service.processTweak(request);
      await waitForOpen();

      simulateMessage({
        type: 'error',
        message: 'Server error occurred',
      });

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server error occurred');
    });

    it('should execute tool calls and send results back', async () => {
      const request = createMockRequest();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(null);

      mockDeps.toolExecutorService.execute.mockResolvedValue({
        success: true,
        result: { message: 'Tool executed' },
      });

      const promise = service.processTweak(request);
      await waitForOpen();

      // Send tool call message
      simulateMessage({
        type: 'tool_call',
        callId: 'call-123',
        name: 'read-file-tool',
        args: { path: '/test/file.txt' },
      });

      // Wait for tool execution
      await new Promise((r) => setTimeout(r, 20));

      // Verify tool was executed
      expect(mockDeps.toolExecutorService.execute).toHaveBeenCalledWith('read-file-tool', {
        path: '/test/file.txt',
      });

      // Verify result was sent back
      expect(wsSendMock).toHaveBeenCalledWith(expect.stringContaining('"type":"tool_result"'));
      expect(wsSendMock).toHaveBeenCalledWith(expect.stringContaining('"callId":"call-123"'));

      // Complete the session
      simulateMessage({
        type: 'agent_done',
        response: { status: 'success', message: 'Done' },
      });

      await promise;
    });

    it('should send tool definitions on WebSocket open', async () => {
      const request = createMockRequest();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(null);

      const promise = service.processTweak(request);
      await waitForOpen();

      // Verify user_message with tools was sent
      expect(wsSendMock).toHaveBeenCalledWith(expect.stringContaining('"type":"user_message"'));
      expect(wsSendMock).toHaveBeenCalledWith(expect.stringContaining('"tools"'));

      simulateMessage({
        type: 'agent_done',
        response: { status: 'success', message: 'Done' },
      });

      await promise;
    });
  });

  describe('status updates', () => {
    it('should update status response when agent completes', async () => {
      const request = createMockRequest();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(null);

      const promise = service.processTweak(request);
      await waitForOpen();

      simulateMessage({
        type: 'agent_done',
        response: { status: 'success', message: 'All tweaks applied' },
      });

      await promise;

      const status = service.status;
      expect(status.response).toEqual({
        status: 'success',
        message: 'All tweaks applied',
      });
    });

    it('should update status with warning response', async () => {
      const request = createMockRequest();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(null);
      mockDeps.toolStatusService.hasCompletedModificationTools.mockReturnValue(true);

      const promise = service.processTweak(request);
      await waitForOpen();

      simulateMessage({
        type: 'agent_done',
        response: { status: 'warning', message: 'Partially applied' },
      });

      await promise;

      expect(service.status.response?.status).toBe('warning');
    });
  });

  describe('error handling', () => {
    it('should handle recipe execution throwing an error', async () => {
      const request = createMockRequest();
      const recipe = createMockRecipe();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(recipe);

      mockDeps.recipeService.executeRecipe.mockRejectedValue(new Error('Unexpected error'));

      const promise = service.processTweak(request);
      await waitForOpen();

      // Should fall back to agent
      simulateMessage({
        type: 'agent_done',
        response: { status: 'success', message: 'Agent fixed it' },
      });

      const result = await promise;

      expect(result.success).toBe(true);
    });

    it('should handle malformed server messages gracefully', async () => {
      const request = createMockRequest();
      mockDeps.recipeService.lookupRecipe.mockResolvedValue(null);

      const promise = service.processTweak(request);
      await waitForOpen();

      // Send malformed message
      if (wsHandlers['message']) {
        wsHandlers['message'](Buffer.from('not valid json'));
      }

      // Should not crash, continue and handle properly
      simulateMessage({
        type: 'agent_done',
        response: { status: 'success', message: 'Done' },
      });

      const result = await promise;
      expect(result.success).toBe(true);
    });
  });
});
