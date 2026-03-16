<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import type { PCGWGameInfo } from '@twiki/shared';
  import { renderMarkdown, renderMarkdownInline } from '$lib/utils/markdown.utils';

  interface Props {
    gameInfo?: PCGWGameInfo | null;
    /** Whether the game info is currently loading */
    loading?: boolean;
    /** Handler for links that may be internal (receives URL and link text for matching) */
    onLinkClick?: (url: string, linkText: string) => void;
    /** Fallback for opening external URLs directly */
    onOpenExternal?: (url: string) => void;
  }

  let {
    gameInfo,
    loading = false,
    onLinkClick,
    onOpenExternal,
  }: Props = $props();

  // Expanded states using an object for easier management
  type ExpandableSection = 'hdr' | 'frameRate' | 'ultraHD4K' | 'ultrawide' | 'controller';
  let expanded = $state<Record<ExpandableSection, boolean>>({
    hdr: false,
    frameRate: false,
    ultraHD4K: false,
    ultrawide: false,
    controller: false,
  });

  /**
   * Toggle expanded state for a section (only if expandable)
   */
  function toggleExpanded(section: ExpandableSection, isExpandable: boolean) {
    if (isExpandable) {
      expanded[section] = !expanded[section];
    }
  }

  /**
   * Handle clicks on rendered notes content (for anchor links)
   */
  function handleNotesClick(event: MouseEvent | KeyboardEvent) {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor?.href) return;

    event.preventDefault();
    const linkText = anchor.textContent?.trim() || '';

    if (onLinkClick) {
      onLinkClick(anchor.href, linkText);
    } else if (onOpenExternal) {
      onOpenExternal(anchor.href);
    } else {
      window.api.openExternal(anchor.href);
    }
  }

  // Derived values - now using flattened structure
  const engine = $derived(gameInfo?.engine);
  const hdr = $derived(gameInfo?.hdr);
  const frameRate = $derived(gameInfo?.frameRate);
  const ultraHD4K = $derived(gameInfo?.ultraHD4K);
  const ultrawide = $derived(gameInfo?.ultrawide);
  const controller = $derived(gameInfo?.controller);
  const buttonPrompts = $derived(gameInfo?.buttonPrompts);
  const directX = $derived(gameInfo?.directX);
  const vulkan = $derived(gameInfo?.vulkan);
  const openGL = $derived(gameInfo?.openGL);
  const antiCheat = $derived(gameInfo?.antiCheat);

  // Check if data exists for conditional rendering
  const hasAnyButtonPrompt = $derived(
    buttonPrompts?.xbox ||
    buttonPrompts?.playstation ||
    buttonPrompts?.steam
  );

  // Status label helpers
  function getStatusLabel(status: string | null): string | null {
    if (!status) return null;
    switch (status) {
      case 'true': return 'Supported';
      case 'false': return 'Not Supported';
      case 'hackable': return 'Hackable';
      case 'n/a': return 'N/A';
      case 'limited': return 'Limited';
      default: return status;
    }
  }

  function getStatusVariant(status: string | null): 'secondary' | 'outline' {
    switch (status) {
      case 'true': return 'secondary';
      case 'hackable': return 'secondary';
      case 'limited': return 'secondary';
      default: return 'outline';
    }
  }

  // HDR display helpers
  const hdrStatusLabel = $derived.by(() => {
    if (!hdr?.status) return null;
    switch (hdr.status) {
      case 'true': return 'Supported';
      case 'always on': return 'Always On';
      case 'false': return 'Not Supported';
      case 'limited': return 'Limited';
      case 'hackable': return 'Hackable';
      default: return null;
    }
  });

  // Check if HDR notes mention HDR mod keywords and return the mod name for badge display
  const hdrModName = $derived.by(() => {
    const notes = hdr?.notes?.toLowerCase() ?? '';
    if (notes.includes('renodx')) return 'RenoDX';
    if (notes.includes('reshade')) return 'ReShade';
    return null;
  });

  // HDR notes rendered as HTML (using full markdown to support paragraphs)
  const renderedHdrNotes = $derived(hdr?.notes ? renderMarkdown(hdr.notes) : '');

  // Whether HDR row is expandable (has notes to show)
  const isHdrExpandable = $derived(!!renderedHdrNotes);

  // Frame rate display helpers - only show badges for supported/hackable/limited (not false/unknown)
  const supportedFpsStatuses = ['true', 'hackable', 'limited', 'always on'];
  const showFps60 = $derived(frameRate?.fps60 && supportedFpsStatuses.includes(frameRate.fps60));
  const showFps120 = $derived(frameRate?.fps120 && supportedFpsStatuses.includes(frameRate.fps120));
  const fps60Variant = $derived(getStatusVariant(frameRate?.fps60 ?? null));
  const fps120Variant = $derived(getStatusVariant(frameRate?.fps120 ?? null));

  // Frame rate notes rendered as HTML
  const renderedFrameRateNotes = $derived(frameRate?.notes ? renderMarkdownInline(frameRate.notes) : '');
  const isFrameRateExpandable = $derived(!!renderedFrameRateNotes);

  // Ultra HD 4K notes (now from ultraHD4K.notes)
  const renderedUltraHD4KNotes = $derived(ultraHD4K?.notes ? renderMarkdownInline(ultraHD4K.notes) : '');
  const isUltraHD4KExpandable = $derived(!!renderedUltraHD4KNotes);

  // Ultrawide notes (now from ultrawide.notes)
  const renderedUltrawideNotes = $derived(ultrawide?.notes ? renderMarkdownInline(ultrawide.notes) : '');
  const isUltrawideExpandable = $derived(!!renderedUltrawideNotes);

  // Controller notes (now from controller.notes)
  const renderedControllerNotes = $derived(controller?.notes ? renderMarkdownInline(controller.notes) : '');
  const isControllerExpandable = $derived(!!renderedControllerNotes);

  // Check if any game info exists to display
  const hasAnyGameInfo = $derived(
    engine ||
    hdr?.status ||
    showFps60 || showFps120 ||
    (ultraHD4K?.status && ultraHD4K.status !== 'unknown') ||
    (ultrawide?.status && ultrawide.status !== 'unknown') ||
    (controller?.status && controller.status !== 'unknown') ||
    hasAnyButtonPrompt ||
    directX ||
    vulkan ||
    openGL ||
    antiCheat
  );
</script>

<Card class="border bg-card">
  <CardHeader>
    <CardTitle class="text-sm font-medium text-muted-foreground">Game Information</CardTitle>
  </CardHeader>
  <CardContent class="space-y-4 text-sm">
    {#if loading}
      <!-- Skeleton loading state -->
      <div class="flex justify-between gap-4 items-center">
        <div class="animate-shimmer h-4 w-16 rounded bg-muted"></div>
        <div class="animate-shimmer h-5 w-20 rounded bg-muted"></div>
      </div>
      <div class="flex justify-between gap-4 items-center">
        <div class="animate-shimmer h-4 w-12 rounded bg-muted"></div>
        <div class="animate-shimmer h-5 w-24 rounded bg-muted"></div>
      </div>
      <div class="flex justify-between gap-4 items-center">
        <div class="animate-shimmer h-4 w-20 rounded bg-muted"></div>
        <div class="flex gap-1.5">
          <div class="animate-shimmer h-5 w-10 rounded bg-muted"></div>
          <div class="animate-shimmer h-5 w-12 rounded bg-muted"></div>
        </div>
      </div>
      <div class="flex justify-between gap-4 items-center">
        <div class="animate-shimmer h-4 w-18 rounded bg-muted"></div>
        <div class="animate-shimmer h-5 w-20 rounded bg-muted"></div>
      </div>
      <div class="flex justify-between gap-4 items-center">
        <div class="animate-shimmer h-4 w-14 rounded bg-muted"></div>
        <div class="animate-shimmer h-5 w-16 rounded bg-muted"></div>
      </div>
    {:else if !hasAnyGameInfo}
      <p class="text-muted-foreground text-center py-2">No game information available</p>
    {/if}

    <!-- Engine -->
    {#if engine}
      <div class="flex justify-between gap-4">
        <span class="text-muted-foreground shrink-0">Engine</span>
        <span class="font-medium text-right">{engine}</span>
      </div>
    {/if}

    <!-- HDR -->
    {#if hdr?.status}
      <div class="flex flex-col gap-2">
        {#if isHdrExpandable}
          <button
            type="button"
            class="group relative flex w-full justify-between gap-4 items-center cursor-pointer text-sm text-left py-1 -my-1"
            onclick={() => toggleExpanded('hdr', isHdrExpandable)}
            aria-expanded={expanded.hdr}
          >
            <!-- Hover background that extends beyond content -->
            <span class="absolute inset-y-0 -inset-x-2 rounded bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity"></span>
            <span class="relative text-muted-foreground shrink-0 flex items-center gap-1">
              HDR
              <ChevronDown class="size-3.5 text-muted-foreground/60 transition-transform {expanded.hdr ? 'rotate-180' : ''}" />
            </span>
            <div class="relative flex items-center gap-1.5">
              {#if hdrModName}
                <Badge variant="outline" class="text-xs">{hdrModName}</Badge>
              {/if}
              {#if hdrStatusLabel}
                <Badge variant={getStatusVariant(hdr.status ?? null)} class="text-xs">{hdrStatusLabel}</Badge>
              {:else}
                <span class="font-medium text-right">—</span>
              {/if}
            </div>
          </button>
        {:else}
          <div class="flex justify-between gap-4 items-center">
            <span class="text-muted-foreground shrink-0">HDR</span>
            <div class="flex items-center gap-1.5">
              {#if hdrStatusLabel}
                <Badge variant={getStatusVariant(hdr.status ?? null)} class="text-xs">{hdrStatusLabel}</Badge>
              {:else}
                <span class="font-medium text-right">—</span>
              {/if}
            </div>
          </div>
        {/if}
        {#if expanded.hdr && renderedHdrNotes}
          <div
            role="button"
            tabindex="0"
            class="
              text-xs text-muted-foreground pl-3 border-l border-border/50
              prose prose-sm prose-invert prose-a:text-primary prose-a:no-underline
              prose-a:hover:underline select-text"
            onclick={handleNotesClick}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleNotesClick(e)}
          >
            {@html renderedHdrNotes}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Frame Rate -->
    {#if showFps60 || showFps120}
      <div class="flex flex-col gap-2">
        {#if isFrameRateExpandable}
          <button
            type="button"
            class="group relative flex w-full justify-between gap-4 items-center cursor-pointer text-sm text-left py-1 -my-1"
            onclick={() => toggleExpanded('frameRate', isFrameRateExpandable)}
            aria-expanded={expanded.frameRate}
          >
            <!-- Hover background that extends beyond content -->
            <span class="absolute inset-y-0 -inset-x-2 rounded bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity"></span>
            <span class="relative text-muted-foreground shrink-0 flex items-center gap-1">
              Frame Rate
              <ChevronDown class="size-3.5 text-muted-foreground/60 transition-transform {expanded.frameRate ? 'rotate-180' : ''}" />
            </span>
            <div class="relative flex flex-wrap justify-end gap-1.5">
              {#if showFps60}
                <Badge variant={fps60Variant} class="text-xs">60</Badge>
              {/if}
              {#if showFps120}
                <Badge variant={fps120Variant} class="text-xs">120+</Badge>
              {/if}
            </div>
          </button>
        {:else}
          <div class="flex justify-between gap-4 items-center">
            <span class="text-muted-foreground shrink-0">Frame Rate</span>
            <div class="flex flex-wrap justify-end gap-1.5">
              {#if showFps60}
                <Badge variant={fps60Variant} class="text-xs">60</Badge>
              {/if}
              {#if showFps120}
                <Badge variant={fps120Variant} class="text-xs">120+</Badge>
              {/if}
            </div>
          </div>
        {/if}
        {#if expanded.frameRate && renderedFrameRateNotes}
          <div
            role="button"
            tabindex="0"
            class="
              text-xs text-muted-foreground pl-3 border-l border-border/50
              prose prose-sm prose-invert prose-a:text-primary prose-a:no-underline
              prose-a:hover:underline select-text"
            onclick={handleNotesClick}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleNotesClick(e)}
          >
            {@html renderedFrameRateNotes}
          </div>
        {/if}
      </div>
    {/if}

    <!-- 4K Ultra HD -->
    {#if ultraHD4K?.status && ultraHD4K.status !== 'unknown'}
      <div class="flex flex-col gap-2">
        {#if isUltraHD4KExpandable}
          <button
            type="button"
            class="group relative flex w-full justify-between gap-4 items-center cursor-pointer text-sm text-left py-1 -my-1"
            onclick={() => toggleExpanded('ultraHD4K', isUltraHD4KExpandable)}
            aria-expanded={expanded.ultraHD4K}
          >
            <span class="absolute inset-y-0 -inset-x-2 rounded bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity"></span>
            <span class="relative text-muted-foreground shrink-0 flex items-center gap-1">
              4K Ultra HD
              <ChevronDown class="size-3.5 text-muted-foreground/60 transition-transform {expanded.ultraHD4K ? 'rotate-180' : ''}" />
            </span>
            <Badge variant={getStatusVariant(ultraHD4K.status)} class="relative text-xs">
              {getStatusLabel(ultraHD4K.status)}
            </Badge>
          </button>
        {:else}
          <div class="flex justify-between gap-4 items-center">
            <span class="text-muted-foreground shrink-0">4K Ultra HD</span>
            <Badge variant={getStatusVariant(ultraHD4K.status)} class="text-xs">
              {getStatusLabel(ultraHD4K.status)}
            </Badge>
          </div>
        {/if}
        {#if expanded.ultraHD4K && renderedUltraHD4KNotes}
          <div
            role="button"
            tabindex="0"
            class="
              text-xs text-muted-foreground pl-3 border-l border-border/50
              prose prose-sm prose-invert prose-a:text-primary prose-a:no-underline
              prose-a:hover:underline select-text"
            onclick={handleNotesClick}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleNotesClick(e)}
          >
            {@html renderedUltraHD4KNotes}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Ultrawide -->
    {#if ultrawide?.status && ultrawide.status !== 'unknown'}
      <div class="flex flex-col gap-2">
        {#if isUltrawideExpandable}
          <button
            type="button"
            class="group relative flex w-full justify-between gap-4 items-center cursor-pointer text-sm text-left py-1 -my-1"
            onclick={() => toggleExpanded('ultrawide', isUltrawideExpandable)}
            aria-expanded={expanded.ultrawide}
          >
            <span class="absolute inset-y-0 -inset-x-2 rounded bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity"></span>
            <span class="relative text-muted-foreground shrink-0 flex items-center gap-1">
              Ultrawide
              <ChevronDown class="size-3.5 text-muted-foreground/60 transition-transform {expanded.ultrawide ? 'rotate-180' : ''}" />
            </span>
            <Badge variant={getStatusVariant(ultrawide.status)} class="relative text-xs">
              {getStatusLabel(ultrawide.status)}
            </Badge>
          </button>
        {:else}
          <div class="flex justify-between gap-4 items-center">
            <span class="text-muted-foreground shrink-0">Ultrawide</span>
            <Badge variant={getStatusVariant(ultrawide.status)} class="text-xs">
              {getStatusLabel(ultrawide.status)}
            </Badge>
          </div>
        {/if}
        {#if expanded.ultrawide && renderedUltrawideNotes}
          <div
            role="button"
            tabindex="0"
            class="
              text-xs text-muted-foreground pl-3 border-l border-border/50
              prose prose-sm prose-invert prose-a:text-primary prose-a:no-underline
              prose-a:hover:underline select-text"
            onclick={handleNotesClick}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleNotesClick(e)}
          >
            {@html renderedUltrawideNotes}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Controller -->
    {#if controller?.status && controller.status !== 'unknown'}
      <div class="flex flex-col gap-2">
        {#if isControllerExpandable}
          <button
            type="button"
            class="group relative flex w-full justify-between gap-4 items-center cursor-pointer text-sm text-left py-1 -my-1"
            onclick={() => toggleExpanded('controller', isControllerExpandable)}
            aria-expanded={expanded.controller}
          >
            <span class="absolute inset-y-0 -inset-x-2 rounded bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity"></span>
            <span class="relative text-muted-foreground shrink-0 flex items-center gap-1">
              Controller
              <ChevronDown class="size-3.5 text-muted-foreground/60 transition-transform {expanded.controller ? 'rotate-180' : ''}" />
            </span>
            <Badge variant={getStatusVariant(controller.status)} class="relative text-xs">
              {getStatusLabel(controller.status)}
            </Badge>
          </button>
        {:else}
          <div class="flex justify-between gap-4 items-center">
            <span class="text-muted-foreground shrink-0">Controller</span>
            <Badge variant={getStatusVariant(controller.status)} class="text-xs">
              {getStatusLabel(controller.status)}
            </Badge>
          </div>
        {/if}
        {#if expanded.controller && renderedControllerNotes}
          <div
            role="button"
            tabindex="0"
            class="
              text-xs text-muted-foreground pl-3 border-l border-border/50
              prose prose-sm prose-invert prose-a:text-primary prose-a:no-underline
              prose-a:hover:underline select-text"
            onclick={handleNotesClick}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleNotesClick(e)}
          >
            {@html renderedControllerNotes}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Button Prompts -->
    {#if hasAnyButtonPrompt}
      <div class="flex justify-between gap-4 items-center">
        <span class="text-muted-foreground shrink-0">Button Prompts</span>
        <div class="flex flex-wrap justify-end gap-1.5">
          {#if buttonPrompts?.xbox}
            <Badge variant="outline" class="text-xs">Xbox</Badge>
          {/if}
          {#if buttonPrompts?.playstation}
            <Badge variant="outline" class="text-xs">PlayStation</Badge>
          {/if}
          {#if buttonPrompts?.steam}
            <Badge variant="outline" class="text-xs">Steam</Badge>
          {/if}
        </div>
      </div>
    {/if}

    <!-- DirectX -->
    {#if directX}
      <div class="flex justify-between gap-4 items-center">
        <span class="text-muted-foreground shrink-0">DirectX</span>
        {#if getStatusLabel(directX)}
          <Badge variant={getStatusVariant(directX)} class="text-xs">
            {getStatusLabel(directX)}
          </Badge>
        {:else}
          <span class="font-medium text-right">{directX}</span>
        {/if}
      </div>
    {/if}

    <!-- Vulkan -->
    {#if vulkan}
      <div class="flex justify-between gap-4 items-center">
        <span class="text-muted-foreground shrink-0">Vulkan</span>
        {#if getStatusLabel(vulkan)}
          <Badge variant={getStatusVariant(vulkan)} class="text-xs">
            {getStatusLabel(vulkan)}
          </Badge>
        {:else}
          <span class="font-medium text-right">{vulkan}</span>
        {/if}
      </div>
    {/if}

    <!-- OpenGL -->
    {#if openGL}
      <div class="flex justify-between gap-4 items-center">
        <span class="text-muted-foreground shrink-0">OpenGL</span>
        {#if getStatusLabel(openGL)}
          <Badge variant={getStatusVariant(openGL)} class="text-xs">
            {getStatusLabel(openGL)}
          </Badge>
        {:else}
          <span class="font-medium text-right">{openGL}</span>
        {/if}
      </div>
    {/if}

    <!-- Anti-Cheat -->
    {#if antiCheat}
      <div class="flex justify-between gap-4 items-center">
        <span class="text-muted-foreground shrink-0">Anti-Cheat</span>
        <Badge variant={getStatusVariant(antiCheat)} class="text-xs">
          {antiCheat}
        </Badge>
      </div>
    {/if}
  </CardContent>
</Card>
