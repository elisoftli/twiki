<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { toast } from 'svelte-sonner';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { settingsStore, nexusModsDownloadDialogStore } from '$lib/stores';
  import { formatCount } from '$lib/utils/format.utils';
  import { bbcodeToHtml } from '$lib/utils/bbcode.utils';
  import Download from '@lucide/svelte/icons/download';
  import ThumbsUp from '@lucide/svelte/icons/thumbs-up';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import FileDown from '@lucide/svelte/icons/file-down';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Shield from '@lucide/svelte/icons/shield';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import type { NexusModsMod, NexusModsModFile } from '../../../../../../../main/interfaces/nexusmods.interface';

  interface Props {
    mod: NexusModsMod;
    domainName: string;
    open: boolean;
  }

  let { mod, domainName, open = $bindable() }: Props = $props();

  // State
  let files = $state<NexusModsModFile[]>([]);
  let isLoadingFiles = $state(false);
  let downloadingFileId = $state<number | null>(null);
  let downloadProgress = $state<number | undefined>(undefined);
  let showOldVersions = $state(false);

  // Download progress listener
  let cleanupProgressListener: (() => void) | undefined;

  onMount(() => {
    cleanupProgressListener = window.api.nexusmods.onDownloadProgress((data) => {
      if (data.fileId === downloadingFileId && data.percentage !== undefined) {
        downloadProgress = data.percentage;
      }
    });
  });

  onDestroy(() => {
    cleanupProgressListener?.();
  });

  // File category grouping
  const FILE_CATEGORY_ORDER: NexusModsModFile['category'][] = ['MAIN', 'UPDATE', 'OPTIONAL', 'MISCELLANEOUS', 'OLD_VERSION'];
  const FILE_CATEGORY_LABELS: Record<string, string> = {
    MAIN: 'Main Files',
    UPDATE: 'Update Files',
    OPTIONAL: 'Optional Files',
    OLD_VERSION: 'Old Versions',
    MISCELLANEOUS: 'Miscellaneous',
    REMOVED: 'Removed',
    ARCHIVED: 'Archived',
  };

  const groupedFiles = $derived.by(() => {
    const groups = new Map<string, NexusModsModFile[]>();
    for (const file of files) {
      if (file.category === 'REMOVED' || file.category === 'ARCHIVED') continue;
      const cat = file.category;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(file);
    }
    // Sort groups by category order
    const sorted: { category: string; label: string; files: NexusModsModFile[] }[] = [];
    for (const cat of FILE_CATEGORY_ORDER) {
      const g = groups.get(cat);
      if (g && g.length > 0) {
        sorted.push({ category: cat, label: FILE_CATEGORY_LABELS[cat] ?? cat, files: g });
      }
    }
    return sorted;
  });

  const nexusRequirements = $derived(mod.modRequirements?.nexusRequirements?.nodes ?? []);
  const hasAnyRequirements = $derived(nexusRequirements.length > 0);

  function formatFileSize(kb: number): string {
    if (kb >= 1_048_576) return `${(kb / 1_048_576).toFixed(1)} GB`;
    if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
    return `${kb} KB`;
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getVirusScanIcon(status: string) {
    if (status === 'VERIFIED') return ShieldCheck;
    if (status === 'QUARANTINED') return ShieldAlert;
    return Shield;
  }

  function getVirusScanColor(status: string): string {
    if (status === 'VERIFIED') return 'text-green-500';
    if (status === 'QUARANTINED') return 'text-destructive';
    return 'text-muted-foreground';
  }

  /** Allowed HTML tags for mod descriptions */
  const ALLOWED_TAGS = new Set([
    'p', 'br', 'b', 'i', 'u', 's', 'em', 'strong', 'a', 'img',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'td', 'th', 'caption',
    'blockquote', 'pre', 'code', 'hr', 'div', 'span', 'font',
    'center', 'sub', 'sup', 'details', 'summary',
  ]);

  /** Allowed attributes per tag (others are stripped) */
  const ALLOWED_ATTRS: Record<string, Set<string>> = {
    a: new Set(['href', 'title', 'target', 'rel']),
    img: new Set(['src', 'alt', 'width', 'height', 'title']),
    td: new Set(['colspan', 'rowspan']),
    th: new Set(['colspan', 'rowspan']),
    font: new Set(['color', 'size']),
    div: new Set(['class', 'style']),
    span: new Set(['class', 'style']),
  };

  function sanitizeHtml(html: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    function cleanNode(node: Node): void {
      const toRemove: Node[] = [];

      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as Element;
          const tag = el.tagName.toLowerCase();

          if (!ALLOWED_TAGS.has(tag)) {
            // Replace disallowed tags with their children
            while (el.firstChild) {
              node.insertBefore(el.firstChild, el);
            }
            toRemove.push(el);
            continue;
          }

          // Strip disallowed attributes
          const allowed = ALLOWED_ATTRS[tag];
          for (const attr of Array.from(el.attributes)) {
            if (attr.name.startsWith('on') || !(allowed?.has(attr.name) ?? false)) {
              el.removeAttribute(attr.name);
            }
          }

          // Sanitize href/src values
          if (el.hasAttribute('href')) {
            const href = el.getAttribute('href') ?? '';
            if (!/^https?:\/\//i.test(href) && !href.startsWith('#') && !href.startsWith('/')) {
              el.removeAttribute('href');
            }
          }
          if (el.hasAttribute('src')) {
            const src = el.getAttribute('src') ?? '';
            if (!/^https?:\/\//i.test(src)) {
              el.removeAttribute('src');
            }
          }

          // Force external links to open safely
          if (tag === 'a') {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          }

          cleanNode(el);
        }
      }

      for (const n of toRemove) {
        node.removeChild(n);
      }
    }

    cleanNode(doc.body);
    return doc.body.innerHTML;
  }

  async function loadFiles(): Promise<void> {
    isLoadingFiles = true;
    try {
      files = await window.api.nexusmods.getModFiles(mod.modId, mod.gameId);
    } catch (err) {
      toast.error('Failed to load mod files');
    } finally {
      isLoadingFiles = false;
    }
  }

  async function handleDownload(file: NexusModsModFile): Promise<void> {
    const apiKey = settingsStore.value?.integrations?.nexusMods?.apiKey;
    const modPageUrl = `https://www.nexusmods.com/${domainName}/mods/${mod.modId}?tab=files`;

    if (!apiKey) {
      if (settingsStore.value?.integrations?.nexusMods?.hideDownloadDialog) {
        window.api.openExternal(modPageUrl);
      } else {
        nexusModsDownloadDialogStore.show('no-key', modPageUrl, () => handleDownload(file));
      }
      return;
    }

    downloadingFileId = file.fileId;
    downloadProgress = undefined;
    try {
      const urls = await window.api.nexusmods.getDownloadUrl(domainName, mod.modId, file.fileId, apiKey);

      if (!urls || urls.length === 0) {
        if (settingsStore.value?.integrations?.nexusMods?.hideDownloadDialog) {
          window.api.openExternal(modPageUrl);
        } else {
          nexusModsDownloadDialogStore.show('not-premium', modPageUrl, () => handleDownload(file));
        }
        return;
      }

      const downloadUrl = urls[0].URI;
      const result = await window.api.nexusmods.downloadFile(downloadUrl, mod.name, file.uri, file.fileId);

      if (result.cancelled) {
        return;
      }

      if (result.success) {
        toast.success('Download complete', {
          description: file.name,
          action: result.path ? {
            label: 'Open folder',
            onClick: () => {
              if (result.path) {
                const dir = result.path.substring(0, result.path.lastIndexOf('\\'));
                window.api.openPath(dir);
              }
            },
          } : undefined,
        });
      } else {
        toast.error(`Download failed: ${result.error}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('401')) {
        nexusModsDownloadDialogStore.show('invalid-key', modPageUrl, () => handleDownload(file));
      } else if (err instanceof Error && err.message.includes('403')) {
        if (settingsStore.value?.integrations?.nexusMods?.hideDownloadDialog) {
          window.api.openExternal(modPageUrl);
        } else {
          nexusModsDownloadDialogStore.show('not-premium', modPageUrl, () => handleDownload(file));
        }
      } else {
        toast.error('Download failed');
      }
    } finally {
      downloadingFileId = null;
      downloadProgress = undefined;
    }
  }

  function handleDescriptionClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor?.href) return;
    event.preventDefault();
    window.api.openExternal(anchor.href);
  }

  function openModPage(): void {
    window.api.openExternal(`https://www.nexusmods.com/${domainName}/mods/${mod.modId}`);
  }

  function openRequirementPage(reqModId: string): void {
    window.api.openExternal(`https://www.nexusmods.com/${domainName}/mods/${reqModId}`);
  }

  // Load data when dialog opens or mod changes
  $effect(() => {
    if (open && mod) {
      // Reset state for new mod
      files = [];
      showOldVersions = false;
      downloadingFileId = null;

      loadFiles();
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-3xl max-h-[85vh] overflow-hidden p-0 flex flex-col">
    <!-- Header with image -->
    <div class="relative shrink-0">
      {#if mod.pictureUrl}
        <div class="h-40 w-full overflow-hidden rounded-t-lg">
          <img
            src={mod.pictureUrl}
            alt={mod.name}
            class="w-full h-full object-cover opacity-50"
          />
          <div class="absolute inset-0 bg-linear-to-b from-transparent via-background/80 to-background" />
        </div>
      {/if}

      <div class="px-6 pb-4 {mod.pictureUrl ? 'absolute bottom-0 left-0 right-0' : 'pt-6'}">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-xl font-bold text-foreground {mod.pictureUrl ? 'drop-shadow-lg' : ''}">{mod.name}</h2>
            <div class="flex items-center gap-3 mt-1 text-sm {mod.pictureUrl ? 'text-foreground/80' : 'text-muted-foreground'}">
              {#if mod.author}
                <span>by {mod.author}</span>
              {/if}
              {#if mod.version}
                <Badge variant="secondary" class="text-xs">{mod.version}</Badge>
              {/if}
            </div>
          </div>
          <div class="flex items-center gap-4 shrink-0 {mod.pictureUrl ? 'text-foreground/80' : 'text-muted-foreground'}">
            <div class="flex items-center gap-1 text-sm">
              <Download class="size-4" />
              <span>{formatCount(mod.downloads)}</span>
            </div>
            <div class="flex items-center gap-1 text-sm">
              <ThumbsUp class="size-4" />
              <span>{formatCount(mod.endorsements)}</span>
            </div>
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground transition-colors"
              title="View on NexusMods"
              onclick={openModPage}
            >
              <ExternalLink class="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="px-6 pb-6 space-y-6 overflow-y-scroll flex-1 min-h-0">
      <!-- Description -->
      {#if mod.summary || mod.description}
        <div class="space-y-2">
          <h3 class="text-sm font-semibold text-foreground">Description</h3>
          <!-- eslint-disable-next-line svelte/no-static-element-interactions -->
          <div
            class="max-h-64 overflow-y-auto overflow-x-hidden rounded-md border border-border/30 p-4"
            onclick={handleDescriptionClick}
          >
            {#if mod.summary}
              <h4 class="text-lg font-semibold text-foreground">About this mod</h4>
              <p class="text-sm text-muted-foreground mb-5">{mod.summary}</p>
            {/if}
            {#if mod.description}
            <div class="prose prose-sm prose-invert max-w-none text-xs text-muted-foreground break-words
              [&_img]:rounded-md [&_img]:max-w-full [&_a]:text-primary [&_a]:underline
              [&_table]:border-collapse [&_table]:w-full [&_table]:table-fixed
              [&_td]:border [&_td]:border-border/50 [&_td]:p-2 [&_td]:break-words
              [&_th]:border [&_th]:border-border/50 [&_th]:p-2 [&_th]:bg-muted/50 [&_th]:break-words
              [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap">
              {@html sanitizeHtml(bbcodeToHtml(mod.description))}
            </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Files -->
      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-foreground">Files</h3>

        {#if isLoadingFiles}
          <Skeleton class="h-14 w-full rounded-md" />
        {:else if groupedFiles.length === 0}
          <p class="text-sm text-muted-foreground">No files available</p>
        {:else}
          {#each groupedFiles as group}
            {@const isCollapsible = group.category === 'OLD_VERSION'}
            <div class="space-y-1.5">
              <button
                type="button"
                class="flex items-center gap-1.5 {isCollapsible ? 'text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer' : 'cursor-default'}"
                onclick={isCollapsible ? () => showOldVersions = !showOldVersions : undefined}
              >
                {#if isCollapsible}
                  {#if showOldVersions}
                    <ChevronDown class="size-3" />
                  {:else}
                    <ChevronRight class="size-3" />
                  {/if}
                {/if}
                <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wider">{group.label}</h4>
                {#if isCollapsible && !showOldVersions}
                  <span class="text-xs normal-case tracking-normal">({group.files.length})</span>
                {/if}
              </button>
              {#if !isCollapsible || showOldVersions}
                {#each group.files as file}
                  <div class="flex items-center gap-3 p-3 rounded-md border border-border/50 bg-card/50">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium truncate">{file.name}</span>
                        {#if file.version}
                          <span class="text-xs text-muted-foreground">{file.version}</span>
                        {/if}
                        {#if file.primary === 1}
                          <Badge variant="secondary" class="text-[10px] px-1.5 py-0">Primary</Badge>
                        {/if}
                      </div>
                      <div class="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{formatFileSize(file.size)}</span>
                        <span class="opacity-50">·</span>
                        <span>{formatDate(file.date)}</span>
                        {#if file.scannedV2}
                          <span class="opacity-50">·</span>
                          {@const ScanIcon = getVirusScanIcon(file.scannedV2)}
                          <span class="flex items-center gap-0.5 {getVirusScanColor(file.scannedV2)}">
                            <ScanIcon class="size-3" />
                            <span class="capitalize">{file.scannedV2.toLowerCase().replace('_', ' ')}</span>
                          </span>
                        {/if}
                      </div>
                    </div>
                    <Button
                      variant={group.category === 'MAIN' ? 'default' : 'outline'}
                      size="sm"
                      onclick={() => handleDownload(file)}
                      disabled={downloadingFileId === file.fileId}
                    >
                      {#if downloadingFileId === file.fileId}
                        <Loader2 class="size-3.5 mr-1.5 animate-spin" />
                        {#if downloadProgress !== undefined}
                          Downloading - {downloadProgress}%
                        {:else}
                          Downloading...
                        {/if}
                      {:else}
                        <FileDown class="size-3.5 mr-1.5" />
                        Download
                      {/if}
                    </Button>
                  </div>
                {/each}
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      <!-- Prerequisites -->
      {#if hasAnyRequirements}
        <div class="space-y-3">
          <h3 class="text-sm font-semibold text-foreground">Prerequisites</h3>
          <div class="space-y-1.5">
            {#each nexusRequirements as req}
              <div class="flex items-center gap-2 text-sm">
                {#if req.externalRequirement && req.url}
                  <button
                    type="button"
                    class="text-primary hover:underline text-left"
                    onclick={() => window.api.openExternal(req.url)}
                  >
                    {req.modName || req.url}
                  </button>
                {:else}
                  <button
                    type="button"
                    class="text-primary hover:underline text-left"
                    onclick={() => openRequirementPage(req.modId)}
                  >
                    {req.modName || `Mod ${req.modId}`}
                  </button>
                {/if}
                {#if req.notes}
                  <span class="text-xs text-muted-foreground">({req.notes})</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
