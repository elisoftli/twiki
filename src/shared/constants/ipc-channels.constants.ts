/**
 * IPC Channel Constants
 *
 * Centralized definitions for all Electron IPC channel names used
 * for communication between main and renderer processes.
 *
 * Organized by domain/feature area.
 */

export const IPC_CHANNELS = {
  // Agent domain - Tweak agent status and control
  AGENT: {
    GET_STATUS: 'agent:get-status',
    PROCESS_TWEAK: 'agent:process-tweak',
    ABORT_TASK: 'agent:abort-task',
    RESET_STATUS: 'agent:reset-status',
    STATUS_UPDATED: 'agent:status-updated',
    // Tool approval workflow
    GET_TOOL_STATUSES: 'agent:get-tool-statuses',
    APPROVE_TOOL: 'agent:approve-tool',
    DECLINE_TOOL: 'agent:decline-tool',
    // User input
    USER_INPUT_REQUEST: 'agent:user-input-request',
    USER_INPUT_RESPONSE: 'agent:user-input-response',
  },

  // Service Status domain
  SERVICE_STATUS: {
    GET: 'service-status:get',
    FORCE_CHECK: 'service-status:force-check',
    UPDATED: 'service-status:updated',
  },

  // Library domain - Game library operations
  LIBRARY: {
    GET_STATUS: 'library:get-status',
    GET_GAMES: 'library:get-games',
    RELOAD: 'library:reload',
    GET_GAME: 'library:get-game',
    LAUNCH_GAME: 'library:launch-game',
    IS_GAME_RUNNING: 'library:is-game-running',
    TERMINATE_GAME: 'library:terminate-game',
    PIN_GAME: 'library:pin-game',
    UNPIN_GAME: 'library:unpin-game',
    LINK_PCGW: 'library:link-pcgw',
    REMOVE_GAME: 'library:remove-game',
    // Events from main to renderer
    GAME_POSTER_UPDATED: 'library:game-poster-updated',
    GAME_PCGW_LINKED: 'library:game-pcgw-linked',
    LOADED: 'library:loaded',
    CACHE_LOADED: 'library:cache-loaded',
    GAME_PINNED: 'library:game-pinned',
    GAME_UNPINNED: 'library:game-unpinned',
  },

  // PCGamingWiki domain
  PCGW: {
    GET_TWEAKS: 'pcgw:get-tweaks',
  },

  // Settings domain
  SETTINGS: {
    GET: 'get-settings',
    UPDATE: 'update-settings',
    UPDATED: 'settings-updated',
    PICK_RESHADE_INSTALLER: 'settings:pick-reshade-installer',
  },

  // System domain - System specs and operations
  SYSTEM: {
    SPECS_GET_STATUS: 'system-specs:get-status',
    SPECS_GET_SPECS: 'system-specs:get-specs',
  },

  // Auth domain - Authentication
  AUTH: {
    GET_STATE: 'auth:get-state',
    SIGNIN: 'auth:signin',
    SIGNUP: 'auth:signup',
    VERIFY: 'auth:verify',
    RESEND_CODE: 'auth:resend-code',
    REFRESH: 'auth:refresh',
    SIGNOUT: 'auth:signout',
    NEEDS_REFRESH: 'auth:needs-refresh',
    GET_VALID_TOKEN: 'auth:get-valid-token',
    ERROR: 'auth:error',
  },

  // Shell domain - External operations
  SHELL: {
    OPEN_EXTERNAL: 'shell:open-external',
    OPEN_PATH: 'shell:open-path',
  },

  // Downloads domain - Download management
  DOWNLOADS: {
    GET_SIZE: 'downloads:get-size',
    CLEAR: 'downloads:clear',
    OPEN_FOLDER: 'downloads:open-folder',
  },

  // Updater domain - App updates
  UPDATER: {
    GET_STATUS: 'updater:get-status',
    STATUS_UPDATED: 'updater:status-updated',
    UPDATE_AND_RELAUNCH: 'updater:update-and-relaunch-app',
    RETRY: 'updater:retry',
  },

  // File domain - File operations
  FILE: {
    READ_TEXT: 'file:read-text',
    WRITE_TEXT: 'file:write-text',
  },

  // Logs domain - Application logs
  LOGS: {
    GET_PATH: 'logs:get-path',
    OPEN_IN_EDITOR: 'logs:open-in-editor',
    COPY_PATH: 'logs:copy-path',
  },

  // Applied Tweaks domain - Persistence
  APPLIED_TWEAKS: {
    GET_BY_GAME: 'applied-tweaks:get-by-game',
    GET_ALL: 'applied-tweaks:get-all',
    ADD: 'applied-tweaks:add',
    REMOVE: 'applied-tweaks:remove',
  },

  // Revert domain - Tweak reversion
  REVERT: {
    EXECUTE: 'revert:execute',
    PRE_CHECK: 'revert:pre-check',
    EXECUTE_WITH_FALLBACK: 'revert:execute-with-fallback',
  },

  // Tweak Metadata domain
  TWEAK_METADATA: {
    FETCH: 'tweak-metadata:fetch',
  },

  // Download Browser domain - Navigation
  DOWNLOAD_BROWSER: {
    NAVIGATE_BACK: 'download-browser:navigate-back',
    NAVIGATE_FORWARD: 'download-browser:navigate-forward',
    RELOAD: 'download-browser:reload',
    STOP: 'download-browser:stop',
    STATE_UPDATE: 'download-browser:state-update',
  },

  // App domain - General app operations
  APP: {
    RELAUNCH: 'relaunch-app',
  },
} as const;

/**
 * Type helper to extract channel names from a domain
 */
export type IpcChannelDomain = keyof typeof IPC_CHANNELS;

/**
 * Type helper to get all channel names as a union type
 */
export type IpcChannelName = (typeof IPC_CHANNELS)[IpcChannelDomain][keyof (typeof IPC_CHANNELS)[IpcChannelDomain]];
