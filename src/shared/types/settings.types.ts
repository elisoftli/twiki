/**
 * Settings types for the application.
 * Extracted from settings.interface.ts
 */

export interface AutoTweakerSettings {
  autoApproveReadOnly: boolean;
  /** User-provided Claude API key to bypass rate limits */
  claudeApiKey?: string;
  /** Claude model to use (requires claudeApiKey). undefined = let Twiki decide */
  claudeModel?: 'haiku' | 'sonnet' | 'opus';
}

export interface GamePageSettings {
  autoExpandTweaks: boolean;
}

export interface GraphicsModsSettings {
  reshadeInstallerPath?: string;
}

export interface DownloadBrowserSettings {
  hideInfoDialog?: boolean;
}

export interface NexusModsSettings {
  apiKey?: string;
  /** When true, skip the download dialog and open the browser directly */
  hideDownloadDialog?: boolean;
}

export interface IntegrationsSettings {
  nexusMods: NexusModsSettings;
}

export interface LauncherSettings {
  enabled: boolean;
}

export interface GameLibrarySettings {
  /** Per-launcher settings keyed by launcher name (e.g., 'steam', 'xbox') */
  launchers: Record<string, LauncherSettings>;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

export interface Settings {
  isAutoUpdateEnabled: boolean;
  specsVisibility: SpecsVisibilitySettings;
  theme: string;
  autoTweaker: AutoTweakerSettings;
  gamePage: GamePageSettings;
  graphicsMods: GraphicsModsSettings;
  downloadBrowser: DownloadBrowserSettings;
  integrations: IntegrationsSettings;
  gameLibrary: GameLibrarySettings;
  useBuiltInEditor: boolean;
  disableHardwareAcceleration?: boolean;
  windowBounds?: WindowBounds;
}

export interface KeyboardShortcutsSettings {
  focusApp: string;
}

export interface SpecsVisibilitySettings {
  showOs: boolean;
  showCpu: boolean;
  showGpu: boolean;
  showDisplay: boolean;
}
