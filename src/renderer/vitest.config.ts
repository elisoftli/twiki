import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules'],
    setupFiles: ['./src/test/setup.ts'],
    alias: {
      $lib: resolve(__dirname, './src/lib'),
      $app: resolve(__dirname, './src/test/mocks/app'),
    },
  },
  resolve: {
    alias: {
      $lib: resolve(__dirname, './src/lib'),
      $app: resolve(__dirname, './src/test/mocks/app'),
    },
    // Force browser conditions for Svelte
    conditions: ['browser'],
  },
});
