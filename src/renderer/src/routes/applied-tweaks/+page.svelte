<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { Badge } from '$lib/components/ui/badge';
  import { AppliedTweakCard, AppliedTweakCardSkeleton } from '$lib/components/domain/tweak/applied-tweak-card';
  import { StateCard } from '$lib/components/domain/common/state-card';
  import { RevertConfirmationDialog } from '$lib/components/domain/tweak/revert-confirmation-dialog';
  import History from '@lucide/svelte/icons/history';
  import type { AppliedTweak, PreRevertCheckResult } from '../../../../main/interfaces/tweak-agent.interface';
  import type { Game } from '../../../../main/interfaces/game-library.interface';
  import { logger } from '$lib/utils/logger.utils';

  let tweaks = $state<AppliedTweak[]>([]);
  let gamesMap = $state<Map<string, Game>>(new Map());
  let isLoading = $state(true);
  let revertingTweakId = $state<string | null>(null);

  // Revert confirmation dialog state
  let revertDialog = $state<{
    isOpen: boolean;
    tweak: AppliedTweak | null;
    preCheck: PreRevertCheckResult | null;
  }>({ isOpen: false, tweak: null, preCheck: null });

  async function handleRevert(tweak: AppliedTweak) {
    const hash = tweak.tweak.hash;
    revertingTweakId = hash;

    try {
      // Step 1: Pre-check for conflicts
      const preCheck = await window.api.revert.preCheck($state.snapshot(tweak));

      if (!preCheck.canProceed || preCheck.fileConflicts.length > 0) {
        // Show confirmation dialog for conflicts or blocked state
        revertDialog = { isOpen: true, tweak, preCheck };
        revertingTweakId = null;
        return;
      }

      // Step 2: No conflicts - execute immediately
      const result = await window.api.revert.execute($state.snapshot(tweak.summary));

      if (result.status === 'success' || result.status === 'partial') {
        await window.api.appliedTweaks.remove(hash);
        tweaks = tweaks.filter((t) => t.tweak.hash !== hash);
        toast.success('Reverted successfully');
      } else {
        toast.error('Failed to revert tweak');
      }
    } catch (err) {
      logger.error('Failed to revert tweak:', err);
      toast.error('Failed to revert tweak');
    } finally {
      revertingTweakId = null;
    }
  }

  async function handleConfirmRevert(useFallback: boolean) {
    if (!revertDialog.tweak) return;

    const tweak = revertDialog.tweak;
    const hash = tweak.tweak.hash;
    revertDialog = { isOpen: false, tweak: null, preCheck: null };
    revertingTweakId = hash;

    try {
      const result = await window.api.revert.executeWithFallback(
        $state.snapshot(tweak),
        useFallback
      );

      if (result.status === 'success' || result.status === 'partial') {
        await window.api.appliedTweaks.remove(hash);
        tweaks = tweaks.filter((t) => t.tweak.hash !== hash);

        if (useFallback) {
          toast.success('Reverted using backup');
        } else {
          toast.success('Reverted successfully');
        }
      } else {
        toast.error('Failed to revert tweak');
      }
    } catch (err) {
      logger.error('Failed to revert tweak:', err);
      toast.error('Failed to revert tweak');
    } finally {
      revertingTweakId = null;
    }
  }

  function handleCancelRevert() {
    revertDialog = { isOpen: false, tweak: null, preCheck: null };
  }

  onMount(async () => {
    try {
      // Fetch all applied tweaks
      const allTweaks = await window.api.appliedTweaks.getAll();

      // Sort by appliedAt descending (newest first)
      tweaks = allTweaks.sort(
        (a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
      );

      // Fetch game info for all unique launcher game IDs
      const gameIds = [...new Set(tweaks.map((t) => t.launcherGameId))];
      const games = await Promise.all(gameIds.map((id) => window.api.library.getGameByLauncherId(id)));

      // Build a map for efficient lookup (keyed by launcherId for applied tweak matching)
      const map = new Map<string, Game>();
      games.forEach((game) => {
        if (game) map.set(game.launcherId, game);
      });
      gamesMap = map;
    } catch (err) {
      logger.error('Failed to load applied tweaks:', err);
    } finally {
      isLoading = false;
    }
  });
</script>

<div class="min-h-screen bg-background">
  <!-- Header -->
  <div class="border-b border-border/50 bg-card/50">
    <div class="px-8 py-8">
      <div class="flex items-center justify-between">
        <div class="space-y-1">
          <h1 class="text-3xl font-bold tracking-tight text-foreground">Applied Tweaks</h1>
          <p class="text-muted-foreground">
            {#if isLoading}
              Loading your tweaks...
            {:else if tweaks.length > 0}
              Manage and revert your applied game tweaks
            {:else}
              No tweaks applied yet
            {/if}
          </p>
        </div>
        {#if !isLoading && tweaks.length > 0}
          <Badge variant="secondary" class="px-3 py-1.5 text-sm font-medium">
            {tweaks.length} {tweaks.length === 1 ? 'tweak' : 'tweaks'}
          </Badge>
        {/if}
      </div>
    </div>
  </div>

  <!-- Content Area -->
  <div class="p-8">
    <div class="mx-auto max-w-7xl">
      {#if isLoading}
        <div class="space-y-3">
          <AppliedTweakCardSkeleton count={5} />
        </div>
      {:else if tweaks.length === 0}
        <StateCard
          variant="empty"
          icon={History}
          title="No Applied Tweaks"
          description="You haven't applied any tweaks yet. Browse your game library and apply tweaks to see them here."
        />
      {:else}
        <!-- Tweaks List -->
        <div class="space-y-3">
          {#each tweaks as tweak, index (tweak.tweak.hash)}
            <AppliedTweakCard
              {tweak}
              game={gamesMap.get(tweak.launcherGameId) ?? null}
              {index}
              isReverting={revertingTweakId === tweak.tweak.hash}
              onRevert={handleRevert}
            />
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Revert Confirmation Dialog -->
{#if revertDialog.isOpen && revertDialog.preCheck}
  <RevertConfirmationDialog
    isOpen={revertDialog.isOpen}
    tweakTitle={revertDialog.tweak?.tweak.title ?? ''}
    preCheck={revertDialog.preCheck}
    onConfirm={handleConfirmRevert}
    onCancel={handleCancelRevert}
  />
{/if}
