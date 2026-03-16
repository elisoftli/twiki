<script lang="ts">
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import X from '@lucide/svelte/icons/x';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import { settingsStore } from '$lib/stores';

  interface Props {
    /** Current API key value (from settings) */
    value?: string;
    /** Callback when a key is successfully configured */
    onConfigured?: (key: string) => void;
    /** Callback when the key is cleared */
    onCleared?: () => void;
    /** Whether to show in a more compact form (for dialogs) */
    compact?: boolean;
    /** Whether to show the "Get an API key" link */
    showGetKeyLink?: boolean;
  }

  let {
    value = $bindable(undefined),
    onConfigured = undefined,
    onCleared = undefined,
    compact = false,
    showGetKeyLink = true,
  }: Props = $props();

  // Use settings value if no explicit value provided
  let currentKey = $derived(value ?? settingsStore.value?.integrations?.nexusMods?.apiKey ?? '');

  // Local state
  let showKey = $state(false);
  let error = $state<string | null>(null);

  function isValidKey(key: string): boolean {
    return key.length >= 20;
  }

  function handleChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const newValue = input.value.trim();

    if (!newValue) {
      error = null;
      window.api.updateSettings({ integrations: { nexusMods: { apiKey: undefined } } });
      onCleared?.();
      return;
    }

    if (!isValidKey(newValue)) {
      error = 'API key seems too short';
      return;
    }

    error = null;
    window.api.updateSettings({ integrations: { nexusMods: { apiKey: newValue } } });
    onConfigured?.(newValue);
  }

  function handleClear(): void {
    error = null;
    window.api.updateSettings({ integrations: { nexusMods: { apiKey: undefined } } });
    onCleared?.();
  }

  function openNexusModsApiPage(): void {
    window.api.openExternal('https://www.nexusmods.com/users/myaccount?tab=api+access');
  }
</script>

<div class="space-y-3">
  {#if !compact}
    <div class="space-y-0.5">
      <p class="text-sm font-medium">NexusMods API Key</p>
      <p class="text-xs text-muted-foreground">
        Required for downloading mods directly. Free users can browse without a key.
      </p>
    </div>
  {/if}

  <div class="flex items-center gap-2">
    <div class="relative flex-1">
      <input
        type={showKey ? 'text' : 'password'}
        value={currentKey}
        onchange={handleChange}
        placeholder="API key..."
        class="h-9 w-full rounded-md border bg-input/30 px-3 pr-16 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 {error ? 'border-destructive focus:ring-destructive' : 'border-input focus:ring-ring'}"
      />
      <div class="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        {#if currentKey}
          <button
            type="button"
            class="shrink-0 rounded-sm opacity-50 hover:opacity-100 hover:bg-muted p-0.5 transition-opacity"
            onclick={handleClear}
            title="Clear API key"
          >
            <X class="size-3.5" />
          </button>
        {/if}
        <button
          type="button"
          class="shrink-0 rounded-sm opacity-50 hover:opacity-100 hover:bg-muted p-0.5 transition-opacity"
          onclick={() => showKey = !showKey}
          title={showKey ? 'Hide API key' : 'Show API key'}
        >
          {#if showKey}
            <EyeOff class="size-3.5" />
          {:else}
            <Eye class="size-3.5" />
          {/if}
        </button>
      </div>
    </div>
  </div>

  {#if error}
    <p class="text-xs text-destructive">{error}</p>
  {/if}

  {#if showGetKeyLink}
    <p class="text-xs text-muted-foreground">
      <button
        type="button"
        class="inline-flex items-center gap-1 text-primary hover:underline"
        onclick={openNexusModsApiPage}
      >
        <ExternalLink class="size-3" />
        Get an API key from NexusMods
      </button>
    </p>
  {/if}
</div>
