export type NexusModsDownloadReason = 'no-key' | 'not-premium' | 'invalid-key';

class NexusModsDownloadDialogStore {
  isOpen = $state(false);
  reason = $state<NexusModsDownloadReason>('no-key');
  modPageUrl = $state('');
  private onRetry: (() => void) | null = null;
  private onBrowser: (() => void) | null = null;
  private onCloseCallback: (() => void) | null = null;

  show(
    reason: NexusModsDownloadReason,
    modPageUrl: string,
    onRetry?: () => void,
    onBrowser?: () => void,
    onClose?: () => void
  ): void {
    this.reason = reason;
    this.modPageUrl = modPageUrl;
    this.onRetry = onRetry ?? null;
    this.onBrowser = onBrowser ?? null;
    this.onCloseCallback = onClose ?? null;
    this.isOpen = true;
  }

  close(): void {
    const cb = this.onCloseCallback;
    this.isOpen = false;
    this.onRetry = null;
    this.onBrowser = null;
    this.onCloseCallback = null;
    cb?.();
  }

  retry(): void {
    const cb = this.onRetry;
    this.isOpen = false;
    this.onRetry = null;
    this.onBrowser = null;
    this.onCloseCallback = null;
    cb?.();
  }

  openInBrowser(): void {
    // In IPC mode (resolver-triggered), onBrowser handles the fallback to download browser.
    // Only open externally when NOT in IPC mode (normal UI usage).
    if (!this.onBrowser && this.modPageUrl) {
      window.api.openExternal(this.modPageUrl);
    }
    const cb = this.onBrowser;
    this.isOpen = false;
    this.onRetry = null;
    this.onBrowser = null;
    this.onCloseCallback = null;
    cb?.();
  }
}

export const nexusModsDownloadDialogStore = new NexusModsDownloadDialogStore();
