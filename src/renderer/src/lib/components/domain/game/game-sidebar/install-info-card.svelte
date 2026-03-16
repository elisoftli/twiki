<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import * as ContextMenu from '$lib/components/ui/context-menu';
  import { Folder, File, Copy, AlertCircle, Database, FolderPlus, Trash2, UserRoundPen, EyeOff, Eye } from 'lucide-svelte';
  import type { PCGWConfigPath } from '@twiki/shared';
  import { logger } from '$lib/utils/logger.utils';
  import { toast } from 'svelte-sonner';

  interface Props {
    installPath?: string;
    configPaths: PCGWConfigPath[];
    /** User-added custom config paths */
    extraConfigPaths?: PCGWConfigPath[];
    /** PCGW paths disabled by user */
    disabledConfigPaths?: string[];
    /** Whether config paths are currently loading */
    loading?: boolean;
    onOpenPath: (path: string, pathType?: 'file' | 'directory' | 'registry') => void;
    /** Handler for adding a custom config path */
    onAddCustomPath?: () => void;
    /** Handler for removing a custom config path */
    onRemoveCustomPath?: (path: string) => void;
    /** Handler for disabling a PCGW config path */
    onDisableConfigPath?: (path: string) => void;
    /** Handler for enabling a disabled config path */
    onEnableConfigPath?: (path: string) => void;
    /** Whether to highlight the card */
    highlighted?: boolean;
  }

  let {
    installPath,
    configPaths,
    extraConfigPaths = [],
    disabledConfigPaths = [],
    loading = false,
    onOpenPath,
    onAddCustomPath,
    onRemoveCustomPath,
    onDisableConfigPath,
    onEnableConfigPath,
    highlighted = false,
  }: Props = $props();

  // Combine PCGW paths with custom paths (custom paths appear after PCGW paths)
  const allConfigPaths = $derived([...configPaths, ...extraConfigPaths]);

  // Split paths by category
  const configurationPaths = $derived(allConfigPaths.filter((p) => p.category === 'config' || p.platform === 'custom'));
  const savePaths = $derived(allConfigPaths.filter((p) => p.category === 'save'));

  // Reference to the card element for scrolling
  let cardElement = $state<HTMLElement | null>(null);

  // Scroll into view when highlighted
  $effect(() => {
    if (highlighted && cardElement) {
      setTimeout(() => {
        cardElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  });

  /**
   * Truncates a path to show first two parts + ... + last two parts
   */
  function truncatePath(path: string): string {
    const parts = path.split(/[\\/]/).filter((p) => p.length > 0);

    if (parts.length <= 4) {
      return parts.join('\\');
    }

    const firstTwo = parts.slice(0, 1);
    const lastTwo = parts.slice(-1);

    return `${firstTwo.join('\\')}\\...\\${lastTwo.join('\\')}`;
  }

  /**
   * Copies the full path to clipboard
   */
  async function copyToClipboard(path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path);
      toast.success('Path copied to clipboard');
    } catch (err) {
      logger.error('Failed to copy to clipboard:', err);
      toast.error('Failed to copy path');
    }
  }

  /**
   * Check if a path is in the disabled list.
   * Uses case-insensitive matching with path normalization.
   */
  function isPathDisabled(path: string): boolean {
    if (!disabledConfigPaths || disabledConfigPaths.length === 0) return false;
    const normalized = path.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
    return disabledConfigPaths.some(
      (dp) => dp.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '') === normalized
    );
  }
</script>

{#snippet pathButton(path: string, pathType: 'file' | 'directory' | 'registry', isCustomPath: boolean = false, exists: boolean = true, isDisabled: boolean = false)}
  <button
    type="button"
    onclick={() => onOpenPath(path, pathType)}
    title={isDisabled ? `${path} (disabled)` : path}
    class="
      flex min-w-0 w-full cursor-pointer items-center
      gap-2 overflow-hidden rounded bg-background/50 px-2
      py-1.5 text-left font-mono text-xs transition-colors hover:bg-background
      {isDisabled ? 'line-through opacity-50' : ''}"
  >
    {#if pathType === 'registry'}
      <Database class="size-3.5 shrink-0 text-muted-foreground" />
    {:else if pathType === 'file'}
      <File class="size-3.5 shrink-0 text-muted-foreground" />
    {:else}
      <Folder class="size-3.5 shrink-0 text-muted-foreground" />
    {/if}
    <span class="flex-1 truncate">{truncatePath(path)}</span>
    {#if isCustomPath}
      <div title="Custom path" class="shrink-0 flex">
        <UserRoundPen class="size-3 text-muted-foreground/60" />
      </div>
    {/if}
    {#if pathType !== 'registry' && !exists}
      <div title="Path does not exist" class="shrink-0 flex">
        <AlertCircle class="size-3 text-amber-500" />
      </div>
    {/if}
  </button>
{/snippet}

<Card bind:ref={cardElement} class="border bg-card transition-shadow {highlighted ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}">
  <CardHeader>
    <CardTitle class="text-sm font-medium text-muted-foreground">Installation</CardTitle>
  </CardHeader>
  <CardContent class="space-y-4 text-sm">
    {#if installPath}
      <div class="space-y-1.5">
        <span class="text-muted-foreground block">Install Location</span>
        <ContextMenu.Root>
          <ContextMenu.Trigger>
            {@render pathButton(installPath, 'directory')}
          </ContextMenu.Trigger>
          <ContextMenu.Content>
            <ContextMenu.Item onclick={() => copyToClipboard(installPath)}>
              <Copy class="mr-2 size-4" />
              Copy Path
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Root>
      </div>
    {/if}
    <div class="space-y-1.5">
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground block">Config Locations</span>
        {#if onAddCustomPath}
          <button
            type="button"
            onclick={onAddCustomPath}
            title="Add custom config path"
            class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <FolderPlus class="size-4" />
          </button>
        {/if}
      </div>
      {#if loading}
        <div class="animate-shimmer h-8 w-full rounded bg-muted"></div>
        <div class="animate-shimmer h-8 w-full rounded bg-muted"></div>
      {:else if configurationPaths.length === 0}
        <p class="text-muted-foreground/60 text-center py-2 text-xs">No config locations available</p>
      {:else}
        {#each configurationPaths as configPath}
          {@const isCustomPath = configPath.platform === 'custom'}
          {@const isDisabled = !isCustomPath && isPathDisabled(configPath.path)}
          <ContextMenu.Root>
            <ContextMenu.Trigger>
              {@render pathButton(configPath.path, configPath.pathType, isCustomPath, configPath.exists, isDisabled)}
            </ContextMenu.Trigger>
            <ContextMenu.Content>
              <ContextMenu.Item onclick={() => copyToClipboard(configPath.path)}>
                <Copy class="mr-2 size-4" />
                Copy Path
              </ContextMenu.Item>
              {#if isCustomPath && onRemoveCustomPath}
                <ContextMenu.Separator />
                <ContextMenu.Item onclick={() => onRemoveCustomPath(configPath.path)} class="text-destructive focus:text-destructive">
                  <Trash2 class="mr-2 size-4" />
                  Remove
                </ContextMenu.Item>
              {:else if !isCustomPath}
                <ContextMenu.Separator />
                {#if isDisabled && onEnableConfigPath}
                  <ContextMenu.Item onclick={() => onEnableConfigPath(configPath.path)}>
                    <Eye class="mr-2 size-4" />
                    Enable path
                  </ContextMenu.Item>
                {:else if !isDisabled && onDisableConfigPath}
                  <ContextMenu.Item onclick={() => onDisableConfigPath(configPath.path)}>
                    <EyeOff class="mr-2 size-4" />
                    Disable path
                  </ContextMenu.Item>
                {/if}
              {/if}
            </ContextMenu.Content>
          </ContextMenu.Root>
        {/each}
      {/if}
    </div>
    {#if loading || savePaths.length > 0}
      <div class="space-y-1.5">
        <span class="text-muted-foreground block">Save Locations</span>
        {#if loading}
          <div class="animate-shimmer h-8 w-full rounded bg-muted"></div>
        {:else}
          {#each savePaths as savePath}
            {@const isDisabled = isPathDisabled(savePath.path)}
            <ContextMenu.Root>
              <ContextMenu.Trigger>
                {@render pathButton(savePath.path, savePath.pathType, false, savePath.exists, isDisabled)}
              </ContextMenu.Trigger>
              <ContextMenu.Content>
                <ContextMenu.Item onclick={() => copyToClipboard(savePath.path)}>
                  <Copy class="mr-2 size-4" />
                  Copy Path
                </ContextMenu.Item>
                <ContextMenu.Separator />
                {#if isDisabled && onEnableConfigPath}
                  <ContextMenu.Item onclick={() => onEnableConfigPath(savePath.path)}>
                    <Eye class="mr-2 size-4" />
                    Enable path
                  </ContextMenu.Item>
                {:else if !isDisabled && onDisableConfigPath}
                  <ContextMenu.Item onclick={() => onDisableConfigPath(savePath.path)}>
                    <EyeOff class="mr-2 size-4" />
                    Disable path
                  </ContextMenu.Item>
                {/if}
              </ContextMenu.Content>
            </ContextMenu.Root>
          {/each}
        {/if}
      </div>
    {/if}
  </CardContent>
</Card>
