<script lang="ts">
  import { goto } from '$app/navigation';
  import { slide } from 'svelte/transition';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as HoverCard from '$lib/components/ui/hover-card';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import type { AppliedTweak } from '../../../../../../../main/interfaces/tweak-agent.interface';
  import type { Game } from '../../../../../../../main/interfaces/game-library.interface';
  import { formatRelativeTime } from '$lib/utils/format.utils';
  import { renderMarkdownInline, renderMarkdown } from '$lib/utils/markdown.utils';

  interface Props {
    tweak: AppliedTweak;
    game: Game | null;
    index?: number;
    isReverting?: boolean;
    onRevert?: (tweak: AppliedTweak) => void;
  }

  let { tweak, game, index = 0, isReverting = false, onRevert }: Props = $props();

  let expanded = $state(false);

  function handleCardClick(event: MouseEvent) {
    // Don't toggle if clicking the revert button or poster
    if ((event.target as HTMLElement).closest('button')) return;
    if ((event.target as HTMLElement).closest('[data-poster]')) return;
    expanded = !expanded;
  }

  function handlePosterClick(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    // Navigate using the game's composite ID (if available), falling back to launcherGameId
    goto(`/game/${game?.id ?? tweak.launcherGameId}`);
  }

  function handleRevert() {
    onRevert?.(tweak);
  }

  const relativeTime = $derived(formatRelativeTime(tweak.appliedAt));

  // Inline version for collapsed state (single line, no breaks)
  const renderedMessageInline = $derived(
    tweak.summary.message
      ? renderMarkdownInline(tweak.summary.message.replace(/\n/g, ' ')).replace(/<br\s*\/?>/g, ' ')
      : ''
  );

  // Full version for expanded state (proper markdown blocks)
  const renderedMessageFull = $derived(
    tweak.summary.message ? renderMarkdown(tweak.summary.message) : ''
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  role="button"
  tabindex="0"
  class="group flex items-start gap-4 rounded-lg border border-border/50 bg-card p-4 transition-all duration-200 ease-out hover:border-primary/60 cursor-pointer animate-fade-in-up"
  style="animation-delay: {index * 40}ms"
  onclick={handleCardClick}
>
  <!-- Game Poster (click to navigate) -->
  <div
    data-poster
    role="button"
    tabindex="0"
    class="shrink-0 w-16 aspect-2/3 rounded-md overflow-hidden bg-muted cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all duration-200"
    onclick={handlePosterClick}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handlePosterClick(e)}
  >
    {#if game?.posterPath}
      <img
        src={`local-file:///${game.posterPath}`}
        alt={game.name}
        class="w-full h-full object-cover transition-all duration-300 group-hover:brightness-110 group-hover:contrast-105"
        draggable="false"
      />
    {:else}
      <div class="w-full h-full flex items-center justify-center">
        <Gamepad2 class="size-6 text-muted-foreground" />
      </div>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 min-w-0">
    <!-- Header row with game name and expand indicator -->
    <div class="flex items-center gap-2">
      <h4 class="font-medium text-sm text-foreground truncate transition-colors duration-200 group-hover:text-primary">
        {game?.name ?? 'Unknown Game'}
      </h4>
      {#if tweak.summary.message}
        <ChevronDown class="size-3.5 text-muted-foreground/60 shrink-0 transition-transform duration-200 {expanded ? 'rotate-180' : ''}" />
      {/if}
    </div>

    <!-- Tweak Title -->
    <p class="text-xs text-muted-foreground truncate mt-0.5">
      {tweak.tweak.title}
    </p>

    <!-- Agent Summary Message -->
    {#if tweak.summary.message}
      <!-- Collapsed: truncated message (2 lines) -->
      <p
        class="text-xs text-muted-foreground/70 mt-1 line-clamp-3 [&_a]:text-primary [&_a]:no-underline [&_code]:text-foreground/80 [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded transition-all duration-200 {expanded ? 'opacity-0 h-0 mt-0 overflow-hidden' : 'opacity-100'}"
      >
        {@html renderedMessageInline}
      </p>
      <!-- Expanded: full markdown message -->
      {#if expanded}
        <div
          transition:slide={{ duration: 200 }}
          class="text-xs text-muted-foreground/70 mt-2 prose prose-xs prose-invert prose-a:text-primary prose-a:no-underline prose-code:text-foreground/80 prose-code:bg-muted prose-code:px-1 prose-code:rounded select-text"
        >
          {@html renderedMessageFull}
        </div>
      {/if}
    {/if}
  </div>

  <!-- Actions -->
  <div class="flex items-center gap-2 shrink-0">
    <!-- Timestamp -->
    <span class="text-xs text-muted-foreground/60 w-24 text-right">
      {relativeTime}
    </span>

    <!-- Status Badges -->
    <div class="flex items-center gap-1.5">
      {#if tweak.status === 'warning' && tweak.summary.message}
        <HoverCard.Root openDelay={200}>
          <HoverCard.Trigger>
            <Badge variant="outline" class="h-6 gap-1 border-yellow-500/30 bg-yellow-500/10 px-2 text-xs text-yellow-500 cursor-help">
              <TriangleAlert class="size-3" />
            </Badge>
          </HoverCard.Trigger>
          <HoverCard.Content side="bottom" align="start" class="w-80">
            <p class="text-sm text-muted-foreground">{tweak.summary.message}</p>
          </HoverCard.Content>
        </HoverCard.Root>
      {/if}
    </div>

    <!-- Revert Button -->
    <Button
      variant="outline"
      size="sm"
      onclick={handleRevert}
      disabled={isReverting}
      class="h-7 shrink-0 gap-1.5 border-muted-foreground/30 px-2.5 text-xs text-muted-foreground hover:border-muted-foreground hover:bg-muted-foreground/10 disabled:opacity-50"
    >
      {#if isReverting}
        <LoaderCircle class="size-3 animate-spin" />
        Reverting...
      {:else}
        <RotateCcw class="size-3" />
        Revert
      {/if}
    </Button>
  </div>
</div>
