import type {
  AgentStatus,
} from '../../../../main/interfaces/tweak-agent.interface';

const DEFAULT_STATUS: AgentStatus = {
  isRunning: false,
  response: null,
  error: null,
  threadId: null,
  executionMode: null,
  agentActivity: null,
  rateLimitInfo: null,
};

export type StatusUpdateCallback = (status: AgentStatus) => void;

/**
 * Hook for subscribing to and tracking tweak agent status.
 */
export function useAgentStatus() {
  let status = $state<AgentStatus>({ ...DEFAULT_STATUS });

  // Callbacks for external handling
  let onStatusUpdate: StatusUpdateCallback | null = null;

  /**
   * Initializes the agent status by fetching current state and subscribing to updates.
   */
  async function init(): Promise<void> {
    // Get initial status
    status = await window.api.agent.getStatus();

    // Subscribe to status updates
    window.api.agent.onStatusUpdated((newStatus) => {
      status = newStatus;
      onStatusUpdate?.(newStatus);
    });
  }

  /**
   * Resets the agent status in the backend.
   */
  async function reset(): Promise<void> {
    window.api.agent.resetStatus();
    status = { ...DEFAULT_STATUS };
  }

  /**
   * Aborts the current task.
   */
  function abort(): void {
    window.api.agent.abortTask();
  }

  /**
   * Removes all IPC listeners. Call this on component destroy.
   */
  function cleanup(): void {
    window.api.agent.removeAllListeners();
  }

  /**
   * Sets a callback for status updates.
   */
  function setOnStatusUpdate(callback: StatusUpdateCallback | null): void {
    onStatusUpdate = callback;
  }

  return {
    // State
    get status() { return status; },
    get isRunning() { return status.isRunning; },
    get response() { return status.response; },
    get error() { return status.error; },

    // Actions
    init,
    reset,
    abort,
    cleanup,

    // Callback setters
    setOnStatusUpdate,
  };
}
