<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import FileText from '@lucide/svelte/icons/file-text';
  import Folder from '@lucide/svelte/icons/folder';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Download from '@lucide/svelte/icons/download';
  import Archive from '@lucide/svelte/icons/archive';
  import CodeMirror from 'svelte-codemirror-editor';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { EditorView, lineNumbers } from '@codemirror/view';
  import type { ToolOperation, EditableContent } from '../../../../../../../main/interfaces/tool-display.interface';
  import { looksLikeDirectory } from '$lib/utils/path-display.utils';

  interface Props {
    operation: ToolOperation;
    /** Index of this operation in the operations array */
    operationIndex?: number;
    /** Whether the tool is pending approval (enables editing) */
    isPending?: boolean;
    /** Callback to open a file or folder path */
    onOpenPath?: (path: string) => void;
    /** Callback when editable content is changed by user */
    onContentChange?: (content: string, operationIndex: number) => void;
  }

  let { operation, operationIndex = 0, isPending = false, onOpenPath, onContentChange }: Props = $props();

  /**
   * Get the editable content from an operation if it exists and editing is allowed.
   * Returns undefined if the operation has no editable content or editing is disabled.
   */
  function getEditable(): EditableContent | undefined {
    if (!isPending) return undefined;
    // Check if operation has editable field (type narrowing)
    if ('editable' in operation && operation.editable) {
      return operation.editable;
    }
    return undefined;
  }

  // Compact CodeMirror theme extensions
  const compactTheme = EditorView.theme({
    '&': {
      fontSize: '12px',
      maxHeight: '80px',
    },
    '.cm-content': {
      padding: '4px 0',
    },
    '.cm-line': {
      padding: '0 8px',
    },
  });

  /**
   * Create line numbers extension with custom starting line
   */
  function createLineNumbersExtension(startLine: number) {
    return lineNumbers({
      formatNumber: (n: number) => String(n + startLine - 1),
    });
  }

  /**
   * Get the appropriate icon for a path
   */
  function getPathIcon(path: string) {
    return looksLikeDirectory(path) ? Folder : FileText;
  }

  /**
   * Format bytes into human-readable string
   */
  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Svelte action for adaptive path truncation.
   * Shows as many path segments as will fit, always keeping the first segment (drive).
   * Format: "C:\...\trailing\segments" or full path if it fits.
   */
  function adaptivePath(node: HTMLElement, fullPath: string) {
    const pathSpan = node.querySelector('.path-text') as HTMLElement | null;
    if (!pathSpan) return;

    // Parse path into segments
    const segments = fullPath.split('\\').filter(Boolean);
    const firstSegment = segments[0]; // e.g., "C:"
    const trailingSegments = segments.slice(1); // everything after the drive

    // Check if current text overflows
    const isOverflowing = (): boolean => {
      return pathSpan.scrollWidth > pathSpan.clientWidth;
    };

    const findOptimalPath = () => {
      // Start with full path
      pathSpan.textContent = fullPath;

      // If it fits or there's only 1-2 segments, we're done
      if (!isOverflowing() || segments.length <= 2) return;

      // Try progressively fewer trailing segments until it fits
      // Format: C:\...\segment1\segment2
      for (let numSegments = trailingSegments.length - 1; numSegments >= 1; numSegments--) {
        const selectedTrailing = trailingSegments.slice(-numSegments);
        const truncatedPath = firstSegment + '\\...\\' + selectedTrailing.join('\\');
        pathSpan.textContent = truncatedPath;

        if (!isOverflowing()) return;
      }

      // If even 1 trailing segment doesn't fit, show it anyway (CSS truncate handles the rest)
      pathSpan.textContent = firstSegment + '\\...\\' + trailingSegments[trailingSegments.length - 1];
    };

    // Initial calculation after layout settles
    requestAnimationFrame(() => {
      requestAnimationFrame(findOptimalPath);
    });

    // Re-calculate on resize
    const resizeObserver = new ResizeObserver(() => {
      findOptimalPath();
    });
    resizeObserver.observe(node);

    return {
      destroy() {
        resizeObserver.disconnect();
      },
    };
  }
</script>

<!--
  PathDisplay: Reusable snippet for displaying paths with adaptive truncation
  Shows full path when space allows, truncates to last N segments when needed
-->
{#snippet PathDisplay(path: string, clickable: boolean = true)}
  {@const Icon = getPathIcon(path)}
  {@const fullPath = path.replace(/\//g, '\\')}
  <Tooltip.Root delayDuration={500}>
    <Tooltip.Trigger
      class="inline-flex items-center gap-1.5 min-w-0 max-w-full {clickable && onOpenPath ? 'cursor-pointer hover:text-primary transition-colors duration-150' : ''}"
      onclick={() => clickable && onOpenPath?.(path)}
    >
      <Icon class="size-3.5 shrink-0 text-muted-foreground/70" />
      <span
        class="path-display min-w-0 flex-1 text-foreground/90 overflow-hidden"
        use:adaptivePath={fullPath}
      >
        <span class="path-text block truncate w-full">{fullPath}</span>
      </span>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content side="bottom" class="max-w-md">
        <p class="font-mono text-xs break-all select-all">{path}</p>
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
{/snippet}

<!-- DetailBadge: Small inline badge for additional details -->
{#snippet DetailBadge(text: string)}
  <span class="op-count-badge">{text}</span>
{/snippet}

<!-- CodeSnippet: Styled code display for search/replace text -->
{#snippet CodeSnippet(text: string, variant: 'default' | 'muted' = 'default')}
  <code class="px-1.5 py-0.5 rounded text-xs font-mono max-w-52 truncate inline-block align-middle
    {variant === 'muted'
      ? 'bg-muted/50 text-muted-foreground'
      : 'bg-muted text-foreground/80'}"
  >{text}</code>
{/snippet}

<!-- EditableCodeBlock: CodeMirror editor for editable content -->
{#snippet EditableCodeBlock(editable: EditableContent)}
  <div class="flex-1 rounded border overflow-hidden min-w-0 border-border/50">
    <CodeMirror
      value={editable.value}
      lineNumbers={false}
      readonly={false}
      theme={oneDark}
      foldGutter={false}
      extensions={[compactTheme]}
      styles={{ '&': { borderRadius: '0.375rem' } }}
      onchange={(value) => onContentChange?.(value, operationIndex)}
    />
  </div>
{/snippet}

{#snippet ReadOnlyCodeBlock(value: string)}
  <div class="flex-1 rounded border overflow-hidden min-w-0 border-border/50">
    <CodeMirror
      value={value}
      readonly={true}
      lineNumbers={false}
      theme={oneDark}
      foldGutter={false}
      extensions={[compactTheme]}
      styles={{ '&': { borderRadius: '0.375rem' } }}
      onchange={(value) => onContentChange?.(value, operationIndex)}
    />
  </div>
{/snippet}

<!-- EditableTextInput: Text input for short editable content -->
{#snippet EditableTextInput(editable: EditableContent)}
  <input
    type="text"
    value={editable.value}
    oninput={(e) => onContentChange?.(e.currentTarget.value, operationIndex)}
    class="px-1.5 py-0.5 rounded text-xs font-mono bg-muted text-foreground/80 border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary min-w-[80px] max-w-[200px]"
  />
{/snippet}

<div class="flex items-center gap-2 text-sm py-1.5">
  {#if operation.type === 'path'}
    <!-- Single path operation (read, create, list) -->
    <div class="flex items-center gap-2 min-w-0 flex-1">
      {@render PathDisplay(operation.path)}
      {#if operation.detail}
        {@render DetailBadge(operation.detail)}
      {/if}
    </div>

  {:else if operation.type === 'move'}
    <!-- Move/rename operation - wraps cleanly with arrow staying with destination -->
    <div class="flex flex-wrap items-start gap-x-1.5 gap-y-1 min-w-0 flex-1">
      {@render PathDisplay(operation.sourcePath)}
      <span class="flex items-center gap-1.5 min-w-0">
        <ArrowRight class="size-3.5 shrink-0 text-muted-foreground/50" />
        {@render PathDisplay(operation.destPath)}
      </span>
    </div>

  {:else if operation.type === 'string-replace'}
    <!-- String replace operation (edit file) -->
    {@const editable = getEditable()}
    {@const isDelete = operation.newString === ''}
    <div class="flex flex-wrap flex-col items-start gap-y-2 min-w-0 flex-1">
      {@render PathDisplay(operation.path)}
      <div class="flex items-center gap-1.5 w-full">
        {#if operation.replaceAll}
          <span class="text-[0.6rem] uppercase font-semibold tracking-wide px-1 py-0.5 rounded bg-amber-500/15 text-amber-400">all</span>
        {/if}
        {@render ReadOnlyCodeBlock(operation.oldString)}
        <ArrowRight class="size-3 shrink-0 text-muted-foreground/40" />
        {#if editable}
          {@render EditableCodeBlock(editable)}
        {:else if isDelete}
          <span class="text-[0.65rem] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">delete</span>
        {:else}
          {@render ReadOnlyCodeBlock(operation.newString)}
        {/if}
      </div>
    </div>

  {:else if operation.type === 'registry'}
    <!-- Registry operation -->
    <div class="flex items-center gap-1.5 min-w-0 flex-wrap flex-1">
      <span class="text-[0.65rem] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded
        {operation.action === 'set' ? 'bg-blue-500/15 text-blue-400' :
         operation.action === 'delete' ? 'bg-red-500/15 text-red-400' :
         'bg-muted text-muted-foreground'}"
      >{operation.action}</span>
      <Tooltip.Root delayDuration={500}>
        <Tooltip.Trigger class="inline-flex items-center gap-1 min-w-0">
          <span class="path-display text-foreground/90">{operation.keyName}\{operation.valueName}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="bottom" class="max-w-md">
            <p class="font-mono text-xs break-all select-all">{operation.keyPath}\{operation.valueName}</p>
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      {#if operation.value !== undefined && operation.action === 'set'}
        <span class="text-muted-foreground/50">=</span>
        {@render CodeSnippet(String(operation.value))}
      {/if}
    </div>

  {:else if operation.type === 'content'}
    <!-- Content operation (insert, append, create-file) -->
    {@const editable = getEditable()}
    <div class="flex flex-col gap-1.5 min-w-0 flex-1">
      {@render PathDisplay(operation.path)}
      {#if editable}
        {@render EditableCodeBlock(editable)}
      {:else}
        {@render ReadOnlyCodeBlock(operation.contentPreview)}
      {/if}
    </div>

  {:else if operation.type === 'system'}
    <!-- System operation -->
    <Tooltip.Root delayDuration={500}>
      <Tooltip.Trigger
        class="flex items-center gap-1.5 min-w-0 {onOpenPath ? 'cursor-pointer hover:text-primary transition-colors duration-150' : ''}"
        onclick={() => onOpenPath?.(operation.target)}
      >
        <span class="path-display text-foreground/90">{operation.targetName}</span>
        <span class="text-muted-foreground/50">:</span>
        <span class="text-xs text-muted-foreground">{operation.setting}</span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="bottom" class="max-w-md">
          <p class="font-mono text-xs break-all select-all">{operation.target}</p>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>

  {:else if operation.type === 'user-input'}
    <!-- User input operation -->
    <div class="flex items-start gap-1.5 min-w-0">
      <span class="text-foreground/90">{operation.message}</span>
    </div>

  {:else if operation.type === 'launch-options'}
    <!-- Launch options operation -->
    {@const launcherDisplay = operation.launcher.charAt(0).toUpperCase() + operation.launcher.slice(1)}
    <div class="flex items-center gap-2 min-w-0 flex-wrap">
      <span class="text-[0.65rem] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
        {launcherDisplay}
      </span>
      <span class="text-xs text-muted-foreground">ID: {operation.gameId}</span>
      <code class="bg-muted px-2 py-1 rounded text-xs font-mono text-foreground/80">
        {operation.options || '(clear options)'}
      </code>
    </div>

  {:else if operation.type === 'download'}
    <!-- Download operation -->
    <div class="flex items-center gap-1.5 min-w-0 flex-wrap flex-1">
      {#if operation.shouldExtract}
        <Archive class="size-3.5 shrink-0 text-muted-foreground/70" />
      {:else}
        <Download class="size-3.5 shrink-0 text-muted-foreground/70" />
      {/if}
      <Tooltip.Root delayDuration={500}>
        <Tooltip.Trigger class="inline-flex items-center gap-1 min-w-0">
          <span class="path-display truncate text-foreground/90 max-w-xs">{operation.displayUrl}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="bottom" class="max-w-lg">
            <p class="font-mono text-xs break-all select-all">{operation.url}</p>
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      {#if operation.hoster}
        <span class="text-[0.65rem] px-1.5 py-0.5 rounded bg-muted/70 text-muted-foreground font-medium">
          {operation.hoster}
        </span>
      {/if}
      {#if operation.progress}
        <span class="text-xs font-medium text-primary tabular-nums">
          {#if operation.progress.percentage !== undefined}
            {operation.progress.percentage}%
          {:else}
            {formatBytes(operation.progress.downloadedBytes)}
          {/if}
        </span>
        {#if operation.progress.totalBytes}
          <span class="text-xs text-muted-foreground tabular-nums">
            / {formatBytes(operation.progress.totalBytes)}
          </span>
        {/if}
      {:else if operation.shouldExtract || operation.openAfterDownload}
        {@const actions = [operation.shouldExtract && 'extract', operation.openAfterDownload && 'open'].filter(Boolean)}
        {@render DetailBadge(actions.join(', '))}
      {/if}
    </div>
  {/if}
</div>
