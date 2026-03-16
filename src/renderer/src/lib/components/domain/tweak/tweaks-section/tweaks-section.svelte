<script lang="ts">
  import { TweakAccordion } from '$lib/components/domain/tweak/tweak-accordion';
  import { StateCard } from '$lib/components/domain/common/state-card';
  import { ErrorCard } from '$lib/components/domain/common/error-card';
  import CircleSlash from '@lucide/svelte/icons/circle-slash';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import type { TweakGroup, Tweak } from '@twiki/shared';
  import type { AppliedTweak, AgentStatus } from '../../../../../../../main/interfaces/tweak-agent.interface';
  import type { TweakMetadata } from '../../../../../../../main/services/tweak/tweak-metadata.service';

  interface Props {
    /** Error message if loading failed */
    error?: string | null;
    /** PCGamingWiki page name (for empty state link) */
    pageName?: string | null;
    /** External search term for filtering tweaks */
    searchTerm?: string;
    tweakGroups: TweakGroup[];
    appliedTweaks: Map<string, AppliedTweak>;
    tweakMetadata: Map<string, TweakMetadata>;
    agentStatus: AgentStatus;
    runningTweakId: string | null;
    revertingTweakId: string | null;
    /** Group title to focus and expand (for navigating from links) */
    focusedGroupTitle?: string | null;
    /** Callback when focus has been handled (to clear the focused state) */
    onFocusHandled?: () => void;
    onAutoTweak: (groupTitle: string, tweak: Tweak) => void;
    onRevert: (groupTitle: string, tweak: Tweak) => void;
    /** Callback when a PCGamingWiki link is clicked (receives URL and link text) */
    onInternalLinkClick: (url: string, linkText: string) => void;
    /** Callback when a file name is clicked (receives filename) */
    onFileClick?: (filename: string) => void;
    /** Callback to retry loading after an error */
    onRetry?: () => void;
    /** Callback to open PCGamingWiki page (for empty state) */
    onOpenPCGWPage?: () => void;
    /** Whether to expand all tweaks by default */
    autoExpand?: boolean;
  }

  let {
    error = null,
    pageName = null,
    searchTerm = '',
    tweakGroups,
    appliedTweaks,
    tweakMetadata,
    agentStatus,
    runningTweakId,
    revertingTweakId,
    focusedGroupTitle,
    onFocusHandled,
    onAutoTweak,
    onRevert,
    onInternalLinkClick,
    onFileClick,
    onRetry,
    onOpenPCGWPage,
    autoExpand = false,
  }: Props = $props();

  // Derived state
  const isEmpty = $derived(!error && tweakGroups.length === 0);

  // Filtered tweak groups based on search term
  const filteredTweakGroups = $derived(
    searchTerm.trim() === ''
      ? tweakGroups
      : tweakGroups
          .map((group) => ({
            ...group,
            tweaks: group.tweaks.filter((t) => {
              const term = searchTerm.toLowerCase();
              return (
                group.title.toLowerCase().includes(term) ||
                t.title.toLowerCase().includes(term) ||
                (t.body?.toLowerCase().includes(term) ?? false) ||
                t.notes.some((n) => n.toLowerCase().includes(term))
              );
            })
          }))
          .filter((group) => group.tweaks.length > 0)
  );

  const isSearching = $derived(searchTerm.trim() !== '');
</script>

{#if error}
  <ErrorCard message={error} onRetry={onRetry} />
{:else}
  <div class="animate-fade-in-up space-y-6">
    <!-- Empty State -->
    {#if isEmpty}
      <StateCard
        icon={CircleSlash}
        title="No tweaks available"
        description="PCGamingWiki doesn't have any documented fixes or tweaks for this game yet."
        action={pageName && onOpenPCGWPage ? { label: 'View on PCGamingWiki', onclick: onOpenPCGWPage, icon: ExternalLink } : undefined}
      />
    {:else}
      <!-- Tweaks Accordion -->
      <TweakAccordion
        tweakGroups={filteredTweakGroups}
        {onAutoTweak}
        {onRevert}
        {onInternalLinkClick}
        {onFileClick}
        {agentStatus}
        {runningTweakId}
        {revertingTweakId}
        {appliedTweaks}
        {tweakMetadata}
        {isSearching}
        {focusedGroupTitle}
        {onFocusHandled}
        {autoExpand}
      />
    {/if}
  </div>
{/if}
