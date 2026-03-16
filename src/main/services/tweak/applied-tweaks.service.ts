/**
 * Applied Tweaks Service
 * Manages persistence and retrieval of applied tweaks for the revert system.
 */

import { app } from 'electron';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { Tweak } from '@twiki/shared';
import type { AppliedTweaksData, AppliedTweak } from '../../interfaces/tweak-agent.interface';
import type { AgentResponseSchemaType } from '../../schemas/tweak-summary.schema';
import { ensureParentDirectoryExists, atomicWriteJson } from '../../utils/json-store.utils';
import { buildAppliedTweak } from '../../utils/build-applied-tweak.utils';
import { ToolStatusService } from '../agent/tool-status.service';
import { createLogger } from '../../utils/logger.utils';

const logger = createLogger('AppliedTweaksService');

/** Current version of the applied tweaks data format */
const CURRENT_VERSION = 1;

/** Check if a path exists (async) */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Service for managing applied tweaks persistence.
 * Provides methods to store, retrieve, and remove applied tweaks.
 */
export class AppliedTweaksService {
  private static dataPath: string;

  /**
   * Get the path to the applied tweaks data file.
   * @returns Absolute path to the JSON file
   */
  private static getDataPath(): string {
    if (!this.dataPath) {
      const userDataPath = app.getPath('userData');
      this.dataPath = join(userDataPath, 'applied-tweaks.json');
    }
    return this.dataPath;
  }

  /**
   * Get the default empty data structure.
   * @returns Default AppliedTweaksData object
   */
  private static getDefaultData(): AppliedTweaksData {
    return {
      version: CURRENT_VERSION,
      tweaks: [],
    };
  }

  /**
   * Read and parse the applied tweaks data file.
   * @returns The stored data or default empty data if file doesn't exist
   */
  private static async readAppliedTweaks(): Promise<AppliedTweaksData> {
    const dataPath = this.getDataPath();

    try {
      if (!(await pathExists(dataPath))) {
        return this.getDefaultData();
      }

      const fileContent = await fs.readFile(dataPath, 'utf-8');
      const data = JSON.parse(fileContent) as AppliedTweaksData;

      // Validate and provide defaults
      return {
        version: data.version ?? CURRENT_VERSION,
        tweaks: Array.isArray(data.tweaks) ? data.tweaks : [],
      };
    } catch (error) {
      logger.error('Error reading applied tweaks file:', error);
      return this.getDefaultData();
    }
  }

  /**
   * Write applied tweaks data to the storage file atomically.
   * @param data - The data to write
   * @throws Error if write fails
   */
  private static async writeAppliedTweaks(data: AppliedTweaksData): Promise<void> {
    try {
      const dataPath = this.getDataPath();
      await ensureParentDirectoryExists(dataPath);
      await atomicWriteJson(dataPath, data);
    } catch (error) {
      logger.error('Error writing applied tweaks file:', error);
      throw error;
    }
  }

  /**
   * Get all applied tweaks for a specific game.
   * @param launcherGameId - The launcher-specific game identifier (e.g., Steam App ID)
   * @returns Array of applied tweaks for the game
   */
  public static async getByGame(launcherGameId: string): Promise<AppliedTweak[]> {
    const data = await this.readAppliedTweaks();
    return data.tweaks.filter((t) => t.launcherGameId === launcherGameId);
  }

  /**
   * Get all applied tweaks across all games.
   * @returns Array of all applied tweaks
   */
  public static async getAll(): Promise<AppliedTweak[]> {
    const data = await this.readAppliedTweaks();
    return data.tweaks;
  }

  /**
   * Add or update an applied tweak.
   * If a tweak with the same ID exists, it will be replaced.
   * @param tweak - The tweak to add or update
   */
  public static async add(tweak: AppliedTweak): Promise<void> {
    const data = await this.readAppliedTweaks();

    // Note: Non-revertible tool calls are already filtered out in buildAppliedTweak
    // based on the isRevertible field in each tool's output

    // Check if this tweak already exists (by hash)
    const existingIndex = data.tweaks.findIndex(
      (t) => t.tweak.hash === tweak.tweak.hash
    );

    if (existingIndex >= 0) {
      // Replace existing tweak
      data.tweaks[existingIndex] = tweak;
    } else {
      // Add new tweak
      data.tweaks.push(tweak);
    }

    await this.writeAppliedTweaks(data);
  }

  /**
   * Remove an applied tweak by its unique hash.
   * Typically called after reverting a tweak.
   * @param hash - The unique hash of the tweak to remove
   * @returns true if a tweak was removed, false if not found
   */
  public static async remove(hash: string): Promise<boolean> {
    const data = await this.readAppliedTweaks();

    const initialLength = data.tweaks.length;
    data.tweaks = data.tweaks.filter((t) => t.tweak.hash !== hash);

    if (data.tweaks.length !== initialLength) {
      await this.writeAppliedTweaks(data);
      return true;
    }

    return false;
  }

  /**
   * Capture and save applied tweak based on actual tool executions.
   * High-level method that handles the full capture-and-save flow.
   *
   * @param launcherGameId - The launcher-specific game ID (e.g., Steam App ID)
   * @param pcgwPageId - The PCGamingWiki page ID
   * @param tweak - The tweak being applied
   * @param agentResponse - Optional agent response (for message/status)
   */
  public static async captureAndSave(
    launcherGameId: string,
    pcgwPageId: number,
    tweak: Tweak,
    agentResponse: AgentResponseSchemaType | null
  ): Promise<void> {
    const toolSnapshot = ToolStatusService.getSnapshot();
    const completedTools = toolSnapshot.tools.filter((t) => t.status === 'completed');

    if (completedTools.length === 0) {
      logger.debug('No completed tools, skipping applied tweak save');
      return;
    }

    const appliedTweak = buildAppliedTweak(launcherGameId, pcgwPageId, tweak, completedTools, agentResponse);

    if (appliedTweak) {
      await this.add(appliedTweak);
      logger.info('Applied tweak saved:', tweak.title);
    } else {
      logger.debug('No revertible tools, applied tweak not saved');
    }
  }
}
