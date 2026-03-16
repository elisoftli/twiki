<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Play from '@lucide/svelte/icons/play';
  import Square from '@lucide/svelte/icons/square';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
  import Link from '@lucide/svelte/icons/link';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { cn } from '$lib/utils';
  import { GameLauncher, type Game } from '../../../../../../../main/interfaces/game-library.interface';
  import { HEADER_EXPANDED_HEIGHT, HEADER_COLLAPSED_HEIGHT } from '$lib/constants/animations.constants';

  interface Props {
    game: Game | null;
    isLoading: boolean;
    /** Whether the game is currently running */
    isGameRunning?: boolean;
    /** Whether the game is currently being terminated */
    isTerminating?: boolean;
    onBack: () => void;
    onOpenLauncherPage?: () => void;
    onOpenPCGWPage?: () => void;
    onLinkPcgw?: () => void;
    onDeleteGame?: () => void;
    onLaunchGame?: () => void;
    onTerminateGame?: () => void;
    scrollProgress?: number; // 0 = fully expanded, 1 = fully compact
    class?: string;
  }

  let { game, isLoading, isGameRunning = false, isTerminating = false, onBack, onOpenLauncherPage, onOpenPCGWPage, onLinkPcgw, onDeleteGame, onLaunchGame, onTerminateGame, scrollProgress = 0, class: className }: Props = $props();

  const launcherName = $derived(() => {
    switch (game?.launcher) {
      case GameLauncher.STEAM:
        return 'Steam';
      case GameLauncher.XBOX:
        return 'Xbox';
    }
  });

  // Linear interpolation helper
  function lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * progress;
  }

  // Re-export for backwards compatibility (if other components still import from here)
  export const EXPANDED_HEIGHT = HEADER_EXPANDED_HEIGHT;
  export const COLLAPSED_HEIGHT = HEADER_COLLAPSED_HEIGHT;

  // Derived interpolated values based on scroll progress
  let posterHeight = $derived(lerp(144, 48, scrollProgress)); // h-36 (144px) → h-12 (48px)
  let posterWidth = $derived(lerp(96, 32, scrollProgress)); // w-24 (96px) → w-8 (32px)
  let paddingTop = $derived(lerp(32, 12, scrollProgress)); // py-8 (32px) → py-3 (12px)
  let paddingBottom = $derived(lerp(32, 16, scrollProgress)); // py-8 (32px) → py-4 (16px) - extra bottom padding when compact
  let titleSize = $derived(lerp(30, 20, scrollProgress)); // text-3xl (30px) → text-xl (20px)
  let gap = $derived(lerp(24, 12, scrollProgress)); // gap-6 (24px) → gap-3 (12px)
  let heroOpacity = $derived(lerp(0.3, 0.2, scrollProgress));
  let infoGap = $derived(lerp(12, 16, scrollProgress)); // gap-3 (12px) → gap-4 (16px) for inline layout
  let borderOpacity = $derived(lerp(0.5, 1, scrollProgress)); // border becomes more visible when compact

  // Current content height (for positioning border and clipping background)
  let contentHeight = $derived(lerp(EXPANDED_HEIGHT, COLLAPSED_HEIGHT, scrollProgress));

  // For layout transition (stacked → inline), use a threshold
  let isCompactLayout = $derived(scrollProgress > 0.5);
</script>

<!--
  Fixed-height outer container prevents layout shifts during scroll animation.
  The height never changes, so scrolling remains smooth without "snap back" issues.
  pointer-events: none allows clicks to pass through the empty space when collapsed.
-->
<div
  class={cn('sticky top-0 z-50 overflow-hidden pointer-events-none', className)}
  data-gp-header
  style="height: {EXPANDED_HEIGHT}px"
>
  <!-- Inner wrapper that clips to actual content height and has the visual styling -->
  <div
    class="absolute inset-x-0 top-0 bg-background pointer-events-auto"
    style="height: {contentHeight}px; border-bottom: 1px solid hsl(var(--border) / {borderOpacity}); box-shadow: 0 4px 12px -2px hsl(0 0% 0% / {scrollProgress * 0.15})"
  >
    <!-- Background: Hero image or gradient fallback -->
    {#if game?.heroPath}
      <div class="absolute inset-0 overflow-hidden">
        <img
          src={`local-file:///${game.heroPath}`}
          alt=""
          class="h-full w-full object-cover"
          style="opacity: {heroOpacity}"
          draggable="false"
        />
        <div class="absolute inset-0 bg-linear-to-b from-transparent via-background/80 to-background"></div>
      </div>
    {:else}
      <div class="absolute inset-0 bg-linear-to-b from-primary/5 via-background to-background"></div>
      <div class="absolute inset-0 bg-linear-to-r from-transparent via-primary/3 to-transparent"></div>
    {/if}

    <div class="relative px-8" style="padding-top: {paddingTop}px; padding-bottom: {paddingBottom}px">
    {#if isLoading}
      <!-- Loading State -->
      <div class="flex items-center" style="gap: {gap}px">
        <Button
          variant="ghost"
          size="icon"
          onclick={onBack}
          class="shrink-0 hover:bg-muted/50"
        >
          <ArrowLeft class="size-5" />
        </Button>
        <div
          class="animate-shimmer shrink-0 rounded-lg"
          style="height: {posterHeight}px; width: {posterWidth}px"
        ></div>
        <div class="min-w-0 space-y-2">
          <div
            class="animate-shimmer rounded"
            style="height: {lerp(36, 24, scrollProgress)}px; width: {lerp(256, 192, scrollProgress)}px"
          ></div>
          {#if scrollProgress < 0.5}
            <div
              class="animate-shimmer h-9 w-24 rounded"
              style="opacity: {1 - scrollProgress * 2}"
            ></div>
          {/if}
        </div>
      </div>
    {:else if game}
      <!-- Game Header -->
      <div class="flex items-center" style="gap: {gap}px">
        <Button
          variant="ghost"
          size="icon"
          onclick={onBack}
          class="shrink-0 text-foreground hover:bg-muted/50 hover:text-primary"
        >
          <ArrowLeft class="size-5" />
        </Button>

        <!-- Poster -->
        {#if game.posterPath}
          <div class="shrink-0 overflow-hidden rounded-lg shadow-xl shadow-black/30">
            <img
              src={`local-file:///${game.posterPath}`}
              alt={game.name}
              class="w-auto object-cover"
              style="height: {posterHeight}px"
              draggable="false"
            />
          </div>
        {:else}
          <div
            class="flex shrink-0 items-center justify-center rounded-lg bg-muted shadow-xl shadow-black/30"
            style="height: {posterHeight}px; width: {posterWidth}px"
          >
            <span
              class="font-bold text-muted-foreground/50"
              style="font-size: {lerp(30, 18, scrollProgress)}px"
            >
              {game.name.charAt(0).toUpperCase()}
            </span>
          </div>
        {/if}

        <!-- Game Info -->
        <div
          class={cn('flex min-w-0 items-center', isCompactLayout ? '' : 'flex-col items-start')}
          style="gap: {isCompactLayout ? infoGap : 12}px"
        >
          <h1
            class="font-bold tracking-tight text-foreground"
            style="font-size: {titleSize}px; line-height: 1.2"
          >
            {game.name}
          </h1>
          <div class="flex items-center gap-2 shrink-0">
            {#if isGameRunning}
              <Button
                onclick={onTerminateGame}
                variant="destructive"
                size={isCompactLayout ? 'sm' : 'default'}
                class="gap-2"
                disabled={isTerminating}
              >
                <Square class="size-4" style="width: {lerp(16, 12, scrollProgress)}px; height: {lerp(16, 12, scrollProgress)}px" />
                {isTerminating ? 'Stopping...' : 'Exit Game'}
              </Button>
            {:else}
              <Button onclick={onLaunchGame} size={isCompactLayout ? 'sm' : 'default'} class="gap-2">
                <Play style="width: {lerp(16, 12, scrollProgress)}px; height: {lerp(16, 12, scrollProgress)}px" />
                Play
              </Button>
            {/if}
            {#if launcherName()}
              <Button
                onclick={onOpenLauncherPage}
                variant="outline"
                size={isCompactLayout ? 'sm' : 'default'}
                class="gap-2"
                title={`View on ${launcherName()}`}
              >
                <ExternalLink style="width: {lerp(16, 12, scrollProgress)}px; height: {lerp(16, 12, scrollProgress)}px" />
                {launcherName()}
              </Button>
            {/if}
            <Button
              onclick={onOpenPCGWPage}
              variant="outline"
              size={isCompactLayout ? 'sm' : 'default'}
              class="gap-2"
              title="View on PCGamingWiki"
              disabled={!game.pcgwPageId}
            >
              <ExternalLink style="width: {lerp(16, 12, scrollProgress)}px; height: {lerp(16, 12, scrollProgress)}px" />
              PCGamingWiki
            </Button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="outline"
                    size={isCompactLayout ? 'sm' : 'default'}
                    class="px-2"
                    title="More options"
                  >
                    <EllipsisVertical style="width: {lerp(16, 12, scrollProgress)}px; height: {lerp(16, 12, scrollProgress)}px" />
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start">
                <DropdownMenu.Item onclick={onLinkPcgw}>
                  <Link class="size-4" />
                  Link to PCGamingWiki
                </DropdownMenu.Item>
                {#if game.launcher === GameLauncher.MANUAL}
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item class="text-destructive" onclick={onDeleteGame}>
                    <Trash2 class="size-4" />
                    Delete Game
                  </DropdownMenu.Item>
                {/if}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>
    {/if}
    </div>
  </div>
</div>
