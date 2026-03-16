/**
 * Path templating utilities for the Recipe Caching System.
 * Converts absolute paths to/from template format using variables like {INSTALL_PATH}.
 * Also handles step output references like {STEP_N_OUTPUT.fieldName}.
 */

import os from 'os';
import { expandWindowsEnvVars } from './system.utils';
import type { PathResolutionContext } from '../interfaces/recipe.interface';
import type { ProcessTweakRequest } from '../interfaces';

/**
 * Get the current Windows username.
 * Cached to avoid repeated system calls.
 */
const getCurrentUsername = (() => {
  let cached: string | null = null;
  return (): string => {
    if (cached === null) {
      cached = os.userInfo().username;
    }
    return cached;
  };
})();

/**
 * Step output reference for path templating.
 * Maps step numbers to their captured output fields.
 */
export type StepOutputsMap = Map<number, Record<string, unknown>>;

/**
 * Pattern to match step output references: {STEP_N_OUTPUT.fieldName} or {STEP_N_OUTPUT.fieldName[index]}
 */
const STEP_OUTPUT_PATTERN = /\{STEP_(\d+)_OUTPUT\.([a-zA-Z_][a-zA-Z0-9_]*)(?:\[(\d+)\])?\}/g;

/**
 * Template variable patterns for game-specific paths.
 */
const TEMPLATE_VARS = {
  INSTALL_PATH: '{INSTALL_PATH}',
  LAUNCHER_INSTALL_PATH: '{LAUNCHER_INSTALL_PATH}',
  USERNAME: '{USERNAME}',
} as const;

/**
 * Windows environment variables for path templatization.
 * Order matters: more specific paths should come first to ensure correct matching.
 * e.g., %LOCALAPPDATA% (C:\Users\X\AppData\Local) before %USERPROFILE% (C:\Users\X)
 */
const WINDOWS_ENV_VARS = [
  'LOCALAPPDATA', // C:\Users\X\AppData\Local
  'APPDATA', // C:\Users\X\AppData\Roaming
  'PROGRAMDATA', // C:\ProgramData
  'PUBLIC', // C:\Users\Public
  'USERPROFILE', // C:\Users\X (least specific, should be last)
] as const;

/**
 * Pattern to detect username in Windows paths: C:\Users\john\...
 */
const USERNAME_PATTERN = /\\Users\\([^\\]+)\\/i;

/**
 * Check if a string looks like a file path
 */
function looksLikePath(str: string): boolean {
  // Windows absolute path
  if (/^[A-Za-z]:[/\\]/.test(str)) return true;
  // Unix absolute path
  if (str.startsWith('/')) return true;
  // Contains Windows environment variable
  if (/%[^%]+%/.test(str)) return true;
  // Contains template variable
  if (/\{[A-Z_]+\}/.test(str)) return true;
  // Contains path separators and looks path-like
  if ((str.includes('\\') || str.includes('/')) && str.length > 3) return true;
  return false;
}

/**
 * Normalize path separators to backslash for Windows consistency
 */
function normalizePath(p: string): string {
  return p.replace(/\//g, '\\');
}

/**
 * Normalize a path for case-insensitive comparison.
 * Handles trailing slashes and converts backslashes to forward slashes.
 * Used for comparing paths across different sources (PCGW, user input, etc.)
 */
export function normalizePathForComparison(path: string): string {
  return path.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Convert an absolute path to a templated path.
 *
 * Matching order (most specific first):
 * 1. Install path → {INSTALL_PATH}
 * 2. Launcher install path → {LAUNCHER_INSTALL_PATH}
 * 3. Windows env vars → %LOCALAPPDATA%, %APPDATA%, %PROGRAMDATA%, %PUBLIC%, %USERPROFILE%
 * 4. Username fallback → {USERNAME} in C:\Users\{USERNAME}\...
 */
export function templatizePath(absolutePath: string, context: PathResolutionContext): string {
  const templatedPath = normalizePath(absolutePath);
  const normalizedInstallPath = normalizePath(context.installPath);
  const normalizedLauncherPath = context.launcherInstallPath
    ? normalizePath(context.launcherInstallPath)
    : '';

  // 1. Replace install path first (most specific game-related path)
  if (
    normalizedInstallPath &&
    templatedPath.toLowerCase().startsWith(normalizedInstallPath.toLowerCase())
  ) {
    return TEMPLATE_VARS.INSTALL_PATH + templatedPath.substring(normalizedInstallPath.length);
  }

  // 2. Replace launcher install path (Steam/Epic/Xbox directory)
  if (
    normalizedLauncherPath &&
    templatedPath.toLowerCase().startsWith(normalizedLauncherPath.toLowerCase())
  ) {
    return (
      TEMPLATE_VARS.LAUNCHER_INSTALL_PATH + templatedPath.substring(normalizedLauncherPath.length)
    );
  }

  // 3. Replace Windows environment variable paths
  for (const envVar of WINDOWS_ENV_VARS) {
    const envValue = process.env[envVar];
    if (!envValue) continue;

    const normalizedEnvValue = normalizePath(envValue);
    if (templatedPath.toLowerCase().startsWith(normalizedEnvValue.toLowerCase())) {
      return `%${envVar}%` + templatedPath.substring(normalizedEnvValue.length);
    }
  }

  // 4. Fallback: Replace username in paths (e.g., C:\Users\john\... -> C:\Users\{USERNAME}\...)
  const username = getCurrentUsername();
  const match = templatedPath.match(USERNAME_PATTERN);
  if (match && match[1].toLowerCase() === username.toLowerCase()) {
    const fullMatch = match[0];
    const prefix = fullMatch.substring(0, fullMatch.indexOf(match[1]));
    const suffix = fullMatch.substring(fullMatch.indexOf(match[1]) + match[1].length);
    return templatedPath.replace(fullMatch, prefix + TEMPLATE_VARS.USERNAME + suffix);
  }

  return templatedPath;
}

/**
 * Resolve a templated path to an absolute path for the current user.
 *
 * Handles:
 * - {INSTALL_PATH} → game installation directory
 * - {LAUNCHER_INSTALL_PATH} → launcher (Steam/Epic/Xbox) directory
 * - {USERNAME} → current Windows username
 * - %ENV_VAR% → Windows environment variables (via expandWindowsEnvVars)
 */
export function resolvePath(templatedPath: string, context: PathResolutionContext): string {
  let resolvedPath = templatedPath;

  // Replace template variables with actual values
  resolvedPath = resolvedPath
    .replace(/\{INSTALL_PATH\}/g, context.installPath)
    .replace(/\{LAUNCHER_INSTALL_PATH\}/g, context.launcherInstallPath || '')
    .replace(/\{USERNAME\}/g, getCurrentUsername());

  // Expand Windows environment variables (%APPDATA%, %LOCALAPPDATA%, etc.)
  resolvedPath = expandWindowsEnvVars(resolvedPath);

  // Normalize path separators
  resolvedPath = normalizePath(resolvedPath);

  return resolvedPath;
}

/**
 * Recursively templatize all path values in an args object
 */
export function templatizeArgs(args: Record<string, unknown>, context: PathResolutionContext): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && looksLikePath(value)) {
      result[key] = templatizePath(value, context);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === 'object' && item !== null) {
          return templatizeArgs(item as Record<string, unknown>, context);
        } else if (typeof item === 'string' && looksLikePath(item)) {
          return templatizePath(item, context);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      result[key] = templatizeArgs(value as Record<string, unknown>, context);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Recursively resolve all templated paths in an args object
 */
export function resolveArgs(args: Record<string, unknown>, context: PathResolutionContext): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && looksLikePath(value)) {
      result[key] = resolvePath(value, context);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === 'object' && item !== null) {
          return resolveArgs(item as Record<string, unknown>, context);
        } else if (typeof item === 'string' && looksLikePath(item)) {
          return resolvePath(item, context);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      result[key] = resolveArgs(value as Record<string, unknown>, context);
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ============================================================================
// Step Output Reference Functions
// ============================================================================

/**
 * Result of finding a step output match in a path
 */
interface StepOutputMatch {
  stepNumber: number;
  field: string;
  remainder: string; // Path after the matched output (e.g., \subfolder\file.dll)
}

/**
 * Find if an absolute path starts with a value from a previous step's output.
 * Returns match details if found, null otherwise.
 * Finds the LONGEST (most specific) match to avoid ambiguity.
 */
export function findStepOutputMatch(
  absolutePath: string,
  stepOutputs: StepOutputsMap
): StepOutputMatch | null {
  const normalizedPath = normalizePath(absolutePath).toLowerCase();

  let bestMatch: StepOutputMatch | null = null;
  let bestMatchLength = 0;

  // Check each step's outputs and find the longest match
  for (const [stepNumber, outputs] of stepOutputs.entries()) {
    for (const [field, value] of Object.entries(outputs)) {
      // Handle string values (paths)
      if (typeof value === 'string') {
        const normalizedValue = normalizePath(value).toLowerCase();

        // Must match at a path boundary:
        // - Exact match (no remainder)
        // - Followed by path separator
        // - Or value already ends with separator
        if (normalizedPath.startsWith(normalizedValue) && normalizedValue.length > bestMatchLength) {
          const remainder = absolutePath.substring(value.length);

          // Check it's a valid path boundary match
          const isExactMatch = remainder === '';
          const startsWithSeparator = remainder.startsWith('\\') || remainder.startsWith('/');
          const valueEndsWithSeparator = normalizedValue.endsWith('\\') || normalizedValue.endsWith('/');

          if (isExactMatch || startsWithSeparator || valueEndsWithSeparator) {
            bestMatch = {
              stepNumber,
              field,
              remainder,
            };
            bestMatchLength = normalizedValue.length;
          }
        }
      }
      // Handle array values (e.g., extractedFiles) - only exact matches
      else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] === 'string') {
            const normalizedValue = normalizePath(value[i] as string).toLowerCase();
            if (normalizedPath === normalizedValue && normalizedValue.length > bestMatchLength) {
              bestMatch = {
                stepNumber,
                field: `${field}[${i}]`,
                remainder: '',
              };
              bestMatchLength = normalizedValue.length;
            }
          }
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Templatize a path, checking step outputs FIRST before static templates.
 * Step outputs take precedence because they are session-specific paths.
 */
export function templatizePathWithStepOutputs(
  absolutePath: string,
  context: PathResolutionContext,
  stepOutputs: StepOutputsMap
): string {
  // First, check if path matches any step output
  const stepMatch = findStepOutputMatch(absolutePath, stepOutputs);
  if (stepMatch) {
    return `{STEP_${stepMatch.stepNumber}_OUTPUT.${stepMatch.field}}${stepMatch.remainder}`;
  }

  // Fall back to standard templatization
  return templatizePath(absolutePath, context);
}

/**
 * Recursively templatize args, checking step outputs before static templates.
 */
export function templatizeArgsWithStepOutputs(
  args: Record<string, unknown>,
  context: PathResolutionContext,
  stepOutputs: StepOutputsMap
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && looksLikePath(value)) {
      result[key] = templatizePathWithStepOutputs(value, context, stepOutputs);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === 'object' && item !== null) {
          return templatizeArgsWithStepOutputs(item as Record<string, unknown>, context, stepOutputs);
        } else if (typeof item === 'string' && looksLikePath(item)) {
          return templatizePathWithStepOutputs(item, context, stepOutputs);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      result[key] = templatizeArgsWithStepOutputs(value as Record<string, unknown>, context, stepOutputs);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Check if a string contains step output references
 */
export function containsStepOutputRef(str: string): boolean {
  return /\{STEP_\d+_OUTPUT\.[a-zA-Z_][a-zA-Z0-9_]*(?:\[\d+\])?\}/.test(str);
}

/**
 * Resolve all {STEP_N_OUTPUT.fieldName} patterns in a string.
 * Throws if a referenced step output doesn't exist.
 */
export function resolveStepOutputRefs(str: string, stepOutputs: StepOutputsMap): string {
  return str.replace(STEP_OUTPUT_PATTERN, (match, stepNumStr, field, indexStr) => {
    const stepNumber = parseInt(stepNumStr, 10);
    const outputs = stepOutputs.get(stepNumber);

    if (!outputs) {
      throw new Error(`Step ${stepNumber} output not found (referenced: ${match})`);
    }

    let value = outputs[field];

    // Handle array index access
    if (indexStr !== undefined && Array.isArray(value)) {
      const index = parseInt(indexStr, 10);
      if (index >= value.length) {
        throw new Error(`Index ${index} out of bounds for ${match} (array length: ${value.length})`);
      }
      value = value[index];
    }

    if (value === undefined) {
      throw new Error(`Field '${field}' not found in step ${stepNumber} output (referenced: ${match})`);
    }

    if (typeof value !== 'string') {
      throw new Error(`Field '${field}' in step ${stepNumber} is not a string (referenced: ${match})`);
    }

    return value;
  });
}

/**
 * Recursively resolve step output references and path templates in an args object.
 * Step output refs are resolved FIRST, then standard path templates.
 */
export function resolveArgsWithStepOutputs(
  args: Record<string, unknown>,
  context: PathResolutionContext,
  stepOutputs: StepOutputsMap
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      let resolved = value;
      // First resolve step output references
      if (containsStepOutputRef(resolved)) {
        resolved = resolveStepOutputRefs(resolved, stepOutputs);
      }
      // Then resolve standard path templates
      if (looksLikePath(resolved)) {
        resolved = resolvePath(resolved, context);
      }
      result[key] = resolved;
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === 'object' && item !== null) {
          return resolveArgsWithStepOutputs(item as Record<string, unknown>, context, stepOutputs);
        } else if (typeof item === 'string') {
          let resolved = item;
          if (containsStepOutputRef(resolved)) {
            resolved = resolveStepOutputRefs(resolved, stepOutputs);
          }
          if (looksLikePath(resolved)) {
            resolved = resolvePath(resolved, context);
          }
          return resolved;
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      result[key] = resolveArgsWithStepOutputs(value as Record<string, unknown>, context, stepOutputs);
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ============================================================================
// Path Context Factory
// ============================================================================

/**
 * Build path resolution context from a tweak request.
 * @param request - The process tweak request containing game info
 * @returns Context object with paths for template resolution
 */
export function buildPathContext(request: ProcessTweakRequest): PathResolutionContext {
  return {
    installPath: request.game.installPath,
    launcherInstallPath: request.game.launcherInstallPath,
  };
}
