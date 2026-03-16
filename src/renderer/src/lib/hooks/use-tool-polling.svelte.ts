import type { ToolStatusSnapshot } from '../../../../main/interfaces/tool-status.interface';
import { createLogger } from '$lib/utils/logger.utils';

const logger = createLogger('ToolPolling');

const DEFAULT_SNAPSHOT: ToolStatusSnapshot = {
  tools: [],
  hasAwaitingApproval: false,
  firstPendingToolId: null,
};

// Fallback polling interval (push events are primary, polling is backup)
const FALLBACK_POLL_INTERVAL_MS = 5000;

/**
 * Hook for receiving tool statuses from the backend.
 * Uses push-based IPC events as the primary mechanism,
 * with fallback polling for robustness.
 */
export function useToolPolling() {
  let snapshot = $state<ToolStatusSnapshot>({ ...DEFAULT_SNAPSHOT });
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  /**
   * Fetches the current tool statuses from the backend (fallback).
   */
  async function poll(): Promise<ToolStatusSnapshot> {
    try {
      snapshot = await window.api.agent.getToolStatuses();
      return snapshot;
    } catch (err) {
      logger.error('Failed to get tool statuses:', err);
      return snapshot;
    }
  }

  /**
   * Handle push-based tool status updates.
   */
  function handleToolStatusUpdate(newSnapshot: ToolStatusSnapshot): void {
    snapshot = newSnapshot;
  }

  /**
   * Starts listening for tool statuses via push events with fallback polling.
   */
  function start(): void {
    if (unsubscribe || pollingInterval) return;

    // Subscribe to push-based updates (primary)
    unsubscribe = window.api.agent.onToolStatusUpdate(handleToolStatusUpdate);

    // Poll immediately for initial state
    poll();

    // Fallback polling at longer interval
    pollingInterval = setInterval(poll, FALLBACK_POLL_INTERVAL_MS);
  }

  /**
   * Stops listening for tool statuses.
   */
  function stop(): void {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  /**
   * Resets the snapshot to default state.
   */
  function reset(): void {
    snapshot = { ...DEFAULT_SNAPSHOT };
  }

  /**
   * Approves a tool call by ID.
   */
  async function approveTool(toolId: string): Promise<void> {
    await window.api.agent.approveTool(toolId);
    // Poll immediately to get updated status (push event should also arrive)
    await poll();
  }

  /**
   * Declines a tool call by ID.
   */
  async function declineTool(toolId: string): Promise<void> {
    await window.api.agent.declineTool(toolId);
    // Poll immediately to get updated status (push event should also arrive)
    await poll();
  }

  return {
    // State
    get snapshot() { return snapshot; },
    get tools() { return snapshot.tools; },
    get hasAwaitingApproval() { return snapshot.hasAwaitingApproval; },
    get firstPendingToolId() { return snapshot.firstPendingToolId; },
    get isPolling() { return pollingInterval !== null || unsubscribe !== null; },

    // Actions
    poll,
    start,
    stop,
    reset,
    approveTool,
    declineTool,
  };
}
