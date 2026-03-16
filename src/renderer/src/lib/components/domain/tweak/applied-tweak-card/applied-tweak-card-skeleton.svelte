<script lang="ts">
  import { cn } from '$lib/utils';

  interface Props {
    count?: number;
    class?: string;
  }

  let { count = 5, class: className }: Props = $props();
</script>

<div class={cn('space-y-3', className)}>
  {#each Array(count) as _, i}
    <div
      class="animate-fade-in-up flex items-center gap-4 rounded-lg border border-border/50 bg-card/50 p-4"
      style="animation-delay: {i * 60}ms"
    >
      <!-- Poster Skeleton -->
      <div class="animate-shimmer shrink-0 w-16 aspect-2/3 rounded-md bg-muted"></div>

      <!-- Content Skeleton -->
      <div class="flex-1 min-w-0 space-y-2">
        <div class="animate-shimmer h-4 w-40 rounded"></div>
        <div class="animate-shimmer h-3 w-32 rounded"></div>
        <div class="animate-shimmer h-3 w-48 rounded"></div>
      </div>

      <!-- Actions Skeleton -->
      <div class="flex items-center gap-2 shrink-0">
        <div class="animate-shimmer h-6 w-16 rounded-full"></div>
        <div class="animate-shimmer h-3 w-20 rounded"></div>
        <div class="animate-shimmer h-7 w-20 rounded"></div>
      </div>
    </div>
  {/each}
</div>
