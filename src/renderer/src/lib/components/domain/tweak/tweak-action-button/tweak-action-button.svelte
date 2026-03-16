<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as HoverCard from '$lib/components/ui/hover-card';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { renderMarkdown } from '$lib/utils/markdown.utils';
  import type { TweakActionState } from './types';

  interface Props {
    /** Grouped state and handlers for the tweak action */
    state: TweakActionState;
  }

  let { state }: Props = $props();

  // Destructure with defaults
  const isRunning = $derived(state.isRunning ?? false);
  const isCompleted = $derived(state.isCompleted ?? false);
  const isRevertable = $derived(state.isRevertable ?? false);
  const isReverting = $derived(state.isReverting ?? false);
  const isAgentBusy = $derived(state.isAgentBusy ?? false);
  const canApply = $derived(state.canApply ?? true);
  const completionStatus = $derived(state.completionStatus);
  const warningMessage = $derived(state.warningMessage);
</script>

{#if isCompleted}
  <!-- Completed state: show success badge and optional revert button -->
  <div class="flex items-center gap-2">
    <Badge variant="outline" class="h-7 gap-1.5 border-green-500/30 bg-green-500/10 px-2.5 text-xs text-green-500">
      <CircleCheck class="size-3" />
      Applied
    </Badge>
    {#if completionStatus === 'warning' && warningMessage}
      <HoverCard.Root openDelay={200}>
        <HoverCard.Trigger>
          <Badge variant="outline" class="h-7 gap-1.5 border-yellow-500/30 bg-yellow-500/10 px-2.5 text-xs text-yellow-500 cursor-help">
            <TriangleAlert class="size-3" />
            Warning
          </Badge>
        </HoverCard.Trigger>
        <HoverCard.Content side="bottom" align="start" class="w-80">
          <div class="prose prose-sm prose-muted dark:prose-invert max-w-none">
            {@html renderMarkdown(warningMessage)}
          </div>
        </HoverCard.Content>
      </HoverCard.Root>
    {/if}
    {#if isRevertable}
      <Button
        variant="outline"
        size="sm"
        onclick={state.onRevert}
        disabled={isReverting}
        class="
          h-7 shrink-0 gap-1.5 border-muted-foreground/30 px-2.5
          text-xs text-muted-foreground hover:border-muted-foreground
          hover:bg-muted-foreground/10 disabled:opacity-50"
      >
        {#if isReverting}
          <LoaderCircle class="size-3 animate-spin" />
          Reverting...
        {:else}
          <RotateCcw class="size-3" />
          Revert
        {/if}
      </Button>
    {/if}
  </div>
{:else if canApply}
  <!-- Default state: show auto-tweak button -->
  <Button
    variant="outline"
    size="sm"
    onclick={state.onApply}
    disabled={isAgentBusy}
    class="btn-auto-tweak h-7 shrink-0 gap-1.5 px-2.5 text-xs disabled:opacity-50"
  >
    {#if isRunning}
      <LoaderCircle class="size-3 animate-spin" />
      Running...
    {:else}
      <Sparkles class="size-3 animate-sparkle" />
      Auto tweak
    {/if}
  </Button>
{/if}

<style>
  :global {
    .animate-sparkle {
      animation: sparkle-glow 2s linear infinite;
      filter: drop-shadow(0 0 0px oklch(0.85 0.16 70));
    }

    @keyframes sparkle-glow {
      0%, 100% {
        filter: drop-shadow(0 0 0px oklch(0.85 0.16 70));
      }
      50% {
        filter: drop-shadow(0 0 4px oklch(0.85 0.16 70));
      }
    }

    .btn-auto-tweak {
      /* Warm amber base with subtle theme influence */
      --ai-color: color-mix(in oklch, oklch(0.78 0.19 75), var(--primary) 12%);
      --ai-text: color-mix(in oklch, oklch(0.85 0.16 70), var(--primary) 10%);
      background: color-mix(in oklch, var(--ai-color), transparent 70%);
      border-color: color-mix(in oklch, var(--ai-color), transparent 35%);
      color: var(--ai-text);
    }

    .btn-auto-tweak:hover:not(:disabled) {
      background: color-mix(in oklch, var(--ai-color), transparent 55%);
      border-color: color-mix(in oklch, var(--ai-color), transparent 15%);
    }
  }
</style>
