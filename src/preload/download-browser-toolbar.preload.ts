/**
 * Download Browser Toolbar Preload Script
 *
 * Exposes navigation controls and state updates for the download browser toolbar.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('toolbarApi', {
  navigateBack: () => ipcRenderer.send('download-browser:navigate-back'),
  navigateForward: () => ipcRenderer.send('download-browser:navigate-forward'),
  reload: () => ipcRenderer.send('download-browser:reload'),
  stop: () => ipcRenderer.send('download-browser:stop'),

  onStateUpdate: (callback: (state: {
    canGoBack: boolean;
    canGoForward: boolean;
    url: string;
    isLoading: boolean;
  }) => void) => {
    ipcRenderer.on('download-browser:state-update', (_event, state) => callback(state));
  },

  removeStateListener: () => {
    ipcRenderer.removeAllListeners('download-browser:state-update');
  },
});
