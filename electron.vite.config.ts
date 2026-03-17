import { defineConfig, externalizeDepsPlugin, bytecodePlugin } from 'electron-vite';
import { resolve } from 'path';
import obfuscatorPlugin from 'rollup-plugin-obfuscator';
import { config } from 'dotenv';

// Load .env at build time so values can be injected into the bundle
config();

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({ exclude: ['@twiki/shared'] }),
      bytecodePlugin(),
    ],
    define: {
      __BUILD_ENV_AGENT_WEBSOCKET_URL__: JSON.stringify(process.env.AGENT_WEBSOCKET_URL || ''),
      __BUILD_ENV_API_URL__: JSON.stringify(process.env.API_URL || ''),
    },
    build: {
      sourcemap: isProduction ? false : 'inline',
      watch: process.env.WSL_DISTRO_NAME
        ? { chokidar: { usePolling: true, interval: 1000 } }
        : undefined,
    },
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({ exclude: ['@twiki/shared'] }),
      // Obfuscate preload scripts in production (bytecode doesn't work for multi-entry builds)
      isProduction &&
        obfuscatorPlugin({
          options: {
            compact: true,
            controlFlowFlattening: true,
            controlFlowFlatteningThreshold: 0.5,
            deadCodeInjection: true,
            deadCodeInjectionThreshold: 0.3,
            stringArray: true,
            stringArrayEncoding: ['base64'],
            stringArrayThreshold: 1.0, // Encode all strings
            rotateStringArray: true,
            shuffleStringArray: true,
            renameGlobals: false,
            selfDefending: false,
            identifierNamesGenerator: 'mangled',
          },
        }),
    ].filter(Boolean),
    build: {
      sourcemap: isProduction ? false : 'inline',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          'download-browser-content.preload': resolve(__dirname, 'src/preload/download-browser-content.preload.ts'),
          'download-browser-toolbar.preload': resolve(__dirname, 'src/preload/download-browser-toolbar.preload.ts'),
        },
      },
    },
  },
  renderer: {
    // Simple static HTML for toolbar - no framework needed
    root: resolve(__dirname, 'src/toolbar-renderer'),
    build: {
      outDir: resolve(__dirname, 'out/toolbar-renderer'),
      rollupOptions: {
        input: resolve(__dirname, 'src/toolbar-renderer/index.html'),
      },
    },
    server: {
      port: 5174, // Use different port from SvelteKit (5173)
    },
  },
});
