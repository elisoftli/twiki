import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginSvelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'dist/**',
      'src/renderer/.svelte-kit/**',
      'src/renderer/build/**',
      'src/renderer/node_modules/**',
      '**/*.d.ts',
    ],
  },

  // Base JavaScript config
  js.configs.recommended,

  // TypeScript config for all TS files
  ...tseslint.configs.recommended,

  // Explicit .svelte.ts handling - ensures TypeScript parser is used
  {
    files: ['**/*.svelte.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
  },

  // Main process + Preload (Node.js environment)
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'electron.vite.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Renderer TypeScript/JavaScript files (Browser environment)
  {
    files: ['src/renderer/**/*.{js,ts}'],
    ignores: ['src/renderer/**/*.svelte.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  // Svelte 5 runes files (.svelte.ts) - browser globals
  {
    files: ['src/renderer/**/*.svelte.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // Disable rules that don't work well with Svelte 5 runes syntax
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // Svelte files
  ...eslintPluginSvelte.configs['flat/recommended'],
  {
    files: ['src/renderer/**/*.svelte'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parser: svelteParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  // Prettier - must be last to disable conflicting rules
  eslintConfigPrettier,
];
