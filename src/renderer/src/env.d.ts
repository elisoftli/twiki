/// <reference types="svelte" />
/// <reference types="vite/client" />

import type { ElectronAPI } from '@electron-toolkit/preload';
import type { api } from '../../preload';

declare global {
	interface Window {
		electron: ElectronAPI;
		api: typeof api;
	}
}

declare module '@tanstack/table-core' {
	interface ColumnMeta {
		size?: number;
		sizePx?: number;
	}
}
