/**
 * Download browser utility
 *
 * Opens a visible browser window with navigation toolbar for user interaction
 * when automatic download resolution fails. Intercepts downloads via 'will-download'.
 *
 * Also captures page content for scraping installation instructions from
 * hoster pages (e.g., NexusMods mod descriptions).
 */

import { randomUUID } from 'crypto';
import { is } from '@electron-toolkit/utils';
import { BaseWindow, Menu, WebContentsView, ipcMain, session } from 'electron';
import { join } from 'path';
import TurndownService from 'turndown';
import { extractContentFromPage, type ScrapedContent } from './scrapers';
import type { DownloadMetadata } from '../types';
import {
  registerDownloadBrowserWebContents,
  unregisterDownloadBrowserWebContents,
} from '../../../../ipc/download-browser.ipc';
import { SettingsService } from '../../../../services/core/settings.service';
import { MainWindow } from '../../../../windows';

// ============================================================================
// Constants
// ============================================================================

const APP_ICON = is.dev
  ? join(__dirname, '../../resources/icon.png')
  : join(process.resourcesPath, 'icon.png');

const PRELOAD_CONTENT = join(__dirname, '../preload/download-browser-content.preload.js');
const PRELOAD_TOOLBAR = join(__dirname, '../preload/download-browser-toolbar.preload.js');

/** Session partition for download browser (preserves cookies/auth) */
export const DOWNLOAD_BROWSER_SESSION_PARTITION = 'persist:download-browser';

const TOOLBAR_HEIGHT = 48;
const WINDOW_SIZE = { width: 1280, height: 800 };
const CONTENT_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Page Content Store (for scraping mod instructions)
// ============================================================================

interface StoredPageContent {
  url: string;
  scrapedContent: ScrapedContent | null;
  timestamp: number;
}

const pageContentStore = new Map<string, StoredPageContent>();

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

function normalizeUrlForKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function storePageContent(url: string, html: string): void {
  const key = normalizeUrlForKey(url);
  const scrapedContent = extractContentFromPage(url, html);
  const existing = pageContentStore.get(key);

  // Don't overwrite content with instructions with content without
  if (existing?.scrapedContent?.instructionsHtml && !scrapedContent?.instructionsHtml) {
    return;
  }

  pageContentStore.set(key, { url, scrapedContent, timestamp: Date.now() });

  // Clean expired entries
  const now = Date.now();
  for (const [k, v] of pageContentStore) {
    if (now - v.timestamp > CONTENT_EXPIRY_MS) {
      pageContentStore.delete(k);
    }
  }
}

function getStoredMetadata(originalUrl: string): DownloadMetadata | undefined {
  const key = normalizeUrlForKey(originalUrl);
  const stored = pageContentStore.get(key);

  if (!stored?.scrapedContent) return undefined;
  if (Date.now() - stored.timestamp > CONTENT_EXPIRY_MS) {
    pageContentStore.delete(key);
    return undefined;
  }

  const { title, instructionsHtml } = stored.scrapedContent;
  let instructions: string | undefined;

  if (instructionsHtml) {
    try {
      instructions = turndownService.turndown(instructionsHtml);
    } catch (error) {
      console.error('[DownloadBrowser] Failed to convert HTML to markdown:', error);
    }
  }

  if (!title && !instructions) return undefined;

  return { title, instructions, sourceUrl: stored.url };
}

// ============================================================================
// IPC Handler Registration
// ============================================================================

let ipcHandlerRegistered = false;

/**
 * Register IPC handler for receiving page content from preload script.
 * Call once during app initialization.
 */
export function registerDownloadBrowserIpcHandler(): void {
  if (ipcHandlerRegistered) return;

  ipcMain.on('download-browser:page-content', (_event, data: { url: string; html: string }) => {
    storePageContent(data.url, data.html);
  });

  ipcHandlerRegistered = true;
}

// ============================================================================
// Types
// ============================================================================

export interface DownloadBrowserResult {
  downloadUrl: string;
  fileName: string;
  fileSize?: number;
  sessionPartition: string;
  metadata?: DownloadMetadata;
}

export interface DownloadBrowserOptions {
  signal?: AbortSignal;
  debug?: boolean;
  /** Skip the info dialog (e.g. when the user already acknowledged via a prior dialog) */
  skipInfoDialog?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'website';
  }
}

function getToolbarUrl(): string {
  if (is.dev) {
    return 'http://localhost:5174/index.html';
  }
  return `file://${join(__dirname, '../toolbar-renderer/index.html')}`;
}

function updateViewBounds(
  win: BaseWindow,
  toolbarView: WebContentsView,
  contentView: WebContentsView
): void {
  const { width, height } = win.getContentBounds();
  toolbarView.setBounds({ x: 0, y: 0, width, height: TOOLBAR_HEIGHT });
  contentView.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: height - TOOLBAR_HEIGHT });
}

function createWindow(hostname: string): BaseWindow {
  return new BaseWindow({
    ...WINDOW_SIZE,
    minWidth: WINDOW_SIZE.width,
    minHeight: WINDOW_SIZE.height,
    show: true,
    icon: APP_ICON,
    title: `Download from ${hostname} - Navigate and click download`,
  });
}

function createToolbarView(): WebContentsView {
  return new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: PRELOAD_TOOLBAR,
    },
  });
}

function createContentView(): WebContentsView {
  return new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: DOWNLOAD_BROWSER_SESSION_PARTITION,
      preload: PRELOAD_CONTENT,
    },
  });
}

// ============================================================================
// Info Dialog
// ============================================================================

/**
 * Shows an info dialog in the renderer before opening the download browser,
 * unless the user has opted to hide it via "Don't show again".
 */
async function showInfoDialogIfNeeded(): Promise<void> {
  const settings = SettingsService.settings;
  if (settings.downloadBrowser?.hideInfoDialog) return;

  const mainWindow = MainWindow.getWindow();
  if (mainWindow.isDestroyed()) return;

  const requestId = randomUUID();

  return new Promise<void>((resolve) => {
    ipcMain.once(
      'download-browser:info-acknowledged',
      (_event, data: { requestId: string; dontShowAgain: boolean }) => {
        if (data.requestId !== requestId) {
          resolve();
          return;
        }
        if (data.dontShowAgain) {
          SettingsService.updateSettings({ downloadBrowser: { hideInfoDialog: true } });
        }
        resolve();
      }
    );

    mainWindow.webContents.send('download-browser:show-info', { requestId });
  });
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Opens a browser window for manual download interaction.
 *
 * User can interact with the page (login, navigate, click download).
 * When a download starts, it's intercepted and the window closes.
 */
export async function openDownloadBrowser(
  url: string,
  options: DownloadBrowserOptions = {}
): Promise<DownloadBrowserResult> {
  const { signal, debug = false, skipInfoDialog = false } = options;

  // Show info dialog before opening the browser window
  if (!skipInfoDialog) {
    await showInfoDialogIfNeeded();
  }
  const log = debug ? console.log.bind(console, '[DownloadBrowser]') : () => {};

  if (signal?.aborted) {
    throw new Error('Download aborted');
  }

  return new Promise((resolve, reject) => {
    const hostname = getHostname(url);
    const sess = session.fromPartition(DOWNLOAD_BROWSER_SESSION_PARTITION);
    const originalUrl = url;
    let resolved = false;

    // Create window and views
    const win = createWindow(hostname);
    const toolbarView = createToolbarView();
    const contentView = createContentView();

    win.contentView.addChildView(toolbarView);
    win.contentView.addChildView(contentView);
    updateViewBounds(win, toolbarView, contentView);

    win.on('resize', () => updateViewBounds(win, toolbarView, contentView));
    registerDownloadBrowserWebContents(contentView, toolbarView);

    // Enable standard context menu (copy, paste, navigation, etc.)
    contentView.webContents.on('context-menu', (_event, params) => {
      Menu.buildFromTemplate([
        { label: 'Back', enabled: contentView.webContents.canGoBack(), click: () => contentView.webContents.goBack() },
        { label: 'Forward', enabled: contentView.webContents.canGoForward(), click: () => contentView.webContents.goForward() },
        { type: 'separator' },
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', enabled: params.editFlags.canSelectAll },
      ]).popup();
    });

    // Intercept popups: same-host links redirect in-place, cross-host links are blocked
    contentView.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
      const popupHost = getHostname(popupUrl);
      if (popupHost === hostname) {
        log('Popup redirected to content view:', popupUrl);
        contentView.webContents.loadURL(popupUrl);
      } else {
        log('Popup blocked (cross-host):', popupUrl);
      }
      return { action: 'deny' };
    });

    log('Window created for:', hostname);

    // Cleanup resources
    const cleanup = () => {
      sess.removeListener('will-download', handleDownload);
      unregisterDownloadBrowserWebContents();
      if (!win.isDestroyed()) win.destroy();
    };

    // Download interception
    const handleDownload = (
      event: Electron.Event,
      item: Electron.DownloadItem
    ) => {
      if (resolved) return;

      event.preventDefault();
      resolved = true;

      const result: DownloadBrowserResult = {
        downloadUrl: item.getURL(),
        fileName: item.getFilename() || 'download',
        fileSize: item.getTotalBytes() > 0 ? item.getTotalBytes() : undefined,
        sessionPartition: DOWNLOAD_BROWSER_SESSION_PARTITION,
        metadata: getStoredMetadata(originalUrl),
      };

      log('Download intercepted:', result.fileName);
      cleanup();
      resolve(result);
    };

    sess.on('will-download', handleDownload);

    // Window close without download
    win.on('closed', () => {
      if (!resolved) {
        cleanup();
        reject(new Error(
          'Browser window closed without starting a download. Please try again and complete the download process on the website.'
        ));
      }
    });

    // Abort signal
    signal?.addEventListener('abort', () => {
      if (!resolved) {
        cleanup();
        reject(new Error('Download aborted'));
      }
    }, { once: true });

    // Load content
    toolbarView.webContents.loadURL(getToolbarUrl()).catch((err) => {
      log('Toolbar load error:', err.message);
    });

    contentView.webContents.loadURL(url).catch((err) => {
      const isAborted = err.message?.includes('ERR_ABORTED') || err.message?.includes('-3');
      if (!resolved && !isAborted) {
        cleanup();
        reject(new Error(`Failed to load URL: ${err.message}`));
      }
    });
  });
}
