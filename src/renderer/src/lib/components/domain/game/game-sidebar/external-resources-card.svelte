<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import {
    ExternalLink,
    Package,
    Wrench,
    FileCode,
    BookOpen,
    ChevronDown,
    ChevronRight,
    Info,
    ThumbsUp,
    ThumbsDown,
  } from 'lucide-svelte';
  import type {
    PCGWGroupedResources,
    PCGWExternalResource,
    PCGWResourceDescription,
  } from '@twiki/shared';

  interface Props {
    resources: PCGWGroupedResources | null;
    /** Anchor ID to highlight (e.g., "SKSE") */
    highlightedAnchor?: string | null;
    onOpenExternal: (url: string) => void;
  }

  let { resources, highlightedAnchor = null, onOpenExternal }: Props = $props();

  // Track expanded resources by URL
  let expandedResources = $state<Set<string>>(new Set());

  // Track element refs for scrolling
  let resourceElements = $state<Map<string, HTMLElement>>(new Map());

  // Find the URL of the highlighted resource by matching sectionAnchor
  const highlightedUrl = $derived.by(() => {
    if (!highlightedAnchor || !resources) return null;
    const allResources = [
      ...resources.mods,
      ...resources.tools,
      ...resources.patches,
      ...resources.guides
    ];
    const match = allResources.find(r => r.sectionAnchor === highlightedAnchor);
    return match?.url ?? null;
  });

  // Auto-expand and scroll when highlighted
  $effect(() => {
    if (highlightedUrl) {
      // Auto-expand the resource
      if (!expandedResources.has(highlightedUrl)) {
        expandedResources = new Set([...expandedResources, highlightedUrl]);
      }

      // Scroll into view after a short delay to allow DOM update
      setTimeout(() => {
        const el = resourceElements.get(highlightedUrl);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  });

  // Action to register element references for scrolling
  function registerElement(node: HTMLElement, url: string) {
    resourceElements.set(url, node);
    return {
      destroy() {
        resourceElements.delete(url);
      }
    };
  }

  function toggleExpanded(url: string): void {
    const newSet = new Set(expandedResources);
    if (newSet.has(url)) {
      newSet.delete(url);
    } else {
      newSet.add(url);
    }
    expandedResources = newSet;
  }

  // Compute total count
  const totalCount = $derived(
    resources
      ? resources.mods.length +
          resources.tools.length +
          resources.patches.length +
          resources.guides.length
      : 0
  );

  // Category display config
  const categories = [
    { key: 'mods' as const, label: 'Mods', icon: Package, color: 'text-blue-400' },
    { key: 'tools' as const, label: 'Tools', icon: Wrench, color: 'text-orange-400' },
    { key: 'patches' as const, label: 'Patches', icon: FileCode, color: 'text-green-400' },
    { key: 'guides' as const, label: 'Guides', icon: BookOpen, color: 'text-purple-400' },
  ];

  // Maximum items to show per category before "more" indicator
  const MAX_ITEMS_PER_CATEGORY = 25;

  function getDescriptionIcon(type: PCGWResourceDescription['type']) {
    switch (type) {
      case 'advantage':
        return { icon: ThumbsUp, class: 'text-green-500' };
      case 'disadvantage':
        return { icon: ThumbsDown, class: 'text-red-500' };
      case 'info':
      case 'more-info':
      default:
        return { icon: Info, class: 'text-blue-400' };
    }
  }
</script>

{#if resources && totalCount > 0}
  <Card class="border bg-card">
    <CardHeader>
      <div class="flex items-center justify-between">
        <CardTitle class="text-sm font-medium text-muted-foreground">External Resources</CardTitle>
        <Badge variant="secondary" class="px-2 py-0.5 text-xs">
          {totalCount}
        </Badge>
      </div>
    </CardHeader>
    <CardContent class="space-y-4 text-sm">
      {#each categories as category}
        {@const items = resources[category.key]}
        {#if items.length > 0}
          {@const CategoryIcon = category.icon}
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <CategoryIcon class="size-4" />
              <span class="font-medium">{category.label}</span>
              <span class="text-xs text-muted-foreground">({items.length})</span>
            </div>
            <div class="space-y-1 pl-2">
              {#each items.slice(0, MAX_ITEMS_PER_CATEGORY) as resource}
                {@const hasDescriptions = resource.descriptions.length > 0}
                {@const isExpanded = expandedResources.has(resource.url)}
                {@const isHighlighted = resource.url === highlightedUrl}
                <div
                  class="space-y-1 rounded-md transition-shadow {isHighlighted ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}"
                  use:registerElement={resource.url}
                >
                  <div class="flex items-center gap-1">
                    {#if hasDescriptions}
                      <button
                        type="button"
                        onclick={() => toggleExpanded(resource.url)}
                        class="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {#if isExpanded}
                          <ChevronDown class="size-3" />
                        {:else}
                          <ChevronRight class="size-3" />
                        {/if}
                      </button>
                    {:else}
                      <span class="w-4"></span>
                    {/if}
                    <button
                      type="button"
                      onclick={() => onOpenExternal(resource.url)}
                      title={resource.name}
                      class="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted"
                    >
                      <span class="min-w-0 flex-1 truncate">{resource.name}</span>
                      <!-- {#if resource.isPrimary}
                        <span
                          class="shrink-0 rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary"
                        >
                          recommended
                        </span>
                      {/if} -->
                      <ExternalLink class="size-3 shrink-0 text-muted-foreground" />
                    </button>
                  </div>
                  {#if hasDescriptions && isExpanded}
                    <div class="ml-4 space-y-1 border-l border-border/50 pl-3">
                      {#each resource.descriptions as desc}
                        {@const iconConfig = getDescriptionIcon(desc.type)}
                        {@const DescIcon = iconConfig.icon}
                        <div class="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <DescIcon class="mt-0.5 size-3 shrink-0 {iconConfig.class}" />
                          <span class="min-w-0">{desc.text}</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
              {#if items.length > MAX_ITEMS_PER_CATEGORY}
                <span class="block px-1.5 text-xs text-muted-foreground">
                  +{items.length - MAX_ITEMS_PER_CATEGORY} more
                </span>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </CardContent>
  </Card>
{/if}

