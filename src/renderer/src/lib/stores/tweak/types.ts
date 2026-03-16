/**
 * Tweak Store Types
 *
 * Shared types for tweak-related stores.
 */

import type { Game } from '../../../../../main/interfaces/game-library.interface';
import type { Tweak, PCGWConfigPath, PCGWGameInfo } from '@twiki/shared';

// =============================================================================
// Tweak Execution Types
// =============================================================================

export interface StartTweakParams {
  game: Game;
  groupTitle: string;
  tweak: Tweak;
  configPaths: PCGWConfigPath[];
  gameInfo?: PCGWGameInfo;
}

export interface TweakCompleteData {
  gameId: string;
  hash: string;
}

export type OnCompleteCallback = (data: TweakCompleteData) => void;

export interface TweakRevertData {
  gameId: string;
  hash: string;
}

export type OnRevertCallback = (data: TweakRevertData) => void;

// =============================================================================
// Tweak Context
// =============================================================================

export interface TweakContext {
  title: string;
  gameName: string;
  gameId: string | null;
  hash: string | null;
}
