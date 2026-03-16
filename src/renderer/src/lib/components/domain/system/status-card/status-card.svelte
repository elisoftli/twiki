<script lang="ts">
  import type { StatusEntry, StatusSeverity } from '@twiki/shared';
  import { Info, AlertTriangle, WifiOff, X } from 'lucide-svelte';
  import { renderMarkdown } from '$lib/utils/markdown.utils';
  import * as HoverCard from '$lib/components/ui/hover-card';

  interface Props {
    entry: StatusEntry;
    onDismiss?: (id: string) => void;
  }

  const { entry, onDismiss }: Props = $props();

  const iconColorMap: Record<StatusSeverity, string> = {
    ok: 'text-green-500',
    info: 'text-blue-500',
    warning: 'text-amber-500',
    error: 'text-red-500',
  };

  const iconColor = $derived(iconColorMap[entry.severity]);
</script>

{#snippet cardContent()}
  <div
    class="w-full flex items-center gap-2 p-2.5 rounded-lg border border-border/50 bg-card/50"
    title={entry.message}
  >
    {#if entry.severity === 'warning'}
      <AlertTriangle class="size-4 shrink-0 {iconColor}" />
    {:else if entry.severity === 'error'}
      <WifiOff class="size-4 shrink-0 {iconColor}" />
    {:else}
      <Info class="size-4 shrink-0 {iconColor}" />
    {/if}

    <div class="flex flex-col min-w-0 flex-1 overflow-hidden cursor-default">
      <span class="text-xs text-muted-foreground truncate text-center">
        {entry.title}
      </span>
      <span class="text-[10px] text-muted-foreground/70 text-center truncate">
        {entry.message}
      </span>
    </div>

    {#if entry.dismissible && onDismiss}
      <button
        type="button"
        class="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors text-muted-foreground"
        onclick={() => onDismiss(entry.id)}
        title="Dismiss"
      >
        <X class="size-3" />
      </button>
    {/if}
  </div>
{/snippet}

{#if entry.expandedMessage}
  <HoverCard.Root openDelay={300}>
    <HoverCard.Trigger>
      {@render cardContent()}
    </HoverCard.Trigger>
    <HoverCard.Content side="right" avoidCollisions={true} collisionPadding={16} class="w-80">
      <HoverCard.Arrow />
      <div class="space-y-2">
        <div class="max-h-[300px] overflow-y-auto pr-2 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">
          <div class="prose prose-sm prose-invert max-w-none text-xs [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_p]:text-xs [&_li]:text-xs [&_ul]:my-1 [&_ol]:my-1 [&_p]:my-1">
            {@html renderMarkdown(entry.expandedMessage)}
          </div>
        </div>
      </div>
    </HoverCard.Content>
  </HoverCard.Root>
{:else}
  {@render cardContent()}
{/if}
