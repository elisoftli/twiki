/**
 * Vitest setup file - runs before all tests
 * Configures global mocks for Electron and other native modules
 */

import { vi } from 'vitest';

// Mock electron module
vi.mock('electron', () => {
  // Mock BrowserWindow - throws on construction to trigger fetch fallback in tests
  // This ensures tests that rely on fetch fallback continue to work
  class BrowserWindow {
    static getAllWindows = () => [];
    static getFocusedWindow = () => null;

    constructor() {
      // Throw to trigger fallback to fetch in electron-fetch.ts
      throw new Error('BrowserWindow not available in test environment');
    }
  }

  // Mock app
  const app = {
    getPath: (name: string) => `/mock/path/${name}`,
    getVersion: () => '1.0.0',
    getName: () => 'mock-app',
    isReady: () => true,
    whenReady: () => Promise.resolve(),
    quit: () => {},
    exit: () => {},
    relaunch: () => {},
    isPackaged: false,
    getAppPath: () => '/mock/app/path',
    getLocale: () => 'en-US',
    on: () => app,
    once: () => app,
    removeListener: () => app,
    requestSingleInstanceLock: () => true,
    releaseSingleInstanceLock: () => {},
  };

  // Mock ipcMain
  const ipcMain = {
    on: () => ipcMain,
    once: () => ipcMain,
    handle: () => {},
    handleOnce: () => {},
    removeHandler: () => {},
    removeListener: () => ipcMain,
    removeAllListeners: () => ipcMain,
  };

  // Mock ipcRenderer
  const ipcRenderer = {
    on: () => ipcRenderer,
    once: () => ipcRenderer,
    send: () => {},
    sendSync: () => {},
    invoke: () => Promise.resolve(),
    removeListener: () => ipcRenderer,
    removeAllListeners: () => ipcRenderer,
  };

  // Mock session
  const session = {
    defaultSession: {
      webRequest: {
        onBeforeSendHeaders: () => {},
        onHeadersReceived: () => {},
      },
      clearCache: () => Promise.resolve(),
      clearStorageData: () => Promise.resolve(),
    },
    fromPartition: () => session.defaultSession,
  };

  // Mock dialog
  const dialog = {
    showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
    showSaveDialog: () => Promise.resolve({ canceled: true, filePath: undefined }),
    showMessageBox: () => Promise.resolve({ response: 0, checkboxChecked: false }),
    showErrorBox: () => {},
  };

  // Mock shell
  const shell = {
    openExternal: () => Promise.resolve(),
    openPath: () => Promise.resolve(''),
    showItemInFolder: () => {},
    beep: () => {},
    trashItem: () => Promise.resolve(),
  };

  // Mock Menu
  class Menu {
    static buildFromTemplate = () => new Menu();
    static setApplicationMenu = () => {};
    static getApplicationMenu = () => null;

    popup = () => {};
    closePopup = () => {};
    append = () => {};
    insert = () => {};
  }

  // Mock MenuItem
  class MenuItem {
    constructor() {}
  }

  // Mock Tray
  class Tray {
    constructor() {}
    setToolTip = () => {};
    setContextMenu = () => {};
    setImage = () => {};
    destroy = () => {};
    on = (): Tray => new Tray();
  }

  // Mock nativeImage
  const nativeImage = {
    createFromPath: (_path?: string) => ({
      isEmpty: () => false,
      getSize: () => ({ width: 16, height: 16 }),
      toPNG: () => Buffer.from([]),
      toJPEG: () => Buffer.from([]),
      toBitmap: () => Buffer.from([]),
      toDataURL: () => '',
      resize: () => nativeImage.createFromPath(''),
    }),
    createFromBuffer: (_buffer?: Buffer) => nativeImage.createFromPath(''),
    createEmpty: () => nativeImage.createFromPath(),
  };

  // Mock globalShortcut
  const globalShortcut = {
    register: () => true,
    unregister: () => {},
    unregisterAll: () => {},
    isRegistered: () => false,
  };

  // Mock screen
  const screen = {
    getPrimaryDisplay: () => ({
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1,
    }),
    getAllDisplays: () => [screen.getPrimaryDisplay()],
    getDisplayNearestPoint: () => screen.getPrimaryDisplay(),
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  };

  // Mock clipboard
  const clipboard = {
    writeText: () => {},
    readText: () => '',
    writeHTML: () => {},
    readHTML: () => '',
    clear: () => {},
  };

  // Mock powerMonitor
  const powerMonitor = {
    on: () => powerMonitor,
    removeListener: () => powerMonitor,
    getSystemIdleState: () => 'active',
    getSystemIdleTime: () => 0,
  };

  // Mock net
  const net = {
    request: () => ({
      on: () => {},
      write: () => {},
      end: () => {},
    }),
  };

  return {
    app,
    BrowserWindow,
    ipcMain,
    ipcRenderer,
    session,
    dialog,
    shell,
    Menu,
    MenuItem,
    Tray,
    nativeImage,
    globalShortcut,
    screen,
    clipboard,
    powerMonitor,
    net,
    default: {
      app,
      BrowserWindow,
      ipcMain,
      ipcRenderer,
      session,
      dialog,
      shell,
      Menu,
      MenuItem,
      Tray,
      nativeImage,
      globalShortcut,
      screen,
      clipboard,
      powerMonitor,
      net,
    },
  };
});

// Mock @electron-toolkit/utils
vi.mock('@electron-toolkit/utils', () => ({
  is: {
    dev: true,
    windows: process.platform === 'win32',
    macOS: process.platform === 'darwin',
    linux: process.platform === 'linux',
  },
  electronApp: {
    setAppUserModelId: () => {},
  },
  optimizer: {
    watchWindowShortcuts: () => {},
  },
}));
