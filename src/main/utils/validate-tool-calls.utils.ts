import type { ToolCallEntry } from '../interfaces/tweak-agent.interface';
import type { ToolStatus } from '../interfaces/tool-status.interface';

/**
 * Result of validating agent's claimed tool calls against actual executions
 */
export interface ToolCallValidationResult {
  /** Tool calls that were both claimed by agent AND actually executed */
  validatedToolCalls: ToolCallEntry[];
  /** Tool calls claimed by agent but NOT actually executed (hallucinated) */
  hallucinatedToolCalls: ToolCallEntry[];
  /** Whether any hallucinations were detected */
  hasHallucinations: boolean;
}

/**
 * Validates the agent's claimed tool calls against actual tool executions.
 * Uses count-based matching by toolName to handle multiple calls to the same tool.
 *
 * Only considers tools with 'completed' status as actually executed.
 * Takes the intersection: only tool calls that exist in BOTH sources are validated.
 *
 * @param agentToolCalls - Tool calls reported by the agent in its structured response
 * @param actualTools - Tool statuses tracked by ToolStatusService
 * @returns Validation result with validated and hallucinated tool calls
 */
export function validateToolCalls(
  agentToolCalls: ToolCallEntry[],
  actualTools: ToolStatus[]
): ToolCallValidationResult {
  // Filter to only completed tools (successfully executed)
  const completedTools = actualTools.filter((t) => t.status === 'completed');

  // Count occurrences of each toolName in actual executions
  const actualCounts = new Map<string, number>();
  for (const tool of completedTools) {
    actualCounts.set(tool.toolName, (actualCounts.get(tool.toolName) || 0) + 1);
  }

  const validatedToolCalls: ToolCallEntry[] = [];
  const hallucinatedToolCalls: ToolCallEntry[] = [];

  // Track how many of each tool we've validated
  const validatedCounts = new Map<string, number>();

  for (const agentTool of agentToolCalls) {
    const actualCount = actualCounts.get(agentTool.toolName) || 0;
    const validatedCount = validatedCounts.get(agentTool.toolName) || 0;

    if (validatedCount < actualCount) {
      // This tool call matches an actual execution
      validatedToolCalls.push(agentTool);
      validatedCounts.set(agentTool.toolName, validatedCount + 1);
    } else {
      // This tool call is hallucinated (no matching actual execution)
      hallucinatedToolCalls.push(agentTool);
    }
  }

  return {
    validatedToolCalls,
    hallucinatedToolCalls,
    hasHallucinations: hallucinatedToolCalls.length > 0,
  };
}
