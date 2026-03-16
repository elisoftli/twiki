/**
 * Shared test utilities for tool testing
 * Provides common mocks and helpers for testing Electron main process tools
 */

import { vi, type Mock } from 'vitest';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Mock structure for child_process exec function
 */
export interface MockExecResult {
  stdout: string;
  stderr: string;
}

export interface MockExecOptions {
  results?: MockExecResult[];
  errors?: Error[];
}

/**
 * Mock structure for Electron BrowserWindow
 */
export interface MockWebContents {
  send: Mock;
}

export interface MockBrowserWindow {
  webContents: MockWebContents;
}

/**
 * Mock structure for Electron ipcMain
 */
export interface MockIpcMain {
  on: Mock;
  once: Mock;
  removeListener: Mock;
  handle: Mock;
  handleOnce: Mock;
  removeHandler: Mock;
}

/**
 * Mock structure for Electron dialog
 */
export interface MockDialog {
  showMessageBox: Mock;
  showOpenDialog: Mock;
  showSaveDialog: Mock;
  showErrorBox: Mock;
}

/**
 * Mock structure for fs operations
 */
export interface MockFs {
  readFile: Mock;
  writeFile: Mock;
  readdir: Mock;
  stat: Mock;
  mkdir: Mock;
  rm: Mock;
  copyFile: Mock;
  rename: Mock;
  access: Mock;
  existsSync: Mock;
  mkdirSync: Mock;
  writeFileSync: Mock;
  readFileSync: Mock;
}

/**
 * Mock structure for fs/promises
 */
export interface MockFsPromises {
  readFile: Mock;
  writeFile: Mock;
  readdir: Mock;
  stat: Mock;
  mkdir: Mock;
  rm: Mock;
  copyFile: Mock;
  rename: Mock;
  access: Mock;
}

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Creates a mock for child_process exec (promisified)
 */
export function createMockExec(options: MockExecOptions = {}): Mock {
  const { results = [], errors = [] } = options;
  let callIndex = 0;

  return vi.fn().mockImplementation(async () => {
    if (errors[callIndex]) {
      const error = errors[callIndex];
      callIndex++;
      throw error;
    }

    const result = results[callIndex] || { stdout: '', stderr: '' };
    callIndex++;
    return result;
  });
}

/**
 * Creates a mock for Electron BrowserWindow
 */
export function createMockBrowserWindow(): MockBrowserWindow {
  return {
    webContents: {
      send: vi.fn(),
    },
  };
}

/**
 * Creates a mock for Electron ipcMain
 */
export function createMockIpcMain(): MockIpcMain {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  const mockIpcMain: MockIpcMain = {
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      if (!listeners.has(channel)) {
        listeners.set(channel, new Set());
      }
      listeners.get(channel)!.add(listener);
      return mockIpcMain;
    }),
    once: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      const wrappedListener = (...args: unknown[]) => {
        listener(...args);
        listeners.get(channel)?.delete(wrappedListener);
      };
      if (!listeners.has(channel)) {
        listeners.set(channel, new Set());
      }
      listeners.get(channel)!.add(wrappedListener);
      return mockIpcMain;
    }),
    removeListener: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      listeners.get(channel)?.delete(listener);
      return mockIpcMain;
    }),
    handle: vi.fn(),
    handleOnce: vi.fn(),
    removeHandler: vi.fn(),
  };

  // Add helper to simulate receiving a message
  (mockIpcMain as MockIpcMain & { simulateMessage: (channel: string, event: unknown, ...args: unknown[]) => void }).simulateMessage = (
    channel: string,
    event: unknown,
    ...args: unknown[]
  ) => {
    const channelListeners = listeners.get(channel);
    if (channelListeners) {
      channelListeners.forEach((listener) => listener(event, ...args));
    }
  };

  return mockIpcMain;
}

/**
 * Extended mock ipcMain with message simulation capability
 */
export interface MockIpcMainWithSimulation extends MockIpcMain {
  simulateMessage: (channel: string, event: unknown, ...args: unknown[]) => void;
}

/**
 * Creates a mock ipcMain with message simulation capability
 */
export function createMockIpcMainWithSimulation(): MockIpcMainWithSimulation {
  return createMockIpcMain() as MockIpcMainWithSimulation;
}

/**
 * Creates a mock for Electron dialog
 */
export function createMockDialog(): MockDialog {
  return {
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [] }),
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: '' }),
    showErrorBox: vi.fn(),
  };
}

/**
 * Creates a mock for fs module
 */
export function createMockFs(): MockFs {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn(),
    rm: vi.fn(),
    copyFile: vi.fn(),
    rename: vi.fn(),
    access: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
  };
}

/**
 * Creates a mock for fs/promises module
 */
export function createMockFsPromises(): MockFsPromises {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn(),
    rm: vi.fn(),
    copyFile: vi.fn(),
    rename: vi.fn(),
    access: vi.fn(),
  };
}

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Common test fixtures for process-related tests
 */
export const processFixtures = {
  validProcessNames: ['game.exe', 'game', 'MyGame.exe', 'test-game_v1.exe'],
  invalidProcessNames: ['', '   ', '../invalid', 'game;rm -rf /'],
  tasklistOutputs: {
    processFound: (processName: string) =>
      `"Image Name","PID","Session Name","Session#","Mem Usage"\n"${processName}","1234","Console","1","50,000 K"`,
    processNotFound: 'INFO: No tasks are running which match the specified criteria.',
    multipleProcesses: (processName: string) =>
      `"Image Name","PID","Session Name","Session#","Mem Usage"\n"${processName}","1234","Console","1","50,000 K"\n"${processName}","5678","Console","1","75,000 K"`,
  },
};

/**
 * Common test fixtures for user input tests
 */
export const userInputFixtures = {
  validParams: {
    title: 'Test Title',
    message: 'Test Message',
    options: ['Option 1', 'Option 2', 'Option 3'],
  },
  textInputParams: {
    title: 'Enter Value',
    message: 'Please enter a value:',
  },
  longOptions: {
    title: 'Many Options',
    message: 'Choose one:',
    options: Array.from({ length: 10 }, (_, i) => `Option ${i + 1}`),
  },
};

/**
 * Common IPC event fixture
 */
export function createMockIpcEvent(): Electron.IpcMainEvent {
  return {
    sender: {
      send: vi.fn(),
    } as unknown as Electron.WebContents,
    returnValue: undefined,
    defaultPrevented: false,
    preventDefault: vi.fn(),
    reply: vi.fn(),
    ports: [],
    processId: 1,
    frameId: 1,
    senderFrame: null as unknown as Electron.WebFrameMain,
  };
}

// ============================================================================
// Timing Helpers
// ============================================================================

/**
 * Advances timers and flushes promises
 * Useful for testing async code with fake timers
 */
export async function advanceTimersAndFlush(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await Promise.resolve();
}

/**
 * Runs all pending timers and flushes promises
 */
export async function runAllTimersAndFlush(): Promise<void> {
  vi.runAllTimers();
  await Promise.resolve();
}

/**
 * Helper to wait for a condition to become true
 */
export async function waitFor(
  condition: () => boolean,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 10 } = options;
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('waitFor timeout exceeded');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// ============================================================================
// OS Mock Helpers
// ============================================================================

/**
 * Creates a mock for the os module
 */
export interface MockOs {
  cpus: Mock;
  platform: Mock;
  homedir: Mock;
  tmpdir: Mock;
}

export function createMockOs(cpuCount: number = 8): MockOs {
  const cpuArray = Array.from({ length: cpuCount }, (_, i) => ({
    model: `Mock CPU ${i}`,
    speed: 3200,
    times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
  }));

  return {
    cpus: vi.fn().mockReturnValue(cpuArray),
    platform: vi.fn().mockReturnValue('win32'),
    homedir: vi.fn().mockReturnValue('C:\\Users\\TestUser'),
    tmpdir: vi.fn().mockReturnValue('C:\\Users\\TestUser\\AppData\\Local\\Temp'),
  };
}

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Creates an Error with additional properties (e.g., for exec errors)
 */
export function createExecError(
  message: string,
  options: { code?: number; killed?: boolean; signal?: string; stderr?: string } = {}
): Error & { code?: number; killed?: boolean; signal?: string; stderr?: string } {
  const error = new Error(message) as Error & {
    code?: number;
    killed?: boolean;
    signal?: string;
    stderr?: string;
  };
  Object.assign(error, options);
  return error;
}

// ============================================================================
// Module Mock Helpers
// ============================================================================

/**
 * Helper to set up common module mocks for tool tests
 * Returns cleanup function
 */
export function setupCommonMocks(): () => void {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  // Silence console during tests
  console.log = vi.fn();
  console.error = vi.fn();
  console.warn = vi.fn();

  return () => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  };
}
