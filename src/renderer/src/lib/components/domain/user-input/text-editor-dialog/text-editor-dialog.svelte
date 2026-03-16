<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import CodeMirror from 'svelte-codemirror-editor';
  import { json } from '@codemirror/lang-json';
  import { xml } from '@codemirror/lang-xml';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { Loader2, AlertCircle, ExternalLink } from 'lucide-svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';

  interface Props {
    open: boolean;
    filePath: string;
    onClose: () => void;
    onSaved?: () => void;
  }

  let { open = $bindable(), filePath, onClose, onSaved }: Props = $props();

  let content = $state('');
  let originalContent = $state('');
  let detectedLineEnding = $state<'\r\n' | '\n'>('\r\n');
  let isLoading = $state(false);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let showUnsavedWarning = $state(false);
  let editorContainer = $state<HTMLDivElement | null>(null);

  let hasUnsavedChanges = $derived(content !== originalContent);

  // Get filename from path
  function getFilename(path: string): string {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  }

  // Get language extension based on file extension
  function getLanguageExtension(path: string) {
    const ext = path.toLowerCase().split('.').pop();
    switch (ext) {
      case 'json':
        return [json()];
      case 'xml':
        return [xml()];
      default:
        // Plain text for INI, CFG, TXT, etc.
        return [];
    }
  }

  // Load file when dialog opens
  $effect(() => {
    if (open && filePath) {
      loadFile();
    }
  });

  async function loadFile() {
    isLoading = true;
    error = null;
    content = '';
    originalContent = '';

    try {
      const result = await window.api.file.readText(filePath);
      if (result.success && result.content !== null) {
        // Detect original line ending before normalizing
        detectedLineEnding = result.content.includes('\r\n') ? '\r\n' : '\n';
        // Normalize line endings to match CodeMirror's internal representation
        const normalizedContent = result.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        content = normalizedContent;
        originalContent = normalizedContent;
      } else {
        error = result.error || 'Failed to read file';
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error occurred';
    } finally {
      isLoading = false;
      // Focus the editor container after loading
      requestAnimationFrame(() => {
        editorContainer?.focus();
      });
    }
  }

  async function saveFile() {
    if (!hasUnsavedChanges) return;

    isSaving = true;
    error = null;

    try {
      // Restore original line endings before saving
      const contentToSave = detectedLineEnding === '\r\n' ? content.replace(/\n/g, '\r\n') : content;
      const result = await window.api.file.writeText(filePath, contentToSave);
      if (result.success) {
        originalContent = content;
        onSaved?.();
        closeDialog();
      } else {
        error = result.error || 'Failed to save file';
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error occurred';
    } finally {
      isSaving = false;
    }
  }

  function handleClose() {
    if (hasUnsavedChanges) {
      showUnsavedWarning = true;
    } else {
      closeDialog();
    }
  }

  function closeDialog() {
    showUnsavedWarning = false;
    content = '';
    originalContent = '';
    detectedLineEnding = '\r\n';
    error = null;
    onClose();
  }

  function handleDialogOpenChange(isOpen: boolean) {
    if (!isOpen) {
      handleClose();
    }
  }

  function discardChanges() {
    showUnsavedWarning = false;
    closeDialog();
  }

  function cancelDiscard() {
    showUnsavedWarning = false;
  }

  function openInExternalEditor() {
    window.api.openPath(filePath);
  }
</script>

<Dialog.Root bind:open onOpenChange={handleDialogOpenChange}>
  <Dialog.Content class="max-w-4xl h-[85vh] flex flex-col z-100" overlayClass="z-[99]" wrapperClass="z-[100]">
    <Dialog.Header class="shrink-0">
      <Dialog.Title class="flex items-center gap-2">
        {getFilename(filePath)}
        {#if hasUnsavedChanges}
          <span class="text-xs text-muted-foreground">(unsaved)</span>
        {/if}
        <Tooltip.Root>
          <Tooltip.Trigger>
            <Button
              variant="ghost"
              size="icon"
              class="size-7"
              onclick={openInExternalEditor}
            >
              <ExternalLink class="size-3.5" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>Open in external editor</p>
          </Tooltip.Content>
        </Tooltip.Root>
      </Dialog.Title>
      <Dialog.Description class="font-mono text-xs truncate">{filePath}</Dialog.Description>
    </Dialog.Header>

    <div class="flex-1 overflow-hidden border rounded-md min-h-0">
      {#if isLoading}
        <div class="flex items-center justify-center h-full">
          <Loader2 class="size-8 animate-spin text-muted-foreground" />
        </div>
      {:else if error && !content}
        <div class="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <AlertCircle class="size-12 text-destructive" />
          <div>
            <p class="font-medium text-destructive">Failed to load file</p>
            <p class="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
          <Button variant="outline" onclick={loadFile}>Try Again</Button>
        </div>
      {:else}
        <div bind:this={editorContainer} tabindex="-1" class="h-full overflow-auto outline-none">
          <CodeMirror
            bind:value={content}
            lang={getLanguageExtension(filePath)[0]}
            theme={oneDark}
            styles={{
              '&': {
                height: '100%',
                fontSize: '14px',
              },
            }}
          />
        </div>
      {/if}
    </div>

    {#if error && content}
      <div class="flex items-center gap-2 text-sm text-destructive mt-2">
        <AlertCircle class="size-4" />
        <span>{error}</span>
      </div>
    {/if}

    <Dialog.Footer class="shrink-0 mt-4">
      <Button variant="outline" onclick={handleClose}>Cancel</Button>
      <Button onclick={saveFile} disabled={!hasUnsavedChanges || isSaving}>
        {#if isSaving}
          <Loader2 class="size-4 mr-2 animate-spin" />
          Saving...
        {:else}
          Save
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Unsaved changes confirmation dialog -->
<Dialog.Root bind:open={showUnsavedWarning}>
  <Dialog.Content class="sm:max-w-md z-110" overlayClass="z-[109]">
    <Dialog.Header>
      <Dialog.Title>Unsaved Changes</Dialog.Title>
      <Dialog.Description>
        You have unsaved changes. Are you sure you want to close without saving?
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="outline" onclick={cancelDiscard}>Keep Editing</Button>
      <Button variant="destructive" onclick={discardChanges}>Discard Changes</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
