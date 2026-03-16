<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import X from '@lucide/svelte/icons/x';
  import Download from '@lucide/svelte/icons/download';
  import { logger } from '$lib/utils/logger.utils';

  interface Props {
    /** Current path value (from settings) */
    value?: string;
    /** Callback when a path is successfully configured */
    onConfigured?: (path: string) => void;
    /** Callback when the path is cleared */
    onCleared?: () => void;
    /** Whether to show in a more compact form (for dialogs) */
    compact?: boolean;
    /** Whether to show the download link */
    showDownloadLink?: boolean;
  }

  let {
    value = undefined,
    onConfigured = undefined,
    onCleared = undefined,
    compact = false,
    showDownloadLink = true,
  }: Props = $props();

  // Local state
  let isPicking = $state(false);
  let error = $state<string | null>(null);

  // Derived
  let fileName = $derived(value ? value.split(/[\\/]/).pop() ?? value : null);
  let isConfigured = $derived(!!value);

  async function handlePick(): Promise<void> {
    isPicking = true;
    error = null;

    try {
      const result = await window.api.pickReshadeInstaller();

      if (result.success && result.path) {
        onConfigured?.(result.path);
      } else if (!result.success && result.error) {
        error = result.error;
      }
      // If cancelled (no success, no error), do nothing
    } catch (err) {
      logger.error('Failed to pick ReShade installer:', err);
      error = 'Failed to open file picker';
    } finally {
      isPicking = false;
    }
  }

  function handleClear(): void {
    window.api.clearReshadeInstaller();
    error = null;
    onCleared?.();
  }

  function handleOpenDownloadPage(): void {
    window.api.openExternal('https://reshade.me/#download');
  }
</script>

<div class="space-y-3">
  {#if !compact}
    <div class="space-y-0.5">
      <p class="text-sm font-medium">ReShade installer</p>
      <p class="text-xs text-muted-foreground">
        Path to ReShade_Setup_Addon.exe for automated ReShade add-ons installation
      </p>
    </div>
  {/if}

  <div class="flex items-center gap-2">
    <div
      class="flex items-center gap-2 h-9 flex-1 min-w-0 rounded-md border border-input bg-input/30 px-3 text-sm"
    >
      {#if isConfigured && fileName}
        <span class="flex-1 truncate text-foreground" title={value}>
          {fileName}
        </span>
        <button
          type="button"
          class="shrink-0 rounded-sm opacity-50 hover:opacity-100 hover:bg-muted p-0.5 transition-opacity"
          onclick={handleClear}
          title="Clear"
        >
          <X class="size-3.5" />
        </button>
      {:else}
        <span class="flex-1 text-muted-foreground/60">Not configured</span>
      {/if}
    </div>
    <Button
      variant="outline"
      size="icon"
      class="size-9 shrink-0"
      onclick={handlePick}
      disabled={isPicking}
      title="Browse for ReShade installer"
    >
      {#if isPicking}
        <Loader2 class="size-4 animate-spin" />
      {:else}
        <FolderOpen class="size-4" />
      {/if}
    </Button>
  </div>

  {#if error}
    <p class="text-xs text-destructive">{error}</p>
  {/if}

  {#if showDownloadLink}
    <p class="text-xs text-muted-foreground">
      <button
        type="button"
        class="inline-flex items-center gap-1 text-primary hover:underline"
        onclick={handleOpenDownloadPage}
      >
        <Download class="size-3" />
        ReShade with full add-on support
      </button>
    </p>
  {/if}
</div>
