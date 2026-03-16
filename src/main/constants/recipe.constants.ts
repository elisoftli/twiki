/**
 * Recipe-related constants shared across recipe builder and service.
 */

/**
 * Tools that produce outputs that subsequent tools may reference.
 * Maps tool name to the output fields that should be captured during replay.
 *
 * Used by:
 * - recipe.service.ts: To extract outputs during recipe capture and replay
 */
export const TRANSIENT_OUTPUT_TOOLS: Record<string, string[]> = {
  'download-file-tool': ['downloadPath', 'extractPath', 'extractedFiles'],
  'extract-archive-tool': ['extractPath', 'extractedFiles'],
  'create-archive-tool': ['archivePath'],
  'get-user-input-tool': ['userInput'],
};
