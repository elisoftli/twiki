<script lang="ts">
  import { toast } from 'svelte-sonner';
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import type { Tweak } from '@twiki/shared';
  import type { TweakOperationStatus } from '../../../../../../../main/interfaces/tweak-agent.interface';
  import { TweakActionButton, type TweakActionState } from '$lib/components/domain/tweak/tweak-action-button';
  import { mount, unmount } from 'svelte';
  import { isClickableFile, renderMarkdown, renderMarkdownInline, configureMarked } from '$lib/utils/markdown.utils';
  import { TWIKI_PATH_PROTOCOL } from '$lib/utils/path-resolution.utils';
  import { logger } from '$lib/utils/logger.utils';

  // Configure marked once on module load
  configureMarked();

  interface Props {
    tweak: Tweak;
    onAutoTweak?: (tweak: Tweak) => void;
    onRevert?: (tweak: Tweak) => void;
    /** Callback when a PCGamingWiki link is clicked (receives URL and link text) */
    onInternalLinkClick?: (url: string, linkText: string) => void;
    /** Callback when a file name is clicked (receives filename) */
    onFileClick?: (filename: string) => void;
    /** Whether this specific tweak is currently being processed */
    isRunning?: boolean;
    /** Whether this specific tweak is revertable */
    isRevertable?: boolean;
    /** Whether this specific tweak is currently being reverted */
    isReverting?: boolean;
    /** Whether the agent is busy processing any tweak */
    isAgentBusy?: boolean;
    /** Completion status if this tweak has been applied */
    completionStatus?: TweakOperationStatus;
    /** Warning message to display when status is 'warning' */
    warningMessage?: string;
    /** Whether this tweak can be processed (no approved failed attempt) */
    canApplyTweak?: boolean;
  }

  let {
    tweak,
    onAutoTweak,
    onRevert,
    onInternalLinkClick,
    onFileClick,
    isRunning = false,
    isRevertable = false,
    isReverting = false,
    isAgentBusy = false,
    completionStatus,
    warningMessage,
    canApplyTweak = true,
  }: Props = $props();

  const isCompleted = $derived(completionStatus === 'success' || completionStatus === 'warning');

  // Construct state object for TweakActionButton
  const tweakActionState = $derived<TweakActionState>({
    isRunning,
    isCompleted,
    isRevertable,
    isReverting,
    isAgentBusy,
    canApply: canApplyTweak,
    completionStatus,
    warningMessage,
    onApply: () => onAutoTweak?.(tweak),
    onRevert: () => onRevert?.(tweak),
  });

  const renderedTitle = $derived(renderMarkdownInline(tweak.title));
  const renderedBody = $derived(tweak.body ? renderMarkdown(tweak.body) : '');

  /**
   * Copy text to clipboard and show a toast notification
   */
  async function copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch (err) {
      logger.error('Failed to copy to clipboard:', err);
      toast.error('Failed to copy to clipboard');
    }
  }

  /**
   * Handle twiki-path:// links - our custom protocol for file paths.
   * Returns true if handled.
   */
  function handleTwikiPathLink(href: string): boolean {
    if (!href.startsWith(TWIKI_PATH_PROTOCOL) || !onFileClick) return false;
    onFileClick(decodeURIComponent(href));
    return true;
  }

  /**
   * Handle clicks on inline code elements (not in pre blocks).
   * Opens clickable files or copies text to clipboard.
   * Returns true if handled.
   */
  function handleInlineCodeClick(target: HTMLElement): boolean {
    const codeElement = target.closest('code');
    if (!codeElement || codeElement.closest('pre')) return false;

    const text = codeElement.textContent?.trim() || '';
    if (!text) return false;

    if (isClickableFile(text) && onFileClick) {
      onFileClick(text);
    } else {
      copyToClipboard(text);
    }
    return true;
  }

  /**
   * Handle clicks on anchor elements.
   * Routes to appropriate handler based on URL type.
   * Returns true if handled.
   */
  function handleAnchorClick(anchor: HTMLAnchorElement): boolean {
    const href = anchor.href;
    if (!href) return false;

    // Check for twiki-path:// protocol
    if (handleTwikiPathLink(href)) return true;

    // Check for PCGamingWiki internal links
    try {
      const url = new URL(href);
      if (url.hostname === 'www.pcgamingwiki.com' && onInternalLinkClick) {
        const linkText = anchor.textContent?.toLowerCase().trim() || '';
        onInternalLinkClick(href, linkText);
        return true;
      }
    } catch {
      // Invalid URL - treat as external
    }

    // Open as external link
    window.api.openExternal(href);
    return true;
  }

  /**
   * Main click handler for content areas.
   * Delegates to specific handlers based on click target.
   */
  function handleContentClick(event: MouseEvent | KeyboardEvent) {
    const target = event.target as HTMLElement;

    // Priority 1: Direct anchor with twiki-path://
    if (target instanceof HTMLAnchorElement && handleTwikiPathLink(target.href)) {
      event.preventDefault();
      return;
    }

    // Priority 2: Inline code elements
    if (handleInlineCodeClick(target)) {
      event.preventDefault();
      return;
    }

    // Priority 3: Anchor elements (including parent anchors)
    const anchor = target.closest('a');
    if (anchor && handleAnchorClick(anchor)) {
      event.preventDefault();
      return;
    }
  }

  function handleAutoTweak() {
    onAutoTweak?.(tweak);
  }

  function handleRevert() {
    onRevert?.(tweak);
  }

  /**
   * Svelte action to add copy buttons to all pre elements within the container.
   * Mounts Svelte components for the icons.
   */
  function addCodeCopyButtons(node: HTMLElement) {
    const preElements = node.querySelectorAll('pre');
    const cleanupFns: Array<() => void> = [];

    preElements.forEach((pre) => {
      // Make the pre element position relative for absolute positioning of button
      pre.style.position = 'relative';

      // Create button container
      const buttonContainer = document.createElement('button');
      buttonContainer.className = 'code-copy-btn';
      buttonContainer.title = 'Copy code';
      buttonContainer.type = 'button';

      // Create icon container
      const iconContainer = document.createElement('span');
      iconContainer.className = 'code-copy-icon';
      buttonContainer.appendChild(iconContainer);

      // Mount the Copy icon
      const copyIcon = mount(Copy, {
        target: iconContainer,
        props: { class: 'size-3.5' }
      });

      // Handle click
      const handleClick = async (e: Event) => {
        e.preventDefault();
        e.stopPropagation();

        const code = pre.querySelector('code');
        const text = code?.textContent || pre.textContent || '';

        try {
          await navigator.clipboard.writeText(text);
          toast.success('Copied to clipboard');

          // Swap to check icon briefly for visual feedback
          unmount(copyIcon);
          iconContainer.innerHTML = '';
          const checkIcon = mount(Check, {
            target: iconContainer,
            props: { class: 'size-3.5' }
          });

          // Swap back after delay
          setTimeout(() => {
            unmount(checkIcon);
            iconContainer.innerHTML = '';
            mount(Copy, {
              target: iconContainer,
              props: { class: 'size-3.5' }
            });
          }, 1500);
        } catch (err) {
          logger.error('Failed to copy code:', err);
          toast.error('Failed to copy to clipboard');
        }
      };

      buttonContainer.addEventListener('click', handleClick);
      pre.appendChild(buttonContainer);

      cleanupFns.push(() => {
        buttonContainer.removeEventListener('click', handleClick);
        buttonContainer.remove();
      });
    });

    return {
      destroy() {
        cleanupFns.forEach(fn => fn());
      }
    };
  }
</script>

<div
  class="
    overflow-hidden rounded-lg border border-border/30
    bg-background/50 p-4 transition-colors hover:border-border/50"
  >
  <!-- Header with title and auto-tweak button -->
  <div class="flex items-start gap-3">
    <div
      role="button"
      tabindex="0"
      class="
        clickable-content flex-1 min-w-0 font-medium text-sm text-foreground
        prose prose-sm prose-invert prose-a:text-primary
        prose-a:no-underline prose-a:hover:underline prose-code:bg-muted
        prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
        prose-code:text-foreground prose-code:text-xs prose-code:before:content-none
        prose-code:after:content-none wrap-break-word max-w-full overflow-hidden select-text cursor-text"
      onclick={handleContentClick}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleContentClick(e)}
    >
      {@html renderedTitle}
    </div>
    <div class="ml-auto shrink-0">
      <TweakActionButton state={tweakActionState} />
    </div>
  </div>
  {#if tweak.body}
    <div
      role="button"
      tabindex="0"
      class="
        clickable-content mt-3 overflow-x-auto
        prose prose-sm prose-invert prose-a:text-primary prose-a:no-underline
        prose-a:hover:underline prose-pre:overflow-x-auto prose-pre:bg-muted
        prose-pre:border prose-pre:border-border/50 prose-pre:text-foreground
        prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
        prose-code:text-foreground prose-code:text-xs prose-code:before:content-none cursor-text
        prose-code:after:content-none max-w-full text-muted-foreground wrap-break-word select-text"
      onclick={handleContentClick}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleContentClick(e)}
      use:addCodeCopyButtons
    >
      {@html renderedBody}
    </div>
  {/if}
  {#if tweak.notes && tweak.notes.length > 0}
    <div class="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <p class="text-xs font-semibold text-primary mb-2">Notes</p>
      <ul class="space-y-1.5">
        {#each tweak.notes as note}
          <li class="text-xs text-muted-foreground flex gap-2">
            <span class="text-primary shrink-0">•</span>
            <span class="select-text">{note}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  :global {
    /* Fix multiline code block alignment - code inside pre should be block-level */
    .prose pre code {
      display: block;
      padding: 0;
      background: transparent;
    }

    /* Ensure pre blocks are tall enough to contain the copy button */
    .prose pre {
      min-height: calc(1.75rem + 1rem);
    }

    /* Make inline code elements (not in pre blocks) look clickable */
    .clickable-content code:not(pre code) {
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
    }

    .clickable-content code:not(pre code):hover {
      background-color: var(--primary);
      color: var(--primary-foreground);
    }

    /* Copy button for code blocks */
    .code-copy-btn {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 0.375rem;
      background-color: var(--background);
      color: var(--muted-foreground);
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s ease, background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }

    .prose pre:hover .code-copy-btn {
      opacity: 1;
    }

    .code-copy-btn:hover {
      background-color: var(--muted);
      color: var(--foreground);
      border-color: var(--border);
    }

    .code-copy-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }
</style>
