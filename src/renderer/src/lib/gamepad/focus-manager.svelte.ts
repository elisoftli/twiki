import { findNextFocusable, getAllFocusableElements } from './spatial-navigation';
import type { Direction } from './types';

class FocusManager {
  /** Stack of focus scopes (e.g., dialogs push a scope) */
  focusScopeStack = $state<HTMLElement[]>([]);

  /** Currently focused element (tracked for the focus ring) */
  currentFocused = $state<HTMLElement | null>(null);

  /** Whether sidebar is in gamepad focus mode */
  sidebarFocusActive = $state(false);

  /** Active cooldowns keyed by ID */
  private cooldowns = new Map<string, number>();

  /** Saved focus elements for scope stack restore */
  private savedFocusStack: (HTMLElement | null)[] = [];

  /** Push a new focus scope (e.g., when a dialog opens) */
  pushScope(el: HTMLElement) {
    this.savedFocusStack.push(this.currentFocused);
    this.focusScopeStack = [...this.focusScopeStack, el];
    // Focus first element inside the new scope after a frame
    requestAnimationFrame(() => this.focusFirst(el));
  }

  /** Pop the top focus scope (e.g., when a dialog closes) */
  popScope() {
    if (this.focusScopeStack.length === 0) return;
    this.focusScopeStack = this.focusScopeStack.slice(0, -1);
    const savedFocus = this.savedFocusStack.pop() ?? null;
    if (savedFocus && savedFocus.isConnected) {
      this.focusElement(savedFocus);
    }
  }

  /** Get the current top scope (or null for global) */
  get currentScope(): HTMLElement | null {
    return this.focusScopeStack.length > 0
      ? this.focusScopeStack[this.focusScopeStack.length - 1]
      : null;
  }

  /** Move focus in a direction using spatial navigation */
  moveFocus(direction: Direction) {
    if (!this.currentFocused) {
      this.focusFirst();
      return;
    }

    // Don't navigate inside CodeMirror editors
    if (this.currentFocused.closest('.cm-editor')) return;

    const inLeftSidebar = !!this.currentFocused.closest('[data-sidebar="sidebar"]');
    const inRightSidebar = !!this.currentFocused.closest('[data-gp-sidebar-right]');
    const inHeader = !!this.currentFocused.closest('[data-gp-header]');
    const inTabsRow = !!this.currentFocused.closest('[data-gp-tabs-row]');
    const inMainContent = !inLeftSidebar && !inRightSidebar && !inHeader && !inTabsRow;

    // Left sidebar: vertical list — left is ignored, right exits
    if (inLeftSidebar && direction === 'left') return;
    // Right sidebar: vertical list — right is ignored, left exits
    if (inRightSidebar && direction === 'right') return;

    // --- Deterministic zone transitions (up/down) ---
    // Header ↓ → tabs row
    if (inHeader && direction === 'down') {
      const tabsRow = document.querySelector<HTMLElement>('[data-gp-tabs-row]');
      if (tabsRow) { this.focusFirst(tabsRow); return; }
    }
    // Tabs row ↑ → header
    if (inTabsRow && direction === 'up') {
      const header = document.querySelector<HTMLElement>('[data-gp-header]');
      if (header) { this.focusFirst(header); return; }
    }
    // Main content ↑ → try spatial nav within main content first, fall back to tabs row
    if (inMainContent && direction === 'up') {
      const upInContent = findNextFocusable(
        this.currentFocused, direction, this.currentScope,
        { excludeLeftSidebar: true, excludeRightSidebar: true, excludeHeader: true, excludeTabsRow: true },
      );
      if (upInContent) {
        this.focusElement(upInContent);
        return;
      }
      const tabsRow = document.querySelector<HTMLElement>('[data-gp-tabs-row]');
      if (tabsRow) { this.focusFirst(tabsRow); return; }
    }

    // --- Spatial navigation within / between zones ---
    // For horizontal zones (header, tabs row), scope left/right to own container
    const isHorizontal = direction === 'left' || direction === 'right';
    let scope = this.currentScope;
    if (isHorizontal && inHeader) {
      scope = this.currentFocused.closest('[data-gp-header]') as HTMLElement;
    } else if (isHorizontal && inTabsRow) {
      scope = this.currentFocused.closest('[data-gp-tabs-row]') as HTMLElement;
    }

    // Sidebars only reachable from main content via left/right
    const excludeLeftSidebar = !(inLeftSidebar || (inMainContent && direction === 'left'));
    const excludeRightSidebar = !(inRightSidebar || (inMainContent && direction === 'right'));
    const excludeHeader = !inHeader;
    const excludeTabsRow = !inTabsRow;

    const next = findNextFocusable(
      this.currentFocused, direction, scope,
      { excludeLeftSidebar, excludeRightSidebar, excludeHeader, excludeTabsRow },
    );

    if (next) {
      // When entering the left sidebar, always focus the first nav item
      if (!inLeftSidebar && next.closest('[data-sidebar="sidebar"]')) {
        const sidebar = next.closest('[data-sidebar="sidebar"]')!;
        const navMenu = sidebar.querySelector<HTMLElement>('[data-gp-sidebar]');
        if (navMenu) {
          this.focusFirst(navMenu);
          return;
        }
      }
      // When entering the right sidebar, always focus its first element
      if (!inRightSidebar && next.closest('[data-gp-sidebar-right]')) {
        const sidebar = next.closest('[data-gp-sidebar-right]') as HTMLElement;
        this.focusFirst(sidebar);
        return;
      }
      this.focusElement(next);
    }
  }

  /** Focus a specific element and update tracking */
  focusElement(el: HTMLElement) {
    el.focus({ preventScroll: true });
    this.currentFocused = el;
    this.scrollIntoView(el);
  }

  /** Focus the first focusable element in the given scope */
  focusFirst(scope?: HTMLElement | null) {
    const elements = getAllFocusableElements(scope ?? this.currentScope);
    if (elements.length > 0) {
      this.focusElement(elements[0]);
    }
  }

  /** Activate a cooldown (e.g., prevent accidental approve on new pending tool) */
  activateCooldown(id: string, ms: number) {
    const expiry = Date.now() + ms;
    this.cooldowns.set(id, expiry);
  }

  /** Check if a cooldown is currently active */
  isCooldownActive(id: string): boolean {
    const expiry = this.cooldowns.get(id);
    if (!expiry) return false;
    if (Date.now() >= expiry) {
      this.cooldowns.delete(id);
      return false;
    }
    return true;
  }

  /** Scroll the element into view with vertical padding */
  private scrollPadding = 60;

  scrollIntoView(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const pad = this.scrollPadding;

    // Find the nearest scrollable ancestor
    let scrollable: HTMLElement | null = el.parentElement;
    while (scrollable) {
      const style = getComputedStyle(scrollable);
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        scrollable.scrollHeight > scrollable.clientHeight
      ) {
        break;
      }
      scrollable = scrollable.parentElement;
    }

    const container = scrollable ?? document.documentElement;
    const containerRect = scrollable ? container.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };

    if (rect.top < containerRect.top + pad) {
      container.scrollBy({ top: rect.top - containerRect.top - pad, behavior: 'instant' });
    } else if (rect.bottom > containerRect.bottom - pad) {
      container.scrollBy({ top: rect.bottom - containerRect.bottom + pad, behavior: 'instant' });
    }
  }

  /** Reset all state */
  reset() {
    this.focusScopeStack = [];
    this.currentFocused = null;
    this.sidebarFocusActive = false;
    this.savedFocusStack = [];
    this.cooldowns.clear();
  }
}

export const focusManager = new FocusManager();
