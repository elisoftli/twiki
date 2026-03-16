import adapter from '@sveltejs/adapter-static';
// import preprocess from 'svelte-preprocess'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildDir = path.join(__dirname, '..', '..', 'out', 'renderer');

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://github.com/sveltejs/svelte-preprocess
	// for more information about preprocessors
	preprocess: [vitePreprocess()],

	kit: {
		adapter: adapter({
			fallback: 'index.html',
			pages: buildDir,
			assets: buildDir
		}),
		prerender: { entries: [], handleUnseenRoutes: 'ignore' }
		// outDir: 'testDir'
	}
};

export default config;
