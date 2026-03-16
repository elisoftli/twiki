<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy, getContext } from 'svelte';

  // Hooks
  import {
    useGameData,
    useAppliedTweaks,
  } from '$lib/hooks';

  // Stores
  import { tweakDialogStore, lastVisitedGameStore, settingsStore } from '$lib/stores';
  import { inputRouter } from '$lib/gamepad';

  // Components
  import { GameHeroHeader } from '$lib/components/domain/game/game-hero-header';
  import { GameSidebar } from '$lib/components/domain/game/game-sidebar';
  import { GameContentTabs } from '$lib/components/domain/game/game-content-tabs';
  import { RevertConfirmationDialog } from '$lib/components/domain/tweak/revert-confirmation-dialog';
  import { LinkPcgwDialog } from '$lib/components/domain/game/link-pcgw-dialog';
  import { DeleteGameDialog } from '$lib/components/domain/game/delete-game-dialog';
  import { ConfirmationDialog } from '$lib/components/domain/common/confirmation-dialog';

  // Types
  import { GameLauncher, type Game } from '../../../../../main/interfaces/game-library.interface';
  import type { AppliedTweak, PreRevertCheckResult } from '../../../../../main/interfaces/tweak-agent.interface';
  import type { Tweak } from '@twiki/shared';

  // Constants
  import { SCROLL_RANGE, HIGHLIGHT_TIMEOUT_MS } from '$lib/constants/animations.constants';
  import { resolveGlossaryAnchor } from '$lib/constants/glossary.constants';

  // Utilities
  import {
    TWIKI_PATH_PROTOCOL,
    resolveTwikiPath,
    inferPathType,
    findConfigPathByFilename,
    getContainingDirectory,
    resolveLinkTextToPath,
  } from '$lib/utils/path-resolution.utils';
  import { toast } from 'svelte-sonner';
  import { BINARY_FILE_EXTENSIONS } from '../../../../../main/constants';

  // Route params - id is guaranteed to exist in [id] route
  const gameId = $page.params.id as string;

  // Initialize hooks
  const gameData = useGameData(gameId);
  const appliedTweaks = useAppliedTweaks(gameId);

  // Scroll tracking for smooth header shrinking
  let scrollY = $state(0);
  const scrollProgress = $derived(Math.min(1, Math.max(0, scrollY / SCROLL_RANGE)));

  // UI state for tracking which tweak is currently being reverted (by hash)
  let revertingTweakId = $state<string | null>(null);

  // Revert confirmation dialog state
  let revertDialog = $state<{
    isOpen: boolean;
    tweak: AppliedTweak | null;
    preCheck: PreRevertCheckResult | null;
  }>({ isOpen: false, tweak: null, preCheck: null });

  // Track running tweak from the global store (for this game only)
  const runningTweakId = $derived(
    tweakDialogStore.isRunning && tweakDialogStore.gameId === gameId
      ? tweakDialogStore.hash
      : null
  );

  // Highlighted external resource anchor (for scrolling/highlighting sidebar)
  let highlightedAnchor = $state<string | null>(null);
  let highlightTimeout: ReturnType<typeof setTimeout> | null = null;

  // Highlighted install info card (for config file location links)
  let highlightedInstallInfo = $state(false);
  let installInfoHighlightTimeout: ReturnType<typeof setTimeout> | null = null;

  // Focused group title (for expanding and scrolling to a tweak group from a link)
  let focusedGroupTitle = $state<string | null>(null);
  let focusTimeout: ReturnType<typeof setTimeout> | null = null;

  // Content tabs active tab (bound to GameContentTabs)
  let contentActiveTab = $state<'pcgw' | 'nexusmods'>('pcgw');

  // Link PCGW and delete dialog state
  let linkPcgwDialogOpen = $state(false);
  let deleteDialogOpen = $state(false);

  // Navigation
  function goBack() {
    goto('/');
  }

  // External link helpers
  function openPCGWPage() {
    if (gameData.pageName) {
      window.api.openExternal(`https://www.pcgamingwiki.com/wiki/${encodeURIComponent(gameData.pageName)}`);
    }
  }

  function openGameLauncherGamePage() {
    if (gameData.game?.launcher === GameLauncher.STEAM) {
      window.api.openExternal(`steam://nav/games/details/${gameData.game.launcherId}`);
    } else if (gameData.game?.launcher === GameLauncher.XBOX) {
      window.api.openExternal(`msxbox://game/?productId=${gameData.game.launcherId}`);
    }
  }

  // Link PCGW callback: refresh game and tweak data after successful link
  async function handlePcgwLinked(updatedGame: Game): Promise<void> {
    // Re-load game and tweak data from scratch with the new PCGW page
    await gameData.load();
  }

  // Delete callback: navigate back to library
  function handleDeleted(): void {
    goto('/');
  }

  // Get the openConfigFile function from layout context (for built-in editor support)
  const openConfigFile = getContext<(path: string, pathType?: 'file' | 'directory' | 'registry') => void>('openConfigFile');

  /**
   * Opens a path. For files, uses the built-in editor if enabled in settings.
   * For directories and other paths, delegates to the main process.
   */
  function openPath(path: string, pathType?: 'file' | 'directory' | 'registry') {
    const fileExt = path.split('.').pop()?.toLowerCase();
    if (openConfigFile && !BINARY_FILE_EXTENSIONS.some(binExt => fileExt === binExt)) {
      openConfigFile(path, pathType);
    } else {
      // Fallback if context not available
      window.api.openPath(path);
    }
  }

  function openExternal(url: string) {
    window.api.openExternal(url);
  }

  // Try to open a local path based on link text keywords
  function openPathFromLinkText(linkText: string): boolean {
    const resolved = resolveLinkTextToPath(linkText, gameData.game?.installPath);
    if (resolved) {
      openPath(resolved.path, resolved.pathType);
      return true;
    }
    return false;
  }

  // Handle Glossary:Game_data links by anchor
  function handleGlossaryLink(anchor: string): boolean {
    const resolved = resolveGlossaryAnchor(anchor, {
      installPath: gameData.game?.installPath,
      configPaths: [...gameData.configPaths, ...(gameData.game?.extraConfigPaths ?? [])],
    });

    if (resolved) {
      openPath(resolved.path, resolved.pathType);
      return true;
    }
    return false;
  }

  // Config section anchors that should highlight the install info card
  const CONFIG_SECTION_ANCHORS = [
    'configuration_file(s)_location',
    'configuration_file_location',
    'save_game_data_location',
    'save_game_cloud_syncing',
    'game_data',
  ];

  // Try to highlight the install info card for config section links
  function highlightInstallInfoCard(anchor: string): boolean {
    if (!anchor) return false;

    // Normalize anchor for comparison (decode URL encoding, replace underscores with spaces, lowercase)
    const normalizedAnchor = anchor
      .replace(/\.([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/_/g, ' ')
      .toLowerCase();

    // Check if it matches any config section anchor
    const isConfigSection = CONFIG_SECTION_ANCHORS.some(configAnchor =>
      normalizedAnchor.includes(configAnchor.replace(/_/g, ' '))
    );

    if (isConfigSection) {
      if (installInfoHighlightTimeout) clearTimeout(installInfoHighlightTimeout);
      highlightedInstallInfo = true;
      installInfoHighlightTimeout = setTimeout(() => { highlightedInstallInfo = false; }, HIGHLIGHT_TIMEOUT_MS);
      return true;
    }
    return false;
  }

  // Try to highlight an external resource in the sidebar
  function highlightExternalResource(anchor: string): boolean {
    if (!anchor || !gameData.externalResources) return false;

    const allResources = [
      ...gameData.externalResources.mods,
      ...gameData.externalResources.tools,
      ...gameData.externalResources.patches,
      ...gameData.externalResources.guides
    ];

    if (allResources.some(r => r.sectionAnchor === anchor)) {
      if (highlightTimeout) clearTimeout(highlightTimeout);
      highlightedAnchor = anchor;
      highlightTimeout = setTimeout(() => { highlightedAnchor = null; }, HIGHLIGHT_TIMEOUT_MS);
      return true;
    }
    return false;
  }

  // Try to find and focus a tweak group by its anchor (which matches the group title)
  function focusTweakGroup(anchor: string): boolean {
    if (!anchor || gameData.tweakGroups.length === 0) return false;

    // Normalize anchor for comparison:
    // - MediaWiki encodes special chars as .XX (e.g., .2F for /, .3A for :)
    // - MediaWiki uses underscores for spaces
    const normalizedAnchor = anchor
      .replace(/\.([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/_/g, ' ')
      .toLowerCase();

    // Find a tweak group whose title matches the anchor
    const matchingGroup = gameData.tweakGroups.find(group =>
      group.title.toLowerCase() === normalizedAnchor
    );

    if (matchingGroup) {
      if (focusTimeout) clearTimeout(focusTimeout);
      contentActiveTab = 'pcgw';
      focusedGroupTitle = matchingGroup.title;
      // Clear focus after animation completes
      focusTimeout = setTimeout(() => { focusedGroupTitle = null; }, HIGHLIGHT_TIMEOUT_MS);
      return true;
    }
    return false;
  }

  // Clear focused group (called by TweaksSection after handling)
  function clearFocusedGroup() {
    focusedGroupTitle = null;
  }

  // Main handler for PCGamingWiki links
  function handleInternalLinkClick(url: string, linkText: string) {
    // First, try to match by link text (most specific)
    if (openPathFromLinkText(linkText)) return;

    try {
      const parsedUrl = new URL(url);
      const pathParts = parsedUrl.pathname.split('/');
      const linkPageName = pathParts[pathParts.length - 1];
      const anchor = parsedUrl.hash ? decodeURIComponent(parsedUrl.hash.slice(1)) : '';

      // Check if this is a same-page anchor link (e.g., #HDR from our app)
      // These links have the same origin and pathname as the current page
      const currentUrl = new URL(window.location.href);
      const isSamePageAnchor = parsedUrl.origin === currentUrl.origin &&
                               parsedUrl.pathname === currentUrl.pathname &&
                               anchor;

      if (isSamePageAnchor) {
        // Try to focus a tweak group with this anchor
        if (focusTweakGroup(anchor)) return;
        if (highlightInstallInfoCard(anchor)) return;
        if (highlightExternalResource(anchor)) return;
        // If no match found, do nothing (don't open externally)
        return;
      }

      // Check for Glossary:Game_data links
      if (linkPageName === 'Glossary:Game_data' || linkPageName.startsWith('Glossary%3AGame_data')) {
        if (handleGlossaryLink(anchor)) return;
        openExternal(url);
        return;
      }

      // Check if this links to a different wiki page
      const currentPageNameEncoded = encodeURIComponent(gameData.pageName || '');
      if (linkPageName !== currentPageNameEncoded && linkPageName !== gameData.pageName) {
        openExternal(url);
        return;
      }

      // Same page - try to focus a tweak group first, then config sections, then external resources
      if (focusTweakGroup(anchor)) return;
      if (highlightInstallInfoCard(anchor)) return;
      if (highlightExternalResource(anchor)) return;

      openExternal(url);
    } catch {
      openExternal(url);
    }
  }

  // Game running state — polled every 3 seconds, pauses when window is unfocused
  let isGameRunning = $state(false);
  let isTerminating = $state(false);
  let gameRunningPollInterval: ReturnType<typeof setInterval> | null = null;

  const checkGameRunning = async () => {
    if (!gameData.game?.id) return;
    isGameRunning = await window.api.library.isGameRunning(gameData.game.id);
  };

  const startGameRunningPoll = () => {
    if (gameRunningPollInterval || !gameData.game?.id) return;
    checkGameRunning();
    gameRunningPollInterval = setInterval(checkGameRunning, 3000);
  };

  const stopGameRunningPoll = () => {
    if (gameRunningPollInterval) {
      clearInterval(gameRunningPollInterval);
      gameRunningPollInterval = null;
    }
  };

  function handleLaunchGame() {
    if (gameData.game) {
      window.api.library.launchGame(gameData.game.id);
    }
  }

  async function handleTerminateGame() {
    if (!gameData.game) return;
    isTerminating = true;
    try {
      await window.api.library.terminateGame(gameData.game.id);
      isGameRunning = false;
    } finally {
      isTerminating = false;
    }
  }

  // Game running confirmation state
  let gameRunningConfirmation = $state<{
    isOpen: boolean;
    groupTitle: string;
    tweak: Tweak | null;
  }>({ isOpen: false, groupTitle: '', tweak: null });

  async function startTweak(groupTitle: string, tweak: Tweak) {
    if (!gameData.game) return;

    await tweakDialogStore.startTweak({
      game: gameData.game,
      groupTitle,
      tweak,
      configPaths: [...gameData.configPaths, ...(gameData.game.extraConfigPaths ?? [])],
      gameInfo: gameData.gameInfo ?? undefined,
    });
  }

  // Tweak handlers
  async function handleAutoTweak(groupTitle: string, tweak: Tweak) {
    if (!gameData.game) return;

    if (isGameRunning) {
      gameRunningConfirmation = { isOpen: true, groupTitle, tweak };
      return;
    }

    await startTweak(groupTitle, tweak);
  }

  function handleGameRunningConfirm() {
    const { groupTitle, tweak } = gameRunningConfirmation;
    gameRunningConfirmation = { isOpen: false, groupTitle: '', tweak: null };
    if (tweak) {
      startTweak(groupTitle, tweak);
    }
  }

  function handleGameRunningCancel() {
    gameRunningConfirmation = { isOpen: false, groupTitle: '', tweak: null };
  }

  async function handleRevert(groupTitle: string, tweak: Tweak) {
    const applied = appliedTweaks.appliedTweaks.get(tweak.hash);
    if (!applied) return;

    revertingTweakId = tweak.hash;

    try {
      const result = await appliedTweaks.revert(applied);

      // If confirmation is needed, show the dialog
      if (result.status === 'needs_confirmation' || result.status === 'blocked') {
        revertDialog = {
          isOpen: true,
          tweak: applied,
          preCheck: result.preCheck!,
        };
        revertingTweakId = null;
        return;
      }

      // Success or error already handled by the hook
    } finally {
      if (!revertDialog.isOpen) {
        revertingTweakId = null;
      }
    }
  }

  async function handleConfirmRevert(useFallback: boolean) {
    if (!revertDialog.tweak) return;

    const tweak = revertDialog.tweak;
    revertDialog = { isOpen: false, tweak: null, preCheck: null };
    revertingTweakId = tweak.tweak.hash;

    try {
      await appliedTweaks.confirmRevert(tweak, useFallback);
    } finally {
      revertingTweakId = null;
    }
  }

  function handleCancelRevert() {
    revertDialog = { isOpen: false, tweak: null, preCheck: null };
  }

  // Custom config path handlers
  async function handleAddCustomPath() {
    // Open file/directory picker
    const result = await window.api.library.selectConfigPath();
    if (!result) return; // User cancelled

    // Add the custom config path (pass PCGW config paths for duplicate checking)
    const response = await window.api.library.addCustomConfigPath(
      gameId,
      result.path,
      result.pathType,
      JSON.parse(JSON.stringify(gameData.configPaths))
    );

    if (response.success && response.configPath) {
      // Refresh the game data to show the new path
      await gameData.refreshGame();
      toast.success('Custom config path added');
    } else {
      toast.error(response.error ?? 'Failed to add custom config path');
    }
  }

  async function handleRemoveCustomPath(path: string) {
    const response = await window.api.library.removeCustomConfigPath(gameId, path);

    if (response.success) {
      // Refresh the game data to remove the path from display
      await gameData.refreshGame();
      toast.success('Custom config path removed');
    } else {
      toast.error(response.error ?? 'Failed to remove custom config path');
    }
  }

  async function handleDisableConfigPath(path: string) {
    await window.api.library.disableConfigPath(gameId, path);
    // Refresh the game data to update the disabled paths display
    await gameData.refreshGame();
    toast.success('Config path disabled');
  }

  async function handleEnableConfigPath(path: string) {
    await window.api.library.enableConfigPath(gameId, path);
    // Refresh the game data to update the disabled paths display
    await gameData.refreshGame();
    toast.success('Config path enabled');
  }

  /**
   * Handle clicks on file names or full paths in tweak instructions.
   * - Full paths (from twiki-path:// links): opened directly
   * - Simple filenames (from inline code): matched against configPaths
   */
  async function handleFileClick(pathOrFilename: string) {
    // Handle twiki-path:// protocol (full paths from parsed wiki content)
    if (pathOrFilename.startsWith(TWIKI_PATH_PROTOCOL)) {
      const resolved = resolveTwikiPath(pathOrFilename, gameData.game?.installPath);
      const pathType = inferPathType(pathOrFilename);
      openPath(resolved, pathType);
      return;
    }

    // Simple filename - search in configPaths
    const match = findConfigPathByFilename(pathOrFilename, gameData.configPaths);
    if (match) {
      openPath(match.path, match.pathType);
      return;
    }

    // Fallback: Copy file name to clipboard
    await navigator.clipboard.writeText(pathOrFilename);
    toast.success('Copied to clipboard');
    // Fallback: open the directory containing the first config path
    // if (gameData.configPaths.length > 0) {
    //   const firstPath = gameData.configPaths[0].path;
    //   const containingDir = getContainingDirectory(firstPath);
    //   if (containingDir) {
    //     openPath(containingDir, 'directory');
    //   } else {
    //     openPath(firstPath, gameData.configPaths[0].pathType);
    //   }
    // }
  }

  $effect(() => {
    const mainElement = document.querySelector('main');
    if (!mainElement) return;

    const handleScroll = () => {
      scrollY = mainElement.scrollTop;
    };

    mainElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainElement.removeEventListener('scroll', handleScroll);
  });

  // Update the last visited game store when game data loads
  // $effect(() => {
  //   if (gameData.game && !gameData.isGameLoading) {
  //     lastVisitedGameStore.setGame(gameData.game);
  //   }
  // });

  // Lifecycle
  // Save previous page's scroll position so we can restore it when leaving
  let previousScrollTop = 0;

  onMount(async () => {
    const mainElement = document.querySelector('main');
    if (mainElement) {
      previousScrollTop = mainElement.scrollTop;
      mainElement.scrollTo(0, 0);
    }

    // Set up completion callback - main process now handles persistence,
    // we just need to refresh our local state from storage
    tweakDialogStore.setOnComplete(async ({ gameId: completedGameId }) => {
      // Only refresh if this is the same game
      if (completedGameId !== gameId) return;

      // Reload applied tweaks from storage (main process already saved it)
      await appliedTweaks.load();
    });

    // Set up revert callback to update local state when dialog reverts a tweak
    tweakDialogStore.setOnRevert(({ gameId: revertedGameId, hash: revertedTweakId }) => {
      // Only update if this is the same game
      if (revertedGameId !== gameId) return;

      // Remove from local applied tweaks state (storage already updated by dialog)
      appliedTweaks.removeLocal(revertedTweakId);
    });

    // Load data in parallel
    await Promise.all([
      gameData.load(),
      appliedTweaks.load(),
    ]);

    // Register gamepad back handler for this page
    inputRouter.registerBackHandler(() => { goBack(); });

    // Start polling game running status
    startGameRunningPoll();
    window.addEventListener('focus', startGameRunningPoll);
    window.addEventListener('blur', stopGameRunningPoll);
  });

  onDestroy(() => {
    inputRouter.unregisterBackHandler();
    // Restore previous page's scroll position
    document.querySelector('main')?.scrollTo(0, previousScrollTop);
    // Clear callbacks when leaving this page
    tweakDialogStore.setOnComplete(null);
    tweakDialogStore.setOnRevert(null);
    stopGameRunningPoll();
    window.removeEventListener('focus', startGameRunningPoll);
    window.removeEventListener('blur', stopGameRunningPoll);
    if (highlightTimeout) clearTimeout(highlightTimeout);
    if (focusTimeout) clearTimeout(focusTimeout);
    if (installInfoHighlightTimeout) clearTimeout(installInfoHighlightTimeout);
  });
</script>

<div class="bg-background">
  <GameHeroHeader
    game={gameData.game}
    isLoading={gameData.isGameLoading}
    {isGameRunning}
    {isTerminating}
    onBack={goBack}
    onOpenLauncherPage={openGameLauncherGamePage}
    onOpenPCGWPage={openPCGWPage}
    onLinkPcgw={() => { linkPcgwDialogOpen = true; }}
    onDeleteGame={() => { deleteDialogOpen = true; }}
    onLaunchGame={handleLaunchGame}
    onTerminateGame={handleTerminateGame}
    {scrollProgress}
  />

  <!-- Content Area -->
  <div class="p-8 overflow-hidden">
    <div class="mx-auto max-w-7xl flex flex-col gap-8 lg:flex-row lg:items-start">
      <!-- Main Content -->
      <div class="flex-1 w-0 min-w-0">
        <GameContentTabs
          bind:activeTab={contentActiveTab}
          game={gameData.game}
          pageName={gameData.pageName}
          isLoading={gameData.isTweaksLoading}
          error={gameData.error}
          tweakGroups={gameData.tweakGroups}
          appliedTweaks={appliedTweaks.appliedTweaks}
          tweakMetadata={gameData.tweakMetadata}
          agentStatus={tweakDialogStore.agentStatus}
          {runningTweakId}
          {revertingTweakId}
          {focusedGroupTitle}
          onFocusHandled={clearFocusedGroup}
          onAutoTweak={handleAutoTweak}
          onRevert={handleRevert}
          onInternalLinkClick={handleInternalLinkClick}
          onFileClick={handleFileClick}
          onRetry={() => {
            gameData.load();
            appliedTweaks.load();
          }}
          onOpenPCGWPage={openPCGWPage}
          autoExpand={settingsStore.value?.gamePage?.autoExpandTweaks ?? false}
        />
      </div>

      <GameSidebar
        game={gameData.game}
        configPaths={gameData.configPaths}
        gameInfo={gameData.gameInfo}
        externalResources={gameData.externalResources}
        loading={gameData.isTweaksLoading}
        {highlightedAnchor}
        {highlightedInstallInfo}
        onOpenPath={openPath}
        onOpenExternal={openExternal}
        onInternalLinkClick={handleInternalLinkClick}
        onAddCustomPath={handleAddCustomPath}
        onRemoveCustomPath={handleRemoveCustomPath}
        onDisableConfigPath={handleDisableConfigPath}
        onEnableConfigPath={handleEnableConfigPath}
      />
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

<!-- Link PCGW Dialog -->
{#if gameData.game}
  <LinkPcgwDialog
    bind:open={linkPcgwDialogOpen}
    onOpenChange={(open) => { linkPcgwDialogOpen = open; }}
    game={gameData.game}
    onLinked={handlePcgwLinked}
  />
{/if}

<!-- Delete Game Dialog -->
{#if gameData.game}
  <DeleteGameDialog
    bind:open={deleteDialogOpen}
    onOpenChange={(open) => { deleteDialogOpen = open; }}
    game={gameData.game}
    appliedTweakCount={appliedTweaks.appliedTweaks.size}
    onDeleted={handleDeleted}
  />
{/if}

<!-- Game Running Warning Dialog -->
<ConfirmationDialog
  open={gameRunningConfirmation.isOpen}
  title="Game is currently running"
  description="Tweaking a game while it's running may not take effect until restarted, and could cause issues if the game is actively using the modified files."
  confirmLabel="Tweak Anyway"
  variant="warning"
  onConfirm={handleGameRunningConfirm}
  onCancel={handleGameRunningCancel}
/>
