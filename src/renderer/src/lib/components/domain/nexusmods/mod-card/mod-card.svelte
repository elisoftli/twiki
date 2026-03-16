<script lang="ts">
  import Download from '@lucide/svelte/icons/download';
  import ThumbsUp from '@lucide/svelte/icons/thumbs-up';
  import { formatCount, formatCompactRelativeTime } from '$lib/utils/format.utils';
  import type { NexusModsMod } from '../../../../../../../main/interfaces/nexusmods.interface';

  interface Props {
    mod: NexusModsMod;
    onclick: () => void;
  }

  let { mod, onclick }: Props = $props();
</script>

<button
  type="button"
  class="w-full flex gap-4 p-4 rounded-lg border bg-card hover:border-border transition-colors text-left cursor-pointer group"
  {onclick}
>
  <!-- Thumbnail -->
  {#if mod.thumbnailUrl}
    <img
      src={mod.thumbnailUrl}
      alt={mod.name}
      class="h-[62px] w-[62px] rounded-md object-cover shrink-0 bg-muted"
      loading="lazy"
    />
  {:else}
    <div class="h-[62px] w-[62px] rounded-md bg-muted shrink-0 flex items-center justify-center">
      <span class="text-xs text-muted-foreground">No img</span>
    </div>
  {/if}

  <!-- Content -->
  <div class="flex-1 min-w-0 flex flex-col justify-between">
    <div>
      <div class="flex items-center gap-2 mb-0.5">
        <h3 class="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {mod.name}
        </h3>
      </div>
      <p class="text-xs text-muted-foreground line-clamp-1">{mod.summary}</p>
    </div>
    <div class="flex items-center gap-3 text-xs text-muted-foreground mt-1">
      {#if mod.author}
        <span>{mod.author}</span>
      {/if}
      {#if mod.modCategory?.name}
        <span class="opacity-50">·</span>
        <span>{mod.modCategory.name}</span>
      {/if}
      <span class="opacity-50">·</span>
      <span>{formatCompactRelativeTime(mod.updatedAt)}</span>
    </div>
  </div>

  <!-- Stats -->
  <div class="shrink-0 flex flex-col items-end gap-y-1.5 justify-between py-0.5 text-xs text-muted-foreground">
    <div class="flex items-center gap-1">
      <Download class="size-3" />
      <span>{formatCount(mod.downloads)}</span>
    </div>
    <div class="flex items-center gap-1">
      <ThumbsUp class="size-3" />
      <span>{formatCount(mod.endorsements)}</span>
    </div>
  </div>
</button>
