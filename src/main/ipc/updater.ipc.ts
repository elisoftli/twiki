/**
 * Updater IPC Handlers
 *
 * Handles IPC operations for app updates:
 * - Getting update status
 * - Triggering update and relaunch
 * - Retrying failed updates
 */

import { UpdaterService } from '../services/system/updater.service';
import { createIpcHandlers, createIpcListeners } from './ipc-handler.factory';

/**
 * Setup updater-related IPC handlers.
 * Uses UpdaterService singleton.
 */
export function setupUpdaterIpc(): void {
  const updaterService = UpdaterService.getInstance();

  createIpcHandlers([
    { channel: 'updater:get-status', handler: () => updaterService.status },
    { channel: 'updater:retry', handler: async () => updaterService.retry() },
  ]);

  createIpcListeners([
    { channel: 'updater:update-and-relaunch-app', handler: () => updaterService.updateAndRelaunch() },
  ]);
}
