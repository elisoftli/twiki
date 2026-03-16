/**
 * Steam service types
 */

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
