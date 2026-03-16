/**
 * Tool Executor Service
 *
 * Handles tool execution for the WebSocket-based agent communication.
 * Receives tool_call requests from the server and executes them locally
 * using the tool definitions.
 */

import { toolRegistry } from '../../tools';
import { createLogger } from '../../utils/logger.utils';

const logger = createLogger('ToolExecutor');

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

// ============================================================================
// Public API
// ============================================================================

export class ToolExecutorService {
  /**
   * Execute a tool call.
   *
   * This simply delegates to the existing Mastra tool's execute() method,
   * which handles:
   * 1. Registering the tool for approval
   * 2. Waiting for user approval
   * 3. Executing the tool if approved
   * 4. Returning the result
   *
   * @param toolName - Name of the tool to execute
   * @param args - Tool arguments
   * @returns Tool execution result
   */
  static async execute(toolName: string, args: unknown): Promise<ToolExecutionResult> {
    const tool = toolRegistry[toolName];

    if (!tool) {
      logger.warn(`Unknown tool: ${toolName}`);
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
        result: {
          success: false,
          message: `Tool "${toolName}" is not registered`,
          timestamp: new Date().toISOString(),
        },
      };
    }

    try {
      const result = await tool.execute(args);
      const resultObj = result as { success?: boolean; message?: string };
      const success = resultObj.success !== false;
      logger.info(`${toolName} executed successfully:`, JSON.stringify(resultObj, null, 2));

      return {
        success,
        result,
        error: success ? undefined : resultObj.message,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`${toolName} failed:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
        result: {
          success: false,
          message: `Tool execution failed: ${errorMessage}`,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Check if a tool is registered.
   */
  static hasExecutor(toolName: string): boolean {
    return toolName in toolRegistry;
  }

  /**
   * Get list of registered tool names.
   */
  static getRegisteredTools(): string[] {
    return Object.keys(toolRegistry);
  }
}
