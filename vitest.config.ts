import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  define: {
    __BUILD_ENV_AGENT_WEBSOCKET_URL__: JSON.stringify(''),
    __BUILD_ENV_API_URL__: JSON.stringify(''),
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'out'],
    setupFiles: ['src/main/__mocks__/vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Mock electron module since it's not available in test environment
      electron: resolve(__dirname, 'src/main/__mocks__/electron.ts'),
    },
  },
});
