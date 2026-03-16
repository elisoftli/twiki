/**
 * Utility for showing the NexusMods auth dialog from the main process.
 * Uses IPC round-trip: main → renderer (show dialog) → main (user response).
 */

import { randomUUID } from 'crypto';
import { ipcMain } from 'electron';
import { MainWindow } from '../../../windows';

export type NexusModsAuthDialogReason = 'no-key' | 'not-premium' | 'invalid-key';
export type NexusModsAuthDialogAction = 'retry' | 'browser' | 'close';

export interface NexusModsAuthDialogResult {
  action: NexusModsAuthDialogAction;
}

/**
 * Show the NexusMods auth dialog in the renderer and wait for user response.
 *
 * @param reason - Why the dialog is being shown
 * @param modPageUrl - URL of the mod page (for "Open in Browser" fallback)
 * @returns The user's chosen action
 */
export function showNexusModsAuthDialog(
  reason: NexusModsAuthDialogReason,
  modPageUrl: string
): Promise<NexusModsAuthDialogResult> {
  return new Promise((resolve) => {
    const mainWindow = MainWindow.getWindow();
    if (mainWindow.isDestroyed()) {
      resolve({ action: 'close' });
      return;
    }

    const requestId = randomUUID();

    mainWindow.webContents.send('nexusmods:show-auth-dialog', {
      requestId,
      reason,
      modPageUrl,
    });

    const handler = (
      _event: Electron.IpcMainEvent,
      response: { requestId: string; action: NexusModsAuthDialogAction }
    ): void => {
      if (response.requestId === requestId) {
        ipcMain.removeListener('nexusmods:auth-dialog-response', handler);
        resolve({ action: response.action });
      }
    };

    ipcMain.on('nexusmods:auth-dialog-response', handler);
  });
}
