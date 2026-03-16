import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import type {
  Settings,
  UpdaterStatus,
  AgentStatus as AgentStatus,
  AgentResult as AgentResult,
  UserInputRequest,
  ProcessTweakRequest,
  AppliedTweak,
  TweakSummary,
  RevertSummary,
  PreRevertCheckResult,
  Game,
  GameLibraryStatus,
  ToolStatusSnapshot,
  SystemSpecs,
  SystemSpecsStatus,
  ServiceStatusState,
  GameLauncher,
} from '../main/interfaces';
import type { PCGWGame, PCGWConfigPath } from '@twiki/shared';
import type { PcgwSearchResult } from '../main/services/game/pcgamingwiki.service';
import type { ImportGameParams } from '../main/services/game/launchers/manual.launcher';
import type { TweakMetadata } from '../main/services/tweak/tweak-metadata.service';
import type { DeepPartial } from '../main/types';
import type { AuthState, AuthUser } from '../main/services/auth/auth.service';
import type { NexusModsGame, NexusModsModFile, NexusModsDownloadUrl, NexusModsSearchResult, NexusModsSort } from '../main/interfaces/nexusmods.interface';

// Re-export types for renderer usage
export type { PcgwSearchResult, ImportGameParams };

// Select folder result type
export interface SelectFolderResult {
  folderPath: string;
  suggestedExecutable: string | null;
}

// Auth API types
export interface SignInResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
  needsVerification?: boolean;
  userId?: string;
}

export interface SignUpResult {
  success: boolean;
  userId?: string;
  error?: string;
  emailSent?: boolean;
}

export interface VerifyResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

export interface ResendCodeResult {
  success: boolean;
  error?: string;
}

export interface RefreshResult {
  success: boolean;
  error?: string;
}

export interface ForgotPasswordResult {
  success: boolean;
  userId?: string;
  error?: string;
  emailSent?: boolean;
}

export interface ResetPasswordResult {
  success: boolean;
  error?: string;
}

// Custom APIs for renderer
export const api = {
  getSettings: async (): Promise<Settings> => {
    return await ipcRenderer.invoke('get-settings');
  },
  onSettingsUpdated: (callback: (settings: Settings) => void): void => {
    ipcRenderer.on('settings-updated', (_, settings: Settings) => {
      callback(settings);
    });
  },
  updateSettings: (settings: DeepPartial<Settings>): void => {
    ipcRenderer.send('update-settings', settings);
  },
  pickReshadeInstaller: async (): Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }> => {
    return await ipcRenderer.invoke('settings:pick-reshade-installer');
  },
  clearReshadeInstaller: (): void => {
    ipcRenderer.send('update-settings', {
      graphicsMods: { reshadeInstallerPath: undefined },
    });
  },
  openExternal: (url: string): void => {
    ipcRenderer.send('shell:open-external', url);
  },
  openPath: (path: string): void => {
    ipcRenderer.send('shell:open-path', path);
  },

  // Updater API
  updater: {
    getStatus: async (): Promise<UpdaterStatus> => {
      return await ipcRenderer.invoke('updater:get-status');
    },
    onStatusUpdated: (callback: (status: UpdaterStatus) => void): void => {
      ipcRenderer.on('updater:status-updated', (_, status: UpdaterStatus) => {
        callback(status);
      });
    },
    updateAndRelaunch: (): void => {
      ipcRenderer.send('updater:update-and-relaunch-app');
    },
    retry: async (): Promise<void> => {
      await ipcRenderer.invoke('updater:retry');
    },
    removeAllListeners: (): void => {
      ipcRenderer.removeAllListeners('updater:status-updated');
    },
  },

  // Service Status API
  serviceStatus: {
    getState: async (): Promise<ServiceStatusState> => {
      return await ipcRenderer.invoke('service-status:get');
    },
    onUpdated: (callback: (state: ServiceStatusState) => void): void => {
      ipcRenderer.on('service-status:updated', (_, state) => callback(state));
    },
    forceCheck: async (): Promise<ServiceStatusState> => {
      return await ipcRenderer.invoke('service-status:force-check');
    },
    removeAllListeners: (): void => {
      ipcRenderer.removeAllListeners('service-status:updated');
    },
  },

  // Tweak Agent API
  agent: {
    getStatus: async (): Promise<AgentStatus> => {
      return await ipcRenderer.invoke('agent:get-status');
    },

    processTweak: async (request: ProcessTweakRequest): Promise<AgentResult> => {
      return await ipcRenderer.invoke('agent:process-tweak', request);
    },

    abortTask: (): void => {
      ipcRenderer.send('agent:abort-task');
    },

    resetStatus: (): void => {
      ipcRenderer.send('agent:reset-status');
    },

    // Event listeners
    onStatusUpdated: (callback: (status: AgentStatus) => void): void => {
      ipcRenderer.on('agent:status-updated', (_, status) => callback(status));
    },

    // Tool status API
    getToolStatuses: async (): Promise<ToolStatusSnapshot> => {
      return await ipcRenderer.invoke('agent:get-tool-statuses');
    },

    // Push-based tool status updates
    onToolStatusUpdate: (callback: (snapshot: ToolStatusSnapshot) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, snapshot: ToolStatusSnapshot): void => {
        callback(snapshot);
      };
      ipcRenderer.on('agent:tool-status-update', listener);
      return () => ipcRenderer.removeListener('agent:tool-status-update', listener);
    },

    approveTool: async (
      toolId: string,
      modifiedArgs?: Record<string, unknown>
    ): Promise<boolean> => {
      return await ipcRenderer.invoke('agent:approve-tool', { toolId, modifiedArgs });
    },

    declineTool: async (toolId: string): Promise<boolean> => {
      return await ipcRenderer.invoke('agent:decline-tool', toolId);
    },

    onUserInputRequest: (callback: (request: UserInputRequest & { requestId: string }) => void): void => {
      ipcRenderer.on('agent:user-input-request', (_, request) => callback(request));
    },

    respondToUserInput: (requestId: string, userInput: string, cancelled: boolean): void => {
      ipcRenderer.send('agent:user-input-response', { requestId, userInput, cancelled });
    },

    removeAllListeners: (): void => {
      ipcRenderer.removeAllListeners('agent:status-updated');
      ipcRenderer.removeAllListeners('agent:tool-status-update');
      ipcRenderer.removeAllListeners('agent:user-input-request');
    },
  },

  // Game Library API
  library: {
    getStatus: (): Promise<GameLibraryStatus> => {
      return ipcRenderer.invoke('library:get-status');
    },

    getGames: (): Promise<Game[]> => {
      return ipcRenderer.invoke('library:get-games');
    },

    reload: (): Promise<Game[]> => {
      return ipcRenderer.invoke('library:reload');
    },

    getGame: (id: string): Promise<Game | undefined> => {
      return ipcRenderer.invoke('library:get-game', id);
    },

    getGameByLauncherId: (launcherId: string): Promise<Game | undefined> => {
      return ipcRenderer.invoke('library:get-game-by-launcher-id', launcherId);
    },

    launchGame: (id: string): void => {
      ipcRenderer.send('library:launch-game', id);
    },

    isGameRunning: (id: string): Promise<boolean> => {
      return ipcRenderer.invoke('library:is-game-running', id);
    },

    terminateGame: (id: string): Promise<void> => {
      return ipcRenderer.invoke('library:terminate-game', id);
    },

    onGamePosterUpdated: (callback: (data: { id: string; posterPath: string }) => void): void => {
      ipcRenderer.on('library:game-poster-updated', (_, data) => callback(data));
    },

    onGamePcgwLinked: (callback: (data: { id: string; pcgwPageId: number }) => void): void => {
      ipcRenderer.on('library:game-pcgw-linked', (_, data) => callback(data));
    },

    onLibraryLoaded: (callback: (data: { gameCount: number }) => void): void => {
      ipcRenderer.on('library:loaded', (_, data) => callback(data));
    },

    onCacheLoaded: (callback: (data: { gameCount: number }) => void): void => {
      ipcRenderer.on('library:cache-loaded', (_, data) => callback(data));
    },

    pinGame: (id: string): Promise<void> => {
      return ipcRenderer.invoke('library:pin-game', id);
    },

    unpinGame: (id: string): Promise<void> => {
      return ipcRenderer.invoke('library:unpin-game', id);
    },

    reorderPinnedGames: (orderedIds: string[]): Promise<void> => {
      return ipcRenderer.invoke('library:reorder-pinned-games', orderedIds);
    },

    onGamePinned: (callback: (data: { id: string; pinnedAt: string }) => void): void => {
      ipcRenderer.on('library:game-pinned', (_, data) => callback(data));
    },

    onGameUnpinned: (callback: (data: { id: string }) => void): void => {
      ipcRenderer.on('library:game-unpinned', (_, data) => callback(data));
    },

    // Manual game import APIs
    selectFolder: (): Promise<SelectFolderResult | null> => {
      return ipcRenderer.invoke('library:select-folder');
    },

    selectExecutable: (defaultPath?: string): Promise<string | null> => {
      return ipcRenderer.invoke('library:select-executable', defaultPath);
    },

    searchPcgw: (query: string): Promise<PcgwSearchResult[]> => {
      return ipcRenderer.invoke('library:search-pcgw', query);
    },

    importGame: (params: ImportGameParams): Promise<Game> => {
      return ipcRenderer.invoke('library:import-game', params);
    },

    deleteGame: (id: string, deleteAppliedTweaks: boolean): Promise<void> => {
      return ipcRenderer.invoke('library:delete-game', { id, deleteAppliedTweaks });
    },

    removeGame: (gameId: string): Promise<void> => {
      return ipcRenderer.invoke('library:remove-game', { gameId });
    },

    linkPcgw: (gameId: string, pcgwPageId: number, title: string): Promise<Game> => {
      return ipcRenderer.invoke('library:link-pcgw', { gameId, pcgwPageId, title });
    },

    checkDuplicatePath: (installPath: string): Promise<boolean> => {
      return ipcRenderer.invoke('library:check-duplicate-path', installPath);
    },

    checkDuplicatePcgw: (pcgwPageId: number): Promise<boolean> => {
      return ipcRenderer.invoke('library:check-duplicate-pcgw', pcgwPageId);
    },

    // Event listeners for manual game changes
    onGameAdded: (callback: (data: { game: Game }) => void): void => {
      ipcRenderer.on('library:game-added', (_, data) => callback(data));
    },

    onGameRemoved: (callback: (data: { id: string }) => void): void => {
      ipcRenderer.on('library:game-removed', (_, data) => callback(data));
    },

    // Custom config path APIs
    selectConfigPath: (): Promise<{ path: string; pathType: 'file' | 'directory' } | null> => {
      return ipcRenderer.invoke('library:select-config-path');
    },

    addCustomConfigPath: (
      gameId: string,
      path: string,
      pathType: 'file' | 'directory',
      pcgwConfigPaths: PCGWConfigPath[]
    ): Promise<{ success: boolean; configPath?: PCGWConfigPath; error?: string }> => {
      return ipcRenderer.invoke('library:add-custom-config-path', { gameId, path, pathType, pcgwConfigPaths });
    },

    removeCustomConfigPath: (
      gameId: string,
      path: string
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('library:remove-custom-config-path', { gameId, path });
    },

    onCustomConfigPathAdded: (
      callback: (data: { gameId: string; configPath: PCGWConfigPath }) => void
    ): void => {
      ipcRenderer.on('library:custom-config-path-added', (_, data) => callback(data));
    },

    onCustomConfigPathRemoved: (callback: (data: { gameId: string; path: string }) => void): void => {
      ipcRenderer.on('library:custom-config-path-removed', (_, data) => callback(data));
    },

    // Config path disable/enable APIs
    disableConfigPath: (gameId: string, path: string): Promise<void> => {
      return ipcRenderer.invoke('library:disable-config-path', { gameId, path });
    },

    enableConfigPath: (gameId: string, path: string): Promise<void> => {
      return ipcRenderer.invoke('library:enable-config-path', { gameId, path });
    },

    onConfigPathDisabled: (callback: (data: { gameId: string; path: string }) => void): void => {
      ipcRenderer.on('library:config-path-disabled', (_, data) => callback(data));
    },

    onConfigPathEnabled: (callback: (data: { gameId: string; path: string }) => void): void => {
      ipcRenderer.on('library:config-path-enabled', (_, data) => callback(data));
    },

    removeAllListeners: (): void => {
      ipcRenderer.removeAllListeners('library:game-poster-updated');
      ipcRenderer.removeAllListeners('library:game-pcgw-linked');
      ipcRenderer.removeAllListeners('library:loaded');
      ipcRenderer.removeAllListeners('library:cache-loaded');
      ipcRenderer.removeAllListeners('library:game-pinned');
      ipcRenderer.removeAllListeners('library:game-unpinned');
      ipcRenderer.removeAllListeners('library:game-added');
      ipcRenderer.removeAllListeners('library:game-removed');
      ipcRenderer.removeAllListeners('library:custom-config-path-added');
      ipcRenderer.removeAllListeners('library:custom-config-path-removed');
      ipcRenderer.removeAllListeners('library:config-path-disabled');
      ipcRenderer.removeAllListeners('library:config-path-enabled');
    },
  },

  // PCGamingWiki API
  pcgw: {
    getTweaks: (gameId: string, launcher: GameLauncher): Promise<PCGWGame | null> => {
      return ipcRenderer.invoke('pcgw:get-tweaks', { gameId, launcher });
    },
  },

  // Applied Tweaks API (persistence)
  appliedTweaks: {
    getByGame: (gameId: string): Promise<AppliedTweak[]> => {
      return ipcRenderer.invoke('applied-tweaks:get-by-game', gameId);
    },

    getAll: (): Promise<AppliedTweak[]> => {
      return ipcRenderer.invoke('applied-tweaks:get-all');
    },

    add: (tweak: AppliedTweak): Promise<void> => {
      return ipcRenderer.invoke('applied-tweaks:add', tweak);
    },

    remove: (hash: string): Promise<boolean> => {
      return ipcRenderer.invoke('applied-tweaks:remove', hash);
    },
  },

  // Revert API
  revert: {
    execute: (summary: TweakSummary): Promise<RevertSummary> => {
      return ipcRenderer.invoke('revert:execute', summary);
    },
    preCheck: (tweak: AppliedTweak): Promise<PreRevertCheckResult> => {
      return ipcRenderer.invoke('revert:pre-check', tweak);
    },
    executeWithFallback: (tweak: AppliedTweak, useFallback: boolean): Promise<RevertSummary> => {
      return ipcRenderer.invoke('revert:execute-with-fallback', { tweak, useFallback });
    },
  },

  // System Specs API
  systemSpecs: {
    getStatus: (): Promise<SystemSpecsStatus> => {
      return ipcRenderer.invoke('system-specs:get-status');
    },

    getSpecs: (): Promise<SystemSpecs | null> => {
      return ipcRenderer.invoke('system-specs:get-specs');
    },
  },

  // Tweak Metadata API (batch lookup for processability and recipes)
  tweakMetadata: {
    fetch: (hashes: string[], pcgwPageId: number, launcher?: string): Promise<Record<string, TweakMetadata>> => {
      return ipcRenderer.invoke('tweak-metadata:fetch', { hashes, pcgwPageId, ...(launcher && { launcher }) });
    },
  },

  // File API (for built-in text editor)
  file: {
    readText: (
      filePath: string
    ): Promise<{ success: boolean; content: string | null; error: string | null }> => {
      return ipcRenderer.invoke('file:read-text', filePath);
    },

    writeText: (filePath: string, content: string): Promise<{ success: boolean; error: string | null }> => {
      return ipcRenderer.invoke('file:write-text', { filePath, content });
    },
  },

  // Downloads API (for managing downloaded files cache)
  downloads: {
    getSize: (): Promise<number> => {
      return ipcRenderer.invoke('downloads:get-size');
    },

    clear: (): Promise<{ success: boolean; error: string | null }> => {
      return ipcRenderer.invoke('downloads:clear');
    },

    openFolder: (): void => {
      ipcRenderer.send('downloads:open-folder');
    },
  },

  // Download Browser API
  downloadBrowser: {
    onShowInfoDialog: (callback: (data: { requestId: string }) => void): void => {
      ipcRenderer.on('download-browser:show-info', (_event, data) => callback(data));
    },
    acknowledgeInfoDialog: (requestId: string, dontShowAgain: boolean): void => {
      ipcRenderer.send('download-browser:info-acknowledged', { requestId, dontShowAgain });
    },
  },

  // NexusMods API
  nexusmods: {
    resolveGame: (name: string): Promise<NexusModsGame | null> => {
      return ipcRenderer.invoke('nexusmods:resolve-game', { name });
    },

    searchMods: (domainName: string, query: string | null, sort: NexusModsSort, offset: number, count: number): Promise<NexusModsSearchResult> => {
      return ipcRenderer.invoke('nexusmods:search-mods', { domainName, query, sort, offset, count });
    },

    getModFiles: (modId: number, gameId: number): Promise<NexusModsModFile[]> => {
      return ipcRenderer.invoke('nexusmods:get-mod-files', { modId, gameId });
    },

    getDownloadUrl: (domainName: string, modId: number, fileId: number, apiKey: string): Promise<NexusModsDownloadUrl[]> => {
      return ipcRenderer.invoke('nexusmods:get-download-url', { domainName, modId, fileId, apiKey });
    },

    downloadFile: (url: string, modName: string, fileName: string, fileId: number): Promise<{ success: boolean; path?: string; error?: string; cancelled?: boolean }> => {
      return ipcRenderer.invoke('nexusmods:download-file', { url, modName, fileName, fileId });
    },

    onDownloadProgress: (callback: (data: { fileId: number; downloadedBytes: number; totalBytes?: number; percentage?: number }) => void): (() => void) => {
      const listener = (_: unknown, data: { fileId: number; downloadedBytes: number; totalBytes?: number; percentage?: number }): void => callback(data);
      ipcRenderer.on('nexusmods:download-progress', listener);
      return () => ipcRenderer.removeListener('nexusmods:download-progress', listener);
    },

    linkGame: (gameId: string, domainName: string): Promise<void> => {
      return ipcRenderer.invoke('nexusmods:link-game', { gameId, domainName });
    },

    onShowAuthDialog: (callback: (data: { requestId: string; reason: string; modPageUrl: string }) => void): void => {
      ipcRenderer.on('nexusmods:show-auth-dialog', (_, data) => callback(data));
    },

    respondToAuthDialog: (requestId: string, action: 'retry' | 'browser' | 'close'): void => {
      ipcRenderer.send('nexusmods:auth-dialog-response', { requestId, action });
    },

    removeAllListeners: (): void => {
      ipcRenderer.removeAllListeners('nexusmods:show-auth-dialog');
    },
  },

  relaunchApp: (): void => {
    ipcRenderer.send('relaunch-app');
  },

  // Logs API (for accessing application logs)
  logs: {
    getPath: (): Promise<string> => {
      return ipcRenderer.invoke('logs:get-path');
    },

    openInEditor: (): Promise<{ success: boolean; error: string | null }> => {
      return ipcRenderer.invoke('logs:open-in-editor');
    },

    copyPath: (): Promise<void> => {
      return ipcRenderer.invoke('logs:copy-path');
    },

    forward: (level: string, serviceName: string, args: unknown[]): void => {
      ipcRenderer.send('logs:renderer', { level, serviceName, args });
    },
  },

  // Auth API
  auth: {
    getState: (): Promise<AuthState> => {
      return ipcRenderer.invoke('auth:get-state');
    },

    signIn: (email: string, password: string): Promise<SignInResult> => {
      return ipcRenderer.invoke('auth:signin', { email, password });
    },

    signUp: (username: string, email: string, password: string): Promise<SignUpResult> => {
      return ipcRenderer.invoke('auth:signup', { username, email, password });
    },

    verify: (userId: string, code: string): Promise<VerifyResult> => {
      return ipcRenderer.invoke('auth:verify', { userId, code });
    },

    resendCode: (userId: string): Promise<ResendCodeResult> => {
      return ipcRenderer.invoke('auth:resend-code', userId);
    },

    refresh: (): Promise<RefreshResult> => {
      return ipcRenderer.invoke('auth:refresh');
    },

    signOut: (): Promise<void> => {
      return ipcRenderer.invoke('auth:signout');
    },

    needsRefresh: (): Promise<boolean> => {
      return ipcRenderer.invoke('auth:needs-refresh');
    },

    getValidToken: (): Promise<string | null> => {
      return ipcRenderer.invoke('auth:get-valid-token');
    },

    onAuthError: (callback: () => void): void => {
      ipcRenderer.on('auth:error', () => callback());
    },

    forgotPassword: (email: string): Promise<ForgotPasswordResult> => {
      return ipcRenderer.invoke('auth:forgot-password', email);
    },

    resetPassword: (userId: string, code: string, newPassword: string): Promise<ResetPasswordResult> => {
      return ipcRenderer.invoke('auth:reset-password', { userId, code, newPassword });
    },

    resendResetCode: (userId: string): Promise<ResendCodeResult> => {
      return ipcRenderer.invoke('auth:resend-reset-code', userId);
    },

    removeAllListeners: (): void => {
      ipcRenderer.removeAllListeners('auth:error');
    },
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
