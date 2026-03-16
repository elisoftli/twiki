import type { UpdaterStatus } from '../../../../main/interfaces';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_STATUS: UpdaterStatus = {
  isCheckingForUpdates: false,
  isDownloadingUpdate: false,
  isUpdateReadyToInstall: false,
  isError: false,
  errorMessage: null,
  releaseNotes: null,
  updateVersion: null,
};

// =============================================================================
// Store Implementation
// =============================================================================

function createUpdaterStore() {
  // Status state
  let status = $state<UpdaterStatus>({ ...DEFAULT_STATUS });

  // ==========================================================================
  // Derived State
  // ==========================================================================

  // Whether the updater is actively doing something (checking or downloading)
  const isActive = $derived(status.isCheckingForUpdates || status.isDownloadingUpdate);

  // Whether there's something to show in the sidebar
  const showSidebarCard = $derived(
    status.isCheckingForUpdates ||
      status.isDownloadingUpdate ||
      status.isUpdateReadyToInstall ||
      status.isError
  );

  // Card status for icon/styling selection
  const cardStatus = $derived.by((): 'checking' | 'downloading' | 'ready' | 'error' | 'idle' => {
    if (status.isError) return 'error';
    if (status.isCheckingForUpdates) return 'checking';
    if (status.isDownloadingUpdate) return 'downloading';
    if (status.isUpdateReadyToInstall) return 'ready';
    return 'idle';
  });

  // Card label text (primary)
  const cardLabel = $derived.by((): string => {
    switch (cardStatus) {
      case 'checking':
        return 'Checking...';
      case 'downloading':
        return 'Downloading...';
      case 'ready':
        return 'Update ready';
      case 'error':
        return 'Update failed';
      default:
        return '';
    }
  });

  // Card status text (secondary)
  const cardStatusLabel = $derived.by((): string => {
    switch (cardStatus) {
      case 'checking':
        return 'Please wait';
      case 'downloading':
        return 'Please wait';
      case 'ready':
        return 'Click to install';
      case 'error':
        return 'Click to retry';
      default:
        return '';
    }
  });

  // ==========================================================================
  // Status Update Handler
  // ==========================================================================

  function handleStatusUpdate(newStatus: UpdaterStatus): void {
    status = newStatus;
  }

  // ==========================================================================
  // Public Actions
  // ==========================================================================

  /**
   * Initialize the store - subscribe to updater status updates.
   * Should be called once in layout component.
   */
  async function init(): Promise<void> {
    // Subscribe FIRST so no events are missed during the async fetch
    window.api.updater.onStatusUpdated(handleStatusUpdate);

    // Then get current status (always reflects latest main process state)
    status = await window.api.updater.getStatus();
  }

  /**
   * Cleanup IPC listeners. Call on layout destroy.
   */
  function cleanup(): void {
    window.api.updater.removeAllListeners();
  }

  /**
   * Handle card click based on current state:
   * - If update ready -> install and restart
   * - If error -> retry check
   * - Otherwise -> no action (informational)
   */
  async function handleCardClick(): Promise<void> {
    if (status.isUpdateReadyToInstall) {
      window.api.updater.updateAndRelaunch();
    } else if (status.isError) {
      await window.api.updater.retry();
    }
    // If checking or downloading, do nothing (informational only)
  }

  /**
   * Manually trigger an update check.
   */
  async function checkForUpdates(): Promise<void> {
    await window.api.updater.retry();
  }

  return {
    // Status
    get status() {
      return status;
    },
    get isCheckingForUpdates() {
      return status.isCheckingForUpdates;
    },
    get isDownloadingUpdate() {
      return status.isDownloadingUpdate;
    },
    get isUpdateReadyToInstall() {
      return status.isUpdateReadyToInstall;
    },
    get isError() {
      return status.isError;
    },
    get errorMessage() {
      return status.errorMessage;
    },
    get releaseNotes() {
      return status.releaseNotes;
    },
    get updateVersion() {
      return status.updateVersion;
    },

    // Derived
    get isActive() {
      return isActive;
    },
    get showSidebarCard() {
      return showSidebarCard;
    },
    get cardStatus() {
      return cardStatus;
    },
    get cardLabel() {
      return cardLabel;
    },
    get cardStatusLabel() {
      return cardStatusLabel;
    },

    // Actions
    init,
    cleanup,
    handleCardClick,
    checkForUpdates,
  };
}

// Singleton instance
export const updaterStore = createUpdaterStore();
