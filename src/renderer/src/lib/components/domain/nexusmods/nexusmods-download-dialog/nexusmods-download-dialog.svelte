<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Crown from '@lucide/svelte/icons/crown';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import FileDown from '@lucide/svelte/icons/file-down';
  import { untrack } from 'svelte';
  import { NexusModsApiKeyPicker } from '$lib/components/domain/nexusmods/nexusmods-api-key-picker';
  import { nexusModsDownloadDialogStore, settingsStore } from '$lib/stores';

  let currentKey = $derived(settingsStore.value?.integrations?.nexusMods?.apiKey ?? '');
  let keyAtOpen = $state('');
  let keyChanged = $derived(currentKey !== keyAtOpen);
  let dontShowAgain = $state(false);

  // Snapshot the key once when the dialog opens (untrack settings so it doesn't re-run on key change)
  $effect(() => {
    if (nexusModsDownloadDialogStore.isOpen) {
      keyAtOpen = untrack(() => settingsStore.value?.integrations?.nexusMods?.apiKey ?? '');
    }
  });

  const DIALOG_CONTENT = {
    'no-key': {
      title: 'Download Mod',
      description: 'Direct downloads require a NexusMods Premium API key. You can add one below, or open the mod page in your browser to download manually.',
      icon: KeyRound,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-500',
    },
    'not-premium': {
      title: 'Premium Required for Direct Download',
      description: 'Your NexusMods API key does not have Premium access. Direct downloads are only available with a Premium membership. You can update your key below, or open the mod page in your browser.',
      icon: Crown,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-500',
    },
    'invalid-key': {
      title: 'Invalid API Key',
      description: 'Your NexusMods API key was rejected. Please check that it is correct, or clear it to download via browser instead.',
      icon: CircleAlert,
      iconBg: 'bg-destructive/10',
      iconColor: 'text-destructive',
    },
  } as const;

  let content = $derived(DIALOG_CONTENT[nexusModsDownloadDialogStore.reason]);
  let isError = $derived(nexusModsDownloadDialogStore.reason === 'invalid-key');

  function handleOpenChange(open: boolean) {
    if (!open) {
      handleClose();
    }
  }

  function handleDontShowAgainChange(checked: boolean | 'indeterminate') {
    dontShowAgain = checked === true;
  }

  function persistDontShowAgain() {
    if (dontShowAgain) {
      window.api.updateSettings({ integrations: { nexusMods: { hideDownloadDialog: true } } });
    }
  }

  function handleClose() {
    persistDontShowAgain();
    dontShowAgain = false;
    nexusModsDownloadDialogStore.close();
  }

  function handleOpenInBrowser() {
    persistDontShowAgain();
    dontShowAgain = false;
    nexusModsDownloadDialogStore.openInBrowser();
  }

  function handleRetry() {
    persistDontShowAgain();
    dontShowAgain = false;
    nexusModsDownloadDialogStore.retry();
  }

  let canRetry = $derived(keyChanged && currentKey);
</script>

<Dialog.Root open={nexusModsDownloadDialogStore.isOpen} onOpenChange={handleOpenChange}>
  <Dialog.Content class="max-w-md z-[110]" overlayClass="z-[109]" wrapperClass="z-[110]">
    <Dialog.Header>
      <div class="flex items-center gap-3">
        <div class="flex size-10 items-center justify-center rounded-lg {content.iconBg}">
          <content.icon class="size-5 {content.iconColor}" />
        </div>
        <Dialog.Title class="text-lg">
          {content.title}
        </Dialog.Title>
      </div>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <p class="text-sm text-muted-foreground">
        {content.description}
      </p>

      <div class="rounded-lg border border-border bg-muted/30 p-4">
        <NexusModsApiKeyPicker compact={true} />
      </div>

      {#if canRetry}
        <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p class="text-sm text-emerald-400">
            API key updated. Click Download to try again.
          </p>
        </div>
      {/if}

      {#if !isError}
        <label class="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={dontShowAgain}
            onCheckedChange={handleDontShowAgainChange}
          />
          <span class="text-sm text-muted-foreground select-none">Don't show this again</span>
        </label>
      {/if}
    </div>

    <Dialog.Footer class="mt-2">
      <Button variant="outline" onclick={handleOpenInBrowser}>
        <ExternalLink class="size-4 mr-2" />
        Open in Browser
      </Button>
      <Button onclick={handleRetry} disabled={!canRetry}>
        <FileDown class="size-4 mr-2" />
        Download
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
