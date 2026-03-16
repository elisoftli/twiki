<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { TweaksSection } from '$lib/components/domain/tweak/tweaks-section';
  import { TweaksLoadingSkeleton } from '$lib/components/domain/tweak/tweaks-loading-skeleton';
  import { NexusModsSection } from '$lib/components/domain/nexusmods/nexusmods-section';
  import { useNexusMods } from '$lib/hooks';
  import X from '@lucide/svelte/icons/x';
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
  import Check from '@lucide/svelte/icons/check';
  import { onDestroy } from 'svelte';
  import { inputRouter } from '$lib/gamepad';
  import type { TweakGroup, Tweak } from '@twiki/shared';
  import type { AppliedTweak, AgentStatus } from '../../../../../../../main/interfaces/tweak-agent.interface';
  import type { TweakMetadata } from '../../../../../../../main/services/tweak/tweak-metadata.service';
  import type { Game } from '../../../../../../../main/interfaces/game-library.interface';
  import type { NexusModsSortField } from '../../../../../../../main/interfaces/nexusmods.interface';

  interface Props {
    game: Game | null;
    pageName: string | null;
    // TweaksSection props
    isLoading?: boolean;
    error?: string | null;
    tweakGroups: TweakGroup[];
    appliedTweaks: Map<string, AppliedTweak>;
    tweakMetadata: Map<string, TweakMetadata>;
    agentStatus: AgentStatus;
    runningTweakId: string | null;
    revertingTweakId: string | null;
    focusedGroupTitle?: string | null;
    onFocusHandled?: () => void;
    onAutoTweak: (groupTitle: string, tweak: Tweak) => void;
    onRevert: (groupTitle: string, tweak: Tweak) => void;
    onInternalLinkClick: (url: string, linkText: string) => void;
    onFileClick?: (filename: string) => void;
    onRetry?: () => void;
    onOpenPCGWPage?: () => void;
    autoExpand?: boolean;
    activeTab?: 'pcgw' | 'nexusmods';
  }

  let {
    game,
    pageName,
    isLoading = false,
    error = null,
    tweakGroups,
    appliedTweaks,
    tweakMetadata,
    agentStatus,
    runningTweakId,
    revertingTweakId,
    focusedGroupTitle,
    onFocusHandled,
    onAutoTweak,
    onRevert,
    onInternalLinkClick,
    onFileClick,
    onRetry,
    onOpenPCGWPage,
    autoExpand = false,
    activeTab = $bindable<'pcgw' | 'nexusmods'>('pcgw'),
  }: Props = $props();

  // Shared search state
  let searchTerm = $state('');

  // NexusMods hook
  const nexusMods = useNexusMods();

  // Sort options for NexusMods
  const sortOptions: { value: NexusModsSortField; label: string }[] = [
    { value: 'downloads', label: 'Downloads' },
    { value: 'endorsements', label: 'Endorsements' },
    { value: 'updatedAt', label: 'Last Updated' },
    { value: 'name', label: 'Name' },
  ];

  // Computed
  const isNexusModsTab = $derived(activeTab === 'nexusmods');
  const hasTweaks = $derived(!isLoading && !error && tweakGroups.length > 0);
  const activeSortLabel = $derived(
    nexusMods.searchTerm?.trim()
      ? 'Relevance'
      : sortOptions.find((o) => o.value === nexusMods.sortField)?.label ?? 'Downloads'
  );

  // Handle tab change
  function handleTabChange(value: string): void {
    activeTab = value as 'pcgw' | 'nexusmods';

    // Lazy-init NexusMods when tab is first clicked
    if (value === 'nexusmods' && !nexusMods.initialized && game) {
      nexusMods.init(game.id, game.name ?? pageName, game.nexusModsDomainName);
    }
  }

  // Sync search term to NexusMods hook when on NexusMods tab
  $effect(() => {
    if (isNexusModsTab) {
      nexusMods.setSearchTerm(searchTerm);
    }
  });

  function clearSearch(): void {
    searchTerm = '';
  }

  function handleSortChange(value: NexusModsSortField): void {
    nexusMods.setSortField(value);
  }

  // Register LB/RB tab switching for gamepad
  inputRouter.registerTabSwitcher({
    next: () => handleTabChange('nexusmods'),
    prev: () => handleTabChange('pcgw'),
  });

  onDestroy(() => {
    inputRouter.unregisterTabSwitcher();
  });
</script>

<Tabs.Root value={activeTab} onValueChange={handleTabChange} activationMode="manual">
  <div class="space-y-4">
    <!-- Tabs + Sort + Search Row -->
    <div class="flex items-center gap-3" data-gp-tabs-row>
      <Tabs.List class="bg-card border border-border rounded-lg p-1 shrink-0">
        <Tabs.Trigger
          value="pcgw"
          class="rounded-md px-3 py-1 text-sm font-medium transition-colors bg-transparent shadow-none text-muted-foreground hover:text-foreground data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground"
        >
          PCGamingWiki
        </Tabs.Trigger>
        <Tabs.Trigger
          value="nexusmods"
          class="rounded-md px-3 py-1 text-sm font-medium transition-colors bg-transparent shadow-none text-muted-foreground hover:text-foreground data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground"
        >
          NexusMods
        </Tabs.Trigger>
      </Tabs.List>

      <div class="flex items-center gap-2 ml-auto">
        {#if isNexusModsTab}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="outline"
                  size="icon"
                  class="size-10"
                  title="Sort by: {activeSortLabel}"
                  disabled={!!nexusMods.searchTerm?.trim()}
                >
                  <ArrowUpDown class="size-4" />
                </Button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              {#each sortOptions as option}
                <DropdownMenu.Item
                  onclick={() => handleSortChange(option.value)}
                  class="justify-between"
                >
                  {option.label}
                  {#if nexusMods.sortField === option.value && !nexusMods.searchTerm?.trim()}
                    <Check class="size-4" />
                  {/if}
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}

        {#if hasTweaks || isNexusModsTab}
          <div class="relative">
            <Input
              type="text"
              placeholder={isNexusModsTab ? 'Search mods...' : 'Search tweaks...'}
              class="w-48 pr-8"
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
        {/if}
      </div>
    </div>

    <!-- Tab Content -->
    <Tabs.Content value="pcgw">
      {#if isLoading}
        <TweaksLoadingSkeleton />
      {:else}
        <TweaksSection
          {error}
          {pageName}
          {searchTerm}
          {tweakGroups}
          {appliedTweaks}
          {tweakMetadata}
          {agentStatus}
          {runningTweakId}
          {revertingTweakId}
          {focusedGroupTitle}
          {onFocusHandled}
          {onAutoTweak}
          {onRevert}
          {onInternalLinkClick}
          {onFileClick}
          {onRetry}
          {onOpenPCGWPage}
          {autoExpand}
        />
      {/if}
    </Tabs.Content>

    <Tabs.Content value="nexusmods">
      <NexusModsSection
        {game}
        {pageName}
        {nexusMods}
      />
    </Tabs.Content>
  </div>
</Tabs.Root>
