<script lang="ts">
  import * as RadioGroup from '$lib/components/ui/radio-group';
  import * as Alert from '$lib/components/ui/alert';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import { logger } from '$lib/utils/logger.utils';
  import type { PcgwSearchResult } from '../../../../../../../preload';

  interface Props {
    initialQuery?: string;
    currentPageId?: number;
    onSelect: (result: PcgwSearchResult | null) => void;
    disabled?: boolean;
  }

  let { initialQuery = '', currentPageId, onSelect, disabled = false }: Props = $props();

  // Internal state
  let query = $state('');
  let selectedMatch = $state<string>('');
  let pcgwResults = $state<PcgwSearchResult[]>([]);
  let searchPerformed = $state(false);
  let isSearching = $state(false);
  let searchError = $state<string | null>(null);

  // Debounce timer
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Derived: selected result object
  const selectedResult = $derived(
    pcgwResults.find((r) => r.pageId.toString() === selectedMatch) ?? null
  );

  // When selection changes, notify parent
  $effect(() => {
    const result = selectedResult;
    onSelect(result);
  });

  // Sync query when initialQuery prop changes (including initial mount)
  $effect(() => {
    if (initialQuery) {
      query = initialQuery;
    }
  });

  // Debounced search when query changes
  $effect(() => {
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
      }
      isSearching = true;
      searchDebounceTimer = setTimeout(() => {
        searchPcgw(trimmed);
      }, 1000);
    }

    return () => {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
      }
    };
  });

  async function searchPcgw(searchQuery: string): Promise<void> {
    isSearching = true;
    searchPerformed = false;
    searchError = null;

    try {
      const results = await window.api.library.searchPcgw(searchQuery);
      pcgwResults = results;
      searchPerformed = true;

      // Auto-select first result if available
      if (results.length > 0) {
        selectedMatch = results[0].pageId.toString();
      } else {
        selectedMatch = '';
      }
    } catch (err) {
      logger.error('Failed to search PCGW:', err);
      searchError = 'Failed to search PCGamingWiki';
      pcgwResults = [];
      searchPerformed = true;
    } finally {
      isSearching = false;
    }
  }
</script>

<div class="space-y-3">
  <!-- Search Input -->
  <div>
    <Label for="pcgw-search" class="block mb-2">Game Name</Label>
    <Input
      id="pcgw-search"
      type="text"
      placeholder="Search PCGamingWiki..."
      bind:value={query}
      class="h-9"
      disabled={disabled}
    />
  </div>

  <!-- Results Section -->
  <div class="space-y-1">
    <div class="flex items-center justify-between">
      <Label class="block mb-2">PCGamingWiki Match</Label>
      {#if isSearching}
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 class="size-3 animate-spin" />
          Searching...
        </div>
      {/if}
    </div>

    {#if searchPerformed && pcgwResults.length === 0 && !isSearching}
      <Alert.Root variant="destructive" class="py-3">
        <CircleAlert class="size-4" />
        <Alert.Description>No matches found. Try a different game name.</Alert.Description>
      </Alert.Root>
    {:else if pcgwResults.length > 0}
      <RadioGroup.Root bind:value={selectedMatch} class="gap-2 max-h-56 overflow-y-auto pr-1" disabled={disabled}>
        {#each pcgwResults as result (result.pageId)}
          <label
            class="flex items-center gap-3 rounded-md border border-input bg-card/50 p-3 cursor-pointer transition-colors hover:bg-accent/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
          >
            <RadioGroup.Item value={result.pageId.toString()} />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{result.title}</p>
            </div>
            {#if currentPageId != null && result.pageId === currentPageId}
              <span class="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">Current</span>
            {/if}
          </label>
        {/each}
      </RadioGroup.Root>

      <!-- Poster Preview -->
      {#if selectedResult}
        <div class="flex items-center gap-3 pt-2">
          <div class="size-16 shrink-0 overflow-hidden rounded-md bg-muted flex items-center justify-center">
            {#if selectedResult.posterUrl}
              <img
                src={selectedResult.posterUrl}
                alt={selectedResult.title}
                class="h-full w-full object-cover"
              />
            {:else}
              <svg class="size-8 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            {/if}
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">Selected: {selectedResult.title}</p>
          </div>
        </div>
      {/if}
    {:else if !searchPerformed && !isSearching}
      <p class="text-sm text-muted-foreground">
        Enter a game name to search PCGamingWiki.
      </p>
    {/if}

    <!-- Search error -->
    {#if searchError}
      <Alert.Root variant="destructive" class="py-3">
        <CircleAlert class="size-4" />
        <Alert.Description>{searchError}</Alert.Description>
      </Alert.Root>
    {/if}
  </div>
</div>
