<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { ErrorCard } from '$lib/components/domain/common/error-card';
  import { StateCard } from '$lib/components/domain/common/state-card';
  import { ModCard } from '$lib/components/domain/nexusmods/mod-card';
  import { ModDetailDialog } from '$lib/components/domain/nexusmods/mod-detail-dialog';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import CircleSlash from '@lucide/svelte/icons/circle-slash';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import type { Game } from '../../../../../../../main/interfaces/game-library.interface';
  import type { NexusModsMod } from '../../../../../../../main/interfaces/nexusmods.interface';

  interface Props {
    game: Game | null;
    pageName: string | null;
    nexusMods: ReturnType<typeof import('$lib/hooks').useNexusMods>;
  }

  let { game, pageName, nexusMods }: Props = $props();

  // Mod detail dialog state
  let selectedMod = $state<NexusModsMod | null>(null);
  let detailDialogOpen = $state(false);

  function openModDetail(mod: NexusModsMod): void {
    selectedMod = mod;
    detailDialogOpen = true;
  }

  function handleRetry(): void {
    if (game) {
      nexusMods.retry(game.id, pageName ?? game.name);
    }
  }
</script>

{#if nexusMods.isResolving || (nexusMods.isLoading && nexusMods.mods.length === 0)}
  <!-- Loading skeleton -->
  <div class="space-y-3 animate-fade-in-up">
    {#each Array(5) as _}
      <div class="flex gap-4 p-4 rounded-lg border border-border/50 bg-card/50">
        <Skeleton class="h-16 w-16 rounded-md shrink-0" />
        <div class="flex-1 space-y-2">
          <Skeleton class="h-4 w-3/4" />
          <Skeleton class="h-3 w-full" />
          <Skeleton class="h-3 w-1/2" />
        </div>
      </div>
    {/each}
  </div>
{:else if nexusMods.error}
  <ErrorCard message={nexusMods.error} onRetry={handleRetry} />
{:else if nexusMods.resolutionFailed}
  <StateCard
    icon={CircleSlash}
    title="Game not found on NexusMods"
    description="This game wasn't found on NexusMods. It may be listed under a different name."
    action={{
      label: 'Search on NexusMods',
      onclick: () => {
        const name = pageName ?? game?.name ?? '';
        window.api.openExternal(`https://www.nexusmods.com/search/?gsearch=${encodeURIComponent(name)}&gsearchtype=mods`);
      },
      icon: ExternalLink,
    }}
  />
{:else if nexusMods.mods.length === 0 && !nexusMods.isLoading}
  <StateCard
    icon={CircleSlash}
    title="No mods found"
    description="No mods matched your search. Try a different search term."
  />
{:else}
  <div class="space-y-3 animate-fade-in-up">
    {#each nexusMods.mods as mod (mod.uid)}
      <ModCard {mod} onclick={() => openModDetail(mod)} />
    {/each}

    {#if nexusMods.hasMore}
      <div class="flex justify-center pt-2">
        <Button
          variant="outline"
          size="sm"
          onclick={() => nexusMods.loadMore()}
          disabled={nexusMods.isLoadingMore}
        >
          {#if nexusMods.isLoadingMore}
            <Loader2 class="size-4 mr-2 animate-spin" />
            Loading...
          {:else}
            Load more
          {/if}
        </Button>
      </div>
    {/if}
  </div>
{/if}

<!-- Mod Detail Dialog -->
{#if selectedMod && nexusMods.domainName}
  <ModDetailDialog
    mod={selectedMod}
    domainName={nexusMods.domainName}
    bind:open={detailDialogOpen}
  />
{/if}
