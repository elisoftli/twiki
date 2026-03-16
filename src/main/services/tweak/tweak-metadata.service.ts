/**
 * Tweak Metadata Service
 * Handles batch fetching of tweak metadata (processability status and recipes).
 */

import type { TweakMetadata } from '@twiki/shared';
import { EnvService } from '../core/env.service';
import { createLogger } from '../../utils/logger.utils';

const logger = createLogger('TweakMetadataService');

// Re-export TweakMetadata for backwards compatibility
export type { TweakMetadata } from '@twiki/shared';

/**
 * Map of tweak hashes to their metadata
 */
export type TweakMetadataMap = Map<string, TweakMetadata>;

/**
 * Service for fetching tweak metadata including processability status and recipes.
 */
export class TweakMetadataService {
  /**
   * Fetch metadata for multiple tweaks in a single batch request.
   * Returns processability status and recipes for each tweak hash.
   *
   * @param hashes - Array of deterministic tweak hashes
   * @param pcgwPageId - The PCGamingWiki page ID for the game
   * @param launcher - Optional launcher type for filtering (e.g., 'steam', 'xbox')
   * @returns Map of tweak hashes to their metadata
   */
  public static async fetchTweakMetadata(hashes: string[], pcgwPageId: number, launcher?: string): Promise<TweakMetadataMap> {
    if (hashes.length === 0) {
      return new Map();
    }

    try {
      const baseUrl = EnvService.get('API_URL');
      const response = await fetch(`${baseUrl}/tweak-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes, pcgwPageId, ...(launcher && { launcher }) }),
      });

      const data = (await response.json()) as {
        metadata: Record<string, TweakMetadata>;
        error?: string;
      };

      if (data.error) {
        logger.error('Server error:', data.error);
      }

      const map: TweakMetadataMap = new Map();

      for (const [id, meta] of Object.entries(data.metadata)) {
        map.set(id, meta);
      }

      logger.debug(`Fetched metadata for ${map.size} tweaks`);
      return map;
    } catch (error) {
      logger.error('Error fetching metadata:', error);
      // Return empty map on error - all tweaks default to processable
      return new Map();
    }
  }
}
