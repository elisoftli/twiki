import { app } from 'electron';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  GameLauncher,
  type Game,
  type GameLibraryStatus,
  type ILauncherService,
  type LaunchConfig,
} from '../../interfaces/game-library.interface';
import { SteamService } from './launchers/steam.launcher';
import { XboxService } from './launchers/xbox.launcher';
import { ManualService } from './launchers/manual.launcher';
import { MainWindow } from '../../windows';
import { createLogger } from '../../utils/logger.utils';
import { generateGameId } from '../../utils/game-id.utils';
import { ensureParentDirectoryExists, atomicWriteJson } from '../../utils/json-store.utils';
import { normalizePathForComparison } from '../../utils/path-template.utils';
import { SettingsService } from '../core/settings.service';
import { resolveDirectoryFiles } from './pcgamingwiki.service';
import type { PCGWConfigPath } from '@twiki/shared';

const logger = createLogger('GameLibraryService');

/** Data file version for future migrations */
const DATA_VERSION = 2;

interface GameLibraryData {
  version: number;
  games: Game[];
  savedAt: string;
}

/**
 * Aggregates games from all launcher services and provides a unified API
 * Singleton pattern - use initialize() once at startup, then getInstance() to access
 */
export class GameLibraryService {
  private static _instance: GameLibraryService | null = null;

  private readonly launchers: Map<GameLauncher, ILauncherService> = new Map();
  private _games: Game[] = [];
  private _isLoaded: boolean = false;
  private dataPath: string;

  private constructor() {
    this.dataPath = join(app.getPath('userData'), 'game-library.json');
    // Register available launcher services
    // Pass 'this' to launcher services so they can notify us of poster updates
    this.registerLauncher(new SteamService(this));
    this.registerLauncher(new XboxService());
    this.registerLauncher(new ManualService());
    // Future: this.registerLauncher(new EpicService(this));
    // Future: this.registerLauncher(new GOGService(this));
  }

  /**
   * Initialize the GameLibraryService singleton. Should only be called once during app startup.
   */
  public static initialize(): GameLibraryService {
    if (GameLibraryService._instance) {
      throw new Error('GameLibraryService has already been initialized');
    }
    GameLibraryService._instance = new GameLibraryService();
    return GameLibraryService._instance;
  }

  /**
   * Get the GameLibraryService singleton instance.
   * @throws Error if GameLibraryService has not been initialized
   */
  public static getInstance(): GameLibraryService {
    if (!GameLibraryService._instance) {
      throw new Error('GameLibraryService has not been initialized. Call GameLibraryService.initialize() first.');
    }
    return GameLibraryService._instance;
  }

  private registerLauncher(service: ILauncherService): void {
    this.launchers.set(service.launcher, service);
  }

  /**
   * Check if a launcher is enabled in settings
   */
  private isLauncherEnabled(launcher: GameLauncher): boolean {
    const launcherSettings = SettingsService.settings.gameLibrary?.launchers?.[launcher];
    // Default to enabled if not explicitly set
    return launcherSettings?.enabled ?? true;
  }

  public get games(): Game[] {
    return [...this._games];
  }

  public get isLoaded(): boolean {
    return this._isLoaded;
  }

  public getStatus(): GameLibraryStatus {
    const launchers: GameLibraryStatus['launchers'] = {};

    for (const [launcher, service] of this.launchers) {
      launchers[launcher] = {
        isLoaded: service.isLoaded,
        error: service.error,
        gameCount: service.getGames().length,
      };
    }

    return {
      isLoaded: this._isLoaded,
      launchers,
      error: null,
    };
  }

  /**
   * Load games from all registered launchers
   * @param skipCache - If true, skips loading from cache (used for forced reload)
   */
  public async loadAllLaunchers(skipCache: boolean = false): Promise<void> {
    logger.info('Loading game libraries...');

    // Step 1: Load from cache first for instant display (unless skipped)
    if (!skipCache) {
      await this.loadFromCache();
    }

    // Step 2: Load fresh data from enabled launchers in parallel
    const enabledLaunchers = Array.from(this.launchers.values()).filter((service) =>
      this.isLauncherEnabled(service.launcher)
    );
    const loadPromises = enabledLaunchers.map((service) => service.loadEnvironment());
    await Promise.allSettled(loadPromises);

    // Step 3: Aggregate all games and mark as loaded
    this.aggregateGames();
    this._isLoaded = true;
    logger.info(`Loaded ${this._games.length} games from ${this.launchers.size} launcher(s)`);

    // Step 4: Save fresh data to cache for next startup
    await this.saveToCache();

    // Notify renderer that library has finished loading
    MainWindow.getInstance().sendEvent('library:loaded', {
      gameCount: this._games.length,
    });
  }

  /**
   * Force reload the library - rescans all launchers for fresh game data
   * Note: We preserve user-configured properties (like pinnedAt) by keeping
   * _games intact - aggregateGames() handles merging fresh data with existing props
   */
  public async forceReload(): Promise<void> {
    logger.info('Force reloading game libraries...');
    this._isLoaded = false;
    await this.loadAllLaunchers(true);
  }

  /**
   * Aggregate games from all launchers into a single sorted array.
   * Preserves user-configured properties (like pinnedAt, pcgwPageId, extraConfigPaths, disabledConfigPaths, twiki launch configs) from existing games.
   */
  private aggregateGames(): void {
    // Build a map of existing custom properties by game ID
    const existingCustomProps = new Map<string, {
      pinnedAt: string | null;
      pcgwPageId?: number;
      nexusModsDomainName?: string;
      extraConfigPaths?: PCGWConfigPath[];
      disabledConfigPaths?: string[];
      twikiLaunchConfigs?: LaunchConfig[];
    }>();
    for (const game of this._games) {
      // Find twiki launch configs (identified by type: 'twiki')
      const twikiLaunchConfigs = game.launchConfigs.filter((c) => c.type === 'twiki');
      if (game.pinnedAt || game.pcgwPageId || game.nexusModsDomainName || game.extraConfigPaths || game.disabledConfigPaths || twikiLaunchConfigs.length > 0) {
        existingCustomProps.set(game.id, {
          pinnedAt: game.pinnedAt,
          pcgwPageId: game.pcgwPageId,
          nexusModsDomainName: game.nexusModsDomainName,
          extraConfigPaths: game.extraConfigPaths,
          disabledConfigPaths: game.disabledConfigPaths,
          twikiLaunchConfigs: twikiLaunchConfigs.length > 0 ? twikiLaunchConfigs : undefined,
        });
      }
    }

    // Collect fresh games from enabled launchers only
    this._games = [];
    for (const service of this.launchers.values()) {
      // Skip disabled launchers
      if (!this.isLauncherEnabled(service.launcher)) {
        continue;
      }
      const freshGames = service.getGames().map((game) => {
        // Merge custom properties from existing data
        const customProps = existingCustomProps.get(game.id);
        // Merge twiki launch configs with fresh launch configs
        const launchConfigs = customProps?.twikiLaunchConfigs
          ? [...game.launchConfigs, ...customProps.twikiLaunchConfigs]
          : game.launchConfigs;
        return {
          ...game,
          pinnedAt: customProps?.pinnedAt ?? null,
          pcgwPageId: customProps?.pcgwPageId,
          nexusModsDomainName: customProps?.nexusModsDomainName,
          extraConfigPaths: customProps?.extraConfigPaths,
          disabledConfigPaths: customProps?.disabledConfigPaths,
          launchConfigs,
        };
      });
      this._games.push(...freshGames);
    }

    // Sort: pinned games first (by pinnedAt desc), then unpinned (alphabetically)
    this._games.sort((a, b) => {
      // Both pinned: sort by pinnedAt descending (newest first)
      if (a.pinnedAt && b.pinnedAt) {
        return new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime();
      }
      // Only a is pinned: a comes first
      if (a.pinnedAt) return -1;
      // Only b is pinned: b comes first
      if (b.pinnedAt) return 1;
      // Neither pinned: sort alphabetically
      return a.name.localeCompare(b.name);
    });
  }

  // ==================== Data Persistence Methods ====================

  /**
   * Load games from the disk data file for instant startup
   * Emits 'library:cache-loaded' event if data exists
   */
  private async loadFromCache(): Promise<boolean> {
    try {
      const exists = await fs.access(this.dataPath).then(() => true).catch(() => false);
      if (!exists) {
        logger.info('No game library data found');
        return false;
      }

      const content = await fs.readFile(this.dataPath, 'utf-8');
      const data: GameLibraryData = JSON.parse(content);

      // Validate data structure
      if (!data.games || !Array.isArray(data.games)) {
        logger.warn('Invalid data structure, ignoring');
        return false;
      }

      // Restore Date objects for lastPlayed (JSON serializes dates as strings)
      // pinnedAt stays as ISO string for simplicity
      // extraConfigPaths and disabledConfigPaths are preserved as-is
      // Filter out games from disabled launchers
      // Migration: if a cached game has no launcherId field, set launcherId = game.id
      // and regenerate id using the generation function
      this._games = data.games
        .filter((game) => this.isLauncherEnabled(game.launcher))
        .map((game) => {
          // Migration from v1 cache: launcherId didn't exist, id was the launcher-specific ID
          const launcherId = game.launcherId ?? game.id;
          const id = game.launcherId ? game.id : generateGameId(game.launcher, launcherId, game.installPath);
          return {
            ...game,
            id,
            launcherId,
            lastPlayed: game.lastPlayed ? new Date(game.lastPlayed) : null,
            pinnedAt: game.pinnedAt ?? null,
            extraConfigPaths: game.extraConfigPaths,
            disabledConfigPaths: game.disabledConfigPaths,
          };
        });

      logger.info(`Loaded ${this._games.length} games from data file (saved ${data.savedAt})`);

      // Notify renderer that cache is loaded
      MainWindow.getInstance().sendEvent('library:cache-loaded', {
        gameCount: this._games.length,
      });

      return true;
    } catch (error) {
      logger.warn(`Failed to load cache: ${error}`);
      return false;
    }
  }

  /**
   * Save the current game library to disk data file
   */
  private async saveToCache(): Promise<void> {
    try {
      await ensureParentDirectoryExists(this.dataPath);

      const data: GameLibraryData = {
        version: DATA_VERSION,
        games: this._games,
        savedAt: new Date().toISOString(),
      };

      await atomicWriteJson(this.dataPath, data);
      logger.info(`Saved ${this._games.length} games to data file`);
    } catch (error) {
      logger.error(`Failed to save data file: ${error}`);
    }
  }

  /**
   * Get a single game by its unique internal ID
   */
  public getGame(id: string): Game | undefined {
    return this._games.find((g) => g.id === id);
  }

  /**
   * Get a single game by its launcher-specific ID (e.g., Steam App ID, Xbox Store ID).
   * Note: If multiple games share the same launcher ID (e.g., same game in different library folders),
   * this returns the first match.
   */
  public getGameByLauncherId(launcherId: string): Game | undefined {
    return this._games.find((g) => g.launcherId === launcherId);
  }

  /**
   * Get the launcher service for a given game
   */
  private getLauncherForGame(game: Game): ILauncherService | undefined {
    return this.launchers.get(game.launcher);
  }

  /**
   * Launch a game by its unique ID
   */
  public launchGame(id: string): void {
    const game = this.getGame(id);
    if (!game) return;

    const launcher = this.getLauncherForGame(game);
    launcher?.launchGame(game);
  }

  /**
   * Check if a game is currently running
   */
  public async isGameRunning(id: string): Promise<boolean> {
    const game = this.getGame(id);
    if (!game) return false;

    const launcher = this.getLauncherForGame(game);
    return (await launcher?.isGameRunning(game.launcherId)) ?? false;
  }

  /**
   * Terminate a running game
   */
  public async terminateGame(id: string): Promise<void> {
    const game = this.getGame(id);
    if (!game) return;

    const launcher = this.getLauncherForGame(game);
    await launcher?.terminateGame(game.launcherId);
  }

  /**
   * Update poster path for a game (called by launcher services)
   * Also notifies the renderer of the update.
   * @param launcherId - The launcher-specific ID (e.g., Steam App ID)
   * @param posterPath - Path to the poster image
   */
  public updateGamePoster(launcherId: string, posterPath: string): void {
    const gameIndex = this._games.findIndex((g) => g.launcherId === launcherId);
    if (gameIndex !== -1) {
      this._games[gameIndex].posterPath = posterPath;
      MainWindow.getInstance().sendEvent('library:game-poster-updated', {
        id: this._games[gameIndex].id,
        posterPath,
      });
    }
  }

  /**
   * Update hero path for a game (called by launcher services)
   * Also notifies the renderer of the update.
   * @param launcherId - The launcher-specific ID (e.g., Steam App ID)
   * @param heroPath - Path to the hero image
   */
  public updateGameHero(launcherId: string, heroPath: string): void {
    const gameIndex = this._games.findIndex((g) => g.launcherId === launcherId);
    if (gameIndex !== -1) {
      this._games[gameIndex].heroPath = heroPath;
      MainWindow.getInstance().sendEvent('library:game-hero-updated', {
        id: this._games[gameIndex].id,
        heroPath,
      });
    }
  }

  /**
   * Expand launcher-specific path variables for a game
   * @param gameId - The unique game ID in its launcher (e.g., "1234567")
   * @param path - Path that may contain launcher-specific placeholders
   * @returns Expanded path with placeholders resolved, or original path if game not found
   */
  public expandPath(gameId: string, path: string): string {
    const game = this.getGame(gameId);
    if (!game) return path;

    const launcher = this.getLauncherForGame(game);
    if (!launcher) return path;

    let expandedPath = launcher.expandPath(path);
    if (!expandedPath) return path;

    expandedPath = expandedPath.replace(/<path-to-game>/gi, game.installPath);

    return expandedPath;
  }

  public expandLauncherPath(path: string) {
    return path.replace(/%([^%]+)%/g, (match, varName) => {
      switch(varName) {
        case 'STEAMDIR':
          return this.launchers.get(GameLauncher.STEAM)?.installPath || match;
        default:
          return match;
      }
    });
  }

  /**
   * Update a game in the library with partial data
   * @param id - The game ID to update
   * @param updates - Partial game data to merge
   */
  public async updateGame(id: string, updates: Partial<Game>): Promise<void> {
    const gameIndex = this._games.findIndex((g) => g.id === id);
    if (gameIndex === -1) return;

    this._games[gameIndex] = { ...this._games[gameIndex], ...updates };
    await this.saveToCache();
  }

  /**
   * Pin a game to the top of the library
   * @param id - The game ID to pin
   */
  public async pinGame(id: string): Promise<void> {
    const gameIndex = this._games.findIndex((g) => g.id === id);
    if (gameIndex === -1) return;

    const pinnedAt = new Date().toISOString();
    this._games[gameIndex].pinnedAt = pinnedAt;

    // Re-sort to move pinned game to correct position
    this.sortGames();

    // Persist and notify
    await this.saveToCache();
    MainWindow.getInstance().sendEvent('library:game-pinned', { id, pinnedAt });
  }

  /**
   * Unpin a game from the top of the library
   * @param id - The game ID to unpin
   */
  public async unpinGame(id: string): Promise<void> {
    const gameIndex = this._games.findIndex((g) => g.id === id);
    if (gameIndex === -1) return;

    this._games[gameIndex].pinnedAt = null;

    // Re-sort to move unpinned game to correct position
    this.sortGames();

    // Persist and notify
    await this.saveToCache();
    MainWindow.getInstance().sendEvent('library:game-unpinned', { id });
  }

  /**
   * Sort games: pinned first (by pinnedAt desc), then unpinned (alphabetically)
   */
  private sortGames(): void {
    this._games.sort((a, b) => {
      // Both pinned: sort by pinnedAt descending (newest first)
      if (a.pinnedAt && b.pinnedAt) {
        return new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime();
      }
      // Only a is pinned: a comes first
      if (a.pinnedAt) return -1;
      // Only b is pinned: b comes first
      if (b.pinnedAt) return 1;
      // Neither pinned: sort alphabetically
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get the ManualService instance for manual game import/delete operations
   */
  public getManualService(): ManualService {
    return this.launchers.get(GameLauncher.MANUAL) as ManualService;
  }

  /**
   * Check if a game with the given install path already exists in the library
   * (across all launchers)
   */
  public hasGameWithInstallPath(installPath: string): boolean {
    const normalizedPath = installPath.replace(/\\/g, '/').toLowerCase();
    return this._games.some(
      (g) => g.installPath.replace(/\\/g, '/').toLowerCase() === normalizedPath
    );
  }

  /**
   * Add a game to the library (for manual import)
   * Re-sorts and saves the library after adding
   */
  public async addGame(game: Game): Promise<void> {
    this._games.push(game);
    this.sortGames();
    await this.saveToCache();
    MainWindow.getInstance().sendEvent('library:game-added', { game });
  }

  /**
   * Remove a game from the library (for manual delete)
   * Re-sorts and saves the library after removing
   */
  public async removeGame(id: string): Promise<void> {
    const index = this._games.findIndex((g) => g.id === id);
    if (index !== -1) {
      this._games.splice(index, 1);
      await this.saveToCache();
      MainWindow.getInstance().sendEvent('library:game-removed', { id });
    }
  }

  /**
   * Add a custom config path to a game.
   * Custom paths are user-defined and stored separately from PCGW-sourced paths.
   * @param gameId - The game ID to add the path to
   * @param path - The absolute path to add
   * @param pathType - Whether this is a 'file' or 'directory'
   * @returns The created config path object, or null if game not found
   */
  public async addCustomConfigPath(
    gameId: string,
    path: string,
    pathType: 'file' | 'directory'
  ): Promise<PCGWConfigPath | null> {
    const gameIndex = this._games.findIndex((g) => g.id === gameId);
    if (gameIndex === -1) return null;

    // Resolve files if this is a directory
    let resolvedFiles: string[] | undefined;
    if (pathType === 'directory') {
      resolvedFiles = await resolveDirectoryFiles(path);
    }

    const configPath: PCGWConfigPath = {
      path,
      pathType,
      exists: true, // Already validated by IPC handler
      platform: 'custom',
      category: 'config', // Custom paths are always config paths
      ...(resolvedFiles && { resolvedFiles }),
    };

    // Initialize extraConfigPaths array if needed
    if (!this._games[gameIndex].extraConfigPaths) {
      this._games[gameIndex].extraConfigPaths = [];
    }

    this._games[gameIndex].extraConfigPaths!.push(configPath);

    await this.saveToCache();
    MainWindow.getInstance().sendEvent('library:custom-config-path-added', {
      gameId,
      configPath,
    });

    return configPath;
  }

  /**
   * Remove a custom config path from a game.
   * Uses case-insensitive matching for Windows path compatibility.
   * @param gameId - The game ID to remove the path from
   * @param path - The path to remove
   * @returns true if the path was found and removed, false otherwise
   */
  public async removeCustomConfigPath(gameId: string, path: string): Promise<boolean> {
    const gameIndex = this._games.findIndex((g) => g.id === gameId);
    if (gameIndex === -1) return false;

    const extraPaths = this._games[gameIndex].extraConfigPaths;
    if (!extraPaths || extraPaths.length === 0) return false;

    // Find index using case-insensitive comparison (Windows paths)
    const normalizedPath = path.toLowerCase().replace(/\\/g, '/');
    const pathIndex = extraPaths.findIndex(
      (cp) => cp.path.toLowerCase().replace(/\\/g, '/') === normalizedPath
    );

    if (pathIndex === -1) return false;

    extraPaths.splice(pathIndex, 1);

    // Clean up empty array
    if (extraPaths.length === 0) {
      delete this._games[gameIndex].extraConfigPaths;
    }

    await this.saveToCache();
    MainWindow.getInstance().sendEvent('library:custom-config-path-removed', {
      gameId,
      path,
    });

    return true;
  }

  // ==================== Twiki Launch Config Methods ====================

  /**
   * Add or update a Twiki-managed launch configuration for a game.
   * This stores launch options internally for use when launching the game.
   * Twiki configs are identified by type: 'twiki'.
   * @param gameId - The game ID to add the config to
   * @param args - The launch arguments string
   */
  public async addTwikiLaunchConfig(gameId: string, args: string): Promise<void> {
    const gameIndex = this._games.findIndex((g) => g.id === gameId);
    if (gameIndex === -1) {
      logger.warn(`Cannot add twiki launch config: game not found with ID ${gameId}`);
      return;
    }

    const game = this._games[gameIndex];

    // Find existing twiki launch config (identified by type: 'twiki')
    const existingTwikiConfigIndex = game.launchConfigs.findIndex((c) => c.type === 'twiki');

    if (existingTwikiConfigIndex !== -1) {
      // Update existing twiki config - replace with new args (not append)
      // The caller is responsible for combining args if needed
      game.launchConfigs[existingTwikiConfigIndex].args = args;
      logger.info(`Updated twiki launch config for game ${gameId}: ${args}`);
    } else {
      // Create new twiki launch config based on the default config
      const defaultConfig = game.launchConfigs.find((c) => c.type === 'default') || game.launchConfigs[0];
      if (!defaultConfig) {
        logger.warn(`Cannot add twiki launch config: no default config found for game ${gameId}`);
        return;
      }

      const twikiConfig: LaunchConfig = {
        executable: defaultConfig.executable,
        relativeExecutable: defaultConfig.relativeExecutable,
        type: 'twiki',
        description: 'Launch with Twiki options',
        args,
      };

      game.launchConfigs.push(twikiConfig);
      logger.info(`Added twiki launch config for game ${gameId}: ${args}`);
    }

    await this.saveToCache();
  }

  /**
   * Remove the Twiki-managed launch configuration from a game.
   * Twiki configs are identified by type: 'twiki'.
   * @param gameId - The game ID to remove the config from
   * @returns true if a config was found and removed, false otherwise
   */
  public async removeTwikiLaunchConfig(gameId: string): Promise<boolean> {
    const gameIndex = this._games.findIndex((g) => g.id === gameId);
    if (gameIndex === -1) {
      logger.warn(`Cannot remove twiki launch config: game not found with ID ${gameId}`);
      return false;
    }

    const game = this._games[gameIndex];
    const twikiConfigIndex = game.launchConfigs.findIndex((c) => c.type === 'twiki');

    if (twikiConfigIndex === -1) {
      logger.debug(`No twiki launch config found for game ${gameId}`);
      return false;
    }

    game.launchConfigs.splice(twikiConfigIndex, 1);
    logger.info(`Removed twiki launch config for game ${gameId}`);

    await this.saveToCache();
    return true;
  }

  /**
   * Reorder pinned games by reassigning descending pinnedAt timestamps.
   * Only provided IDs are reordered; unlisted pinned games keep their existing timestamps
   * and sort after the reordered set.
   * @param orderedIds - Game IDs in desired display order (first = highest priority)
   */
  public async reorderPinnedGames(orderedIds: string[]): Promise<void> {
    const gameMap = new Map(this._games.map((g) => [g.id, g]));

    // Validate all provided IDs are currently pinned
    for (const id of orderedIds) {
      const game = gameMap.get(id);
      if (!game || !game.pinnedAt) {
        logger.warn(`reorderPinnedGames: game ${id} not found or not pinned, skipping`);
        continue;
      }
    }

    // Assign descending timestamps so first ID sorts first (newest pinnedAt)
    const baseTime = Date.now();
    for (let i = 0; i < orderedIds.length; i++) {
      const game = gameMap.get(orderedIds[i]);
      if (game?.pinnedAt) {
        game.pinnedAt = new Date(baseTime - i * 1000).toISOString();
      }
    }

    this.sortGames();
    await this.saveToCache();
  }

  // ==================== Config Path Enable/Disable Methods ====================

  /**
   * Disable a PCGW config path for a game.
   * Disabled paths will not be sent to the agent during tweak processing.
   * Uses case-insensitive matching for Windows path compatibility.
   * @param gameId - The game ID
   * @param path - The path to disable
   */
  public async disableConfigPath(gameId: string, path: string): Promise<void> {
    const gameIndex = this._games.findIndex((g) => g.id === gameId);
    if (gameIndex === -1) {
      logger.warn(`Cannot disable config path: game not found with ID ${gameId}`);
      return;
    }

    const game = this._games[gameIndex];

    // Initialize disabledConfigPaths array if needed
    if (!game.disabledConfigPaths) {
      game.disabledConfigPaths = [];
    }

    // Check if path is already disabled (using normalized comparison)
    const normalizedPath = normalizePathForComparison(path);
    const alreadyDisabled = game.disabledConfigPaths.some(
      (dp) => normalizePathForComparison(dp) === normalizedPath
    );

    if (alreadyDisabled) {
      logger.debug(`Path already disabled for game ${gameId}: ${path}`);
      return;
    }

    game.disabledConfigPaths.push(path);
    logger.info(`Disabled config path for game ${gameId}: ${path}`);

    await this.saveToCache();
    MainWindow.getInstance().sendEvent('library:config-path-disabled', {
      gameId,
      path,
    });
  }

  /**
   * Enable a previously disabled PCGW config path for a game.
   * Uses case-insensitive matching for Windows path compatibility.
   * @param gameId - The game ID
   * @param path - The path to enable
   */
  public async enableConfigPath(gameId: string, path: string): Promise<void> {
    const gameIndex = this._games.findIndex((g) => g.id === gameId);
    if (gameIndex === -1) {
      logger.warn(`Cannot enable config path: game not found with ID ${gameId}`);
      return;
    }

    const game = this._games[gameIndex];

    if (!game.disabledConfigPaths || game.disabledConfigPaths.length === 0) {
      logger.debug(`No disabled paths to enable for game ${gameId}`);
      return;
    }

    // Find and remove the path (using normalized comparison)
    const normalizedPath = normalizePathForComparison(path);
    const pathIndex = game.disabledConfigPaths.findIndex(
      (dp) => normalizePathForComparison(dp) === normalizedPath
    );

    if (pathIndex === -1) {
      logger.debug(`Path not found in disabled list for game ${gameId}: ${path}`);
      return;
    }

    game.disabledConfigPaths.splice(pathIndex, 1);

    // Clean up empty array
    if (game.disabledConfigPaths.length === 0) {
      delete game.disabledConfigPaths;
    }

    logger.info(`Enabled config path for game ${gameId}: ${path}`);

    await this.saveToCache();
    MainWindow.getInstance().sendEvent('library:config-path-enabled', {
      gameId,
      path,
    });
  }
}
