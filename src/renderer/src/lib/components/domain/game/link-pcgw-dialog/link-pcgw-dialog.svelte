<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Alert from '$lib/components/ui/alert';
  import { Button } from '$lib/components/ui/button';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import Info from '@lucide/svelte/icons/info';
  import { PcgwMatcher } from '$lib/components/domain/game/pcgw-matcher';
  import { logger } from '$lib/utils/logger.utils';
  import type { PcgwSearchResult } from '../../../../../../../preload';
  import type { Game } from '../../../../../../../main/interfaces/game-library.interface';

  interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    game: Game;
    onLinked?: (game: Game) => void;
  }

  let { open = $bindable(), onOpenChange, game, onLinked }: Props = $props();

  // State
  let selectedResult = $state<PcgwSearchResult | null>(null);
  let isSaving = $state(false);
  let error = $state<string | null>(null);

  // Save is enabled only when selection differs from current match
  const canSave = $derived(
    selectedResult !== null &&
    selectedResult.pageId !== game.pcgwPageId &&
    !isSaving
  );

  // Reset state when dialog closes
  $effect(() => {
    if (!open) {
      selectedResult = null;
      isSaving = false;
      error = null;
    }
  });

  function handleSelect(result: PcgwSearchResult | null): void {
    selectedResult = result;
  }

  async function handleSave(): Promise<void> {
    if (!canSave || !selectedResult) return;

    isSaving = true;
    error = null;

    try {
      const updatedGame = await window.api.library.linkPcgw(
        game.id,
        selectedResult.pageId,
        selectedResult.title
      );
      onLinked?.(updatedGame);
      onOpenChange(false);
    } catch (err) {
      logger.error('Failed to link PCGW:', err);
      error = err instanceof Error ? err.message : 'Failed to link PCGamingWiki page';
    } finally {
      isSaving = false;
    }
  }
</script>

<Dialog.Root bind:open onOpenChange={onOpenChange}>
  <Dialog.Content class="sm:max-w-lg select-none! max-h-[85vh] flex flex-col" overlayClass="z-[99]" wrapperClass="z-[100]">
    <Dialog.Header>
      <Dialog.Title>Link to PCGamingWiki</Dialog.Title>
      <Dialog.Description>
        Search for the correct PCGamingWiki page for this game.
      </Dialog.Description>
    </Dialog.Header>

    <div class="py-2 px-1 -mx-1 overflow-y-auto flex-1 min-h-0">
      <PcgwMatcher
        initialQuery={game.name}
        currentPageId={game.pcgwPageId}
        onSelect={handleSelect}
        disabled={isSaving}
      />

      {#if error}
        <div class="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 mt-3 text-sm text-destructive">
          <span>{error}</span>
        </div>
      {/if}

      <Alert.Root class="mt-3 py-2 border-primary/50 bg-primary/10 text-primary [&>svg]:text-primary">
        <Info class="size-4" />
        <Alert.Description>
          This only affects where game data and tweaks are sourced from. It won't change the game's name or poster in your library.
        </Alert.Description>
      </Alert.Root>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => onOpenChange(false)} disabled={isSaving}>
        Cancel
      </Button>
      <Button onclick={handleSave} disabled={!canSave}>
        {#if isSaving}
          <Loader2 class="mr-2 size-4 animate-spin" />
          Saving...
        {:else}
          Save
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
