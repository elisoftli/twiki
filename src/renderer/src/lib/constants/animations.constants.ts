/**
 * Animation and timing constants used across the application.
 */

/** Stagger delay between animated items in milliseconds */
export const ANIMATION_STAGGER_MS = 40;

/** Default number of skeleton items for loading grids */
export const SKELETON_GRID_COUNT = 12;

/** Number of skeleton items for specs loading */
export const SKELETON_SPECS_COUNT = 5;

/** Scroll progress range for header animations */
export const SCROLL_RANGE = 100;

/** Header height when expanded: poster (144) + paddingTop (32) + paddingBottom (32) = 208px */
export const HEADER_EXPANDED_HEIGHT = 208;

/** Header height when collapsed: poster (48) + paddingTop (12) + paddingBottom (16) = 76px */
export const HEADER_COLLAPSED_HEIGHT = 76;

/** Timeout for highlight animations in milliseconds */
export const HIGHLIGHT_TIMEOUT_MS = 2000;

/** Polling interval for spec detection in milliseconds */
export const SPEC_POLLING_INTERVAL_MS = 500;
