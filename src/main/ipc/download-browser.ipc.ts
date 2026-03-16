/**
 * Download Browser IPC Handlers
 *
 * Handles navigation IPC for the download browser toolbar:
 * - Navigation commands (back, forward, reload, stop)
 * - State updates pushed to the toolbar
 */

import type { WebContents, WebContentsView } from 'electron';
import { createIpcListeners } from './ipc-handler.factory';

// Active webContents references (only one download browser window at a time)
let contentWebContents: WebContents | null = null;
let toolbarWebContents: WebContents | null = null;

/**
 * Check if content webContents is valid and not destroyed
 */
function isContentValid(): boolean {
  return contentWebContents !== null && !contentWebContents.isDestroyed();
}

/**
 * Push current navigation state to the toolbar
 */
function sendStateUpdate(): void {
  if (!isContentValid() || !toolbarWebContents || toolbarWebContents.isDestroyed()) {
    return;
  }

  toolbarWebContents.send('download-browser:state-update', {
    canGoBack: contentWebContents!.navigationHistory.canGoBack(),
    canGoForward: contentWebContents!.navigationHistory.canGoForward(),
    url: contentWebContents!.getURL(),
    isLoading: contentWebContents!.isLoading(),
  });
}

/**
 * Register webContents for the active download browser window
 */
export function registerDownloadBrowserWebContents(content: WebContentsView, toolbar: WebContentsView): void {
  contentWebContents = content.webContents;
  toolbarWebContents = toolbar.webContents;

  // Listen for navigation events to update toolbar state
  const wc = content.webContents;
  wc.on('did-start-loading', sendStateUpdate);
  wc.on('did-stop-loading', sendStateUpdate);
  wc.on('did-navigate', sendStateUpdate);
  wc.on('did-navigate-in-page', sendStateUpdate);
}

/**
 * Unregister webContents when the download browser window closes
 */
export function unregisterDownloadBrowserWebContents(): void {
  contentWebContents = null;
  toolbarWebContents = null;
}

/**
 * Setup IPC handlers for toolbar navigation commands
 * Called once during app initialization
 */
export function setupDownloadBrowserIpc(): void {
  createIpcListeners([
    {
      channel: 'download-browser:navigate-back',
      handler: () => {
        if (isContentValid() && contentWebContents!.navigationHistory.canGoBack()) {
          contentWebContents!.navigationHistory.goBack();
        }
      },
    },
    {
      channel: 'download-browser:navigate-forward',
      handler: () => {
        if (isContentValid() && contentWebContents!.navigationHistory.canGoForward()) {
          contentWebContents!.navigationHistory.goForward();
        }
      },
    },
    {
      channel: 'download-browser:reload',
      handler: () => {
        if (isContentValid()) {
          contentWebContents!.reload();
        }
      },
    },
    {
      channel: 'download-browser:stop',
      handler: () => {
        if (isContentValid()) {
          contentWebContents!.stop();
        }
      },
    },
  ]);
}
