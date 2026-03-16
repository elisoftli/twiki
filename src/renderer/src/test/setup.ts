import '@testing-library/jest-dom/vitest';
import { vi, beforeEach } from 'vitest';

// Mock window.api (Electron preload API)
const mockApi = {
  getSettings: vi.fn().mockResolvedValue({
    autoTweaker: { autoApproveReadOnly: false },
    useBuiltInEditor: false,
    gamePage: { autoExpandTweaks: false },
    specsVisibility: {},
  }),
  onSettingsUpdated: vi.fn(),
  updateSettings: vi.fn(),
  openExternal: vi.fn(),
  openPath: vi.fn(),

  // Updater API
  updater: {
    getStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
    onStatusUpdated: vi.fn(),
    updateAndRelaunch: vi.fn(),
  },

  // Tweak Agent API
  agent: {
    getStatus: vi.fn().mockResolvedValue({
      isRunning: false,
      response: null,
      error: null,
      threadId: null,
      executionMode: null,
    }),
    processTweak: vi.fn(),
    abortTask: vi.fn(),
    resetStatus: vi.fn(),
    onStatusUpdated: vi.fn(),
    getToolStatuses: vi.fn().mockResolvedValue({ tools: [], lastUpdated: 0 }),
    approveTool: vi.fn(),
    declineTool: vi.fn(),
    onUserInputRequest: vi.fn(),
    respondToUserInput: vi.fn(),
    removeAllListeners: vi.fn(),
  },

  // Game Library API
  library: {
    getStatus: vi.fn().mockResolvedValue({
      isLoaded: true,
      launchers: {},
      error: null,
    }),
    getGames: vi.fn().mockResolvedValue([]),
    reload: vi.fn().mockResolvedValue([]),
    getGame: vi.fn(),
    launchGame: vi.fn(),
    isGameRunning: vi.fn().mockResolvedValue(false),
    terminateGame: vi.fn(),
    onGamePosterUpdated: vi.fn(),
    removeAllListeners: vi.fn(),
  },

  // PCGamingWiki API
  pcgw: {
    getTweaks: vi.fn().mockResolvedValue(null),
  },

  // Applied Tweaks API
  appliedTweaks: {
    getByGame: vi.fn().mockResolvedValue([]),
    getAll: vi.fn().mockResolvedValue([]),
    add: vi.fn(),
    remove: vi.fn(),
  },

  // Revert API
  revert: {
    execute: vi.fn(),
  },

  // System Specs API
  systemSpecs: {
    getStatus: vi.fn().mockResolvedValue({ status: 'loaded' }),
    getSpecs: vi.fn().mockResolvedValue(null),
  },

  // Tweak Metadata API
  tweakMetadata: {
    fetch: vi.fn().mockResolvedValue({}),
  },

  // File API
  file: {
    readText: vi.fn(),
    writeText: vi.fn(),
  },

  // Downloads API
  downloads: {
    getSize: vi.fn().mockResolvedValue(0),
    clear: vi.fn().mockResolvedValue({ success: true, error: null }),
    openFolder: vi.fn(),
  },
};

// Make the mock available globally
vi.stubGlobal('api', mockApi);

// Also provide it on window for components that access window.api
Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
});

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Export for use in tests that need to customize mocks
export { mockApi };
