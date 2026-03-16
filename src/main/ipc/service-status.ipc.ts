/**
 * Service Status IPC Handlers
 *
 * Handles IPC operations for service status.
 */

import { ServiceStatusService } from '../services/agent/service-status.service';
import { createIpcHandlers } from './ipc-handler.factory';

/**
 * Setup service status IPC handlers.
 * Uses ServiceStatusService singleton.
 */
export function setupServiceStatusIpc(): void {
  const service = ServiceStatusService.getInstance();

  createIpcHandlers([
    { channel: 'service-status:get', handler: () => service.state },
    { channel: 'service-status:force-check', handler: async () => service.forceCheck() },
  ]);
}
