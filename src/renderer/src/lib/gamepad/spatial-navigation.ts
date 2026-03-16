import type { Direction } from './types';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled]):not([data-gp-skip])',
  '[role="button"]:not([data-gp-skip])',
  'a[href]:not([data-gp-skip])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([data-gp-skip]):not([role="tabpanel"])',
  '[data-gp-focusable]',
].join(', ');

/** Returns all visible focusable elements within the given scope */
export function getAllFocusableElements(scope?: HTMLElement | null): HTMLElement[] {
  const root = scope ?? document.body;
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return candidates.filter((el) => isVisible(el) && !el.closest('[data-gp-skip]'));
}

/** Find the best focusable element in the given direction from the current element */
interface ExcludeZones {
  excludeLeftSidebar?: boolean;
  excludeRightSidebar?: boolean;
  excludeHeader?: boolean;
  excludeTabsRow?: boolean;
}

export function findNextFocusable(
  current: HTMLElement,
  direction: Direction,
  scope?: HTMLElement | null,
  exclude?: ExcludeZones,
): HTMLElement | null {
  const candidates = getAllFocusableElements(scope);
  const currentRect = current.getBoundingClientRect();
  const cx = currentRect.left + currentRect.width / 2;
  const cy = currentRect.top + currentRect.height / 2;

  let bestEl: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const candidate of candidates) {
    if (candidate === current) continue;
    if (exclude?.excludeLeftSidebar && candidate.closest('[data-sidebar="sidebar"]')) continue;
    if (exclude?.excludeRightSidebar && candidate.closest('[data-gp-sidebar-right]')) continue;
    if (exclude?.excludeHeader && candidate.closest('[data-gp-header]')) continue;
    if (exclude?.excludeTabsRow && candidate.closest('[data-gp-tabs-row]')) continue;

    const rect = candidate.getBoundingClientRect();
    const tx = rect.left + rect.width / 2;
    const ty = rect.top + rect.height / 2;

    // Check candidate is in the correct half-plane with a small tolerance
    // to catch elements that are directly adjacent (aligned)
    const tolerance = 2;
    if (!isInDirection(cx, cy, tx, ty, direction, tolerance)) continue;

    const { primary, cross } = getAxisDistances(cx, cy, tx, ty, direction);
    const score = primary + 2.0 * cross;

    if (score < bestScore) {
      bestScore = score;
      bestEl = candidate;
    }
  }

  return bestEl;
}

function isVisible(el: HTMLElement): boolean {
  if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return true;
}

function isInDirection(
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  direction: Direction,
  tolerance: number,
): boolean {
  switch (direction) {
    case 'up':
      return ty < cy - tolerance;
    case 'down':
      return ty > cy + tolerance;
    case 'left':
      return tx < cx - tolerance;
    case 'right':
      return tx > cx + tolerance;
  }
}

function getAxisDistances(
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  direction: Direction,
): { primary: number; cross: number } {
  switch (direction) {
    case 'up':
    case 'down':
      return { primary: Math.abs(ty - cy), cross: Math.abs(tx - cx) };
    case 'left':
    case 'right':
      return { primary: Math.abs(tx - cx), cross: Math.abs(ty - cy) };
  }
}
