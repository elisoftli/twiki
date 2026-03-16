<script lang="ts">
  import { cn } from '$lib/utils';

  interface Props {
    count?: number;
    class?: string;
  }

  let { count = 4, class: className }: Props = $props();
</script>

<div class={cn('space-y-3', className)}>
  {#each Array(count) as _, i}
    <div
      class="animate-fade-in-up overflow-hidden rounded-lg border border-border/50 bg-card/50 px-5 py-4 shadow-lg shadow-black/10 backdrop-blur-sm"
      style="animation-delay: {i * 60}ms"
    >
      <div class="flex items-center justify-between">
        <div class="animate-shimmer h-5 w-48 rounded"></div>
        <div class="animate-shimmer size-4 rounded"></div>
      </div>
    </div>
  {/each}
</div>
