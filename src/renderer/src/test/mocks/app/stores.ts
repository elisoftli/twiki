import { readable, writable } from 'svelte/store';
import { vi } from 'vitest';

export const page = readable({
  url: new URL('http://localhost'),
  params: {},
  route: { id: '/' },
  status: 200,
  error: null,
  data: {},
  form: null,
});

export const navigating = readable(null);

export const updated = {
  subscribe: readable(false).subscribe,
  check: vi.fn(),
};

// Writable version for tests that need to modify page state
export const getWritablePage = () =>
  writable({
    url: new URL('http://localhost'),
    params: {},
    route: { id: '/' },
    status: 200,
    error: null,
    data: {},
    form: null,
  });
