<script lang="ts">
  import { renderMarkdown, configureMarked } from '$lib/utils/markdown.utils';

  interface Props {
    /** The markdown message to render */
    message: string;
    /** Additional CSS classes to apply */
    class?: string;
  }

  let { message, class: className = '' }: Props = $props();

  // Configure marked once on module load
  configureMarked();

  const renderedContent = $derived(message ? renderMarkdown(message) : '');

  function handleClick(event: MouseEvent | KeyboardEvent) {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor?.href) {
      event.preventDefault();
      window.api.openExternal(anchor.href);
    }
  }
</script>

<div
  role="button"
  tabindex="0"
  class="
    overflow-y-auto rounded-lg border border-border/30
    bg-card/50 p-6 transition-colors hover:border-border/50
    clickable-content overflow-x-auto prose prose-sm max-h-64
    prose-invert prose-a:text-primary prose-a:no-underline
    prose-a:hover:underline prose-pre:overflow-x-auto
    prose-pre:bg-muted prose-pre:border prose-pre:border-border/50
    prose-pre:text-foreground prose-code:bg-muted prose-code:px-1.5
    prose-code:py-0.5 prose-code:rounded prose-code:text-foreground
    prose-code:text-xs prose-code:before:content-none wrap-break-word
    prose-code:after:content-none max-w-full text-muted-foreground
    {className}"
  onclick={handleClick}
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick(e)}
>
  {@html renderedContent}
</div>
