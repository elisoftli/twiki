<script lang="ts">
  import { cn } from '$lib/utils';
  import { SKELETON_GRID_COUNT, ANIMATION_STAGGER_MS } from '$lib/constants/animations.constants';

  interface Props {
    count?: number;
    class?: string;
  }

  let { count = SKELETON_GRID_COUNT, class: className }: Props = $props();
</script>

<div class={cn('grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5', className)}>
  {#each Array(count) as _, i}
    <div
      class="animate-fade-in-up space-y-3"
      style="animation-delay: {i * ANIMATION_STAGGER_MS}ms"
    >
      <div class="animate-shimmer aspect-2/3 w-full rounded-lg"></div>
      <div class="animate-shimmer h-4 w-3/4 rounded"></div>
    </div>
  {/each}
</div>
