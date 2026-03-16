<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import Settings2 from '@lucide/svelte/icons/settings-2';
  import { ReshadeInstallerPicker } from '$lib/components/domain/tweak/reshade-installer-picker';
  import { NexusModsApiKeyPicker } from '$lib/components/domain/nexusmods/nexusmods-api-key-picker';
  import {
    type ConfigurationType,
    getConfigurationInfo,
    isConfigurationSatisfied,
  } from '$lib/utils/preflight-checks.utils';
  import { settingsStore } from '$lib/stores';

  interface Props {
    /** Whether the dialog is open */
    isOpen: boolean;
    /** The name of the tool that triggered this dialog */
    toolName: string;
    /** The type of configuration required */
    configurationType: ConfigurationType;
    /** Called when the user completes configuration and clicks Continue */
    onConfigured: () => void;
    /** Called when user cancels */
    onCancel: () => void;
  }

  let { isOpen, toolName, configurationType, onConfigured, onCancel }: Props = $props();

  // Get display info for the configuration type
  let configInfo = $derived(getConfigurationInfo(configurationType));

  // Format tool name for display (remove -tool suffix and capitalize)
  let formattedToolName = $derived(
    toolName
      .replace(/-tool$/, '')
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );

  // Check if the configuration is now satisfied (reactive to settings changes)
  let isSatisfied = $derived(isConfigurationSatisfied(configurationType, settingsStore.value));

  function handleDialogOpenChange(open: boolean) {
    if (!open) {
      onCancel();
    }
  }

  function handleContinue() {
    if (isSatisfied) {
      onConfigured();
    }
  }

  // Callback when ReShade path is configured
  // Note: Settings are automatically updated by the picker via IPC
  // The reactive settingsStore.value will update, and isSatisfied will become true
  function handleReshadeConfigured() {
    // Intentionally empty - settings update triggers reactivity
  }
</script>

<Dialog.Root open={isOpen} onOpenChange={handleDialogOpenChange}>
  <Dialog.Content class="max-w-md z-[110]" overlayClass="z-[109]" wrapperClass="z-[110]">
    <Dialog.Header>
      <div class="flex items-center gap-3">
        <div class="flex size-10 items-center justify-center rounded-lg bg-amber-500/10">
          <Settings2 class="size-5 text-amber-500" />
        </div>
        <Dialog.Title class="text-lg">
          {configInfo.title}
        </Dialog.Title>
      </div>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <p class="text-sm text-muted-foreground">
        The <span class="font-medium text-foreground">{formattedToolName}</span> tool requires additional setup.
        {configInfo.description}
      </p>

      <!-- Type-specific configuration UI -->
      {#if configurationType === 'reshade-installer'}
        <div class="rounded-lg border border-border bg-muted/30 p-4">
          <ReshadeInstallerPicker
            value={settingsStore.value?.graphicsMods?.reshadeInstallerPath}
            onConfigured={handleReshadeConfigured}
            compact={true}
            showDownloadLink={true}
          />
        </div>
      {:else if configurationType === 'nexusmods-api-key'}
        <div class="rounded-lg border border-border bg-muted/30 p-4">
          <NexusModsApiKeyPicker
            compact={true}
          />
        </div>
      {/if}

      <!-- Success indicator when configured -->
      {#if isSatisfied}
        <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p class="text-sm text-emerald-400">
            Configuration complete. Click Continue to proceed with the tool.
          </p>
        </div>
      {/if}
    </div>

    <Dialog.Footer class="mt-2">
      <Button variant="outline" onclick={onCancel}>Cancel</Button>
      <Button onclick={handleContinue} disabled={!isSatisfied}>
        Continue
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
