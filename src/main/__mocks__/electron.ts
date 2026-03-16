/**
 * Mock electron module for vitest testing environment.
 * This mock provides stub implementations of commonly used Electron APIs.
 */

// Mock BrowserWindow
export class BrowserWindow {
  static getAllWindows = () => [];
  static getFocusedWindow = () => null;

  id = 1;
  webContents = {
    send: () => {},
    on: () => {},
    executeJavaScript: () => Promise.resolve(),
    session: {
      webRequest: {
        onBeforeSendHeaders: () => {},
        onHeadersReceived: () => {},
      },
    },
  };

  constructor() {}
  loadURL = () => Promise.resolve();
  loadFile = () => Promise.resolve();
  show = () => {};
  hide = () => {};
  close = () => {};
  destroy = () => {};
  focus = () => {};
  blur = () => {};
  isFocused = () => false;
  isDestroyed = () => false;
  isVisible = () => true;
  setTitle = () => {};
  getTitle = () => '';
  setMenu = () => {};
  setSize = () => {};
  getSize = () => [800, 600];
  setPosition = () => {};
  getPosition = () => [0, 0];
  setBounds = () => {};
  getBounds = () => ({ x: 0, y: 0, width: 800, height: 600 });
  setAlwaysOnTop = () => {};
  isAlwaysOnTop = () => false;
  center = () => {};
  on = () => this;
  once = () => this;
  removeListener = () => this;
  removeAllListeners = () => this;
}

// Mock app
export const app = {
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
export const ipcMain = {
  on: () => ipcMain,
  once: () => ipcMain,
  handle: () => {},
  handleOnce: () => {},
  removeHandler: () => {},
  removeListener: () => ipcMain,
  removeAllListeners: () => ipcMain,
};

// Mock ipcRenderer
export const ipcRenderer = {
  on: () => ipcRenderer,
  once: () => ipcRenderer,
  send: () => {},
  sendSync: () => {},
  invoke: () => Promise.resolve(),
  removeListener: () => ipcRenderer,
  removeAllListeners: () => ipcRenderer,
};

// Mock session
export const session = {
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
export const dialog = {
  showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
  showSaveDialog: () => Promise.resolve({ canceled: true, filePath: undefined }),
  showMessageBox: () => Promise.resolve({ response: 0, checkboxChecked: false }),
  showErrorBox: () => {},
};

// Mock shell
export const shell = {
  openExternal: () => Promise.resolve(),
  openPath: () => Promise.resolve(''),
  showItemInFolder: () => {},
  beep: () => {},
  trashItem: () => Promise.resolve(),
};

// Mock Menu
export class Menu {
  static buildFromTemplate = () => new Menu();
  static setApplicationMenu = () => {};
  static getApplicationMenu = () => null;

  popup = () => {};
  closePopup = () => {};
  append = () => {};
  insert = () => {};
}

// Mock MenuItem
export class MenuItem {
  constructor() {}
}

// Mock Tray
export class Tray {
  constructor() {}
  setToolTip = () => {};
  setContextMenu = () => {};
  setImage = () => {};
  destroy = () => {};
  on = (): this => this;
}

// Mock nativeImage
export const nativeImage = {
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
export const globalShortcut = {
  register: () => true,
  unregister: () => {},
  unregisterAll: () => {},
  isRegistered: () => false,
};

// Mock screen
export const screen = {
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
export const clipboard = {
  writeText: () => {},
  readText: () => '',
  writeHTML: () => {},
  readHTML: () => '',
  clear: () => {},
};

// Mock powerMonitor
export const powerMonitor = {
  on: () => powerMonitor,
  removeListener: () => powerMonitor,
  getSystemIdleState: () => 'active',
  getSystemIdleTime: () => 0,
};

// Mock net
export const net = {
  request: () => ({
    on: () => {},
    write: () => {},
    end: () => {},
  }),
};

// Default export for CommonJS compatibility
export default {
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
};
