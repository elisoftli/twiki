/**
 * IPC Handlers Index
 *
 * Central orchestrator that registers all domain-specific IPC handlers.
 */

import type { AgentService } from '../services/agent/agent.service';

import { setupSettingsIpc } from './settings.ipc';
import { setupAgentIpc } from './agent.ipc';
import { setupGameIpc } from './game.ipc';
import { setupShellIpc } from './shell.ipc';
import { setupDownloadsIpc } from './downloads.ipc';
import { setupSystemSpecsIpc, setupFileIpc, setupLogsIpc, setupRendererLogsIpc } from './system.ipc';
import { setupPcgwIpc, setupAppliedTweaksIpc, setupRevertIpc, setupTweakMetadataIpc } from './tweak.ipc';
import { setupUpdaterIpc } from './updater.ipc';
import { setupServiceStatusIpc } from './service-status.ipc';
import { setupDownloadBrowserIpc } from './download-browser.ipc';
import { setupAuthIpc } from './auth.ipc';
import { setupNexusModsIpc } from './nexusmods.ipc';

/**
 * Dependencies required for IPC handler setup.
 */
export interface IpcHandlerDeps {
  agentService: AgentService;
}

/**
 * Register all IPC handlers.
 * @param deps - Dependencies for handlers that require them
 */
export function setupAllIpc(deps: IpcHandlerDeps): void {
  const { agentService } = deps;

  // Handlers with dependencies
  setupSettingsIpc();
  setupAgentIpc(agentService);
  setupUpdaterIpc();
  setupServiceStatusIpc();

  // Handlers without dependencies (use static services)
  setupGameIpc();
  setupShellIpc();
  setupDownloadsIpc();
  setupSystemSpecsIpc();
  setupFileIpc();
  setupLogsIpc();
  setupRendererLogsIpc();
  setupPcgwIpc();
  setupAppliedTweaksIpc();
  setupRevertIpc();
  setupTweakMetadataIpc();
  setupDownloadBrowserIpc();
  setupAuthIpc();
  setupNexusModsIpc();
}

// Re-export individual setup functions for granular testing/usage
export { setupSettingsIpc } from './settings.ipc';
export { setupAgentIpc } from './agent.ipc';
export { setupGameIpc } from './game.ipc';
export { setupShellIpc } from './shell.ipc';
export { setupDownloadsIpc } from './downloads.ipc';
export { setupSystemSpecsIpc, setupFileIpc, setupLogsIpc, setupRendererLogsIpc } from './system.ipc';
export { setupPcgwIpc, setupAppliedTweaksIpc, setupRevertIpc, setupTweakMetadataIpc } from './tweak.ipc';
export { setupServiceStatusIpc } from './service-status.ipc';
export { setupDownloadBrowserIpc, registerDownloadBrowserWebContents, unregisterDownloadBrowserWebContents } from './download-browser.ipc';
export { setupAuthIpc } from './auth.ipc';
export { setupNexusModsIpc } from './nexusmods.ipc';

// Re-export factory functions
export { createIpcHandlers, createIpcListeners } from './ipc-handler.factory';

// Re-export types
export type { SignInResult, SignUpResult, VerifyResult, ResendCodeResult, RefreshResult } from './auth.ipc';
export type { PickReshadeInstallerResult } from './settings.ipc';
