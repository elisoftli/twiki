<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { GamesGrid } from '$lib/components/domain/game/games-grid';
  import { StateCard } from '$lib/components/domain/common/state-card';
  import { GameGridSkeleton } from '$lib/components/domain/common/loading-skeleton';
  import { ImportGameDialog } from '$lib/components/domain/game/import-game-dialog';
  import { DeleteGameDialog } from '$lib/components/domain/game/delete-game-dialog';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Plus from '@lucide/svelte/icons/plus';
  import X from '@lucide/svelte/icons/x';
  import type { Game, GameLibraryStatus } from '../../../main/interfaces/game-library.interface';
  import { logger } from '$lib/utils/logger.utils';

  let libraryStatus = $state<GameLibraryStatus | null>(null);
  let games = $state<Game[]>([]);
  let isLoading = $state(true);
  let isRefreshing = $state(true); // Tracks if library is being loaded/refreshed in background

  // Search/filter state
  let searchTerm = $state('');

  // Import dialog state
  let isImportDialogOpen = $state(false);

  // Delete dialog state
  let isDeleteDialogOpen = $state(false);
  let gameToDelete = $state<Game | null>(null);
  let appliedTweakCount = $state(0);

  // Filtered games based on search term
  const filteredGames = $derived(
    searchTerm.trim() === ''
      ? games
      : games.filter((game) => {
          const term = searchTerm.toLowerCase();
          return game.name.toLowerCase().includes(term);
        })
  );

  const isSearching = $derived(searchTerm.trim() !== '');

  function clearSearch(): void {
    searchTerm = '';
  }

  function handlePosterUpdated(data: { id: string; posterPath: string }) {
    games = games.map((game) =>
      game.id === data.id ? { ...game, posterPath: data.posterPath } : game
    );
  }

  function handleGamePinned(data: { id: string; pinnedAt: string }) {
    // Update local state and re-sort
    games = sortGames(
      games.map((game) =>
        game.id === data.id ? { ...game, pinnedAt: data.pinnedAt } : game
      )
    );
  }

  function handleGameUnpinned(data: { id: string }) {
    // Update local state and re-sort
    games = sortGames(
      games.map((game) =>
        game.id === data.id ? { ...game, pinnedAt: null } : game
      )
    );
  }

  function handleGameAdded(data: { game: Game }) {
    // Add the newly imported game and re-sort (avoid duplicates)
    if (!games.some((g) => g.id === data.game.id)) {
      games = sortGames([...games, data.game]);
      logger.info(`Game added: ${data.game.name}`);
    }
  }

  function handleGameRemoved(data: { id: string }) {
    // Remove the deleted game from local state
    games = games.filter((game) => game.id !== data.id);
    logger.info(`Game removed: ${data.id}`);
  }

  /**
   * Sort games: pinned first (by pinnedAt desc), then unpinned (alphabetically)
   */
  function sortGames(gamesList: Game[]): Game[] {
    return [...gamesList].sort((a, b) => {
      if (a.pinnedAt && b.pinnedAt) {
        return new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime();
      }
      if (a.pinnedAt) return -1;
      if (b.pinnedAt) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async function handlePinGame(id: string) {
    await window.api.library.pinGame(id);
  }

  async function handleUnpinGame(id: string) {
    await window.api.library.unpinGame(id);
  }

  function handleReorderPinnedGames(orderedIds: string[]) {
    // Optimistically reorder local state
    const baseTime = Date.now();
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    const updatedGames = games.map((game) => {
      const orderIndex = orderMap.get(game.id);
      if (orderIndex !== undefined) {
        return { ...game, pinnedAt: new Date(baseTime - orderIndex * 1000).toISOString() };
      }
      return game;
    });
    games = sortGames(updatedGames);

    // Persist to main process (fire-and-forget)
    window.api.library.reorderPinnedGames(orderedIds).catch((err) => {
      logger.error('Failed to persist pinned game reorder:', err);
    });
  }

  async function handleDeleteGame(game: Game) {
    gameToDelete = game;
    try {
      const tweaks = await window.api.appliedTweaks.getByGame(game.id);
      appliedTweakCount = tweaks.length;
    } catch (err) {
      logger.error('Failed to get applied tweaks count:', err);
      appliedTweakCount = 0;
    }
    isDeleteDialogOpen = true;
  }

  function handleDeleteDialogClose() {
    isDeleteDialogOpen = false;
    gameToDelete = null;
    appliedTweakCount = 0;
  }

  async function handleCacheLoaded(data: { gameCount: number }) {
    try {
      // Show cached games immediately
      games = await window.api.library.getGames();
      if (games.length > 0) {
        isLoading = false;
      }
      logger.info(`Cache loaded: ${data.gameCount} games`);
    } catch (err) {
      logger.error('Failed to load games from cache:', err);
    }
  }

  async function handleLibraryLoaded() {
    try {
      games = await window.api.library.getGames();
      libraryStatus = await window.api.library.getStatus();
    } catch (err) {
      logger.error('Failed to load games after library loaded:', err);
    } finally {
      isLoading = false;
      isRefreshing = false;
    }
  }

  async function handleReload() {
    isLoading = true;
    isRefreshing = true;
    games = [];
    try {
      games = await window.api.library.reload();
      libraryStatus = await window.api.library.getStatus();
    } catch (err) {
      logger.error('Failed to reload library:', err);
    } finally {
      isLoading = false;
      isRefreshing = false;
    }
  }

  onMount(async () => {
    try {
      libraryStatus = await window.api.library.getStatus();
      games = await window.api.library.getGames();

      if (libraryStatus.isLoaded && !libraryStatus.error) {
        // Library fully loaded
        isLoading = false;
        isRefreshing = false;
      } else if (games.length > 0) {
        // Cache was loaded, show games while waiting for fresh data
        isLoading = false;
        // Keep isRefreshing = true until library:loaded event
      }
      // Otherwise keep isLoading = true until we get events
    } catch (err) {
      libraryStatus = { isLoaded: false, launchers: {}, error: String(err) };
      isLoading = false;
      isRefreshing = false;
    }

    window.api.library.onGamePosterUpdated(handlePosterUpdated);
    window.api.library.onCacheLoaded(handleCacheLoaded);
    window.api.library.onLibraryLoaded(handleLibraryLoaded);
    window.api.library.onGamePinned(handleGamePinned);
    window.api.library.onGameUnpinned(handleGameUnpinned);
    window.api.library.onGameAdded(handleGameAdded);
    window.api.library.onGameRemoved(handleGameRemoved);
  });

  onDestroy(() => {
    window.api.library.removeAllListeners();
  });
</script>

<div class="flex min-h-full flex-col">
  <!-- Header -->
  <div class="shrink-0 border-b border-border/50 bg-card/50">
    <div class="px-8 py-8">
      <div class="flex items-center justify-between">
        <div class="space-y-1">
          <h1 class="text-3xl font-bold tracking-tight text-foreground">My Games</h1>
          <p class="text-muted-foreground">
            {#if isLoading}
              Loading your library...
            {:else if games.length > 0}
              Browse and tweak your installed games
            {:else}
              No games detected
            {/if}
          </p>
        </div>
        {#if !isLoading}
          <div class="flex items-center gap-4">
            {#if games.length > 0}
              <div class="relative">
                <Input
                  type="text"
                  placeholder="Search games..."
                  class="h-8.5 w-48 pr-8 text-sm"
                  bind:value={searchTerm}
                  clearOnEscape
                  isPrimary
                />
                {#if searchTerm}
                  <button
                    type="button"
                    class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onclick={clearSearch}
                  >
                    <X class="h-4 w-4" />
                  </button>
                {/if}
              </div>
              <Badge variant="secondary" class="min-w-26 flex items-center justify-center px-3 py-1.5 text-sm font-medium tabular-nums text-center">
                {#if isSearching}
                  {filteredGames.length} / {games.length}
                {:else}
                  {games.length} {games.length === 1 ? 'game' : 'games'}
                {/if}
              </Badge>
            {/if}
            <Button
              variant="secondary"
              size="icon"
              onclick={() => isImportDialogOpen = true}
              class="size-8"
              title="Import game"
            >
              <Plus class="size-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onclick={handleReload}
              disabled={isRefreshing}
              class="size-8"
              title={isRefreshing ? 'Loading library...' : 'Reload library'}
            >
              <RefreshCw class="size-4 {isRefreshing ? 'animate-spin' : ''}" />
            </Button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Content Area -->
  <div class="flex-1 p-8">
    <div class="mx-auto max-w-7xl">
      {#if isLoading}
        <GameGridSkeleton />
      {:else if libraryStatus?.error}
        <StateCard
          variant="error"
          icon={AlertCircle}
          title="Library Error"
          description={libraryStatus.error}
        />
      {:else if games.length === 0}
        <StateCard
          variant="empty"
          icon={Gamepad2}
          title="No Games Found"
          description="No games were detected. Make sure Steam or Xbox is installed and you have games in your library."
        />
      {:else}
        <!-- Success State: Games Grid -->
        <div>
          <GamesGrid games={filteredGames} onPinGame={handlePinGame} onUnpinGame={handleUnpinGame} onDeleteGame={handleDeleteGame} onReorderPinnedGames={handleReorderPinnedGames} />
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Import Game Dialog -->
<ImportGameDialog
  bind:open={isImportDialogOpen}
  onOpenChange={(open) => isImportDialogOpen = open}
  onImported={(game) => handleGameAdded({ game })}
/>

<!-- Delete Game Dialog -->
<DeleteGameDialog
  bind:open={isDeleteDialogOpen}
  onOpenChange={(open) => { if (!open) handleDeleteDialogClose(); }}
  game={gameToDelete}
  {appliedTweakCount}
  onDeleted={(gameId) => handleGameRemoved({ id: gameId })}
/>
