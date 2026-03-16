/**
 * User input utility - shows custom dialogs in the renderer for user input
 */

import { ipcMain } from 'electron';
import type { GetUserInputParams, GetUserInputResult, UserInputIpcResponse } from './types';
import { MainWindow } from '../../../windows';

/**
 * Get user input via custom renderer dialog (IPC-based).
 * Supports both option selection and free-form text input.
 */
export async function getUserInput(params: GetUserInputParams): Promise<GetUserInputResult> {
  const { title, message, options } = params;

  return new Promise((resolve, reject) => {
    const requestId = Date.now().toString();

    // Send request to renderer for custom dialog
    MainWindow.getWindow().webContents.send('agent:user-input-request', {
      requestId,
      title,
      message,
      options: options ?? [],
    });

    const handler = (_event: Electron.IpcMainEvent, response: UserInputIpcResponse) => {
      if (response.requestId === requestId) {
        ipcMain.removeListener('agent:user-input-response', handler);

        if (response.cancelled) {
          reject(new Error('User cancelled the input dialog'));
        } else {
          resolve({
            userInput: response.userInput,
            timestamp: new Date(),
          });
        }
      }
    };

    ipcMain.on('agent:user-input-response', handler);
  });
}
