import { configureLogger, createLogger } from './utils/logger.utils';

// Configure logging first, before any other operations
configureLogger();

// Ensure Windows system directories (System32, PowerShell) are on PATH.
// Packaged Electron apps may inherit a truncated PATH, breaking child process
// spawning for tools like powershell.exe and reg.exe.
import { ensureSystemPath } from './utils/system.utils';
ensureSystemPath();

import { app, BrowserWindow, globalShortcut, Menu, protocol, net } from 'electron';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import {
  AgentService,
  SettingsService,
  UpdaterService,
  GameLibraryService,
  SystemSpecsService,
  ServiceStatusService,
  IntegrityService,
  AuthService,
} from './services';
import { ServerService } from './services/core/server.service';
import { MainWindow } from './windows';
import { setupAllIpc } from './ipc';
import { registerDownloadBrowserIpcHandler } from './tools/io/utils/hosters';

const logger = createLogger('ElectronApp');

class ElectronApp {
  private readonly didObtainInstanceLock = app.requestSingleInstanceLock();

  private agentService: AgentService;

  private async createWindow(): Promise<void> {
    logger.info('Creating main window');

    // Initialize settings before creating window (window reads settings for bounds)
    await SettingsService.initialize();

    MainWindow.initialize();
    await this.initializeServices();
    logger.info('Application ready');
  }

  private async initializeServices(): Promise<void> {
    // Initialize auth service early to load persisted tokens
    AuthService.init();

    this.agentService = new AgentService();
    UpdaterService.initialize();
    ServiceStatusService.initialize();

    // Register IPC handler for download browser page content scraping
    registerDownloadBrowserIpcHandler();

    // Initialize GameLibraryService singleton
    GameLibraryService.initialize();

    setupAllIpc({ agentService: this.agentService });

    GameLibraryService.getInstance().loadAllLaunchers();
    SystemSpecsService.loadSpecs();

    // Abort any running agent task when renderer refreshes/reloads
    MainWindow.getWindow().webContents.on('did-start-navigation', (_event, _url, isInPlace) => {
      // isInPlace is true for in-page navigations (anchor clicks), skip those
      if (!isInPlace && this.agentService.status.isRunning) {
        logger.info('Renderer navigation detected, aborting running agent task');
        this.agentService.abortTask();
        this.agentService.resetStatus();
      }
    });

    SettingsService.addSettingsChangeListener((_, updatedSettings) => {
      MainWindow.getInstance().sendEvent('settings-updated', updatedSettings);
    });
    if (SettingsService.settings.isAutoUpdateEnabled) {
      UpdaterService.getInstance().checkForUpdates();
    }
  }

  public async initializeApp(): Promise<void> {
    logger.info('Starting application');

    // Run integrity checks early, before any other initialization
    IntegrityService.checkIntegrity();

    if (!this.didObtainInstanceLock) {
      logger.warn('Another instance is already running, quitting');
      app.quit();
      return;
    }

    if (!is.dev) {
      Menu.setApplicationMenu(null);
    }

    // Disable automation detection for BrowserWindows (helps bypass Cloudflare)
    // Must be set before app.whenReady() for full effect
    app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

    ServerService.initServer();
    app.whenReady().then(async () => {
      electronApp.setAppUserModelId('com.template');
      this.setupAppEvents();
      this.registerCustomProtocols();

      await this.createWindow();
    });
  }

  private registerCustomProtocols(): void {
    // Register a custom protocol to serve local files (e.g., game poster images)
    // URL format: local-file:///C:/Users/... (three slashes, forward slashes in path)
    protocol.handle('local-file', (request) => {
      const url = new URL(request.url);
      // pathname will be like /C:/Users/... - remove leading slash on Windows
      const filePath = decodeURIComponent(process.platform === 'win32' ? url.pathname.slice(1) : url.pathname);
      return net.fetch(pathToFileURL(filePath).toString());
    });
  }

  private setupAppEvents(): void {
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
    app.on('will-quit', () => {
      globalShortcut.unregisterAll();
    });
    app.on('second-instance', () => {
      MainWindow.getInstance().toggleFocusAndVisibility();
    });
  }
}

// Disable hardware acceleration if user opted in (must happen before app.whenReady())
try {
  const settingsPath = join(app.getPath('userData'), 'settings.json');
  const raw = readFileSync(settingsPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (parsed.disableHardwareAcceleration) {
    logger.info('Hardware acceleration disabled by user setting');
    app.disableHardwareAcceleration();
  }
} catch {
  // Settings file may not exist yet or be unreadable — continue with defaults
}

// Initialize the application
const appInstance = new ElectronApp();
appInstance.initializeApp();
