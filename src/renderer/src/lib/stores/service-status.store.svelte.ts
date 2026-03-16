/**
 * Service Status Store
 *
 * Reactive store for service status entries from the server.
 * Provides derived state for backward-compatible agent availability checks.
 */

import type { StatusEntry } from '@twiki/shared';
import type { ServiceStatusState } from '../../../../shared/types/agent.types';

// =============================================================================
// Constants
// =============================================================================

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
      if (!dismissedIds.has(entry.id)) {
        result.push(entry);
      }
    }

    return result;
  });

  // Backward compat: true when server unreachable OR entry with id === 'agent' exists
  const isAgentUnavailable = $derived(
    !isServerReachable || entries.some((e) => e.id === 'agent')
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

    // Actions
    init,
    cleanup,
    forceCheck,
    dismiss,
  };
}

// Singleton instance
export const serviceStatusStore = createServiceStatusStore();
