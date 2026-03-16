<script lang="ts">
  import { type Game, GameLauncher } from '../../../../../../../main/interfaces/game-library.interface';
  import { cn } from '$lib/utils';
  import { goto } from '$app/navigation';
  import steamIcon from '$lib/../assets/images/game-launchers/steam.svg';
  import xboxIcon from '$lib/../assets/images/game-launchers/xbox.svg';
  import manualIcon from '$lib/../assets/images/game-launchers/manual.svg';
  import { logger } from '$lib/utils/logger.utils';
  import * as ContextMenu from '$lib/components/ui/context-menu';
  import Pin from '@lucide/svelte/icons/pin';
  import PinOff from '@lucide/svelte/icons/pin-off';
  import Trash2 from '@lucide/svelte/icons/trash-2';

  interface Props {
    game: Game;
    class?: string;
    index?: number;
    onPin?: (id: string) => void;
    onUnpin?: (id: string) => void;
    onDelete?: (game: Game) => void;
    isDragging?: boolean;
    isDropTarget?: boolean;
    dropPosition?: 'before' | 'after' | null;
    onDragStart?: (e: DragEvent, gameId: string) => void;
    onDragEnd?: (e: DragEvent) => void;
    onDragOver?: (e: DragEvent, gameId: string) => void;
    onDragLeave?: (e: DragEvent) => void;
    onDrop?: (e: DragEvent, gameId: string) => void;
  }

  let {
    game, class: className, index = 0, onPin, onUnpin, onDelete,
    isDragging = false, isDropTarget = false, dropPosition = null,
    onDragStart: onDragStartProp, onDragEnd: onDragEndProp,
    onDragOver: onDragOverProp, onDragLeave: onDragLeaveProp, onDrop: onDropProp,
  }: Props = $props();

  const isPinned = $derived(!!game.pinnedAt);

  // Map launcher to icon
  const launcherIcons: Partial<Record<GameLauncher, string>> = {
    [GameLauncher.STEAM]: steamIcon,
    [GameLauncher.XBOX]: xboxIcon,
    [GameLauncher.MANUAL]: manualIcon,
  };

  const isManualGame = $derived(game.launcher === GameLauncher.MANUAL);

  function handleClick() {
    goto(`/game/${game.id}`);
  }

  let imageLoaded = $state(false);
  let imageError = $state(false);
  let lastPosterPath = $state<string | null>(null);

  function handleImageLoad() {
    imageLoaded = true;
  }

  function handleImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    logger.error('Image load error:', {
      src: img.src,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
      game: game.name,
      posterPath: game.posterPath
    });
    imageError = true;
    imageLoaded = true;
  }

  // Reset image state only when posterPath value actually changes
  $effect(() => {
    const currentPath = game.posterPath;
    if (currentPath !== lastPosterPath) {
      lastPosterPath = currentPath;
      if (currentPath) {
        imageLoaded = false;
        imageError = false;
      }
    }
  });

  function handlePinToggle() {
    if (isPinned) {
      onUnpin?.(game.id);
    } else {
      onPin?.(game.id);
    }
  }

  function handleDelete() {
    onDelete?.(game);
  }
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger>
    <div class="relative">
      {#if isDropTarget && dropPosition === 'before'}
        <div class="absolute -left-3 top-0 bottom-0 w-1 rounded-full bg-primary z-10"></div>
      {/if}
      {#if isDropTarget && dropPosition === 'after'}
        <div class="absolute -right-3 top-0 bottom-0 w-1 rounded-full bg-primary z-10"></div>
      {/if}
    <div
      class={cn(
        'group relative animate-fade-in-up cursor-pointer overflow-hidden rounded-lg bg-card',
        'border transition-colors duration-200 ease-out shadow-sm',
        'hover:border-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isDragging && 'opacity-40',
        className
      )}
      style="animation-delay: {index * 40}ms"
      draggable={isPinned}
      ondragstart={(e) => onDragStartProp?.(e, game.id)}
      ondragend={(e) => onDragEndProp?.(e)}
      ondragover={(e) => onDragOverProp?.(e, game.id)}
      ondragleave={(e) => onDragLeaveProp?.(e)}
      ondrop={(e) => onDropProp?.(e, game.id)}
      onclick={handleClick}
      onkeydown={(e) => e.key === 'Enter' && handleClick()}
      role="button"
      tabindex="0"
      data-testid="game-card"
    >
      <!-- Poster Container with 2:3 aspect ratio -->
      <div class="relative aspect-2/3 overflow-hidden bg-muted">
        {#if game.posterPath && !imageError}
          <img
            src="local-file:///{game.posterPath}"
            alt={game.name}
            class={cn(
              'h-full w-full object-cover transition-all duration-300',
              imageLoaded ? 'opacity-100' : 'opacity-0'
            )}
            draggable="false"
            onload={handleImageLoad}
            onerror={(e) => handleImageError(e)}
          />
          {#if !imageLoaded}
            <div class="animate-shimmer absolute inset-0"></div>
          {/if}
        {:else}
          <!-- Placeholder when no poster -->
          <div class="
            flex h-full items-center justify-center
            bg-linear-to-br from-muted to-muted/50"
          >
            <span class="text-5xl font-bold text-muted-foreground/50 transition-colors duration-300 group-hover:text-primary/50">
              {game.name.charAt(0).toUpperCase()}
            </span>
          </div>
        {/if}

        <!-- Pin badge -->
        {#if isPinned}
          <div class="absolute top-2 left-2 flex size-6 items-center justify-center rounded-md bg-primary/90 text-primary-foreground backdrop-blur-sm">
            <Pin class="size-3.5" />
          </div>
        {/if}

        <!-- Launcher icon badge -->
        {#if launcherIcons[game.launcher]}
          <div class="absolute bottom-2 right-2 flex size-6 items-center justify-center rounded-md bg-background/80 backdrop-blur-sm">
            <img src={launcherIcons[game.launcher]} alt={game.launcher} class="size-4" draggable="false" />
          </div>
        {/if}
      </div>

      <!-- Game Name -->
      <div class="bg-card px-3 py-2.5 backdrop-blur-sm">
        <p class="truncate text-sm font-medium text-card-foreground transition-colors duration-200 group-hover:text-primary" title={game.name}>
          {game.name}
        </p>
      </div>
    </div>
    </div>
  </ContextMenu.Trigger>
  <ContextMenu.Content>
    <ContextMenu.Item onclick={handlePinToggle}>
      {#if isPinned}
        <PinOff class="mr-2 size-4" />
        Unpin Game
      {:else}
        <Pin class="mr-2 size-4" />
        Pin Game
      {/if}
    </ContextMenu.Item>
    {#if isManualGame}
      <ContextMenu.Separator />
      <ContextMenu.Item onclick={handleDelete} class="text-destructive focus:text-destructive">
        <Trash2 class="mr-2 size-4" />
        Delete Game
      </ContextMenu.Item>
    {/if}
  </ContextMenu.Content>
</ContextMenu.Root>
