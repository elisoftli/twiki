import { focusManager } from './focus-manager.svelte';

/**
 * Svelte action: creates a focus scope.
 * When mounted, pushes this element as a focus scope (trapping gamepad navigation).
 * When destroyed, pops the scope. Use on dialog content elements.
 */
export function gpFocusScope(node: HTMLElement) {
  focusManager.pushScope(node);

  return {
    destroy() {
      // Only pop if this node is still the top scope
      if (focusManager.currentScope === node) {
        focusManager.popScope();
      }
    },
  };
}

/**
 * Svelte action: marks an element to be skipped by gamepad navigation.
 * Adds the `data-gp-skip` attribute. Use on decorative or drag-only elements.
 */
export function gpSkip(node: HTMLElement) {
  node.setAttribute('data-gp-skip', '');

  return {
    destroy() {
      node.removeAttribute('data-gp-skip');
    },
  };
}

/**
 * Svelte action: makes an element focusable by gamepad navigation.
 * Adds `data-gp-focusable` and `tabindex="0"`. Use on custom interactive elements.
 */
export function gpFocusable(node: HTMLElement) {
  node.setAttribute('data-gp-focusable', '');
  if (!node.hasAttribute('tabindex')) {
    node.setAttribute('tabindex', '0');
  }

  return {
    destroy() {
      node.removeAttribute('data-gp-focusable');
    },
  };
}
