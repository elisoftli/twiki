<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Game } from '../../../../../../../main/interfaces/game-library.interface';
  import { GameCard } from '$lib/components/domain/game/game-card';
  import { cn } from '$lib/utils';

  interface Props {
    games: Game[];
    class?: string;
    onPinGame?: (id: string) => void;
    onUnpinGame?: (id: string) => void;
    onDeleteGame?: (game: Game) => void;
    onReorderPinnedGames?: (orderedIds: string[]) => void;
  }

  let { games, class: className, onPinGame, onUnpinGame, onDeleteGame, onReorderPinnedGames }: Props = $props();

  // DnD state
  let draggedGameId = $state<string | null>(null);
  let dropTargetGameId = $state<string | null>(null);
  let dropPosition = $state<'before' | 'after' | null>(null);

  // Set of pinned game IDs, rebuilt when drag starts to avoid repeated .find() in handleDragOver
  let pinnedGameIds: Set<string> | null = null;

  let ghostEl: HTMLElement | null = null;
  let ghostOffsetX = 0;
  let ghostOffsetY = 0;

  // 1x1 transparent image to hide the browser's native drag ghost
  const emptyImg = new Image();
  emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function onDocumentDragOver(e: DragEvent) {
    if (ghostEl) {
      ghostEl.style.left = `${e.clientX - ghostOffsetX}px`;
      ghostEl.style.top = `${e.clientY - ghostOffsetY}px`;
    }
  }

  function handleDragStart(e: DragEvent, gameId: string) {
    const game = games.find((g) => g.id === gameId);
    if (!game?.pinnedAt) {
      e.preventDefault();
      return;
    }
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', gameId);

      // Hide native ghost
      e.dataTransfer.setDragImage(emptyImg, 0, 0);

      // Build pinned IDs set for fast lookups during dragover
      pinnedGameIds = new Set(games.filter((g) => g.pinnedAt).map((g) => g.id));

      // Create our own ghost that follows the cursor
      const source = e.currentTarget as HTMLElement;
      const rect = source.getBoundingClientRect();
      ghostOffsetX = e.clientX - rect.left;
      ghostOffsetY = e.clientY - rect.top;

      const clone = source.cloneNode(true) as HTMLElement;
      clone.setAttribute('data-gp-skip', '');
      clone.style.position = 'fixed';
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      clone.style.width = `${source.offsetWidth}px`;
      clone.style.opacity = '0.2';
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = '9999';
      clone.style.transition = 'none';
      clone.style.animation = 'none';
      document.body.appendChild(clone);
      ghostEl = clone;

      document.addEventListener('dragover', onDocumentDragOver);
    }

    // Delay isDragging visual by one frame so the browser captures
    // the normal card appearance before we dim the source
    requestAnimationFrame(() => {
      draggedGameId = gameId;
    });
  }

  function cleanupDrag() {
    draggedGameId = null;
    dropTargetGameId = null;
    dropPosition = null;
    pinnedGameIds = null;
    document.removeEventListener('dragover', onDocumentDragOver);
    if (ghostEl) {
      ghostEl.remove();
      ghostEl = null;
    }
  }

  function handleDragEnd(_e: DragEvent) {
    cleanupDrag();
  }

  function handleDragOver(e: DragEvent, gameId: string) {
    if (!draggedGameId) return;

    // Only allow dropping on pinned games (and not on self)
    if (!pinnedGameIds?.has(gameId) || gameId === draggedGameId) {
      return;
    }

    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }

    // Determine before/after based on horizontal mouse position relative to card midpoint
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    dropTargetGameId = gameId;
    dropPosition = e.clientX < midX ? 'before' : 'after';
  }

  function handleDragLeave(_e: DragEvent) {
    dropTargetGameId = null;
    dropPosition = null;
  }

  function handleDrop(e: DragEvent, gameId: string) {
    e.preventDefault();
    if (!draggedGameId || !dropPosition) return;

    if (!pinnedGameIds?.has(gameId) || gameId === draggedGameId) {
      cleanupDrag();
      return;
    }

    // Build new ordered list of pinned game IDs
    const pinnedGames = games.filter((g) => g.pinnedAt);
    const orderedIds = pinnedGames.map((g) => g.id).filter((id) => id !== draggedGameId);

    const targetIndex = orderedIds.indexOf(gameId);
    if (targetIndex === -1) {
      cleanupDrag();
      return;
    }

    const insertAt = dropPosition === 'before' ? targetIndex : targetIndex + 1;
    orderedIds.splice(insertAt, 0, draggedGameId);

    onReorderPinnedGames?.(orderedIds);
    cleanupDrag();
  }

  // Cleanup ghost/listener if component is destroyed mid-drag
  onDestroy(cleanupDrag);
</script>

<div
  class={cn(
    'grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5',
    className
  )}
>
  {#each games as game, index (game.id)}
    <GameCard
      {game}
      {index}
      onPin={onPinGame}
      onUnpin={onUnpinGame}
      onDelete={onDeleteGame}
      isDragging={draggedGameId === game.id}
      isDropTarget={dropTargetGameId === game.id}
      dropPosition={dropTargetGameId === game.id ? dropPosition : null}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    />
  {/each}
</div>
