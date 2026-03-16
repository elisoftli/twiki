import { vi } from 'vitest';

export const goto = vi.fn();
export const beforeNavigate = vi.fn();
export const afterNavigate = vi.fn();
export const invalidate = vi.fn();
export const invalidateAll = vi.fn();
export const preloadData = vi.fn();
export const preloadCode = vi.fn();
export const disableScrollHandling = vi.fn();
export const pushState = vi.fn();
export const replaceState = vi.fn();
