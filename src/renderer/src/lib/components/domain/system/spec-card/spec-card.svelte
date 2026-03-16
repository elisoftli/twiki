<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import { ANIMATION_STAGGER_MS } from '$lib/constants/animations.constants';
  import type { Component, Snippet } from 'svelte';

  interface Props {
    /** Lucide icon component to display */
    icon: Component;
    /** Card title text */
    title: string;
    /** Animation index for staggered appearance (1-based) */
    animationIndex?: number;
    /** Whether visibility toggle is shown */
    showVisibilityToggle?: boolean;
    /** Whether the spec is visible to the agent */
    isVisible?: boolean;
    /** Callback when visibility is toggled */
    onToggleVisibility?: () => void;
    /** Content to render inside the card */
    children: Snippet;
  }

  let {
    icon: Icon,
    title,
    animationIndex = 1,
    showVisibilityToggle = false,
    isVisible = true,
    onToggleVisibility,
    children,
  }: Props = $props();
</script>

<Card
  class="glass animate-fade-in-up duration-200 ease-out"
  style="animation-delay: {animationIndex * ANIMATION_STAGGER_MS}ms"
>
  <CardHeader>
    <div class="flex flex-row items-center justify-between">
      <div class="flex flex-row items-center gap-3">
        <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon class="size-5 text-primary" />
        </div>
        <CardTitle class="text-lg">{title}</CardTitle>
      </div>
      {#if showVisibilityToggle && onToggleVisibility}
        <Button
          variant={isVisible ? 'ghost' : 'destructive'}
          size="icon"
          class="h-8 w-8 shrink-0"
          onclick={onToggleVisibility}
          title={isVisible ? 'Hide from Auto-Tweaker' : 'Share with Auto-Tweaker'}
        >
          {#if isVisible}
            <Eye class="h-4 w-4" />
          {:else}
            <EyeOff class="h-4 w-4" />
          {/if}
        </Button>
      {/if}
    </div>
  </CardHeader>
  <CardContent>
    {@render children()}
  </CardContent>
</Card>
