/**
 * Main interfaces barrel export.
 * Re-exports all types from shared/types for backwards compatibility.
 */

// Re-export all shared types for backwards compatibility
export * from '../../shared/types';

// NexusMods types (standalone interface, not yet in shared/types)
export * from './nexusmods.interface';

// Note: The following original interface files are now deprecated
// and their contents have been moved to shared/types:
// - tweak-agent.interface.ts -> agent.types.ts + tool.types.ts
// - tool-status.interface.ts -> tool.types.ts
// - tool-display.interface.ts -> tool.types.ts
// - game-library.interface.ts -> game.types.ts
// - steam.interface.ts -> game.types.ts
// - settings.interface.ts -> settings.types.ts
// - system-specs.interface.ts -> system-specs.types.ts
// - recipe.interface.ts -> recipe.types.ts
// - agent-availability.interface.ts -> agent.types.ts
// - updater-status.interface.ts -> updater.types.ts
