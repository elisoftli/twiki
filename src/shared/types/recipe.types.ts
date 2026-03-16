/**
 * Recipe types for the Tweak Recipe Caching and Replay System.
 * Client-specific types only - shared types are in @twiki/shared.
 * Extracted from recipe.interface.ts
 */

/**
 * Context needed to resolve path templates to actual paths.
 * Contains only game-specific paths. OS-level variables (username, env vars)
 * are resolved internally by the path template utilities.
 */
export interface PathResolutionContext {
  /** Game installation directory */
  installPath: string;
  /** Launcher installation directory (Steam/Epic/Xbox) */
  launcherInstallPath?: string;
}

/**
 * Result of a recipe replay execution
 */
export interface RecipeExecutionResult {
  success: boolean;
  error?: string;
  /** Number of steps successfully executed before failure (if any) */
  stepsCompleted?: number;
  /** If true, hash validation failed and agent mode should be used */
  requiresAgentMode?: boolean;
}
