<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Alert from '$lib/components/ui/alert';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import { PcgwMatcher } from '$lib/components/domain/game/pcgw-matcher';
  import { logger } from '$lib/utils/logger.utils';
  import type { PcgwSearchResult, ImportGameParams } from '../../../../../../../preload';
  import type { Game } from '../../../../../../../main/interfaces/game-library.interface';

  // Error message extraction helper
  // Strips Electron IPC wrapper: "Error invoking remote method 'channel': Error: actual message"
  function getErrorMessage(err: unknown): string {
    let message: string;
    if (err instanceof Error) {
      message = err.message;
    } else if (typeof err === 'string') {
      message = err;
    } else {
      return 'Unknown error';
    }

    // Strip Electron IPC error prefix
    const ipcMatch = message.match(/Error invoking remote method '[^']+': (?:Error: )?(.+)/);
    if (ipcMatch) {
      return ipcMatch[1];
    }

    return message;
  }

  interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImported?: (game: Game) => void;
  }

  let { open = $bindable(), onOpenChange, onImported }: Props = $props();

  // Form state
  let folderPath = $state('');
  let executablePath = $state('');
  let suggestedExecutable = $state<string | null>(null);
  let selectedPcgwResult = $state<PcgwSearchResult | null>(null);

  // The initial query for the PCGW matcher (set when folder is selected)
  let pcgwInitialQuery = $state('');

  // Loading state
  let isSelectingFolder = $state(false);
  let isSelectingExecutable = $state(false);
  let isImporting = $state(false);

  // Error state
  let error = $state<string | null>(null);

  // Derived state
  const hasFolderSelected = $derived(folderPath.length > 0);
  const canImport = $derived(
    hasFolderSelected &&
    executablePath.length > 0 &&
    selectedPcgwResult !== null &&
    !isImporting
  );
  const showExecutableSuggestion = $derived(
    suggestedExecutable !== null && executablePath !== suggestedExecutable
  );

  // Reset form state when dialog closes
  $effect(() => {
    if (!open) {
      folderPath = '';
      executablePath = '';
      suggestedExecutable = null;
      selectedPcgwResult = null;
      pcgwInitialQuery = '';
      error = null;
      isImporting = false;
    }
  });

  async function handleSelectFolder(): Promise<void> {
    isSelectingFolder = true;
    error = null;

    try {
      const result = await window.api.library.selectFolder();
      if (result) {
        folderPath = result.folderPath;
        suggestedExecutable = result.suggestedExecutable;
        // Auto-fill game name from folder name and trigger PCGW search
        const folderName = result.folderPath.split(/[\\/]/).pop() ?? '';
        pcgwInitialQuery = folderName;
      }
    } catch (err) {
      logger.error('Failed to select folder:', err);
      error = 'Failed to open folder picker';
    } finally {
      isSelectingFolder = false;
    }
  }

  async function handleSelectExecutable(): Promise<void> {
    isSelectingExecutable = true;
    error = null;

    try {
      const result = await window.api.library.selectExecutable(folderPath || undefined);
      if (result) {
        executablePath = result;
      }
    } catch (err) {
      logger.error('Failed to select executable:', err);
      error = 'Failed to open file picker';
    } finally {
      isSelectingExecutable = false;
    }
  }

  function handlePcgwSelect(result: PcgwSearchResult | null): void {
    selectedPcgwResult = result;
  }

  async function handleImport(): Promise<void> {
    if (!canImport || !selectedPcgwResult) return;

    isImporting = true;
    error = null;

    try {
      const params: ImportGameParams = {
        installPath: folderPath,
        name: selectedPcgwResult.title,
        executablePath: executablePath,
        pcgwPageId: selectedPcgwResult.pageId,
        posterUrl: selectedPcgwResult.posterUrl,
      };

      const game = await window.api.library.importGame(params);
      onImported?.(game);
      onOpenChange(false);
    } catch (err) {
      logger.error('Failed to import game:', err);
      error = getErrorMessage(err);
    } finally {
      isImporting = false;
    }
  }

  function getFileName(path: string): string {
    return path.split(/[\\/]/).pop() ?? path;
  }
</script>

<Dialog.Root bind:open onOpenChange={onOpenChange}>
  <Dialog.Content class="sm:max-w-lg select-none! max-h-[85vh] flex flex-col" overlayClass="z-[99]" wrapperClass="z-[100]">
    <Dialog.Header>
      <Dialog.Title>Import Game</Dialog.Title>
      <Dialog.Description>
        Add a game from any folder by matching it to PCGamingWiki.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-5 py-2 px-1 -mx-1 overflow-y-auto flex-1 min-h-0">
      <!-- Folder Selection -->
      <div>
        <Label for="folder-path" class="block mb-2">Game Folder</Label>
        <div class="flex items-center gap-2">
          <div
            class="flex items-center gap-2 h-9 flex-1 min-w-0 rounded-md border border-input bg-input/30 px-3 text-sm"
          >
            {#if folderPath}
              <span class="flex-1 truncate text-foreground" title={folderPath}>
                {folderPath}
              </span>
            {:else}
              <span class="flex-1 text-muted-foreground/60">Select a folder...</span>
            {/if}
          </div>
          <Button
            variant="outline"
            size="icon"
            class="size-9 shrink-0"
            onclick={handleSelectFolder}
            disabled={isSelectingFolder}
            title="Browse for game folder"
          >
            {#if isSelectingFolder}
              <Loader2 class="size-4 animate-spin" />
            {:else}
              <FolderOpen class="size-4" />
            {/if}
          </Button>
        </div>
      </div>

      <!-- Fields shown after folder selection -->
      {#if hasFolderSelected}
        <!-- Game Executable -->
        <div>
          <Label for="executable-path" class="block mb-2">Game Executable</Label>
          <div class="flex items-center gap-2">
            <div
              class="flex items-center gap-2 h-9 flex-1 min-w-0 rounded-md border border-input bg-input/30 px-3 text-sm"
            >
              {#if executablePath}
                <span class="flex-1 truncate text-foreground" title={executablePath}>
                  {getFileName(executablePath)}
                </span>
              {:else}
                <span class="flex-1 text-muted-foreground/60">Select an executable...</span>
              {/if}
            </div>
            <Button
              variant="outline"
              size="icon"
              class="size-9 shrink-0"
              onclick={handleSelectExecutable}
              disabled={isSelectingExecutable}
              title="Browse for game executable"
            >
              {#if isSelectingExecutable}
                <Loader2 class="size-4 animate-spin" />
              {:else}
                <FolderOpen class="size-4" />
              {/if}
            </Button>
          </div>
          {#if showExecutableSuggestion}
            <button
              type="button"
              class="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onclick={() => { executablePath = suggestedExecutable!; }}
            >
              <span class="truncate">Detected: <span class="font-medium">{getFileName(suggestedExecutable!)}</span></span>
              <span class="shrink-0 text-primary hover:underline">Use this</span>
            </button>
          {/if}
        </div>

        <!-- PCGW Matcher -->
        <PcgwMatcher
          initialQuery={pcgwInitialQuery}
          onSelect={handlePcgwSelect}
          disabled={isImporting}
        />
      {/if}

      <!-- Error display -->
      {#if error}
        <Alert.Root variant="destructive" class="py-3">
          <CircleAlert class="size-4" />
          <Alert.Description>{error}</Alert.Description>
        </Alert.Root>
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => onOpenChange(false)} disabled={isImporting}>
        Cancel
      </Button>
      <Button onclick={handleImport} disabled={!canImport}>
        {#if isImporting}
          <Loader2 class="mr-2 size-4 animate-spin" />
          Importing...
        {:else}
          Import
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
