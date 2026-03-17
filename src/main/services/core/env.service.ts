/**
 * Environment Service
 *
 * Type-safe service for loading and accessing application environment variables.
 * Provides defaults for all app-specific configuration.
 */

import { join } from 'path';
import { createLogger } from '../../utils/logger.utils';
import { config } from 'dotenv';

/**
 * Environment variable definitions with their types and defaults.
*/
interface EnvConfig {
  /** WebSocket URL for the agent server */
  AGENT_WEBSOCKET_URL: string;
  API_URL: string;
  PCGW_CACHE_ENABLED: boolean;
  /** Simulate an available update in development */
  MOCK_UPDATE: boolean;
}

const logger = createLogger('EnvService');

const envDir = join(__dirname, '../..');

const result = config({ path: join(envDir, '.env') });
if (result.error) {
  logger.debug('No .env file loaded (expected in packaged builds)');
} else {
  logger.debug('.env file loaded');
}

/**
 * Default values for all environment variables.
 */
const ENV_DEFAULTS: EnvConfig = {
  AGENT_WEBSOCKET_URL: '',
  API_URL: '',
  PCGW_CACHE_ENABLED: true,
  MOCK_UPDATE: false,
};

/**
 * Service for type-safe access to application environment variables.
 *
 * Usage:
 * ```ts
 * import { EnvService } from './env.service';
 *
 * const serverUrl = EnvService.get('AGENT_SERVER_URL');
 * ```
 */
export class EnvService {
  private static config: EnvConfig;
  private static initialized = false;

  /**
   * Initialize the environment service.
   * Loads environment variables from process.env, falling back to defaults.
   * Safe to call multiple times - will only initialize once.
   */
  public static init(): void {
    if (this.initialized) {
      return;
    }

    this.config = {
      AGENT_WEBSOCKET_URL: process.env.AGENT_WEBSOCKET_URL || ENV_DEFAULTS.AGENT_WEBSOCKET_URL,
      API_URL: process.env.API_URL || ENV_DEFAULTS.API_URL,
      PCGW_CACHE_ENABLED: process.env.PCGW_CACHE_ENABLED
        ? process.env.PCGW_CACHE_ENABLED.toLowerCase() === 'true'
        : ENV_DEFAULTS.PCGW_CACHE_ENABLED,
      MOCK_UPDATE: process.env.MOCK_UPDATE
        ? process.env.MOCK_UPDATE.toLowerCase() === 'true'
        : ENV_DEFAULTS.MOCK_UPDATE,
    };

    this.initialized = true;

    logger.info('Initialized');
  }

  /**
   * Get an environment variable value.
   * Automatically initializes the service if not already done.
   *
   * @param key - The environment variable key
   * @returns The value (from process.env or default)
   */
  public static get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    if (!this.initialized) {
      this.init();
    }
    return this.config[key];
  }

  /**
   * Get all environment configuration.
   * Useful for debugging or logging.
   *
   * @returns A copy of the current configuration
   */
  public static getAll(): Readonly<EnvConfig> {
    if (!this.initialized) {
      this.init();
    }
    return { ...this.config };
  }

  /**
   * Check if a specific environment variable was explicitly set
   * (not using the default value).
   *
   * @param key - The environment variable key
   * @returns true if the variable was set in the environment
   */
  public static isSet<K extends keyof EnvConfig>(key: K): boolean {
    return process.env[key] !== undefined;
  }
}
