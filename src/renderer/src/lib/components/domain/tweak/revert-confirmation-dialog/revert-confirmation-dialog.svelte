<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import FileText from '@lucide/svelte/icons/file-text';
  import { formatRelativeTime } from '$lib/utils/format.utils';
  import type { PreRevertCheckResult } from '../../../../../../../main/interfaces/tweak-agent.interface';

  interface Props {
    /** Whether the dialog is open */
    isOpen: boolean;
    /** Title of the tweak being reverted */
    tweakTitle: string;
    /** Result of pre-revert conflict check */
    preCheck: PreRevertCheckResult;
    /** Called when user confirms the revert */
    onConfirm: (useFallback: boolean) => void;
    /** Called when user cancels the revert */
    onCancel: () => void;
  }

  let { isOpen, tweakTitle, preCheck, onConfirm, onCancel }: Props = $props();

  // Determine dialog state based on preCheck
  type DialogState = 'warning' | 'blocked' | 'error';

  // Compute the dialog state
  function computeDialogState(): DialogState {
    // Error state: file deleted or moved
    const hasFileError = preCheck.fileConflicts.some(
      (conflict) => conflict.conflictType === 'file_deleted' || conflict.conflictType === 'file_moved'
    );
    if (hasFileError) return 'error';

    // Blocked state: canProceed is false
    if (!preCheck.canProceed) return 'blocked';

    // Warning state: canProceed is true but has conflicts
    return 'warning';
  }

  let dialogState = $derived(computeDialogState());

  // Get all conflicting tweak names for the fallback warning
  let conflictingTweakNames = $derived(
    Array.from(
      preCheck.fileConflicts.reduce((names, conflict) => {
        for (const tweak of conflict.otherTweaks) {
          names.add(tweak.title);
        }
        return names;
      }, new Set<string>())
    )
  );

  // Get title based on state
  let dialogTitle = $derived(
    dialogState === 'warning'
      ? `Revert "${tweakTitle}"`
      : dialogState === 'blocked'
        ? `Revert "${tweakTitle}" - Action Required`
        : `Revert Error`
  );

  // Get styling based on state
  let stateStyles = $derived(
    dialogState === 'warning'
      ? {
          bgClass: 'bg-muted/50',
          borderClass: 'border-border',
        }
      : {
          bgClass: 'bg-red-500/10',
          borderClass: 'border-red-500/30',
        }
  );

  function handleDialogOpenChange(open: boolean) {
    if (!open) {
      onCancel();
    }
  }

  function handleConfirm() {
    onConfirm(false);
  }

  function handleUseFallback() {
    onConfirm(true);
  }

  function handleClose() {
    onCancel();
  }

  // Get the error message for file errors
  function getFileErrorMessage(): string {
    const deletedFiles = preCheck.fileConflicts.filter((c) => c.conflictType === 'file_deleted');
    const movedFiles = preCheck.fileConflicts.filter((c) => c.conflictType === 'file_moved');

    const messages: string[] = [];
    if (deletedFiles.length > 0) {
      messages.push(`${deletedFiles.length} file(s) have been deleted`);
    }
    if (movedFiles.length > 0) {
      messages.push(`${movedFiles.length} file(s) have been moved`);
    }
    return messages.join(' and ');
  }

  // Format file path to show meaningful context
  function formatFilePath(fullPath: string): { display: string; tooltip: string } {
    const segments = fullPath.split(/[/\\]/);
    const fileName = segments.pop() || '';

    // Show last 2 parent directories + filename for context
    const parentSegments = segments.slice(-2);
    const display = parentSegments.length > 0
      ? `...${parentSegments.join('\\')}\\${fileName}`
      : fileName;

    return { display, tooltip: fullPath };
  }
</script>

<Dialog.Root open={isOpen} onOpenChange={handleDialogOpenChange}>
  <Dialog.Content class="max-w-xl max-h-[80vh] flex flex-col z-[100]" overlayClass="z-[99]" wrapperClass="z-[100]">
    <Dialog.Header>
      <Dialog.Title>
        {dialogTitle}
      </Dialog.Title>
    </Dialog.Header>

    <div class="space-y-4 flex-1 overflow-y-auto overflow-x-hidden min-h-0">
      <!-- Main message -->
      {#if dialogState === 'warning'}
        <p class="text-sm text-muted-foreground">
          Other tweaks have modified some of the same files:
        </p>
      {:else if dialogState === 'blocked'}
        <p class="text-sm text-muted-foreground">
          {preCheck.blockedReason || 'Some changes were overwritten by another tweak and cannot be surgically reverted.'}
        </p>
      {:else if dialogState === 'error'}
        <p class="text-sm text-muted-foreground">
          {getFileErrorMessage()}. The original files cannot be restored.
        </p>
      {/if}

      <!-- File conflicts list -->
      {#if preCheck.fileConflicts.length > 0}
        <div class="rounded-lg border {stateStyles.borderClass} overflow-hidden">
          {#each preCheck.fileConflicts as conflict, index}
            {@const pathInfo = formatFilePath(conflict.filePath)}
            <div
              class="p-3 {index > 0 ? 'border-t border-border/50' : ''}"
              style="animation: slideIn 0.2s ease-out {index * 50}ms both;"
            >
              <div class="flex items-start gap-2.5">
                <FileText class="size-4 text-muted-foreground shrink-0 mt-0.5" />
                <div class="flex-1 min-w-0 overflow-hidden">
                  <div class="flex items-center gap-2">
                    <span
                      class="font-mono text-sm truncate"
                      title={pathInfo.tooltip}
                    >
                      {pathInfo.display}
                    </span>
                    {#if conflict.conflictType === 'file_deleted'}
                      <span class="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">deleted</span>
                    {:else if conflict.conflictType === 'file_moved'}
                      <span class="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">moved</span>
                    {/if}
                  </div>
                  {#if conflict.otherTweaks.length > 0}
                    <div class="mt-2.5 space-y-2 pl-4 border-l-2 border-muted">
                      {#each conflict.otherTweaks as tweak}
                        <div class="text-xs">
                          <p class="text-muted-foreground">Also modified by:</p>
                          <p class="font-medium text-foreground mt-0.5">"{tweak.title}"</p>
                          <p class="text-muted-foreground/60 mt-0.5">
                            {formatRelativeTime(tweak.appliedAt)}
                          </p>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Blocked operations list -->
      {#if preCheck.blockedOperations.length > 0}
        <div class="rounded-lg border p-3 space-y-2 {stateStyles.bgClass} {stateStyles.borderClass}">
          <p class="text-sm font-medium">Blocked operations:</p>
          {#each preCheck.blockedOperations as operation}
            <div class="text-sm break-words">
              <span class="text-muted-foreground">{operation.description}:</span>
              <span class="text-red-400 ml-1">{operation.reason}</span>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Success callout for warning state - prominent reassurance -->
      {#if dialogState === 'warning'}
        <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <div class="flex items-start gap-2.5">
            <CircleCheck class="size-4 text-emerald-400 shrink-0 mt-0.5" />
            <div class="text-sm">
              <p class="text-emerald-300 font-medium">Safe to proceed</p>
              <p class="text-emerald-400/80 mt-0.5">
                Your changes are independent and can be reverted without affecting these other tweaks.
              </p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Fallback warning for blocked state - more prominent placement -->
      {#if dialogState === 'blocked' && conflictingTweakNames.length > 0}
        <div class="rounded-lg border-2 border-amber-500/40 bg-amber-500/10 p-3">
          <div class="flex items-start gap-2.5">
            <TriangleAlert class="size-4 text-amber-400 shrink-0 mt-0.5" />
            <div class="text-sm">
              <p class="text-amber-300 font-medium">Backup restore has side effects</p>
              <p class="text-amber-400/80 mt-1">
                This will also undo changes made by:
              </p>
              <ul class="mt-1.5 space-y-0.5">
                {#each conflictingTweakNames as name}
                  <li class="text-amber-300 font-medium flex items-center gap-1.5">
                    <span class="w-1 h-1 rounded-full bg-amber-400"></span>
                    {name}
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <Dialog.Footer class="mt-2">
      {#if dialogState === 'warning'}
        <Button variant="outline" onclick={handleClose}>Cancel</Button>
        <Button onclick={handleConfirm}>
          Revert Changes
        </Button>
      {:else if dialogState === 'blocked'}
        <Button variant="outline" onclick={handleClose}>Cancel</Button>
        <Button variant="destructive" onclick={handleUseFallback}>
          Use Backup Instead
        </Button>
      {:else if dialogState === 'error'}
        <Button onclick={handleClose}>OK</Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
