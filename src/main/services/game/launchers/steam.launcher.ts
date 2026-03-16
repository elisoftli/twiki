import { promises as fs } from 'fs';
import path from 'path';
import { app, shell } from 'electron';
import {
  parseSteamData,
  type SteamConfigValue,
  getSteamInstallPath,
  getMostRecentUserId,
} from '../../../utils/steam.utils';
import { parseAppInfo, type AppInfoEntry } from '../../../utils/appinfo.utils';
import type { SteamGame, SteamLibraryFolder, SteamLaunchConfig } from '../../../interfaces/steam.interface';
import { type Game, GameLauncher, type ILauncherService } from '../../../interfaces/game-library.interface';
import { generateGameId } from '../../../utils/game-id.utils';
import {
  areProcessesRunning,
  killProcesses,
  waitForProcessTermination,
  expandWindowsEnvVars,
} from '../../../utils/system.utils';
import type { GameLibraryService } from '../game-library.service';

/** Timeout for waiting for game process termination in milliseconds */
const GAME_TERMINATION_TIMEOUT_MS = 5000;

const DEFAULT_HIDDEN_STEAM_APP_IDS = [
  '228980', // Steamworks Common Redistributables
];

export class SteamService implements ILauncherService {
  // ILauncherService: Launcher type identifier
  public readonly launcher = GameLauncher.STEAM;

  // Private state
  private _installPath!: string;
  private _libraryPaths: string[] = [];
  private _userId: string | null = null;
  private _userConfigPath: string | null = null;
  private _games: SteamGame[] = [];
  private _isLoaded: boolean = false;
  private _error: string | null = null;

  constructor(private readonly libraryService?: GameLibraryService) {}

  // Public getters (return immutable copies where applicable)
  public get installPath(): string {
    return this._installPath;
  }

  public get userId(): string | null {
    return this._userId;
  }

  public get userConfigPath(): string | null {
    return this._userConfigPath;
  }

  /**
   * Get raw Steam games (for Steam-specific operations)
   */
  public getSteamGames(): SteamGame[] {
    return [...this._games];
  }

  /**
   * ILauncherService: Get all games in generic Game format
   */
  public getGames(): Game[] {
    return this._games.map((g) => this.toGenericGame(g));
  }

  /**
   * Convert internal SteamGame to generic Game format
   */
  private toGenericGame(steamGame: SteamGame): Game {
    return {
      id: generateGameId(GameLauncher.STEAM, steamGame.appId, steamGame.installPath),
      launcherId: steamGame.appId,
      launcher: GameLauncher.STEAM,
      launcherInstallPath: this.installPath as string,
      name: steamGame.name,
      installPath: steamGame.installPath,
      posterPath: steamGame.posterPath,
      heroPath: steamGame.heroPath,
      launchConfigs: steamGame.launchConfigs.map((config) => ({
        executable: config.executable,
        relativeExecutable: config.relativeExecutable,
        type: config.type,
        description: config.description,
        oslist: config.oslist,
        osarch: config.osarch,
        workingdir: config.workingdir,
      })),
      lastPlayed: steamGame.lastPlayed,
      pinnedAt: null,
    };
  }

  public get isLoaded(): boolean {
    return this._isLoaded;
  }

  public get error(): string | null {
    return this._error;
  }

  // ==================== ILauncherService Methods ====================

  /**
   * ILauncherService: Launch a game via Steam protocol
   */
  public launchGame(game: Game): void {
    shell.openExternal(`steam://run/${game.launcherId}`);
  }

  /**
   * ILauncherService: Check if a game is running by checking its executables
   */
  public async isGameRunning(appId: string): Promise<boolean> {
    const game = this._games.find((g) => g.appId === appId);
    if (!game) return false;

    const processNames = game.launchConfigs.map((config) => path.basename(config.executable));
    return await areProcessesRunning(processNames);
  }

  /**
   * ILauncherService: Terminate a running game
   */
  public async terminateGame(appId: string): Promise<void> {
    const game = this._games.find((g) => g.appId === appId);
    if (!game) return;

    const processNames = game.launchConfigs.map((config) => path.basename(config.executable));
    await killProcesses(processNames);
    await waitForProcessTermination(processNames, GAME_TERMINATION_TIMEOUT_MS);
  }

  /**
   * ILauncherService: Expand Steam-specific path variables
   * Handles placeholders like <Steam-folder>, <user-id>, and Steam App ID in userdata paths
   *
   * Note: <user-id> is only expanded if the path is detected to be Steam-related,
   * to avoid incorrectly replacing it in non-Steam paths (e.g., %LOCALAPPDATA% paths)
   */
  public expandPath(pathString: string): string {
    let result = pathString;

    // Check if this is a Steam-related path before we modify it
    const isSteamRelated = this.isSteamRelatedPath(pathString);

    // Replace <Steam-folder> with the Steam installation path
    if (this._installPath) {
      result = result.replace(/<Steam-folder>/gi, this._installPath);
    }

    // Only replace <user-id> with Steam user ID if the path is Steam-related
    if (this._userId && isSteamRelated) {
      result = result.replace(/<user-id>/gi, this._userId);
    }

    // Normalize path separators to the platform's separator
    result = result.replace(/[/\\]+/g, path.sep);

    return result;
  }

  /**
   * Determines if a path is Steam-related and should have <user-id> expanded to Steam user ID
   *
   * A path is considered Steam-related if:
   * 1. It contains the <Steam-folder> placeholder
   * 2. After expanding Windows env vars, it starts with the Steam install path
   * 3. After expanding Windows env vars, it starts with any Steam library path
   */
  private isSteamRelatedPath(pathString: string): boolean {
    // Check if path contains <Steam-folder> placeholder
    if (/<Steam-folder>/i.test(pathString)) {
      return true;
    }

    // Expand Windows environment variables to get the actual path for comparison
    const expandedPath = expandWindowsEnvVars(pathString).toLowerCase();

    // Check if path starts with Steam install path
    if (this._installPath && expandedPath.startsWith(this._installPath.toLowerCase())) {
      return true;
    }

    // Check if path starts with any Steam library path
    for (const libraryPath of this._libraryPaths) {
      if (expandedPath.startsWith(libraryPath.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  // ==================== Steam Environment Loading ====================

  /**
   * Loads the Steam environment configuration.
   * Must be called before accessing any data via getters.
   * @returns true if loaded successfully, false otherwise (check error property for details)
   */
  public async loadEnvironment(): Promise<boolean> {
    try {
      // Reset state
      this._error = null;
      this._isLoaded = false;

      // Step 1: Find Steam installation path from registry
      const steamInstallPath = await getSteamInstallPath();
      if (!steamInstallPath) {
        this._error = 'Steam installation not found in Windows registry';
        return false;
      }
      this._installPath = steamInstallPath;

      // Step 2: Find the most recently used Steam user ID
      const userId = await getMostRecentUserId(steamInstallPath);
      if (!userId) {
        this._error = 'No Steam user data found';
        return false;
      }
      this._userId = userId;

      // Step 3: Construct and verify user config path
      const userConfigPath = path.join(steamInstallPath, 'userdata', userId, 'config', 'localconfig.vdf');
      try {
        await fs.access(userConfigPath);
        this._userConfigPath = userConfigPath;
      } catch {
        this._error = `User config file not found at: ${userConfigPath}`;
        return false;
      }

      // Step 4: Parse library folders
      const libraryFolders = await this.parseLibraryFolders(steamInstallPath);
      this._libraryPaths = libraryFolders.map((lf) => lf.path);

      // Step 5: Parse appinfo.vdf to get launch configurations
      const appInfoPath = path.join(steamInstallPath, 'appcache', 'appinfo.vdf');
      const appInfoMap = await parseAppInfo(appInfoPath);

      // Step 6: Parse lastPlayed timestamps from user config
      const lastPlayedMap = await this.parseLastPlayedTimestamps();

      // Step 7: Parse games from all library folders with launch configs and lastPlayed
      this._games = await this.parseGamesFromLibraries(libraryFolders, appInfoMap, lastPlayedMap);

      this._isLoaded = true;
      return true;
    } catch (error) {
      this._error = `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
      return false;
    }
  }

  /**
   * Parses the Steam user config file to extract lastPlayed timestamps for each game
   * Structure: UserLocalConfigStore.Software.Valve.Steam.apps.{appId}.LastPlayed
   */
  private async parseLastPlayedTimestamps(): Promise<Map<string, Date>> {
    const timestamps = new Map<string, Date>();

    if (!this._userConfigPath) {
      return timestamps;
    }

    try {
      const content = await fs.readFile(this._userConfigPath, 'utf-8');
      const parsed = parseSteamData(content);

      // Navigate to: UserLocalConfigStore.Software.Valve.Steam.apps
      const userLocalConfigStore = parsed['UserLocalConfigStore'];
      if (!userLocalConfigStore || typeof userLocalConfigStore === 'string') {
        return timestamps;
      }

      const software = (userLocalConfigStore as Record<string, SteamConfigValue>)['Software'];
      if (!software || typeof software === 'string') {
        return timestamps;
      }

      const valve = (software as Record<string, SteamConfigValue>)['Valve'];
      if (!valve || typeof valve === 'string') {
        return timestamps;
      }

      const steam = (valve as Record<string, SteamConfigValue>)['Steam'];
      if (!steam || typeof steam === 'string') {
        return timestamps;
      }

      const apps = (steam as Record<string, SteamConfigValue>)['apps'];
      if (!apps || typeof apps === 'string') {
        return timestamps;
      }

      // Iterate through each app and extract LastPlayed
      for (const [appId, appData] of Object.entries(apps)) {
        if (typeof appData === 'object' && appData !== null) {
          const lastPlayedValue = (appData as Record<string, SteamConfigValue>)['LastPlayed'];
          if (typeof lastPlayedValue === 'string') {
            const timestamp = parseInt(lastPlayedValue, 10);
            if (!isNaN(timestamp) && timestamp > 0) {
              // Steam stores timestamps as Unix epoch seconds
              timestamps.set(appId, new Date(timestamp * 1000));
            }
          }
        }
      }
    } catch {
      // Failed to parse user config - return empty map
    }

    return timestamps;
  }

  /**
   * Parses Steam's libraryfolders.vdf file to get all library paths and installed apps
   */
  private async parseLibraryFolders(steamInstallPath: string): Promise<SteamLibraryFolder[]> {
    const libraryFoldersPath = path.join(steamInstallPath, 'steamapps', 'libraryfolders.vdf');

    try {
      const content = await fs.readFile(libraryFoldersPath, 'utf-8');
      const parsed = parseSteamData(content);

      const libraries: SteamLibraryFolder[] = [];

      // The root object should have a "libraryfolders" key
      const libraryFoldersData = parsed['libraryfolders'];
      if (!libraryFoldersData || typeof libraryFoldersData === 'string') {
        return libraries;
      }

      // Each numeric key (0, 1, 2, ...) represents a library folder
      for (const [key, value] of Object.entries(libraryFoldersData)) {
        if (!/^\d+$/.test(key) || typeof value === 'string') {
          continue;
        }

        const libraryPath = (value as Record<string, SteamConfigValue>)['path'];
        const appsData = (value as Record<string, SteamConfigValue>)['apps'];

        if (typeof libraryPath === 'string' && appsData && typeof appsData !== 'string') {
          libraries.push({
            path: libraryPath,
            apps: appsData as Record<string, string>,
          });
        }
      }

      return libraries;
    } catch {
      return [];
    }
  }

  /**
   * Parses game information from appmanifest files in all library folders
   */
  private async parseGamesFromLibraries(
    libraries: SteamLibraryFolder[],
    appInfoMap: Map<string, AppInfoEntry>,
    lastPlayedMap: Map<string, Date>
  ): Promise<SteamGame[]> {
    const games: SteamGame[] = [];
    const posterDownloadQueue: { appId: string; index: number }[] = [];
    const heroDownloadQueue: { appId: string; index: number }[] = [];

    for (const library of libraries) {
      const steamappsPath = path.join(library.path, 'steamapps');

      try {
        const entries = await fs.readdir(steamappsPath);

        // Filter for appmanifest_*.acf files
        const manifestFiles = entries.filter((entry) => entry.startsWith('appmanifest_') && entry.endsWith('.acf'));

        for (const manifestFile of manifestFiles) {
          try {
            const manifestPath = path.join(steamappsPath, manifestFile);
            const content = await fs.readFile(manifestPath, 'utf-8');
            const parsed = parseSteamData(content);

            // Extract data from AppState
            const appState = parsed['AppState'];
            if (!appState || typeof appState === 'string') {
              continue;
            }

            const appId = (appState as Record<string, SteamConfigValue>)['appid'];
            const name = (appState as Record<string, SteamConfigValue>)['name'];
            const installDir = (appState as Record<string, SteamConfigValue>)['installdir'];

            if (
              typeof appId === 'string' &&
              typeof name === 'string' &&
              typeof installDir === 'string' &&
              !DEFAULT_HIDDEN_STEAM_APP_IDS.includes(appId)
            ) {
              // Try to resolve image paths (local files only)
              const posterPath = await this.resolvePosterPath(appId);
              const heroPath = await this.resolveHeroPath(appId);
              const installPath = path.join(steamappsPath, 'common', installDir);

              // Get launch configs from appinfo.vdf
              const launchConfigs = this.buildLaunchConfigs(appId, installPath, appInfoMap).filter(
                (config, i, self) => self.findIndex((c) => c.executable === config.executable) === i
              );

              const game: SteamGame = {
                appId,
                name,
                installPath,
                posterPath,
                heroPath,
                launchConfigs,
                lastPlayed: lastPlayedMap.get(appId) ?? null,
              };

              games.push(game);
              const gameIndex = games.length - 1;

              // If no local poster found, queue for async download
              if (!posterPath) {
                posterDownloadQueue.push({ appId, index: gameIndex });
              }

              // If no local hero found, queue for async download
              if (!heroPath) {
                heroDownloadQueue.push({ appId, index: gameIndex });
              }
            }
          } catch {
            // Skip this manifest file if we can't parse it
            continue;
          }
        }
      } catch {
        // Skip this library if we can't read its steamapps folder
        continue;
      }
    }

    // Start async downloads (don't await - runs in background)
    if (posterDownloadQueue.length > 0 || heroDownloadQueue.length > 0) {
      this.processDownloadQueues(posterDownloadQueue, heroDownloadQueue);
    }

    return games;
  }

  /**
   * Builds launch configurations for a game from appinfo.vdf data
   * Filters for Windows-compatible launch configs
   */
  private buildLaunchConfigs(
    appId: string,
    installPath: string,
    appInfoMap: Map<string, AppInfoEntry>
  ): SteamLaunchConfig[] {
    const appInfo = appInfoMap.get(appId);
    if (!appInfo) {
      return [];
    }

    const launchConfigs: SteamLaunchConfig[] = [];

    for (const config of appInfo.launchConfigs) {
      // Filter for Windows-compatible launch configs
      // Include if oslist is undefined, empty, or contains "windows"
      const oslist = config.oslist?.toLowerCase() ?? '';
      if (oslist && !oslist.includes('windows')) {
        continue;
      }

      // Build full executable path
      const executable = path.join(installPath, config.executable);

      launchConfigs.push({
        executable,
        relativeExecutable: config.executable,
        type: config.type,
        description: config.description,
        oslist: config.oslist,
        osarch: config.osarch,
        workingdir: config.workingdir,
      });
    }

    return launchConfigs;
  }

  // ==================== Image Resolution Methods ====================

  /**
   * Gets the app's image cache directory
   */
  private getImageCacheDir(): string {
    return path.join(app.getPath('userData'), 'library-cache', 'steam');
  }

  /**
   * Gets the path where an image would be cached in our app
   */
  private getAppImageCachePath(appId: string, type: 'poster' | 'hero'): string {
    return path.join(this.getImageCacheDir(), `${appId}_${type}.jpg`);
  }

  /**
   * Checks if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolves the poster path for a game, checking local caches only
   * Returns null if not found locally (needs download)
   */
  private async resolvePosterPath(appId: string): Promise<string | null> {
    // 1. Check our app's cache first
    const appCachePath = this.getAppImageCachePath(appId, 'poster');
    if (await this.fileExists(appCachePath)) {
      return appCachePath;
    }

    // 2. Check Steam's local cache
    if (this._installPath) {
      const steamCacheDir = path.join(this._installPath, 'appcache', 'librarycache', appId);

      // 2a. Check direct file: librarycache/{appId}/library_600x900.jpg
      const directPath = path.join(steamCacheDir, 'library_600x900.jpg');
      if (await this.fileExists(directPath)) {
        return directPath;
      }

      // 2b. Search hash subdirectories for library_capsule.jpg
      // Structure: librarycache/{appId}/{hash}/library_capsule.jpg
      try {
        const entries = await fs.readdir(steamCacheDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const capsulePath = path.join(steamCacheDir, entry.name, 'library_capsule.jpg');
            if (await this.fileExists(capsulePath)) {
              return capsulePath;
            }
          }
        }
      } catch {
        // Directory doesn't exist or can't be read
      }
    }

    // 3. Not found locally
    return null;
  }

  /**
   * Resolves the hero image path for a game, checking local caches only
   * Returns null if not found locally (needs download)
   */
  private async resolveHeroPath(appId: string): Promise<string | null> {
    // 1. Check our app's cache first
    const appCachePath = this.getAppImageCachePath(appId, 'hero');
    if (await this.fileExists(appCachePath)) {
      return appCachePath;
    }

    // 2. Check Steam's local cache
    if (this._installPath) {
      const steamCacheDir = path.join(this._installPath, 'appcache', 'librarycache', appId);

      // 2a. Check direct file: librarycache/{appId}/library_hero.jpg
      const directPath = path.join(steamCacheDir, 'library_hero.jpg');
      if (await this.fileExists(directPath)) {
        return directPath;
      }

      // 2b. Search hash subdirectories for library_hero.jpg
      // Structure: librarycache/{appId}/{hash}/library_hero.jpg
      try {
        const entries = await fs.readdir(steamCacheDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const heroPath = path.join(steamCacheDir, entry.name, 'library_hero.jpg');
            if (await this.fileExists(heroPath)) {
              return heroPath;
            }
          }
        }
      } catch {
        // Directory doesn't exist or can't be read
      }
    }

    // 3. Not found locally
    return null;
  }

  /**
   * Downloads a poster from Steam CDN with fallbacks
   * Saves to our app's cache and returns the path
   */
  private async downloadPoster(appId: string): Promise<string | null> {
    const urls = [
      `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_600x900_2x.jpg`,
      `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_600x900.jpg`,
      `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/header.jpg`,
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const cachePath = this.getAppImageCachePath(appId, 'poster');

          // Ensure directory exists
          await fs.mkdir(path.dirname(cachePath), { recursive: true });
          await fs.writeFile(cachePath, buffer);

          return cachePath;
        }
      } catch {
        // Try next URL
        continue;
      }
    }

    return null;
  }

  /**
   * Downloads a hero image from Steam CDN with fallbacks
   * Saves to our app's cache and returns the path
   */
  private async downloadHero(appId: string): Promise<string | null> {
    const urls = [
      `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/library_hero.jpg`,
      `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/header.jpg`,
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const cachePath = this.getAppImageCachePath(appId, 'hero');

          // Ensure directory exists
          await fs.mkdir(path.dirname(cachePath), { recursive: true });
          await fs.writeFile(cachePath, buffer);

          return cachePath;
        }
      } catch {
        // Try next URL
        continue;
      }
    }

    return null;
  }

  /**
   * Processes the download queues in background
   * Updates games array and notifies via GameLibraryService when each image is downloaded
   */
  private async processDownloadQueues(
    posterQueue: { appId: string; index: number }[],
    heroQueue: { appId: string; index: number }[]
  ): Promise<void> {
    // Process poster downloads
    for (const { appId, index } of posterQueue) {
      try {
        const posterPath = await this.downloadPoster(appId);
        if (posterPath && this._games[index]) {
          // Update the game in our array
          this._games[index].posterPath = posterPath;

          // Notify via library service (which handles renderer notification)
          if (this.libraryService) {
            this.libraryService.updateGamePoster(`${appId}`, posterPath);
          }
        }
      } catch {
        // Skip failed downloads
        continue;
      }
    }

    // Process hero downloads
    for (const { appId, index } of heroQueue) {
      try {
        const heroPath = await this.downloadHero(appId);
        if (heroPath && this._games[index]) {
          // Update the game in our array
          this._games[index].heroPath = heroPath;

          // Notify via library service (which handles renderer notification)
          if (this.libraryService) {
            this.libraryService.updateGameHero(`${appId}`, heroPath);
          }
        }
      } catch {
        // Skip failed downloads
        continue;
      }
    }
  }
}
