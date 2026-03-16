/**
 * Agent IPC Handlers
 *
 * Handles IPC operations for agent and tool status:
 * - Agent status and control
 * - Tweak processing
 * - Tool approval/decline
 */

import type { ProcessTweakRequest } from '../interfaces';
import type { AgentService } from '../services/agent/agent.service';
import { ToolStatusService } from '../services/agent/tool-status.service';
import { createIpcHandlers, createIpcListeners } from './ipc-handler.factory';

/**
 * Setup agent-related IPC handlers.
 * @param agentService - AgentService instance for handling agent operations
 */
export function setupAgentIpc(agentService: AgentService): void {
  createIpcHandlers([
    { channel: 'agent:get-status', handler: () => agentService.status },
    {
      channel: 'agent:process-tweak',
      handler: async (_, request: ProcessTweakRequest) => agentService.processTweak(request),
    },
    { channel: 'agent:get-tool-statuses', handler: () => ToolStatusService.getSnapshot() },
    {
      channel: 'agent:approve-tool',
      handler: (_, { toolId, modifiedArgs }: { toolId: string; modifiedArgs?: Record<string, unknown> }) =>
        ToolStatusService.approveOrDeclineTool(toolId, true, modifiedArgs),
    },
    {
      channel: 'agent:decline-tool',
      handler: (_, toolId: string) => ToolStatusService.approveOrDeclineTool(toolId, false),
    },
  ]);

  createIpcListeners([
    { channel: 'agent:abort-task', handler: () => agentService.abortTask() },
    { channel: 'agent:reset-status', handler: () => agentService.resetStatus() },
  ]);
}
