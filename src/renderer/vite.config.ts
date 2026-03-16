import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Monorepo root is 3 levels up from client/src/renderer
const monorepoRoot = path.resolve(__dirname, '..', '..', '..');

const config = {
	plugins: [sveltekit(), tailwindcss()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	},
	build: {
		target: 'esnext'
	},
	optimizeDeps: {
		// Scan all source files upfront to discover dependencies (prevents reload on navigation)
		entries: ['src/**/*.svelte', 'src/**/*.ts'],
		include: ['esm-env'],
	},
	server: {
		fs: {
			allow: [monorepoRoot]
		}
	}
};

export default config;
