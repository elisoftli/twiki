/**
 * IPC Handler Factory
 *
 * Factory functions to reduce boilerplate when registering IPC handlers.
 * Provides a declarative way to set up both invoke handlers (handle) and
 * event listeners (on).
 */

import { ipcMain, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InvokeHandlerFn = (event: IpcMainInvokeEvent, args: any) => Promise<any> | any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ListenerHandlerFn = (event: IpcMainEvent, args: any) => void;

interface InvokeHandlerConfig {
  channel: string;
  handler: InvokeHandlerFn;
}

interface ListenerConfig {
  channel: string;
  handler: ListenerHandlerFn;
}

/**
 * Register multiple IPC invoke handlers (ipcMain.handle).
 * Use for request-response patterns where the renderer expects a return value.
 * @param configs - Array of handler configurations
 */
export function createIpcHandlers(configs: InvokeHandlerConfig[]): void {
  for (const config of configs) {
    ipcMain.handle(config.channel, async (event, args) => {
      return config.handler(event, args);
    });
  }
}

/**
 * Register multiple IPC event listeners (ipcMain.on).
 * Use for fire-and-forget patterns where no response is needed.
 * @param configs - Array of listener configurations
 */
export function createIpcListeners(configs: ListenerConfig[]): void {
  for (const config of configs) {
    ipcMain.on(config.channel, (event, args) => {
      config.handler(event, args);
    });
  }
}
