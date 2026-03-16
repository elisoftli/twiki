/**
 * Game Library types - Generic abstraction for multiple game launchers.
 * Extracted from game-library.interface.ts and steam.interface.ts
 */

/**
 * Enum representing supported game launchers
 */
export enum GameLauncher {
  STEAM = 'steam',
  EPIC = 'epic',
  GOG = 'gog',
  XBOX = 'xbox',
  UBISOFT = 'ubisoft',
  EA = 'ea',
  CUSTOM = 'custom',
  MANUAL = 'manual',
}

/**
 * Generic launch configuration for any game
 */
export interface LaunchConfig {
  /** Full path to executable */
  executable: string;
  /** Relative path from install dir */
  relativeExecutable: string;
  /** Launch type: "default", "option", etc. */
  type?: string;
  /** Display name for this launch option */
  description?: string;
  /** Target OS: "windows", "linux", "macos" */
  oslist?: string;
  /** Architecture: "32" or "64" */
  osarch?: string;
  /** Working directory for launch */
  workingdir?: string;
}

/**
 * Generic game interface supporting all launchers
 */
export interface Game {
  /**
   * Unique internal identifier. Generated as `${launcher}:${launcherId}:${shortHash(installPath)}`
   * to guarantee uniqueness even when the same launcher-specific ID appears in multiple library folders.
   */
  id: string;
  /**
   * Launcher-specific identifier (e.g., Steam App ID, Xbox Store ID, Manual UUID).
   * Used for launcher protocol URLs, PCGW lookups, and external API queries.
   */
  launcherId: string;
  /** Which launcher this game belongs to */
  launcher: GameLauncher;
  /** PCGW Page ID (populated after PCGW data fetch) */
  pcgwPageId?: number;
  /** NexusMods game domain name slug (e.g., "skyrimspecialedition"), cached after first resolution */
  nexusModsDomainName?: string;
  /** Where the launcher is installed */
  launcherInstallPath?: string;
  /** Display name */
  name: string;
  /** Full path to installation directory */
  installPath: string;
  /** Path to poster/cover image (or null if not available) */
  posterPath: string | null;
  /** Path to hero/banner image (or null if not available) */
  heroPath: string | null;
  /** Available launch configurations */
  launchConfigs: LaunchConfig[];
  /** Last played timestamp (or null if never played/unknown) */
  lastPlayed: Date | null;
  /** Timestamp when game was pinned (null if not pinned) */
  pinnedAt: string | null;
  /** User-added custom config paths (persisted alongside launcher data) */
  extraConfigPaths?: import('@twiki/shared').PCGWConfigPath[];
  /** PCGW paths disabled by user (prevents them from being sent to agent) */
  disabledConfigPaths?: string[];
}

/**
 * Status of the game library service
 */
export interface GameLibraryStatus {
  /** Whether the library has finished loading */
  isLoaded: boolean;
  /** Per-launcher status */
  launchers: {
    [key in GameLauncher]?: {
      isLoaded: boolean;
      error: string | null;
      gameCount: number;
    };
  };
  /** Overall error message (if any launcher failed critically) */
  error: string | null;
}

/**
 * Interface that all launcher-specific services must implement
 */
export interface ILauncherService {
  /** The launcher type this service handles */
  readonly launcher: GameLauncher;
  /** Whether this launcher's games have been loaded */
  readonly isLoaded: boolean;
  /** Error message if loading failed */
  readonly error: string | null;
  // Install directory
  readonly installPath?: string;
  /** Load/refresh games from this launcher */
  loadEnvironment(): Promise<boolean>;
  /** Get all games from this launcher (converted to generic Game format) */
  getGames(): Game[];
  /** Launch a game */
  launchGame(game: Game): void;
  /** Check if a game is currently running */
  isGameRunning(launcherGameId: string): Promise<boolean>;
  /** Terminate a running game */
  terminateGame(launcherGameId: string): Promise<void>;
  /**
   * Expand launcher-specific path variables
   * @param path - Path that may contain launcher-specific placeholders
   * @param launcherGameId - The launcher-specific game ID (e.g., Steam App ID)
   * @returns Expanded path with placeholders resolved
   */
  expandPath(path: string): string;
}

// =============================================================================
// Steam-specific Types
// =============================================================================

/**
 * Launch configuration for a Steam game
 */
export interface SteamLaunchConfig {
  executable: string; // Full path to executable
  relativeExecutable: string; // Relative path from install dir
  type?: string; // "default", "option", etc.
  description?: string; // Display name for launch option
  oslist?: string; // "windows", "linux", "macos"
  osarch?: string; // "32" or "64" for architecture
  workingdir?: string; // Working directory
}

export interface SteamGame {
  appId: string;
  name: string;
  installPath: string;
  posterPath: string | null;
  heroPath: string | null;
  launchConfigs: SteamLaunchConfig[]; // All launch configurations
  lastPlayed: Date | null; // Last played timestamp from Steam user config
}

export interface SteamLibraryFolder {
  path: string;
  apps: Record<string, string>;
}

export interface SteamServiceStatus {
  isLoaded: boolean;
  error: string | null;
}
