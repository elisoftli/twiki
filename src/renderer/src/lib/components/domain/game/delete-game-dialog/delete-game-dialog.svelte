<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Label } from '$lib/components/ui/label';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import { logger } from '$lib/utils/logger.utils';
  import type { Game } from '../../../../../../../main/interfaces/game-library.interface';

  // Error message extraction helper
  function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return 'Unknown error';
  }

  interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    game: Game | null;
    appliedTweakCount?: number;
    onDeleted?: (gameId: string) => void;
  }

  let { open = $bindable(), onOpenChange, game, appliedTweakCount = 0, onDeleted }: Props = $props();

  // State
  let deleteAppliedTweaks = $state(false);
  let isDeleting = $state(false);
  let error = $state<string | null>(null);

  // Reset state when dialog opens/closes
  $effect(() => {
    if (!open) {
      deleteAppliedTweaks = false;
      isDeleting = false;
      error = null;
    }
  });

  async function handleDelete(): Promise<void> {
    if (!game) return;

    isDeleting = true;
    error = null;

    try {
      await window.api.library.deleteGame(game.id, deleteAppliedTweaks);
      onDeleted?.(game.id);
      onOpenChange(false);
    } catch (err) {
      logger.error('Failed to delete game:', err);
      error = getErrorMessage(err);
    } finally {
      isDeleting = false;
    }
  }
</script>

<Dialog.Root bind:open onOpenChange={onOpenChange}>
  <Dialog.Content class="sm:max-w-md select-none!" overlayClass="z-[99]" wrapperClass="z-[100]">
    <Dialog.Header>
      <Dialog.Title>Delete Game</Dialog.Title>
    </Dialog.Header>

    {#if game}
      <div class="space-y-4 py-2">
        <p class="text-sm">
          Are you sure you want to remove <strong class="font-semibold">{game.name}</strong> from your library?
        </p>

        {#if appliedTweakCount > 0}
          <div class="flex items-start gap-3 rounded-md border border-warning/50 bg-warning/10 p-3">
            <AlertTriangle class="size-5 shrink-0 text-warning mt-0.5" />
            <div class="space-y-2">
              <p class="text-sm">
                This game has <strong>{appliedTweakCount}</strong> applied {appliedTweakCount === 1 ? 'tweak' : 'tweaks'}.
              </p>
              <label class="flex items-center gap-2 cursor-pointer">
                <Checkbox bind:checked={deleteAppliedTweaks} />
                <span class="text-sm">Also delete applied tweaks</span>
              </label>
            </div>
          </div>
        {/if}

        <p class="text-xs text-muted-foreground">
          This will not delete any game files from your computer.
        </p>

        {#if error}
          <div class="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle class="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        {/if}
      </div>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={() => onOpenChange(false)} disabled={isDeleting}>
        Cancel
      </Button>
      <Button variant="destructive" onclick={handleDelete} disabled={isDeleting || !game}>
        {#if isDeleting}
          <Loader2 class="mr-2 size-4 animate-spin" />
          Deleting...
        {:else}
          Delete
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
