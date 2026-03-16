<script lang="ts">
  import { LoaderCircle, CircleCheck, CircleX } from 'lucide-svelte';
  import { updaterStore } from '$lib/stores';
  import { renderMarkdown } from '$lib/utils/markdown.utils';
  import * as HoverCard from '$lib/components/ui/hover-card';
</script>

{#if updaterStore.showSidebarCard}
  <HoverCard.Root openDelay={300}>
    <HoverCard.Trigger>
      <button
        type="button"
        class="
          w-full flex items-center gap-2 p-2.5 rounded-lg border border-border/50
          bg-card/50 transition-colors duration-200 ease-out
          hover:border-primary/60 cursor-pointer text-left"
        onclick={() => updaterStore.handleCardClick()}
        title={updaterStore.isError ? updaterStore.errorMessage ?? 'Update error' : updaterStore.cardLabel}
      >
        {#if ['checking', 'downloading'].includes(updaterStore.cardStatus)}
          <LoaderCircle class="size-4 shrink-0 text-blue-500 animate-spin" />
        {:else if updaterStore.cardStatus === 'ready'}
          <CircleCheck class="size-4 shrink-0 text-green-500" />
        {:else if updaterStore.cardStatus === 'error'}
          <CircleX class="size-4 shrink-0 text-red-500" />
        {/if}

        <div class="flex flex-col min-w-0 flex-1 overflow-hidden">
          <span class="text-xs text-muted-foreground truncate text-center">
            {updaterStore.cardLabel}
          </span>
          <span class="text-[10px] text-muted-foreground/70 text-center">
            {updaterStore.cardStatusLabel}
          </span>
        </div>
      </button>
    </HoverCard.Trigger>

    {#if updaterStore.releaseNotes}
      <HoverCard.Content side="right" avoidCollisions={true} collisionPadding={16} class="w-80">
        <HoverCard.Arrow />
        <div class="space-y-2">
          <h4 class="text-sm font-semibold">
            {#if updaterStore.updateVersion}
              What's new in v{updaterStore.updateVersion}
            {:else}
              Release Notes
            {/if}
          </h4>
          <div class="max-h-[300px] overflow-y-auto pr-2 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">
            <div class="prose prose-sm prose-invert max-w-none text-xs [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_p]:text-xs [&_li]:text-xs [&_ul]:my-1 [&_ol]:my-1 [&_p]:my-1">
              {@html renderMarkdown(updaterStore.releaseNotes)}
            </div>
          </div>
        </div>
      </HoverCard.Content>
    {/if}
  </HoverCard.Root>
{/if}
