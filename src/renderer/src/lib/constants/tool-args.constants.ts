/**
 * Tool argument updaters for modifying tool call arguments.
 * Used when users edit file contents before approving tool calls.
 */

import type { EditOperation } from '../../../../main/tools/io/utils/types';

/**
 * Type for a function that updates tool arguments with new content.
 */
export type ToolArgsUpdater = (
  args: Record<string, unknown>,
  operationIndex: number,
  content: string
) => void;

/**
 * Mapping of tool names to their argument update functions.
 * Each function updates the cloned args with the new content value.
 */
export const TOOL_ARGS_UPDATERS: Record<string, ToolArgsUpdater> = {
  'edit-file-tool': (args, opIndex, value) => {
    const ops = args.operations as Array<EditOperation> | undefined;
    if (ops?.[opIndex]) ops[opIndex].newString = value;
  },

  'create-file-tool': (args, _opIndex, value) => {
    args.content = value;
  },

};

/**
 * Get the updater function for a given tool name.
 * Returns undefined if no updater exists for the tool.
 */
export function getToolArgsUpdater(toolName: string): ToolArgsUpdater | undefined {
  return TOOL_ARGS_UPDATERS[toolName];
}
