import { toast } from 'svelte-sonner';
import type { AppliedTweak, PreRevertCheckResult } from '../../../../main/interfaces/tweak-agent.interface';
import { createLogger } from '$lib/utils/logger.utils';

const logger = createLogger('AppliedTweaks');

/**
 * Result of the revert flow indicating what action the caller should take.
 */
export interface RevertFlowResult {
  /** 'success' = completed, 'needs_confirmation' = show warning dialog, 'blocked' = show blocked dialog, 'error' = failed */
  status: 'success' | 'needs_confirmation' | 'blocked' | 'error';
  /** Pre-check result if confirmation or blocking is needed */
  preCheck?: PreRevertCheckResult;
  /** Message describing the result */
  message?: string;
}

/**
 * Hook for managing applied tweaks state and persistence.
 * Handles loading, adding, removing, and reverting tweaks.
 */
export function useAppliedTweaks(gameId?: string) {
  let appliedTweaks = $state<Map<string, AppliedTweak>>(new Map());

  /**
   * Loads persisted tweaks from storage.
   * If gameId is provided, loads only tweaks for that game.
   * Otherwise, loads all tweaks.
   */
  async function load(): Promise<void> {
    try {
      const persisted = gameId
        ? await window.api.appliedTweaks.getByGame(gameId)
        : await window.api.appliedTweaks.getAll();

      appliedTweaks = new Map(
        persisted.map((tweak) => [tweak.tweak.hash, { ...tweak }])
      );
    } catch (err) {
      logger.warn('Failed to load persisted tweaks:', err);
    }
  }

  /**
   * Adds a new applied tweak to state and persists it.
   */
  async function add(tweak: AppliedTweak): Promise<void> {
    // Update local state using hash as key
    appliedTweaks = new Map(appliedTweaks).set(tweak.tweak.hash, tweak);

    // Persist to storage
    await window.api.appliedTweaks.add(tweak);
  }

  /**
   * Removes a tweak from state and storage by hash.
   */
  async function remove(hash: string): Promise<void> {
    // Remove from storage
    await window.api.appliedTweaks.remove(hash);

    // Remove from local state
    removeLocal(hash);
  }

  /**
   * Removes a tweak from local state only (storage already updated elsewhere).
   */
  function removeLocal(hash: string): void {
    const newMap = new Map(appliedTweaks);
    newMap.delete(hash);
    appliedTweaks = newMap;
  }

  /**
   * Initiates a revert flow with pre-check for conflicts.
   * Returns a result indicating if the revert completed or if user confirmation is needed.
   */
  async function revert(tweak: AppliedTweak): Promise<RevertFlowResult> {
    try {
      // Step 1: Pre-check for conflicts
      const preCheck = await window.api.revert.preCheck($state.snapshot(tweak));

      if (!preCheck.canProceed) {
        // Return blocked state - caller should show blocked dialog
        return { status: 'blocked', preCheck };
      }

      if (preCheck.fileConflicts.length > 0) {
        // Return warning state - caller should show confirmation dialog
        return { status: 'needs_confirmation', preCheck };
      }

      // Step 2: No conflicts - execute immediately
      const result = await window.api.revert.execute($state.snapshot(tweak.summary));

      if (result.status === 'success' || result.status === 'partial') {
        await remove(tweak.tweak.hash);
        toast.success('Reverted successfully');
        return { status: 'success', message: result.message };
      }

      toast.error('Failed to revert tweak');
      return { status: 'error', message: result.message };
    } catch (err) {
      logger.error('Failed to revert tweak:', err);
      toast.error('Failed to revert tweak');
      return {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to revert tweak'
      };
    }
  }

  /**
   * Executes a confirmed revert after user acknowledges conflicts.
   * @param tweak The tweak to revert
   * @param useFallback If true, uses backup restore instead of surgical revert
   */
  async function confirmRevert(
    tweak: AppliedTweak,
    useFallback: boolean
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const result = await window.api.revert.executeWithFallback(
        $state.snapshot(tweak),
        useFallback
      );

      if (result.status === 'success' || result.status === 'partial') {
        await remove(tweak.tweak.hash);

        if (useFallback) {
          toast.success('Reverted using backup');
        } else {
          toast.success('Reverted successfully');
        }
        return { success: true, message: result.message };
      }

      toast.error('Failed to revert tweak');
      return { success: false, message: result.message };
    } catch (err) {
      logger.error('Failed to revert tweak:', err);
      toast.error('Failed to revert tweak');
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed to revert tweak'
      };
    }
  }

  /**
   * Checks if a tweak is applied (with success or warning status) by hash.
   */
  function isApplied(hash: string): boolean {
    const applied = appliedTweaks.get(hash);
    return applied?.status === 'success' || applied?.status === 'warning';
  }

  /**
   * Gets an applied tweak by hash.
   */
  function get(hash: string): AppliedTweak | undefined {
    return appliedTweaks.get(hash);
  }

  return {
    // State
    get appliedTweaks() { return appliedTweaks; },

    // Actions
    load,
    add,
    remove,
    removeLocal,
    revert,
    confirmRevert,

    // Helpers
    isApplied,
    get,
  };
}
