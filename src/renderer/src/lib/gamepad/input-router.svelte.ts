import { focusManager } from './focus-manager.svelte';
import { GamepadButton, type Direction, type GamepadFrame } from './types';

/** Callback pair for tab switching (LB/RB) */
interface TabSwitcher {
  next: () => void;
  prev: () => void;
}

/** D-pad repeat timing */
const INITIAL_REPEAT_DELAY = 400;
const REPEAT_INTERVAL = 100;

class InputRouter {
  private backHandler: (() => boolean | void) | null = null;
  private tabSwitcher: TabSwitcher | null = null;

  // D-pad repeat state per direction
  private heldDirections = new Map<Direction, { since: number; lastFired: number }>();

  /** Register a per-page back handler. Return true to indicate the event was consumed. */
  registerBackHandler(fn: () => boolean | void) {
    this.backHandler = fn;
  }

  unregisterBackHandler() {
    this.backHandler = null;
  }

  /** Register tab switching callbacks for LB/RB */
  registerTabSwitcher(switcher: TabSwitcher) {
    this.tabSwitcher = switcher;
  }

  unregisterTabSwitcher() {
    this.tabSwitcher = null;
  }

  /** Process a gamepad frame. Called from the gamepad store's polling loop. */
  processFrame(frame: GamepadFrame, isControllerMode: boolean) {
    if (!isControllerMode) return;

    // Handle button presses (edges only)
    for (const btn of frame.justPressed) {
      this.handleButton(btn);
    }

    // Handle D-pad / left stick directional input with repeat
    this.handleDirectionalInput(frame);

    // Handle right stick scrolling
    this.handleRightStickScroll(frame);
  }

  private handleButton(button: number) {
    switch (button) {
      case GamepadButton.A:
        this.handleConfirm();
        break;
      case GamepadButton.B:
        this.handleBack();
        break;
      case GamepadButton.X:
        this.handleContextMenu();
        break;
      case GamepadButton.Y:
        this.handleFocusSearch();
        break;
      case GamepadButton.LB:
        this.tabSwitcher?.prev();
        break;
      case GamepadButton.RB:
        this.tabSwitcher?.next();
        break;
      case GamepadButton.Select:
        this.toggleSidebarFocus();
        break;
    }
  }

  private handleConfirm() {
    const el = focusManager.currentFocused;
    if (!el) return;

    // Don't click on input/textarea — let the OS handle keyboard activation
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

    // Respect cooldowns
    if (focusManager.isCooldownActive('approve-tool')) return;

    el.click();
  }

  private handleBack() {
    // 1. Close top dialog scope if one exists
    if (focusManager.focusScopeStack.length > 0) {
      // Find the dialog close button or trigger Escape
      const scope = focusManager.currentScope;
      if (scope) {
        const closeBtn = scope.querySelector<HTMLElement>(
          '[data-dialog-close], [data-bits-dialog-close]'
        );
        if (closeBtn) {
          closeBtn.click();
          return;
        }
        // Fallback: dispatch Escape
        scope.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
    }

    // 2. Exit sidebar focus
    if (focusManager.sidebarFocusActive) {
      focusManager.sidebarFocusActive = false;
      focusManager.focusFirst();
      return;
    }

    // 3. Per-page back handler
    if (this.backHandler) {
      const consumed = this.backHandler();
      if (consumed !== false) return;
    }
  }

  private handleContextMenu() {
    const el = focusManager.currentFocused;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
    el.dispatchEvent(event);
  }

  private handleFocusSearch() {
    // Find the primary search input (marked with isPrimary or data-gp-primary)
    const searchInput = document.querySelector<HTMLElement>(
      'input[data-gp-primary], input[is-primary]'
    );
    if (searchInput) {
      focusManager.focusElement(searchInput);
    }
  }

  private toggleSidebarFocus() {
    focusManager.sidebarFocusActive = !focusManager.sidebarFocusActive;

    if (focusManager.sidebarFocusActive) {
      // Focus first element in the sidebar
      const sidebar = document.querySelector<HTMLElement>('[data-gp-sidebar]');
      if (sidebar) {
        focusManager.focusFirst(sidebar);
      }
    } else {
      // Return focus to main content
      focusManager.focusFirst();
    }
  }

  private handleDirectionalInput(frame: GamepadFrame) {
    // Collect active directions from D-pad presses and left stick
    const activeDirections = new Set<Direction>();

    // D-pad buttons
    if (frame.justPressed.has(GamepadButton.DpadUp) || frame.held.has(GamepadButton.DpadUp))
      activeDirections.add('up');
    if (frame.justPressed.has(GamepadButton.DpadDown) || frame.held.has(GamepadButton.DpadDown))
      activeDirections.add('down');
    if (frame.justPressed.has(GamepadButton.DpadLeft) || frame.held.has(GamepadButton.DpadLeft))
      activeDirections.add('left');
    if (frame.justPressed.has(GamepadButton.DpadRight) || frame.held.has(GamepadButton.DpadRight))
      activeDirections.add('right');

    // Left stick direction
    if (frame.leftStickDir) {
      activeDirections.add(frame.leftStickDir);
    }

    const now = Date.now();

    // Process each possible direction
    for (const dir of ['up', 'down', 'left', 'right'] as Direction[]) {
      if (activeDirections.has(dir)) {
        const state = this.heldDirections.get(dir);
        if (!state) {
          // Just started — fire immediately
          this.heldDirections.set(dir, { since: now, lastFired: now });
          focusManager.moveFocus(dir);
        } else {
          // Held — check repeat timing
          const elapsed = now - state.since;
          const sinceLastFire = now - state.lastFired;
          if (elapsed >= INITIAL_REPEAT_DELAY && sinceLastFire >= REPEAT_INTERVAL) {
            state.lastFired = now;
            focusManager.moveFocus(dir);
          }
        }
      } else {
        // Released
        this.heldDirections.delete(dir);
      }
    }
  }

  private handleRightStickScroll(frame: GamepadFrame) {
    const deadzone = 0.15;
    if (Math.abs(frame.rightStickY) < deadzone) return;

    // Find nearest scrollable ancestor of focused element
    const el = focusManager.currentFocused;
    const scrollable = el ? findScrollableAncestor(el) : document.querySelector('main');
    if (scrollable) {
      scrollable.scrollBy(0, frame.rightStickY * 20);
    }
  }

  /** Reset all state */
  reset() {
    this.backHandler = null;
    this.tabSwitcher = null;
    this.heldDirections.clear();
  }
}

function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = el.parentElement;
  while (current) {
    const style = getComputedStyle(current);
    const overflowY = style.overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      current.scrollHeight > current.clientHeight
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export const inputRouter = new InputRouter();
