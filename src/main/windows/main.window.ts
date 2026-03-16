import { app, BrowserWindow, screen } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';

// In dev: use resources folder relative to project root
// In production: use extraResources path
const appIcon = is.dev
  ? join(__dirname, '../../resources/icon.png')
  : join(process.resourcesPath, 'icon.png');

import { ServerService } from '../services/core/server.service';
import { SettingsService } from '../services/core/settings.service';
import { IntegrityService } from '../services/system/integrity.service';
import type { WindowBounds } from '../interfaces';

export class MainWindow {
  private static instance: MainWindow | null = null;
  private window: BrowserWindow;

  private constructor() {
    this.window = new BrowserWindow(this.getWindowConfiguration());
    this.setupWindowEvents();
    this.loadApplication();
  }

  /**
   * Initialize the MainWindow singleton. Should only be called once during app startup.
   */
  public static initialize(): MainWindow {
    if (MainWindow.instance) {
      throw new Error('MainWindow has already been initialized');
    }
    MainWindow.instance = new MainWindow();
    return MainWindow.instance;
  }

  /**
   * Get the MainWindow singleton instance.
   * @throws Error if MainWindow has not been initialized
   */
  public static getInstance(): MainWindow {
    if (!MainWindow.instance) {
      throw new Error('MainWindow has not been initialized. Call MainWindow.initialize() first.');
    }
    return MainWindow.instance;
  }

  /**
   * Get the BrowserWindow instance directly.
   * Convenience method for accessing the browser window without getting the MainWindow instance first.
   * @throws Error if MainWindow has not been initialized
   */
  public static getWindow(): BrowserWindow {
    return MainWindow.getInstance().window;
  }

  private getWindowConfiguration(): Electron.BrowserWindowConstructorOptions {
    const savedBounds = this.getSavedWindowBounds();
    const defaultConfig: Electron.BrowserWindowConstructorOptions = {
      title: 'Twiki',
      width: 1280,
      height: 1080,
      minWidth: 1280,
      minHeight: 720,
      show: false, // Don't show until ready-to-show to avoid visual glitches
      autoHideMenuBar: true,
      center: !savedBounds, // Only center if no saved bounds
      icon: appIcon,
      webPreferences: {
        nodeIntegration: true,
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    };

    if (savedBounds) {
      return {
        ...defaultConfig,
        x: savedBounds.x,
        y: savedBounds.y,
        width: savedBounds.width,
        height: savedBounds.height,
      };
    }

    return defaultConfig;
  }

  private getSavedWindowBounds(): WindowBounds | undefined {
    const settings = SettingsService.settings;
    const bounds = settings.windowBounds;

    if (!bounds) {
      return undefined;
    }

    // Validate that the saved position is still visible on a connected display
    const displays = screen.getAllDisplays();
    const isVisible = displays.some((display) => {
      const { x, y, width, height } = display.bounds;
      // Check if the window's top-left corner is within any display
      return (
        bounds.x >= x &&
        bounds.x < x + width &&
        bounds.y >= y &&
        bounds.y < y + height
      );
    });

    if (!isVisible) {
      return undefined;
    }

    return bounds;
  }

  private saveWindowBounds(): void {
    if (this.window.isMinimized()) {
      return;
    }

    const isMaximized = this.window.isMaximized();
    const bounds = this.window.getBounds();

    // Fire-and-forget: window close doesn't wait for this
    SettingsService.updateSettings({
      windowBounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized,
      },
    });
  }

  private setupWindowEvents(): void {
    this.window.on('ready-to-show', this.handleReadyToShow.bind(this));
    this.window.on('close', this.saveWindowBounds.bind(this));

    // In production, detect DevTools opening and trigger silent fallback
    if (!is.dev) {
      this.window.webContents.on('devtools-opened', () => {
        IntegrityService.markTampered();
        this.window.webContents.closeDevTools();
      });
    }
  }

  private handleReadyToShow(): void {
    // Restore maximized state if previously maximized
    const settings = SettingsService.settings;
    if (settings.windowBounds?.isMaximized) {
      this.window.maximize();
    }

    this.window.show();
    if (is.dev && !app.commandLine.hasSwitch('remote-debugging-port')) {
      this.window.webContents.openDevTools();
    }
  }

  private loadApplication(): void {
    ServerService.serveWindow(this.window);
  }

  public getBrowserWindow(): BrowserWindow {
    return this.window;
  }

  public async toggleFocusAndVisibility(): Promise<void> {
    if (this.window.isFocused()) {
      this.window.hide();
    } else if (this.window.isVisible()) {
      this.window.focus();
    } else {
      this.window.show();
    }
  }

  public async sendEvent(event: string, ...args: unknown[]): Promise<void> {
    this.window.webContents.send(event, ...args);
  }
}
