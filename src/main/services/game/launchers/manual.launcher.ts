import { promises as fs } from 'fs';
import path, { win32 as winPath } from 'path';
import { spawn } from 'child_process';
import { app, shell } from 'electron';
import { type Game, GameLauncher, type ILauncherService } from '../../../interfaces/game-library.interface';
import { generateGameId } from '../../../utils/game-id.utils';
import {
  areProcessesRunning,
  killProcesses,
  waitForProcessTermination,
} from '../../../utils/system.utils';
import { ensureDirectoryExists, ensureParentDirectoryExists, atomicWriteJson } from '../../../utils/json-store.utils';
import { createLogger } from '../../../utils/logger.utils';
import { AppliedTweaksService } from '../../tweak/applied-tweaks.service';
import { PCGW_USER_AGENT } from '@twiki/shared';

const logger = createLogger('ManualService');

/** Timeout for waiting for game process termination in milliseconds */
const GAME_TERMINATION_TIMEOUT_MS = 5000;

/** Data file version for future migrations */
const DATA_VERSION = 1;

/**
 * Internal representation of a manually imported game
 */
export interface ManualGame {
  /** Unique ID: "manual-{pcgwPageId}" */
  id: string;
  /** Display name */
  name: string;
  /** Full path to installation directory */
  installPath: string;
  /** Full path to the game executable */
  executablePath: string;
  /** Path to cached poster image (or null if not available) */
  posterPath: string | null;
  /** PCGW page ID (required for manual imports) */
  pcgwPageId: number;
  /** ISO timestamp when the game was imported */
  importedAt: string;
}

/**
 * Data structure for the manual games JSON file
 */
interface ManualGamesData {
  version: number;
  games: ManualGame[];
  savedAt: string;
}

/**
 * Parameters for importing a manual game
 */
export interface ImportGameParams {
  installPath: string;
  name: string;
  executablePath: string;
  pcgwPageId: number;
  posterUrl: string | null;
}

/**
 * Manual Game Launcher Service
 * Manages manually imported games that aren't auto-detected from Steam/Xbox/etc.
 * Games are persisted to a JSON file and posters are cached locally.
 */
export class ManualService implements ILauncherService {
  public readonly launcher = GameLauncher.MANUAL;

  private _games: ManualGame[] = [];
  private _isLoaded: boolean = false;
  private _error: string | null = null;
  private dataPath: string;
  private posterCacheDir: string;

  constructor() {
    this.dataPath = path.join(app.getPath('userData'), 'manual-games.json');
    this.posterCacheDir = path.join(app.getPath('userData'), 'library-cache', 'manual');
  }

  // ==================== Public Getters ====================

  public get isLoaded(): boolean {
    return this._isLoaded;
  }

  public get error(): string | null {
    return this._error;
  }

  // ==================== ILauncherService Methods ====================

  /**
   * ILauncherService: Get all games in generic Game format
   */
  public getGames(): Game[] {
    return this._games.map((g) => this.toGenericGame(g));
  }

  /**
   * Convert internal ManualGame to generic Game format
   */
  private toGenericGame(manualGame: ManualGame): Game {
    const relativeExecutable = winPath.relative(manualGame.installPath, manualGame.executablePath);

    return {
      id: generateGameId(GameLauncher.MANUAL, manualGame.id, manualGame.installPath),
      launcherId: manualGame.id,
      launcher: GameLauncher.MANUAL,
      name: manualGame.name,
      installPath: manualGame.installPath,
      posterPath: manualGame.posterPath,
      heroPath: manualGame.posterPath, // Use same image for hero
      pcgwPageId: manualGame.pcgwPageId,
      launchConfigs: [
        {
          executable: manualGame.executablePath,
          relativeExecutable,
          type: 'default',
          description: 'Launch',
        },
      ],
      lastPlayed: null,
      pinnedAt: null,
    };
  }

  /**
   * ILauncherService: Launch a game by opening the executable
   * If a Twiki launch config exists (type: 'twiki'), uses spawn() with the configured arguments.
   * Otherwise falls back to shell.openPath() for default behavior.
   */
  public launchGame(game: Game): void {
    const manualGame = this._games.find((g) => g.id === game.launcherId);
    if (!manualGame) {
      logger.warn(`Cannot launch game: game not found with ID ${game.launcherId}`);
      return;
    }

    // Check for Twiki launch config with arguments (identified by type: 'twiki')
    const twikiConfig = game.launchConfigs.find((c) => c.type === 'twiki' && c.args);

    if (twikiConfig && twikiConfig.args) {
      // Launch with arguments using spawn
      logger.info(`Launching ${game.name} with Twiki args: ${twikiConfig.args}`);

      const workingDir = winPath.dirname(manualGame.executablePath);

      // Parse arguments - split on whitespace but respect quoted strings
      const args = this.parseArguments(twikiConfig.args);

      const child = spawn(manualGame.executablePath, args, {
        cwd: workingDir,
        detached: true,
        stdio: 'ignore',
        windowsHide: false, // Show the game window
      });

      // Unref so the parent process can exit independently
      child.unref();

      child.on('error', (err) => {
        logger.error(`Failed to launch ${game.name}: ${err.message}`);
        // Fallback to shell.openPath if spawn fails
        logger.info(`Falling back to shell.openPath for ${game.name}`);
        shell.openPath(manualGame.executablePath);
      });
    } else {
      // Default behavior - use shell.openPath
      shell.openPath(manualGame.executablePath);
    }
  }

  /**
   * Parse a command-line arguments string into an array.
   * Handles quoted strings (both single and double quotes).
   */
  private parseArguments(argsString: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];

      if (!inQuote && (char === '"' || char === "'")) {
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote && char === ' ') {
        if (current.length > 0) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current.length > 0) {
      args.push(current);
    }

    return args;
  }

  /**
   * ILauncherService: Check if a game is running by checking its executable
   */
  public async isGameRunning(gameId: string): Promise<boolean> {
    const game = this._games.find((g) => g.id === gameId);
    if (!game) return false;

    const processName = winPath.basename(game.executablePath);
    return await areProcessesRunning([processName]);
  }

  /**
   * ILauncherService: Terminate a running game
   */
  public async terminateGame(gameId: string): Promise<void> {
    const game = this._games.find((g) => g.id === gameId);
    if (!game) return;

    const processName = winPath.basename(game.executablePath);
    await killProcesses([processName]);
    await waitForProcessTermination([processName], GAME_TERMINATION_TIMEOUT_MS);
  }

  /**
   * ILauncherService: Expand path variables
   * Manual games don't have special path expansion - return unchanged
   */
  public expandPath(pathString: string): string {
    return pathString;
  }

  // ==================== Environment Loading ====================

  /**
   * Load manual games from the JSON data file
   */
  public async loadEnvironment(): Promise<boolean> {
    try {
      this._error = null;
      this._isLoaded = false;

      logger.info('Loading manual games...');

      const data = await this.readData();
      this._games = data.games;

      this._isLoaded = true;
      logger.info(`Loaded ${this._games.length} manual game(s)`);
      return true;
    } catch (error) {
      this._error = `Failed to load manual games: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(this._error);
      this._isLoaded = true; // Mark as loaded even on error
      return false;
    }
  }

  // ==================== Import/Delete Methods ====================

  /**
   * Import a new manual game
   * @param params - Import parameters (install path, name, executable, PCGW info)
   * @returns The imported game in generic Game format
   */
  public async importGame(params: ImportGameParams): Promise<Game> {
    const { installPath, name, executablePath, pcgwPageId, posterUrl: pcgwPosterUrl } = params;

    // Generate the unique ID
    const id = `manual-${pcgwPageId}`;

    // Check if game with same ID already exists
    const existingGame = this._games.find((g) => g.id === id);
    if (existingGame) {
      throw new Error(`Game already imported: ${existingGame.name}`);
    }

    // Download poster if URL provided
    let posterPath: string | null = null;
    if (pcgwPosterUrl) {
      posterPath = await this.downloadPoster(id, pcgwPosterUrl);
    }

    const manualGame: ManualGame = {
      id,
      name,
      installPath,
      executablePath,
      posterPath,
      pcgwPageId,
      importedAt: new Date().toISOString(),
    };

    // Add to games array
    this._games.push(manualGame);

    // Save to JSON
    await this.saveData();

    logger.info(`Imported manual game: ${name} (${id})`);

    return this.toGenericGame(manualGame);
  }

  /**
   * Delete a manual game
   * @param id - The game ID to delete
   * @param deleteAppliedTweaks - Whether to also delete applied tweaks for this game
   */
  public async deleteGame(id: string, deleteAppliedTweaks: boolean): Promise<void> {
    const gameIndex = this._games.findIndex((g) => g.id === id);
    if (gameIndex === -1) {
      logger.warn(`Cannot delete game: game not found with ID ${id}`);
      return;
    }

    const game = this._games[gameIndex];

    // Remove cached poster if exists
    if (game.posterPath) {
      try {
        await fs.unlink(game.posterPath);
        logger.debug(`Deleted poster: ${game.posterPath}`);
      } catch {
        // Poster might not exist, that's fine
      }
    }

    // Delete applied tweaks if requested
    if (deleteAppliedTweaks) {
      const appliedTweaks = await AppliedTweaksService.getByGame(id);
      for (const tweak of appliedTweaks) {
        await AppliedTweaksService.remove(tweak.tweak.hash);
      }
      logger.info(`Deleted ${appliedTweaks.length} applied tweak(s) for game ${id}`);
    }

    // Remove from games array
    this._games.splice(gameIndex, 1);

    // Save to JSON
    await this.saveData();

    logger.info(`Deleted manual game: ${game.name} (${id})`);
  }

  /**
   * Check if a game with the given install path already exists
   */
  public hasGameWithInstallPath(installPath: string): boolean {
    const normalizedPath = winPath.normalize(installPath).toLowerCase();
    return this._games.some(
      (g) => winPath.normalize(g.installPath).toLowerCase() === normalizedPath
    );
  }

  /**
   * Check if a game with the given PCGW page ID already exists
   */
  public hasGameWithPcgwPageId(pcgwPageId: number): boolean {
    return this._games.some((g) => g.pcgwPageId === pcgwPageId);
  }

  // ==================== Data Persistence ====================

  /**
   * Read manual games data from JSON file
   */
  private async readData(): Promise<ManualGamesData> {
    try {
      await fs.access(this.dataPath);
    } catch {
      // File doesn't exist, return default
      return { version: DATA_VERSION, games: [], savedAt: new Date().toISOString() };
    }

    try {
      const content = await fs.readFile(this.dataPath, 'utf-8');
      const data = JSON.parse(content) as ManualGamesData;

      // Validate data structure
      return {
        version: data.version ?? DATA_VERSION,
        games: Array.isArray(data.games) ? data.games : [],
        savedAt: data.savedAt ?? new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Failed to parse manual games data: ${error}`);
      return { version: DATA_VERSION, games: [], savedAt: new Date().toISOString() };
    }
  }

  /**
   * Save manual games data to JSON file
   */
  private async saveData(): Promise<void> {
    const data: ManualGamesData = {
      version: DATA_VERSION,
      games: this._games,
      savedAt: new Date().toISOString(),
    };

    await ensureParentDirectoryExists(this.dataPath);
    await atomicWriteJson(this.dataPath, data);
    logger.debug(`Saved ${this._games.length} manual game(s) to data file`);
  }

  // ==================== Poster Download ====================

  /**
   * Download a poster image from URL and cache it locally
   * @param gameId - The game ID (used for filename)
   * @param posterUrl - The URL to download from
   * @returns The local cache path, or null if download failed
   */
  private async downloadPoster(gameId: string, posterUrl: string): Promise<string | null> {
    try {
      const response = await fetch(posterUrl, {
        headers: { 'User-Agent': PCGW_USER_AGENT },
      });
      if (!response.ok) {
        logger.warn(`Failed to download poster: ${response.status}`);
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Determine extension from content-type or URL
      let extension = '.jpg';
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('png')) {
        extension = '.png';
      } else if (contentType?.includes('webp')) {
        extension = '.webp';
      }

      const cachePath = path.join(this.posterCacheDir, `${gameId}_poster${extension}`);

      await ensureDirectoryExists(this.posterCacheDir);
      await fs.writeFile(cachePath, buffer);

      logger.debug(`Downloaded poster to: ${cachePath}`);
      return cachePath;
    } catch (error) {
      logger.warn(`Failed to download poster: ${error}`);
      return null;
    }
  }
}
