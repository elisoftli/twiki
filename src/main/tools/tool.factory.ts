/**
 * Local createTool implementation - replaces @mastra/client-js
 *
 * This provides the same interface as Mastra's createTool but without
 * any external dependencies. Tools created with this function work with:
 * - tool-converter.ts (converts to Anthropic API format)
 * - tool-executor.service.ts (executes tools locally)
 */

import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Tool definition interface
 */
export interface ToolDefinition<TInput, TOutput> {
  /** Unique identifier for the tool (kebab-case) */
  id: string;
  /** Description of what the tool does */
  description: string;
  /** Zod schema for input validation */
  inputSchema: ZodType<TInput, ZodTypeDef, unknown>;
  /** Zod schema for output validation */
  outputSchema: ZodType<TOutput, ZodTypeDef, unknown>;
  /** Function that executes the tool */
  execute: (input: TInput) => Promise<TOutput>;
}

/**
 * Options for creating a tool
 */
export interface CreateToolOptions<TInput, TOutput> {
  id: string;
  description: string;
  inputSchema: ZodType<TInput, ZodTypeDef, unknown>;
  outputSchema: ZodType<TOutput, ZodTypeDef, unknown>;
  execute: (input: TInput) => Promise<TOutput>;
}

/**
 * Create a tool definition.
 *
 * This is a drop-in replacement for @mastra/client-js createTool.
 * It returns an object with the tool's metadata and execute function.
 *
 * @example
 * ```typescript
 * const myTool = createTool({
 *   id: 'my-tool',
 *   description: 'Does something useful',
 *   inputSchema: z.object({ path: z.string() }),
 *   outputSchema: z.object({ success: z.boolean() }),
 *   execute: async (input) => {
 *     return { success: true };
 *   },
 * });
 * ```
 */
export function createTool<TInput, TOutput>(
  options: CreateToolOptions<TInput, TOutput>
): ToolDefinition<TInput, TOutput> {
  return {
    id: options.id,
    description: options.description,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
    execute: options.execute,
  };
}
