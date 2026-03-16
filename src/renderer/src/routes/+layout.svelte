<script lang="ts">
  import '../main.css';
  import { onMount, onDestroy, setContext } from 'svelte';
  import { page } from '$app/stores';
  import {
    settingsStore,
    tweakDialogStore,
    updaterStore,
    serviceStatusStore,
    authStore,
    nexusModsDownloadDialogStore,
    gamepadStore,
  } from '$lib/stores';
  import GamepadFocusRing from '$lib/gamepad/GamepadFocusRing.svelte';
  import type { NexusModsDownloadReason } from '$lib/stores/nexusmods-download-dialog.store.svelte';
  import type { Settings } from '../../../main/interfaces';
  import { SidebarInset, SidebarProvider } from '$lib/components/ui/sidebar';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { AppSidebar } from '$lib/components/domain/app/app-sidebar';
  import { UserInputDialog } from '$lib/components/domain/user-input/user-input-dialog';
  import { ApplyTweakDialog } from '$lib/components/domain/tweak/apply-tweak-dialog';
  import { TextEditorDialog } from '$lib/components/domain/user-input/text-editor-dialog';
  import { RevertConfirmationDialog } from '$lib/components/domain/tweak/revert-confirmation-dialog';
  import { PreApprovalDialog } from '$lib/components/domain/common/pre-approval-dialog';
  import { DownloadBrowserInfoDialog } from '$lib/components/domain/common/download-browser-info-dialog';
  import { AuthDialog } from '$lib/components/domain/auth/auth-dialog';
  import { NexusModsDownloadDialog } from '$lib/components/domain/nexusmods/nexusmods-download-dialog';
  import { Toaster } from '$lib/components/ui/sonner';
  import { getToolArgsUpdater } from '$lib/constants/tool-args.constants';
  import { logger } from '$lib/utils/logger.utils';

  const { children } = $props();

  const currentPath = $derived($page.url.pathname);

  // Theme state
  let currentTheme = $state('nature');

  function handleThemeChange(theme: string) {
    currentTheme = theme;
    window.api.updateSettings({ theme });
  }

  // User input dialog state (for IPC requests from main process)
  let userInputRequest = $state<{
    requestId: string;
    title: string;
    message: string;
    options: string[];
  } | null>(null);

  let userInputDialogOpen = $derived(userInputRequest !== null);

  function handleUserInputSubmit(value: string) {
    if (userInputRequest) {
      window.api.agent.respondToUserInput(userInputRequest.requestId, value, false);
      userInputRequest = null;
    }
  }

  function handleUserInputCancel() {
    if (userInputRequest) {
      window.api.agent.respondToUserInput(userInputRequest.requestId, '', true);
      userInputRequest = null;
    }
  }

  // Listen for user input requests from main process
  window.api.agent.onUserInputRequest((request) => {
    userInputRequest = {
      requestId: request.requestId,
      title: request.title,
      message: request.message,
      options: request.options ?? []
    };
  });

  window.api.onSettingsUpdated((updatedSettings: Settings) => {
    settingsStore.set(updatedSettings);
    if (updatedSettings.theme) {
      currentTheme = updatedSettings.theme;
    }
  });

  // Tweak dialog handlers
  function handleTweakDialogClose() {
    tweakDialogStore.close();
    tweakDialogStore.reset();
  }

  async function handleTweakDialogRevert() {
    // Perform the revert (may show confirmation dialog if conflicts detected)
    const result = await tweakDialogStore.revert();

    if (result.success) {
      // Close and reset the dialog after successful revert
      handleTweakDialogClose();
    } else if (result.message !== 'Confirmation required') {
      // Log error but keep dialog open so user can see the issue
      // (Don't log when confirmation dialog is shown)
      logger.error('Revert failed:', result.message);
    }
  }

  async function handleRevertConfirm(useFallback: boolean) {
    await tweakDialogStore.confirmRevertAction(useFallback);
    // Close the apply tweak dialog after successful revert
    handleTweakDialogClose();
  }

  function handleRevertCancel() {
    tweakDialogStore.cancelRevertAction();
  }

  function openPath(path: string) {
    window.api.openPath(path);
  }

  /**
   * Handles content changes in tool operations (e.g., user edits).
   * Builds modified args and updates the store so they're passed on approval.
   */
  function handleOperationContentChange(toolId: string, operationIndex: number, content: string) {
    const tool = tweakDialogStore.tools.find(t => t.toolId === toolId);
    if (!tool) return;

    const updater = getToolArgsUpdater(tool.toolName);
    if (!updater) return;

    // Use existing modifications as base (to preserve other operation edits),
    // or clone from original args if no modifications exist yet
    const existingMods = tweakDialogStore.getToolModifications(toolId);
    const modifiedArgs = existingMods
      ? JSON.parse(JSON.stringify(existingMods))
      : JSON.parse(JSON.stringify(tool.args));

    updater(modifiedArgs, operationIndex, content);
    tweakDialogStore.updateToolModifications(toolId, modifiedArgs);
  }

  // Text editor dialog state
  let textEditorOpen = $state(false);
  let textEditorFilePath = $state('');

  /**
   * Opens a config file - either in the built-in editor (if setting enabled and it's a file)
   * or in the external default application.
   * @param path The file path to open
   * @param pathType Optional hint about the path type ('file', 'directory', 'registry')
   */
  function openConfigFile(path: string, pathType?: 'file' | 'directory' | 'registry') {
    // Only use built-in editor for files when setting is enabled
    if (settingsStore.value?.useBuiltInEditor && pathType === 'file') {
      textEditorFilePath = path;
      textEditorOpen = true;
    } else {
      window.api.openPath(path);
    }
  }

  function handleTextEditorClose() {
    textEditorOpen = false;
    textEditorFilePath = '';
  }

  // Download browser info dialog state (IPC-triggered from main process)
  let downloadBrowserInfoRequest = $state<{ requestId: string } | null>(null);
  let downloadBrowserDontShowAgain = $state(false);

  // Listen for download browser info requests from main process
  window.api.downloadBrowser.onShowInfoDialog((data) => {
    downloadBrowserInfoRequest = data;
  });

  function handleDownloadBrowserAcknowledge() {
    if (downloadBrowserInfoRequest) {
      window.api.downloadBrowser.acknowledgeInfoDialog(
        downloadBrowserInfoRequest.requestId,
        downloadBrowserDontShowAgain
      );
      downloadBrowserInfoRequest = null;
      downloadBrowserDontShowAgain = false;
    }
  }

  function handleDownloadBrowserDontShowAgainChange(checked: boolean) {
    downloadBrowserDontShowAgain = checked;
  }

  // NexusMods auth dialog listener (IPC-triggered from main process resolver)
  window.api.nexusmods.onShowAuthDialog((data) => {
    nexusModsDownloadDialogStore.show(
      data.reason as NexusModsDownloadReason,
      data.modPageUrl,
      () => { // onRetry
        window.api.nexusmods.respondToAuthDialog(data.requestId, 'retry');
      },
      () => { // onBrowser
        window.api.nexusmods.respondToAuthDialog(data.requestId, 'browser');
      },
      () => { // onClose
        window.api.nexusmods.respondToAuthDialog(data.requestId, 'close');
      }
    );
  });

  // Provide openConfigFile to child components via context
  setContext('openConfigFile', openConfigFile);

  onMount(async () => {
    // Initialize gamepad support
    gamepadStore.init();

    // Initialize auth store first (other stores may depend on auth state)
    await authStore.init();

    // Initialize tweak dialog store
    await tweakDialogStore.init();

    // Initialize updater store
    await updaterStore.init();

    // Initialize service status store
    await serviceStatusStore.init();

    const loadedSettings = await window.api.getSettings();
    settingsStore.set(loadedSettings);
    if (loadedSettings.theme) {
      currentTheme = loadedSettings.theme;
    }
  });

  onDestroy(() => {
    gamepadStore.dispose();
    authStore.cleanup();
    tweakDialogStore.cleanup();
    updaterStore.cleanup();
    serviceStatusStore.cleanup();
    window.api.nexusmods.removeAllListeners();
  });
</script>

<Tooltip.Provider>
  <div id="layout" class="{currentTheme}">
    {#if settingsStore.value}
      <SidebarProvider>
        <AppSidebar {currentPath} {currentTheme} onThemeChange={handleThemeChange} />
        <SidebarInset>
          {@render children()}
        </SidebarInset>
      </SidebarProvider>
    {/if}
  </div>

  <!-- User Input Dialog (global, IPC-triggered) -->
  <UserInputDialog
    open={userInputDialogOpen}
    title={userInputRequest?.title ?? ''}
    message={userInputRequest?.message ?? ''}
    options={userInputRequest?.options ?? []}
    onsubmit={handleUserInputSubmit}
    oncancel={handleUserInputCancel}
  />

  <!-- Tweak Dialog (global, managed by tweakDialogStore) -->
  <ApplyTweakDialog
    bind:open={tweakDialogStore.isOpen}
    tweakTitle={tweakDialogStore.title}
    toolCalls={tweakDialogStore.tools}
    agentStatus={tweakDialogStore.agentStatus}
    firstPendingToolId={tweakDialogStore.firstPendingToolId}
    canRevert={tweakDialogStore.canRevert}
    usingUserApiKey={!!settingsStore.value?.autoTweaker?.claudeApiKey}
    globalAutoApproveReadOnly={settingsStore.value?.autoTweaker?.autoApproveReadOnly ?? false}
    onApprove={() => tweakDialogStore.approve()}
    onDecline={() => tweakDialogStore.decline()}
    onClose={handleTweakDialogClose}
    onMinimize={() => tweakDialogStore.minimize()}
    onRevert={handleTweakDialogRevert}
    onOpenPath={openPath}
    onOperationContentChange={handleOperationContentChange}
  />

  <!-- Text Editor Dialog (global, for built-in config file editing) -->
  <TextEditorDialog
  bind:open={textEditorOpen}
  filePath={textEditorFilePath}
  onClose={handleTextEditorClose}
  />

  <!-- Revert Confirmation Dialog (for tweak dialog revert) -->
  {#if tweakDialogStore.revertConfirmation.isOpen && tweakDialogStore.revertConfirmation.preCheck}
    <RevertConfirmationDialog
      isOpen={tweakDialogStore.revertConfirmation.isOpen}
      tweakTitle={tweakDialogStore.title}
      preCheck={tweakDialogStore.revertConfirmation.preCheck}
      onConfirm={handleRevertConfirm}
      onCancel={handleRevertCancel}
    />
  {/if}

  <!-- Pre-Approval Dialog (configuration, shown after user clicks Approve) -->
  {#if tweakDialogStore.configurationRequired.isOpen && tweakDialogStore.configurationRequired.configurationType}
    <PreApprovalDialog
      isOpen={tweakDialogStore.configurationRequired.isOpen}
      toolName={tweakDialogStore.configurationRequired.toolName ?? ''}
      configurationType={tweakDialogStore.configurationRequired.configurationType}
      onConfigured={() => tweakDialogStore.handleConfigurationComplete()}
      onCancel={() => tweakDialogStore.cancelConfiguration()}
    />
  {/if}

  <!-- Download Browser Info Dialog (IPC-triggered from main process) -->
  {#if downloadBrowserInfoRequest}
    <DownloadBrowserInfoDialog
      isOpen={true}
      onAcknowledge={handleDownloadBrowserAcknowledge}
      onDontShowAgainChange={handleDownloadBrowserDontShowAgainChange}
    />
  {/if}

  <!-- Auth Dialog (global, managed by authStore) -->
  <AuthDialog />

  <!-- NexusMods Download Dialog (global, managed by store) -->
  <NexusModsDownloadDialog />

  <!-- Gamepad focus ring overlay -->
  {#if gamepadStore.isControllerMode}
    <GamepadFocusRing />
  {/if}

  <!-- Toast notifications -->
  <Toaster />
</Tooltip.Provider>
  