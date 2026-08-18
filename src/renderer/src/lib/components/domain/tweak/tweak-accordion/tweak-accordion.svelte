<script lang="ts">
  import type { TweakGroup, Tweak } from '@twiki/shared';
  import type { AppliedTweak, AgentStatus } from '../../../../../../../main/interfaces/tweak-agent.interface';
  import type { TweakMetadata } from '../../../../../../../main/services/tweak/tweak-metadata.service';
  import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent
  } from '$lib/components/ui/accordion';
  import { Badge } from '$lib/components/ui/badge';
  import { TweakCard } from '$lib/components/domain/tweak/tweak-card';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import { HEADER_COLLAPSED_HEIGHT } from '$lib/constants/animations.constants';
  import { serviceStatusStore } from '$lib/stores';

  interface Props {
    tweakGroups: TweakGroup[];
    onAutoTweak?: (groupTitle: string, tweak: Tweak) => void;
    onRevert?: (groupTitle: string, tweak: Tweak) => void;
    /** Callback when a PCGamingWiki link is clicked (receives URL and link text) */
    onInternalLinkClick?: (url: string, linkText: string) => void;
    /** Callback when a file name is clicked (receives filename) */
    onFileClick?: (filename: string) => void;
    agentStatus?: AgentStatus;
    runningTweakId?: string | null;
    revertingTweakId?: string | null;
    appliedTweaks?: Map<string, AppliedTweak>;
    tweakMetadata?: Map<string, TweakMetadata>;
    /** Whether search is active - auto-expands first result */
    isSearching?: boolean;
    /** Group title to focus and expand (for navigating from links) */
    focusedGroupTitle?: string | null;
    /** Callback when focus has been handled */
    onFocusHandled?: () => void;
    /** Whether to expand all tweaks by default */
    autoExpand?: boolean;
  }

  let {
    tweakGroups,
    onAutoTweak,
    onRevert,
    onInternalLinkClick,
    onFileClick,
    agentStatus,
    runningTweakId,
    revertingTweakId,
    appliedTweaks,
    tweakMetadata,
    isSearching = false,
    focusedGroupTitle,
    onFocusHandled,
    autoExpand = false,
  }: Props = $props();

  // Filter tweak groups to only include those with at least one tweak with a non-empty body
  const filteredTweakGroups = $derived(
    tweakGroups
      .map((group) => ({
        ...group,
        tweaks: group.tweaks.filter((t) => {
          return t.body?.trim() !== '' || t.notes?.length > 0;
        })
      }))
      .filter((group) => group.tweaks.length > 0)
  );

  // Track expanded accordion items
  let expandedItems = $state<string[]>([]);

  // Track which group is currently highlighted (for visual feedback)
  let highlightedGroupIndex = $state<number | null>(null);

  // Track if initial expansion has been applied
  let hasAppliedInitialExpansion = $state(false);

  // Auto-expand all items when searching with results, or when autoExpand is enabled
  $effect(() => {
    if (isSearching && filteredTweakGroups.length > 0) {
      expandedItems = filteredTweakGroups.map((_, i) => `group-${i}`);
    } else if (!isSearching) {
      // When not searching, apply default expansion state
      if (autoExpand && filteredTweakGroups.length > 0 && !hasAppliedInitialExpansion) {
        expandedItems = filteredTweakGroups.map((_, i) => `group-${i}`);
        hasAppliedInitialExpansion = true;
      } else if (!autoExpand && !hasAppliedInitialExpansion) {
        expandedItems = [];
        hasAppliedInitialExpansion = true;
      }
    }
  });

  // Handle focused group - expand and scroll to it
  $effect(() => {
    if (!focusedGroupTitle) return;

    // Find the index of the focused group
    const groupIndex = filteredTweakGroups.findIndex(
      (group) => group.title.toLowerCase() === focusedGroupTitle.toLowerCase()
    );

    if (groupIndex === -1) {
      onFocusHandled?.();
      return;
    }

    const groupId = `group-${groupIndex}`;

    // Expand the item if not already expanded
    if (!expandedItems.includes(groupId)) {
      expandedItems = [...expandedItems, groupId];
    }

    // Set highlight for visual feedback
    highlightedGroupIndex = groupIndex;

    // Scroll to the accordion item after a brief delay for expansion animation
    // Account for the sticky header height when scrolling
    setTimeout(() => {
      const scrollTarget = document.querySelector(`[data-group-index="${groupIndex}"]`);
      if (scrollTarget) {
        // Use the main element as scroll container (matches page scroll tracking)
        const scrollContainer = document.querySelector('main') as HTMLElement;
        if (scrollContainer) {
          // Calculate the target scroll position with header offset
          const targetRect = scrollTarget.getBoundingClientRect();
          const containerRect = scrollContainer.getBoundingClientRect();
          const currentScroll = scrollContainer.scrollTop;
          const targetOffset = targetRect.top - containerRect.top + currentScroll - (HEADER_COLLAPSED_HEIGHT * 2) - 16; // 16px extra padding
          scrollContainer.scrollTo({ top: targetOffset, behavior: 'smooth' });
        }
      }

      // Clear highlight after animation
      setTimeout(() => {
        highlightedGroupIndex = null;
      }, 1500);
    }, 100);

    // Notify that focus has been handled
    onFocusHandled?.();
  });

  // Check if a group has any applied tweaks
  function hasAppliedTweak(group: TweakGroup): boolean {
    if (!appliedTweaks) return false;
    return group.tweaks.some((tweak) => {
      const applied = appliedTweaks.get(tweak.hash);
      return applied?.status === 'success' || applied?.status === 'warning';
    });
  }
</script>

<Accordion type="multiple" class="space-y-3" bind:value={expandedItems}>
  {#each filteredTweakGroups as group, i (i)}
    <AccordionItem
      value={`group-${i}`}
      data-group-index={i}
      class="
        animate-fade-in-up overflow-hidden rounded-lg border bg-card
        transition-all hover:border-border
        {highlightedGroupIndex === i ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}"
      style="animation-delay: {i * 60}ms"
    >
      <AccordionTrigger
        class="
          px-5 py-4"
        >
        <div class="flex flex-1 items-center justify-between gap-3">
          <span class="text-left font-medium text-foreground">{group.title}</span>
          {#if hasAppliedTweak(group)}
            <Badge variant="outline" class="h-7 gap-1.5 mr-2 border-green-500/30 bg-green-500/10 px-2.5 text-xs text-green-500">
              <CircleCheck class="size-3" />
              Applied
            </Badge>
          {/if}
        </div>
      </AccordionTrigger>
      <AccordionContent class="px-5 pb-1 pt-4 overflow-hidden">
        <div class="space-y-4 overflow-hidden">
          {#each group.tweaks as tweak, j (j)}
            {@const appliedTweak = appliedTweaks?.get(tweak.hash)}
            {@const metadata = tweakMetadata?.get(tweak.hash)}
            <TweakCard
              {tweak}
              onAutoTweak={(t) => onAutoTweak?.(group.title, t)}
              onRevert={(t) => onRevert?.(group.title, t)}
              {onInternalLinkClick}
              {onFileClick}
              isRunning={agentStatus?.isRunning && runningTweakId === tweak.hash}
              isRevertable={(appliedTweak?.summary?.toolCalls?.length ?? 0) > 0}
              isReverting={revertingTweakId === tweak.hash}
              isAgentBusy={agentStatus?.isRunning ?? false}
              completionStatus={appliedTweak?.status}
              warningMessage={appliedTweak?.status === 'warning' ? appliedTweak.summary.message : undefined}
              canApplyTweak={!!metadata?.canApply && !serviceStatusStore.isAutoTweakBlocked}
            />
          {/each}
        </div>
      </AccordionContent>
    </AccordionItem>
  {/each}
</Accordion>
