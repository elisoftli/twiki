<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Switch } from '$lib/components/ui/switch';
  import { Button } from '$lib/components/ui/button';
  import * as Select from '$lib/components/ui/select';
  import { ReshadeInstallerPicker } from '$lib/components/domain/tweak/reshade-installer-picker';
  import { NexusModsApiKeyPicker } from '$lib/components/domain/nexusmods/nexusmods-api-key-picker';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import Globe from '@lucide/svelte/icons/globe';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import FileText from '@lucide/svelte/icons/file-text';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Copy from '@lucide/svelte/icons/copy';
  import Library from '@lucide/svelte/icons/library';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import X from '@lucide/svelte/icons/x';
  import { settingsStore } from '$lib/stores';
  import { formatBytes } from '$lib/utils/format.utils';
  import { logger } from '$lib/utils/logger.utils';
  import steamIcon from '$lib/../assets/images/game-launchers/steam.svg';
  import xboxIcon from '$lib/../assets/images/game-launchers/xbox.svg';

  // Downloads folder state
  let downloadsFolderSize = $state<number>(0);
  let isLoadingSize = $state(true);
  let isClearing = $state(false);

  // API key visibility state
  let showApiKey = $state(false);
  let apiKeyError = $state<string | null>(null);

  // Hardware acceleration restart prompt
  let showRestartPrompt = $state(false);

  function isValidApiKey(key: string): boolean {
    // Anthropic API keys start with "sk-ant-" and have sufficient length
    return key.startsWith('sk-ant-') && key.length >= 40;
  }

  function toggleAutoApproveReadOnly(): void {
    const current = settingsStore.value?.autoTweaker ?? { autoApproveReadOnly: false };
    window.api.updateSettings({
      autoTweaker: {
        ...current,
        autoApproveReadOnly: !current.autoApproveReadOnly,
      },
    });
  }

  function handleApiKeyChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();

    // Clear error and allow empty value (clearing the key)
    if (!value) {
      apiKeyError = null;
      const current = settingsStore.value?.autoTweaker ?? { autoApproveReadOnly: false };
      window.api.updateSettings({
        autoTweaker: {
          ...current,
          claudeApiKey: undefined,
          claudeModel: undefined,
        },
      });
      return;
    }

    // Validate the API key format
    if (!isValidApiKey(value)) {
      apiKeyError = 'Invalid API key format. Keys should start with "sk-ant-"';
      return;
    }

    // Valid key - save it
    apiKeyError = null;
    const current = settingsStore.value?.autoTweaker ?? { autoApproveReadOnly: false };
    window.api.updateSettings({
      autoTweaker: {
        ...current,
        claudeApiKey: value,
      },
    });
  }

  function clearApiKey(): void {
    apiKeyError = null;
    const current = settingsStore.value?.autoTweaker ?? { autoApproveReadOnly: false };
    window.api.updateSettings({
      autoTweaker: {
        ...current,
        claudeApiKey: undefined,
        claudeModel: undefined,
      },
    });
  }

  function openAnthropicConsole(): void {
    window.api.openExternal('https://console.anthropic.com/settings/keys');
  }

  function handleModelChange(value: string | undefined): void {
    const current = settingsStore.value?.autoTweaker ?? { autoApproveReadOnly: false };
    const modelValue = value === 'auto' ? undefined : value as 'haiku' | 'sonnet' | 'opus' | undefined;
    window.api.updateSettings({
      autoTweaker: {
        ...current,
        claudeModel: modelValue,
      },
    });
  }

  function toggleBuiltInEditor(): void {
    window.api.updateSettings({
      useBuiltInEditor: !settingsStore.value?.useBuiltInEditor,
    });
  }

  function toggleHardwareAcceleration(): void {
    window.api.updateSettings({
      disableHardwareAcceleration: !settingsStore.value?.disableHardwareAcceleration,
    });
    showRestartPrompt = true;
  }

  function toggleAutoExpandTweaks(): void {
    const current = settingsStore.value?.gamePage ?? { autoExpandTweaks: false };
    window.api.updateSettings({
      gamePage: {
        ...current,
        autoExpandTweaks: !current.autoExpandTweaks,
      },
    });
  }

  function toggleLauncher(launcher: string): void {
    const current = settingsStore.value?.gameLibrary ?? { launchers: {} };
    const currentLauncherSettings = current.launchers?.[launcher] ?? { enabled: true };
    window.api.updateSettings({
      gameLibrary: {
        ...current,
        launchers: {
          ...current.launchers,
          [launcher]: {
            ...currentLauncherSettings,
            enabled: !currentLauncherSettings.enabled,
          },
        },
      },
    });
  }

  function isLauncherEnabled(launcher: string): boolean {
    return settingsStore.value?.gameLibrary?.launchers?.[launcher]?.enabled ?? true;
  }

  async function loadDownloadsSize(): Promise<void> {
    isLoadingSize = true;
    try {
      downloadsFolderSize = await window.api.downloads.getSize();
    } catch (error) {
      logger.error('Failed to get downloads size:', error);
    } finally {
      isLoadingSize = false;
    }
  }

  async function clearDownloads(): Promise<void> {
    isClearing = true;
    try {
      const result = await window.api.downloads.clear();
      if (result.success) {
        downloadsFolderSize = 0;
      } else {
        logger.error('Failed to clear downloads:', result.error);
      }
    } catch (error) {
      logger.error('Failed to clear downloads:', error);
    } finally {
      isClearing = false;
    }
  }

  function openDownloadsFolder(): void {
    window.api.downloads.openFolder();
  }

  async function openLogsInEditor(): Promise<void> {
    const result = await window.api.logs.openInEditor();
    if (!result.success) {
      logger.error('Failed to open logs in editor:', result.error);
    }
  }

  async function copyLogsPath(): Promise<void> {
    await window.api.logs.copyPath();
    toast.success('Log file path copied to clipboard');
  }

  function openGitHubIssues(): void {
    window.api.openExternal('https://github.com/elisoftli/twiki/issues');
  }

  onMount(() => {
    loadDownloadsSize();
  });
</script>

<div class="min-h-screen bg-background">
  <!-- Header -->
  <div class="border-b border-border/50 bg-card/50">
    <div class="px-8 py-8">
      <div class="flex items-center justify-between">
        <div class="space-y-1">
          <h1 class="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          <p class="text-muted-foreground">Configure application preferences</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Content Area -->
  <div class="p-8">
    <div class="mx-auto max-w-7xl">
      <div class="columns-1 gap-6 md:columns-2 lg:columns-3">
        <!-- Auto-Approve Operations Card -->
        <Card class="glass animate-fade-in-up mb-6 break-inside-avoid duration-200 ease-out" style="animation-delay: {1 * 40}ms">
          <CardHeader>
            <div class="flex flex-row items-center gap-3">
              <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles class="size-5 text-primary" />
              </div>
              <CardTitle class="text-lg">Auto Tweaker</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              <div class="flex items-center justify-between gap-4">
                <div class="space-y-0.5">
                  <p class="text-sm font-medium">Auto approve read-only</p>
                  <p class="text-xs text-muted-foreground">
                    Automatically approve file reading and directory listing operations
                  </p>
                </div>
                <Switch
                  checked={settingsStore.value?.autoTweaker?.autoApproveReadOnly ?? false}
                  onCheckedChange={toggleAutoApproveReadOnly}
                />
              </div>

              <div class="border-t border-border/50 pt-4">
                <ReshadeInstallerPicker
                  value={settingsStore.value?.graphicsMods?.reshadeInstallerPath}
                />
              </div>

              <div class="border-t border-border/50 pt-4">
                <div class="space-y-3">
                  <div class="space-y-0.5">
                    <p class="text-sm font-medium">Downloads cache</p>
                    <p class="text-xs text-muted-foreground">
                      Downloaded files and extracted archives are stored locally
                    </p>
                  </div>
                  <div class="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      class="flex-1"
                      onclick={openDownloadsFolder}
                    >
                      <FolderOpen class="size-4 mr-2" />
                      Open
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      class="flex-1"
                      onclick={clearDownloads}
                      disabled={isClearing || isLoadingSize || downloadsFolderSize === 0}
                    >
                      {#if isClearing}
                        <Loader2 class="size-4 mr-2 animate-spin" />
                        Clearing...
                      {:else if isLoadingSize}
                        <Loader2 class="size-4 mr-2 animate-spin" />
                        Clear
                      {:else}
                        <Trash2 class="size-4 mr-2" />
                        Clear ({formatBytes(downloadsFolderSize)})
                      {/if}
                    </Button>
                  </div>
                </div>
              </div>

              <div class="border-t border-border/50 pt-4">
                <div class="space-y-3">
                  <div class="space-y-0.5">
                    <p class="text-sm font-medium">Claude API Key</p>
                    <p class="text-xs text-muted-foreground">
                      Use your own API key to bypass rate limits
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="relative flex-1">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={settingsStore.value?.autoTweaker?.claudeApiKey ?? ''}
                        onchange={handleApiKeyChange}
                        placeholder="sk-ant-..."
                        class="h-9 w-full rounded-md border bg-input/30 px-3 pr-16 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 {apiKeyError ? 'border-destructive focus:ring-destructive' : 'border-input focus:ring-ring'}"
                      />
                      <div class="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        {#if settingsStore.value?.autoTweaker?.claudeApiKey}
                          <button
                            type="button"
                            class="shrink-0 rounded-sm opacity-50 hover:opacity-100 hover:bg-muted p-0.5 transition-opacity"
                            onclick={clearApiKey}
                            title="Clear API key"
                          >
                            <X class="size-3.5" />
                          </button>
                        {/if}
                        <button
                          type="button"
                          class="shrink-0 rounded-sm opacity-50 hover:opacity-100 hover:bg-muted p-0.5 transition-opacity"
                          onclick={() => showApiKey = !showApiKey}
                          title={showApiKey ? 'Hide API key' : 'Show API key'}
                        >
                          {#if showApiKey}
                            <EyeOff class="size-3.5" />
                          {:else}
                            <Eye class="size-3.5" />
                          {/if}
                        </button>
                      </div>
                    </div>
                  </div>
                  {#if apiKeyError}
                    <p class="text-xs text-destructive">{apiKeyError}</p>
                  {/if}
                  <p class="text-xs text-muted-foreground">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-primary hover:underline"
                      onclick={openAnthropicConsole}
                    >
                      <ExternalLink class="size-3" />
                      Get an API key from Anthropic
                    </button>
                  </p>
                  <div class="mt-4 space-y-1.5">
                    <p class="text-sm font-medium {!settingsStore.value?.autoTweaker?.claudeApiKey ? 'text-muted-foreground/60' : ''}">Claude Model</p>
                    <Select.Root
                      type="single"
                      value={settingsStore.value?.autoTweaker?.claudeModel ?? 'auto'}
                      onValueChange={handleModelChange}
                      disabled={!settingsStore.value?.autoTweaker?.claudeApiKey}
                    >
                      <Select.Trigger class="h-9 w-full {!settingsStore.value?.autoTweaker?.claudeApiKey ? 'opacity-50 cursor-not-allowed' : ''}">
                        {#if !settingsStore.value?.autoTweaker?.claudeModel || settingsStore.value?.autoTweaker?.claudeModel === undefined}
                          Let Twiki decide
                        {:else if settingsStore.value?.autoTweaker?.claudeModel === 'haiku'}
                          Haiku
                        {:else if settingsStore.value?.autoTweaker?.claudeModel === 'sonnet'}
                          Sonnet
                        {:else if settingsStore.value?.autoTweaker?.claudeModel === 'opus'}
                          Opus
                        {/if}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="auto" label="Let Twiki decide" />
                        <Select.Item value="haiku" label="Haiku" />
                        <Select.Item value="sonnet" label="Sonnet" />
                        <Select.Item value="opus" label="Opus" />
                      </Select.Content>
                    </Select.Root>
                    <p class="text-xs text-muted-foreground/60">
                      {#if !settingsStore.value?.autoTweaker?.claudeApiKey}
                        Requires API key to be set
                      {:else}
                        Choose which model to use for tweaks
                      {/if}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Game Page Card -->
        <Card class="glass animate-fade-in-up mb-6 break-inside-avoid duration-200 ease-out" style="animation-delay: {3 * 40}ms">
          <CardHeader>
            <div class="flex flex-row items-center gap-3">
              <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Gamepad2 class="size-5 text-primary" />
              </div>
              <CardTitle class="text-lg">Game Page</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              <div class="flex items-center justify-between gap-4">
                <div class="space-y-0.5">
                  <p class="text-sm font-medium">Auto expand tweaks</p>
                  <p class="text-xs text-muted-foreground">
                    Automatically expand all tweak sections when loading the page
                  </p>
                </div>
                <Switch
                  checked={settingsStore.value?.gamePage?.autoExpandTweaks ?? false}
                  onCheckedChange={toggleAutoExpandTweaks}
                />
              </div>
              <div class="flex items-center justify-between gap-4">
                <div class="space-y-0.5">
                  <p class="text-sm font-medium">Use built-in text editor</p>
                  <p class="text-xs text-muted-foreground">
                    Open config files in the built-in editor instead of your system's default
                  </p>
                </div>
                <Switch
                  checked={settingsStore.value?.useBuiltInEditor ?? false}
                  onCheckedChange={toggleBuiltInEditor}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Integrations Card -->
        <Card class="glass animate-fade-in-up mb-6 break-inside-avoid duration-200 ease-out" style="animation-delay: {2 * 40}ms">
          <CardHeader>
            <div class="flex flex-row items-center gap-3">
              <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Globe class="size-5 text-primary" />
              </div>
              <CardTitle class="text-lg">Integrations</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <NexusModsApiKeyPicker
              value={settingsStore.value?.integrations?.nexusMods?.apiKey}
            />
          </CardContent>
        </Card>

        <!-- Game Library Card -->
        <Card class="glass animate-fade-in-up mb-6 break-inside-avoid duration-200 ease-out" style="animation-delay: {4 * 40}ms">
          <CardHeader>
            <div class="flex flex-row items-center gap-3">
              <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Library class="size-5 text-primary" />
              </div>
              <CardTitle class="text-lg">Game Library</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              <div class="space-y-0.5">
                <p class="text-sm font-medium">Enabled launchers</p>
                <p class="text-xs text-muted-foreground">
                  Choose which game launchers to scan. Changes take effect on next refresh.
                </p>
              </div>
              <div class="space-y-3">
                <div class="flex items-center justify-between gap-4">
                  <div class="flex items-center gap-3">
                    <img src={steamIcon} alt="Steam" class="size-5" />
                    <p class="text-sm font-medium">Steam</p>
                  </div>
                  <Switch
                    checked={isLauncherEnabled('steam')}
                    onCheckedChange={() => toggleLauncher('steam')}
                  />
                </div>
                <div class="flex items-center justify-between gap-4">
                  <div class="flex items-center gap-3">
                    <img src={xboxIcon} alt="Xbox" class="size-5" />
                    <p class="text-sm font-medium">Xbox</p>
                  </div>
                  <Switch
                    checked={isLauncherEnabled('xbox')}
                    onCheckedChange={() => toggleLauncher('xbox')}
                  />
                </div>
                <p class="text-xs text-muted-foreground/60 italic">More to come...</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Troubleshooting Card -->
        <Card class="glass animate-fade-in-up mb-6 break-inside-avoid duration-200 ease-out" style="animation-delay: {5 * 40}ms">
          <CardHeader>
            <div class="flex flex-row items-center gap-3">
              <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <FileText class="size-5 text-primary" />
              </div>
              <CardTitle class="text-lg">Troubleshooting</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              <div class="space-y-3">
                <div class="space-y-0.5">
                  <p class="text-sm font-medium">Application logs</p>
                  <p class="text-xs text-muted-foreground">
                    Access logs to help diagnose issues when reporting bugs
                  </p>
                </div>
                <div class="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    class="flex-1"
                    onclick={openLogsInEditor}
                  >
                    <FileText class="size-4 mr-2" />
                    Open
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="flex-1"
                    onclick={copyLogsPath}
                  >
                    <Copy class="size-4 mr-2" />
                    Copy Path
                  </Button>
                </div>
              </div>

              <div class="border-t border-border/50 pt-4">
                <div class="space-y-3">
                  <div class="space-y-0.5">
                    <p class="text-sm font-medium">Report an issue</p>
                    <p class="text-xs text-muted-foreground">
                      Found a bug or have a suggestion? Open an issue on GitHub
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    class="w-full"
                    onclick={openGitHubIssues}
                  >
                    <ExternalLink class="size-4 mr-2" />
                    Open GitHub Issues
                  </Button>
                </div>
              </div>

              <div class="border-t border-border/50 pt-4">
                <div class="space-y-3">
                  <div class="flex items-center justify-between gap-4">
                    <div class="space-y-0.5">
                      <p class="text-sm font-medium">Disable hardware acceleration</p>
                      <p class="text-xs text-muted-foreground">
                        May fix rendering issues like black spots or flickering. Requires restart.
                      </p>
                    </div>
                    <Switch
                      checked={settingsStore.value?.disableHardwareAcceleration ?? false}
                      onCheckedChange={toggleHardwareAcceleration}
                    />
                  </div>
                  {#if showRestartPrompt}
                    <Button
                      variant="outline"
                      size="sm"
                      class="w-full"
                      onclick={() => window.api.relaunchApp()}
                    >
                      Restart now
                    </Button>
                  {/if}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  </div>
</div>
