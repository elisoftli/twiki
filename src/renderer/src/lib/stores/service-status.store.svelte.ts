/**
 * Service Status Store
 *
 * Reactive store for service status entries from the server.
 * Provides derived state for backward-compatible agent availability checks.
 */

import type { StatusEntry } from '@twiki/shared';
import type { ServiceStatusState } from '../../../../shared/types/agent.types';
import { settingsStore } from './settings.store.svelte';

// =============================================================================
// Constants
// =============================================================================

/**
 * Status entry ids the server uses for the auto-tweak agent notice.
 *
 * 'agent-notice' is what the server emits today; 'agent' is the original id and
 * what it may return to once every client gates on the API key (this one does).
 * Matching both keeps this client correct either way.
 */
const AGENT_STATUS_IDS = ['agent', 'agent-notice'];

const DEFAULT_STATE: ServiceStatusState = {
  entries: [],
  isServerReachable: true, // Optimistic default
  lastChecked: null,
};

// =============================================================================
// Store Implementation
// =============================================================================

function createServiceStatusStore() {
  // State
  let entries = $state<StatusEntry[]>([]);
  let isServerReachable = $state(true);
  let lastChecked = $state<number | null>(null);
  let dismissedIds = $state<Set<string>>(new Set());

  // ==========================================================================
  // Derived State
  // ==========================================================================

  /** The agent notice from the server, if the hosted agent is currently off */
  const agentNotice = $derived(entries.find((e) => AGENT_STATUS_IDS.includes(e.id)));

  /** True when the user has configured their own Anthropic API key */
  const hasUserApiKey = $derived(
    Boolean(settingsStore.value?.autoTweaker?.claudeApiKey)
  );

  // Visible entries: server entries filtered by dismissals, plus synthetic connectivity entry
  const visibleEntries = $derived.by((): StatusEntry[] => {
    const result: StatusEntry[] = [];

    // If server is unreachable, inject synthetic entry
    if (!isServerReachable) {
      result.push({
        id: 'server-connectivity',
        severity: 'error',
        title: 'Server Offline',
        message: 'Unable to connect to the server.',
        dismissible: false,
      });
    }

    // Add server entries that haven't been dismissed
    for (const entry of entries) {
      if (dismissedIds.has(entry.id)) continue;

      // The agent notice tells users to supply their own API key. Users who already
      // have one aren't affected by the hosted agent being off, so showing it to them
      // is a permanent, undismissible warning about a state that doesn't apply --
      // and its text asks them to do something they've already done.
      if (hasUserApiKey && AGENT_STATUS_IDS.includes(entry.id)) continue;

      result.push(entry);
    }

    return result;
  });

  // Backward compat: raw "hosted agent is off" signal, independent of the user's key.
  const isAgentUnavailable = $derived(!isServerReachable || Boolean(agentNotice));

  /**
   * Whether *this user* is blocked from auto-tweaking.
   *
   * The hosted agent being off only blocks users without their own API key — the
   * server accepts BYOK sessions regardless (see ws/handler.ts). An unreachable
   * server blocks everyone, since the agent session runs over the server
   * WebSocket even when the user supplies their own key.
   */
  const isAutoTweakBlocked = $derived(
    !isServerReachable || (Boolean(agentNotice) && !hasUserApiKey)
  );

  // ==========================================================================
  // Status Update Handler
  // ==========================================================================

  function handleStateUpdate(newState: ServiceStatusState): void {
    entries = newState.entries;
    isServerReachable = newState.isServerReachable;
    lastChecked = newState.lastChecked;
  }

  // ==========================================================================
  // Public Actions
  // ==========================================================================

  /**
   * Initialize the store - subscribe to service status updates.
   * Should be called once in layout component.
   */
  async function init(): Promise<void> {
    // Get initial state
    const state = await window.api.serviceStatus.getState();
    handleStateUpdate(state);

    // Subscribe to status updates
    window.api.serviceStatus.onUpdated(handleStateUpdate);
  }

  /**
   * Cleanup IPC listeners. Call on layout destroy.
   */
  function cleanup(): void {
    window.api.serviceStatus.removeAllListeners();
  }

  /**
   * Force an immediate status check.
   */
  async function forceCheck(): Promise<void> {
    const state = await window.api.serviceStatus.forceCheck();
    handleStateUpdate(state);
  }

  /**
   * Dismiss a status entry by ID (client-side only).
   */
  function dismiss(id: string): void {
    const newSet = new Set(dismissedIds);
    newSet.add(id);
    dismissedIds = newSet;
  }

  return {
    // State
    get entries() {
      return entries;
    },
    get isServerReachable() {
      return isServerReachable;
    },
    get lastChecked() {
      return lastChecked;
    },

    // Derived
    get visibleEntries() {
      return visibleEntries;
    },
    get isAgentUnavailable() {
      return isAgentUnavailable;
    },
    get isAutoTweakBlocked() {
      return isAutoTweakBlocked;
    },
    get agentNotice() {
      return agentNotice;
    },

    // Actions
    init,
    cleanup,
    forceCheck,
    dismiss,
  };
}

// Singleton instance
export const serviceStatusStore = createServiceStatusStore();
