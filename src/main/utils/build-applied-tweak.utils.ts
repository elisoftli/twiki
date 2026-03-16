import type { Tweak } from '@twiki/shared';
import type { ToolStatus } from '../interfaces/tool-status.interface';
import type {
  ToolCallEntry,
  AppliedTweak,
  TweakOperationStatus,
  ToolName,
  ToolResultUnion,
} from '../interfaces/tweak-agent.interface';
import type { AgentResponseSchemaType } from '../schemas/tweak-summary.schema';

/**
 * Convert a ToolStatus (from actual execution tracking) to a ToolCallEntry (storage format).
 * Maps the lifecycle status to operation status and extracts relevant fields.
 */
function toolStatusToToolCallEntry(tool: ToolStatus): ToolCallEntry {
  // Map lifecycle status to operation status
  const status: TweakOperationStatus = tool.error ? 'error' : 'success';

  return {
    toolCallId: tool.toolId,
    toolName: tool.toolName as ToolName,
    description: tool.formattedDescription,
    status,
    timestamp: tool.updatedAt,
    result: tool.result as ToolResultUnion,
  };
}

/**
 * Determine overall status from tool statuses.
 * Returns 'error' if any tool errored, 'warning' if any had warnings, otherwise 'success'.
 */
function deriveOverallStatus(tools: ToolStatus[]): TweakOperationStatus {
  const hasError = tools.some((t) => t.status === 'error' || t.error);
  if (hasError) return 'error';

  // Currently no warning condition from ToolStatus, but kept for future use
  return 'success';
}

/**
 * Build an AppliedTweak from actual tool executions and optionally the agent's response.
 *
 * This function takes the ground truth from ToolStatusService (what actually executed)
 * and combines it with the agent's TweakSummary (for message and skipped operations).
 *
 * @param launcherGameId - The launcher-specific game ID (e.g., Steam App ID)
 * @param pcgwPageId - The PCGamingWiki page ID
 * @param tweak - The tweak being applied
 * @param completedTools - Tools that completed execution (from ToolStatusService)
 * @param agentResponse - Optional agent's TweakSummary for message and skipped fields
 * @returns AppliedTweak object, or null if no revertible tools completed
 */
export function buildAppliedTweak(
  launcherGameId: string,
  pcgwPageId: number,
  tweak: Tweak,
  completedTools: ToolStatus[],
  agentResponse: AgentResponseSchemaType | null
): AppliedTweak | null {
  // Filter to only revertible tools based on isRevertible field in tool output
  // Tools set isRevertible: false for read-only operations or non-modifying actions
  const revertibleTools = completedTools.filter((t) => {
    const result = t.result as { isRevertible?: boolean } | undefined;
    // Exclude tools that explicitly report they're not revertible
    // Default to true (revertible) if isRevertible is not set (backward compatibility)
    return result?.isRevertible !== false;
  });

  // If no revertible tools completed, nothing to save
  if (revertibleTools.length === 0) {
    return null;
  }

  // Convert to storage format
  const toolCalls = revertibleTools.map(toolStatusToToolCallEntry);

  // Use agent's status if available, otherwise derive from tool executions
  const overallStatus = agentResponse?.status ?? deriveOverallStatus(completedTools);

  return {
    pcgwPageId,
    launcherGameId,
    tweak,
    status: overallStatus,
    summary: {
      status: overallStatus,
      message: agentResponse?.message ?? 'Tweak applied',
      toolCalls,
      // skipped: agentResponse?.skipped,
    },
    appliedAt: new Date().toISOString(),
  };
}
