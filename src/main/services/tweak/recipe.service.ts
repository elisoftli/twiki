/**
 * Recipe service for the Tweak Recipe Caching System.
 * Handles recipe lookup and replay execution.
 * Note: Recipe building and submission are handled by the server.
 */

import type { TweakRecipe } from '@twiki/shared';
import { CURRENT_CONTRACT_VERSION, resolveToolName } from '@twiki/shared';
import type { PathResolutionContext, RecipeExecutionResult } from '../../interfaces/recipe.interface';
import type { ProcessTweakRequest } from '../../interfaces';
import {
  resolvePath,
  resolveArgsWithStepOutputs,
  buildPathContext,
  type StepOutputsMap,
} from '../../utils/path-template.utils';
import { ToolStatusService } from '../agent/tool-status.service';
import { computeFileHash, FILE_NOT_EXISTS_HASH } from '../../utils/file-hash.utils';
import { TRANSIENT_OUTPUT_TOOLS } from '../../constants';
import { toolRegistry } from '../../tools';
import { EnvService } from '../core/env.service';
import { createLogger } from '../../utils/logger.utils';

const logger = createLogger('RecipeService');

/**
 * Compare two semver strings.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareSemver(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
  const [bMajor, bMinor, bPatch] = b.split('.').map(Number);

  if (aMajor !== bMajor) return aMajor < bMajor ? -1 : 1;
  if (aMinor !== bMinor) return aMinor < bMinor ? -1 : 1;
  if (aPatch !== bPatch) return aPatch < bPatch ? -1 : 1;
  return 0;
}

/**
 * Check if recipe is compatible with current client contract version.
 * Rule: Forward compatible only (newer client can replay older recipe)
 */
function isRecipeCompatible(recipeContractVersion: string | undefined): boolean {
  if (!recipeContractVersion) {
    // Legacy recipe without contractVersion - assume compatible
    return true;
  }
  // Client version must be >= recipe version
  return compareSemver(CURRENT_CONTRACT_VERSION, recipeContractVersion) >= 0;
}

/**
 * Tools that require hash validation during recipe replay.
 * These tools modify files and their beforeHash must match current file state.
 */
const HASH_VALIDATED_TOOLS = new Set([
  'edit-file-tool',
]);


/**
 * Result of validating recipe file hashes
 */
interface HashValidationResult {
  valid: boolean;
  firstMismatch?: {
    step: number;
    file: string;
    reason: string;
  };
}

/**
 * Service for managing tweak recipe operations including
 * lookup, validation, and execution.
 */
export class RecipeService {
  /**
   * Build path resolution context from a tweak request.
   * Delegates to shared utility function.
   */
  public static buildPathContext = buildPathContext;

  /**
   * Look up an approved recipe by tweak hash and game.
   * @param hash - The unique hash for the tweak
   * @param pcgwPageId - The PCGamingWiki page ID for the game
   * @param launcher - Optional launcher type for filtering (e.g., 'steam', 'xbox')
   * @returns The recipe if found and approved, null otherwise
   */
  public static async lookupRecipe(hash: string, pcgwPageId: number, launcher?: string): Promise<TweakRecipe | null> {
    try {
      const baseUrl = EnvService.get('API_URL');
      const params = new URLSearchParams({ hash, pcgwPageId: pcgwPageId.toString() });
      if (launcher) {
        params.set('launcher', launcher);
      }
      const response = await fetch(`${baseUrl}/recipes/lookup?${params}`);
      const data = await response.json();

      if (data.recipe) {
        logger.debug('Found approved recipe:', data.recipe.id);
        return data.recipe;
      }

      return null;
    } catch (error) {
      logger.error('Error looking up recipe:', error);
      return null;
    }
  }

  /**
   * Execute a recipe directly without agent involvement.
   * Validates all file hashes upfront, then calls each tool in sequence.
   * User approval dialogs will still appear through ToolStatusService.
   *
   * @param recipe - The recipe to execute
   * @param request - The original tweak request with context
   * @returns Execution result with success status and steps completed
   */
  public static async executeRecipe(
    recipe: TweakRecipe,
    request: ProcessTweakRequest
  ): Promise<RecipeExecutionResult> {
    // Check contract version compatibility (forward-only: newer client, older recipe)
    if (!isRecipeCompatible(recipe.contractVersion)) {
      logger.error(
        `Recipe contract version ${recipe.contractVersion} is newer than client ${CURRENT_CONTRACT_VERSION}`
      );
      return {
        success: false,
        stepsCompleted: 0,
        error: 'Recipe requires a newer client version. Please update the application.',
      };
    }

    const pathContext = this.buildPathContext(request);
    ToolStatusService.reset();

    logger.info(`Executing recipe with ${recipe.steps.length} steps (contract: ${recipe.contractVersion || 'legacy'})`);

    // Execute steps with validation before and after each step
    return this.executeRecipeSteps(recipe, pathContext);
  }

  /**
   * Check if session is being aborted (for graceful cancellation).
   * @returns true if the current session is aborting
   */
  public static isAborting(): boolean {
    return ToolStatusService.isSessionAborting();
  }

  /**
   * Validate file hashes for a single step (either before or after execution).
   *
   * Note: Currently only 'before' phase validation is used during recipe execution to avoid
   * false failures from line ending differences. The 'after' phase is supported but not actively used.
   *
   * @param step - The recipe step to validate
   * @param phase - 'before' validates beforeHash, 'after' validates afterHash
   * @param pathContext - Path resolution context
   * @returns Validation result with error details if validation fails
   */
  private static async validateStepHashes(
    step: TweakRecipe['steps'][0],
    phase: 'before' | 'after',
    pathContext: PathResolutionContext
  ): Promise<{ valid: boolean; error?: string }> {
    // Only validate hash-checked tools
    if (!HASH_VALIDATED_TOOLS.has(step.toolName) || !step.fileHashes) {
      return { valid: true };
    }

    const hashType = phase === 'before' ? 'beforeHash' : 'afterHash';

    for (const hashInfo of step.fileHashes) {
      const resolvedFilePath = resolvePath(hashInfo.filePath, pathContext);
      const currentHash = (await computeFileHash(resolvedFilePath)) ?? FILE_NOT_EXISTS_HASH;
      const expectedHash = phase === 'before' ? hashInfo.beforeHash : hashInfo.afterHash;

      if (currentHash !== expectedHash) {
        const reason =
          currentHash === FILE_NOT_EXISTS_HASH
            ? 'File does not exist'
            : `File content differs from expected ${hashType}`;

        logger.debug(`${hashType} mismatch at step ${step.stepNumber}: ${reason}`);

        return {
          valid: false,
          error: `Step ${step.stepNumber} ${hashType} validation failed: ${reason} for file ${resolvedFilePath}`,
        };
      }

    }

    return { valid: true };
  }

  /**
   * Validate all file hashes in a recipe before execution.
   * Checks that current file state matches expected beforeHash for all file modification steps.
   *
   * @deprecated This method validates all hashes upfront, which fails for multi-step modifications.
   * Use validateStepHashes() instead for step-by-step validation.
   */
  // @ts-expect-error - Deprecated method kept for reference
  private static async validateRecipeHashes(
    recipe: TweakRecipe,
    pathContext: PathResolutionContext
  ): Promise<HashValidationResult> {
    for (const step of recipe.steps) {
      if (!HASH_VALIDATED_TOOLS.has(step.toolName) || !step.fileHashes) {
        continue;
      }

      for (const hashInfo of step.fileHashes) {
        const resolvedFilePath = resolvePath(hashInfo.filePath, pathContext);
        const currentHash = (await computeFileHash(resolvedFilePath)) ?? FILE_NOT_EXISTS_HASH;

        if (currentHash !== hashInfo.beforeHash) {
          const reason =
            currentHash === FILE_NOT_EXISTS_HASH
              ? 'File does not exist'
              : 'File content differs from expected';

          logger.debug(`Hash mismatch at step ${step.stepNumber}: ${reason}`);

          return {
            valid: false,
            firstMismatch: {
              step: step.stepNumber,
              file: resolvedFilePath,
              reason,
            },
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Execute recipe steps with step-by-step beforeHash validation.
   * Validates beforeHash before each step to ensure the file is in the expected state.
   * Note: afterHash validation is skipped to avoid false failures from line ending differences.
   */
  private static async executeRecipeSteps(
    recipe: TweakRecipe,
    pathContext: PathResolutionContext
  ): Promise<RecipeExecutionResult> {
    let stepsCompleted = 0;
    const stepOutputs: StepOutputsMap = new Map();

    try {
      for (const step of recipe.steps) {
        logger.debug(`Step ${step.stepNumber}: ${step.toolName}`);

        // PHASE 1: Validate beforeHash for this step
        const beforeValidation = await this.validateStepHashes(step, 'before', pathContext);
        if (!beforeValidation.valid) {
          logger.debug(`Hash validation failed for step ${step.stepNumber}, falling back to agent`);
          return {
            success: false,
            error: beforeValidation.error,
            stepsCompleted,
            requiresAgentMode: true,
          };
        }

        // PHASE 2: Execute the tool (resolve aliases for renamed tools)
        const resolvedToolName = resolveToolName(
          step.toolName,
          recipe.contractVersion || '1.0.0',
          CURRENT_CONTRACT_VERSION
        );
        const tool = toolRegistry[resolvedToolName as keyof typeof toolRegistry];
        if (!tool) {
          throw new Error(`Unknown tool: ${step.toolName} (resolved: ${resolvedToolName})`);
        }

        let resolvedArgs = resolveArgsWithStepOutputs(step.templatedArgs, pathContext, stepOutputs);

        // For download steps, ensure we use the original download URL
        if (step.flags.isDownload && step.flags.downloadUrl) {
          resolvedArgs = {
            ...resolvedArgs,
            downloadUrl: step.flags.downloadUrl,
          };
        }

        const result = await (tool.execute as (args: unknown) => Promise<{ success: boolean; message?: string }>)(
          resolvedArgs
        );

        if (!result.success) {
          if (result.message?.includes('declined')) {
            return {
              success: false,
              error: `Step ${step.stepNumber} (${step.toolName}) was declined by user`,
              stepsCompleted,
            };
          }

          throw new Error(`Step ${step.stepNumber} failed: ${result.message}`);
        }

        // Note: afterHash validation is skipped to avoid false failures due to line ending differences.
        // beforeHash validation ensures the file is in the correct state before each operation.

        // Capture step output for subsequent steps to reference
        const capturedOutput = this.extractStepOutput(step.toolName, result);
        if (capturedOutput) {
          stepOutputs.set(step.stepNumber, capturedOutput);
        }

        stepsCompleted++;
      }

      logger.info(`Recipe executed successfully (${stepsCompleted} steps)`);
      return { success: true, stepsCompleted };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Recipe execution failed:', errorMessage);

      return {
        success: false,
        error: errorMessage,
        stepsCompleted,
      };
    }
  }

  /**
   * Extract relevant output fields from a tool result for step reference during replay.
   */
  private static extractStepOutput(toolName: string, result: unknown): Record<string, unknown> | null {
    const fieldsToCapture = TRANSIENT_OUTPUT_TOOLS[toolName];
    if (!fieldsToCapture || !result || typeof result !== 'object') {
      return null;
    }

    const captured: Record<string, unknown> = {};
    const resultObj = result as Record<string, unknown>;

    for (const field of fieldsToCapture) {
      if (field in resultObj && resultObj[field] !== undefined) {
        captured[field] = resultObj[field];
      }
    }

    return Object.keys(captured).length > 0 ? captured : null;
  }
}
