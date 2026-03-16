<script lang="ts">
  import { focusManager } from './focus-manager.svelte';

  let ringStyle = $state('');
  let showCooldownPulse = $state(false);
  let resizeObserver: ResizeObserver | null = null;
  let scrollCleanups: (() => void)[] = [];

  function updatePosition() {
    const el = focusManager.currentFocused;
    if (!el || !el.isConnected) {
      ringStyle = 'display:none';
      return;
    }

    const rect = el.getBoundingClientRect();
    const pad = 3;
    ringStyle = [
      `top:${rect.top - pad}px`,
      `left:${rect.left - pad}px`,
      `width:${rect.width + pad * 2}px`,
      `height:${rect.height + pad * 2}px`,
      `border-radius:${getComputedStyle(el).borderRadius || '6px'}`,
    ].join(';');

    showCooldownPulse = focusManager.isCooldownActive('approve-tool');
  }

  function observeElement(el: HTMLElement | null) {
    // Cleanup previous observers
    resizeObserver?.disconnect();
    scrollCleanups.forEach((fn) => fn());
    scrollCleanups = [];

    if (!el) return;

    // Watch for size changes
    resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(el);

    // Watch for scroll on ancestors
    let parent: HTMLElement | null = el.parentElement;
    while (parent) {
      const target = parent;
      const handler = () => updatePosition();
      target.addEventListener('scroll', handler, { passive: true });
      scrollCleanups.push(() => target.removeEventListener('scroll', handler));
      parent = parent.parentElement;
    }
  }

  // React to focus changes
  $effect(() => {
    const el = focusManager.currentFocused;
    updatePosition();
    observeElement(el);

    return () => {
      resizeObserver?.disconnect();
      scrollCleanups.forEach((fn) => fn());
      scrollCleanups = [];
    };
  });

  // Also reposition on window resize/scroll
  $effect(() => {
    const handler = () => updatePosition();
    window.addEventListener('resize', handler, { passive: true });
    window.addEventListener('scroll', handler, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, { capture: true } as EventListenerOptions);
    };
  });
</script>

<div
  class="gamepad-focus-ring"
  class:gamepad-cooldown-pulse={showCooldownPulse}
  style={ringStyle}
></div>
