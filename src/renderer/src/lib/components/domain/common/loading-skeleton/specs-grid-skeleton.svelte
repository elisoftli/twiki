<script lang="ts">
  import { Card, CardContent, CardHeader } from '$lib/components/ui/card';
  import { cn } from '$lib/utils';
  import { SKELETON_SPECS_COUNT, ANIMATION_STAGGER_MS } from '$lib/constants/animations.constants';

  interface Props {
    count?: number;
    class?: string;
  }

  let { count = SKELETON_SPECS_COUNT, class: className }: Props = $props();
</script>

<div class={cn('grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3', className)}>
  {#each Array(count) as _, i}
    <div
      class="animate-fade-in-up"
      style="animation-delay: {i * ANIMATION_STAGGER_MS}ms"
    >
      <Card class="glass duration-200 ease-out">
        <CardHeader>
          <div class="animate-shimmer h-6 w-24 rounded"></div>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <div class="animate-shimmer h-4 w-full rounded"></div>
            <div class="animate-shimmer h-4 w-3/4 rounded"></div>
            <div class="animate-shimmer h-4 w-1/2 rounded"></div>
          </div>
        </CardContent>
      </Card>
    </div>
  {/each}
</div>
