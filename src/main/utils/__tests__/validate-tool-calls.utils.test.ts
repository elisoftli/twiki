/**
 * Validate Tool Calls Utils Tests
 *
 * Tests for agent hallucination detection:
 * - validateToolCalls function
 * - Count-based matching by toolName
 * - Hallucination detection
 * - Edge cases (empty arrays, mismatches)
 */

import { describe, it, expect } from 'vitest';
import type { ToolCallEntry } from '../../interfaces/tweak-agent.interface';
import type { ToolStatus } from '../../interfaces/tool-status.interface';
import { validateToolCalls } from '../validate-tool-calls.utils';

// =============================================================================
// Test Fixtures
// =============================================================================

const createToolCallEntry = (toolName: string, toolCallId = `call-${Math.random()}`): ToolCallEntry => ({
  toolCallId,
  toolName: toolName as any,
  description: `${toolName} operation`,
  status: 'success',
  timestamp: new Date().toISOString(),
  result: {} as any,
});

const createToolStatus = (
  toolName: string,
  status: 'pending-approval' | 'completed' | 'error' = 'completed',
  toolId = `tool-${Math.random()}`
): ToolStatus => ({
  toolId,
  toolName,
  args: {},
  status,
  formattedDescription: `${toolName} operation`,
  registeredAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// =============================================================================
// Tests
// =============================================================================

describe('Validate Tool Calls Utils', () => {
  describe('validateToolCalls', () => {
    it('should return empty results for empty inputs', () => {
      const result = validateToolCalls([], []);

      expect(result.validatedToolCalls).toEqual([]);
      expect(result.hallucinatedToolCalls).toEqual([]);
      expect(result.hasHallucinations).toBe(false);
    });

    it('should validate all tool calls when they match actual executions', () => {
      const agentCalls = [
        createToolCallEntry('edit-ini-value'),
        createToolCallEntry('set-registry-value'),
      ];

      const actualTools = [
        createToolStatus('edit-ini-value', 'completed'),
        createToolStatus('set-registry-value', 'completed'),
      ];

      const result = validateToolCalls(agentCalls, actualTools);

      expect(result.validatedToolCalls).toHaveLength(2);
      expect(result.hallucinatedToolCalls).toHaveLength(0);
      expect(result.hasHallucinations).toBe(false);
    });

    it('should detect hallucinated tool calls', () => {
      const agentCalls = [
        createToolCallEntry('edit-ini-value'),
        createToolCallEntry('set-registry-value'), // Not executed
        createToolCallEntry('create-file'), // Not executed
      ];

      const actualTools = [createToolStatus('edit-ini-value', 'completed')];

      const result = validateToolCalls(agentCalls, actualTools);

      expect(result.validatedToolCalls).toHaveLength(1);
      expect(result.validatedToolCalls[0].toolName).toBe('edit-ini-value');
      expect(result.hallucinatedToolCalls).toHaveLength(2);
      expect(result.hasHallucinations).toBe(true);
    });

    it('should only count completed tools as actual executions', () => {
      const agentCalls = [
        createToolCallEntry('edit-ini-value'),
        createToolCallEntry('set-registry-value'),
      ];

      const actualTools = [
        createToolStatus('edit-ini-value', 'completed'),
        createToolStatus('set-registry-value', 'pending-approval'), // Not completed
      ];

      const result = validateToolCalls(agentCalls, actualTools);

      expect(result.validatedToolCalls).toHaveLength(1);
      expect(result.validatedToolCalls[0].toolName).toBe('edit-ini-value');
      expect(result.hallucinatedToolCalls).toHaveLength(1);
      expect(result.hallucinatedToolCalls[0].toolName).toBe('set-registry-value');
      expect(result.hasHallucinations).toBe(true);
    });

    it('should handle multiple calls to the same tool', () => {
      const agentCalls = [
        createToolCallEntry('edit-ini-value', 'call-1'),
        createToolCallEntry('edit-ini-value', 'call-2'),
        createToolCallEntry('edit-ini-value', 'call-3'),
      ];

      const actualTools = [
        createToolStatus('edit-ini-value', 'completed', 'tool-1'),
        createToolStatus('edit-ini-value', 'completed', 'tool-2'),
      ];

      const result = validateToolCalls(agentCalls, actualTools);

      expect(result.validatedToolCalls).toHaveLength(2);
      expect(result.hallucinatedToolCalls).toHaveLength(1);
      expect(result.hasHallucinations).toBe(true);
    });

    it('should allow more actual executions than claimed', () => {
      const agentCalls = [createToolCallEntry('edit-ini-value')];

      const actualTools = [
        createToolStatus('edit-ini-value', 'completed', 'tool-1'),
        createToolStatus('edit-ini-value', 'completed', 'tool-2'),
        createToolStatus('edit-ini-value', 'completed', 'tool-3'),
      ];

      const result = validateToolCalls(agentCalls, actualTools);

      expect(result.validatedToolCalls).toHaveLength(1);
      expect(result.hallucinatedToolCalls).toHaveLength(0);
      expect(result.hasHallucinations).toBe(false);
    });

    it('should handle all agent calls being hallucinated', () => {
      const agentCalls = [
        createToolCallEntry('fake-tool-1'),
        createToolCallEntry('fake-tool-2'),
      ];

      const actualTools = [createToolStatus('real-tool', 'completed')];

      const result = validateToolCalls(agentCalls, actualTools);

      expect(result.validatedToolCalls).toHaveLength(0);
      expect(result.hallucinatedToolCalls).toHaveLength(2);
      expect(result.hasHallucinations).toBe(true);
    });

    it('should handle empty agent calls with actual executions', () => {
      const agentCalls: ToolCallEntry[] = [];

      const actualTools = [
        createToolStatus('edit-ini-value', 'completed'),
        createToolStatus('set-registry-value', 'completed'),
      ];

      const result = validateToolCalls(agentCalls, actualTools);

      expect(result.validatedToolCalls).toHaveLength(0);
      expect(result.hallucinatedToolCalls).toHaveLength(0);
      expect(result.hasHallucinations).toBe(false);
    });

    it('should handle empty actual tools with agent claims', () => {
      const agentCalls = [
        createToolCallEntry('edit-ini-value'),
        createToolCallEntry('set-registry-value'),
      ];

      const actualTools: ToolStatus[] = [];

      const result = validateToolCalls(agentCalls, actualTools);

      expect(result.validatedToolCalls).toHaveLength(0);
      expect(result.hallucinatedToolCalls).toHaveLength(2);
      expect(result.hasHallucinations).toBe(true);
    });

    it('should ignore error status tools', () => {
      const agentCalls = [
        createToolCallEntry('edit-ini-value'),
        createToolCallEntry('set-registry-value'),
      ];

      const actualTools = [
        createToolStatus('edit-ini-value', 'completed'),
        createToolStatus('set-registry-value', 'error'), // Errored, not completed
      ];

      const result = validateToolCalls(agentCalls, actualTools);

      expect(result.validatedToolCalls).toHaveLength(1);
      expect(result.validatedToolCalls[0].toolName).toBe('edit-ini-value');
      expect(result.hallucinatedToolCalls).toHaveLength(1);
      expect(result.hallucinatedToolCalls[0].toolName).toBe('set-registry-value');
    });

    it('should preserve order of validated tool calls', () => {
      const agentCalls = [
        createToolCallEntry('tool-a', 'call-a'),
        createToolCallEntry('tool-b', 'call-b'),
        createToolCallEntry('tool-c', 'call-c'),
      ];

      const actualTools = [
        createToolStatus('tool-c', 'completed'),
        createToolStatus('tool-a', 'completed'),
        createToolStatus('tool-b', 'completed'),
      ];

      const result = validateToolCalls(agentCalls, actualTools);

      expect(result.validatedToolCalls).toHaveLength(3);
      expect(result.validatedToolCalls[0].toolCallId).toBe('call-a');
      expect(result.validatedToolCalls[1].toolCallId).toBe('call-b');
      expect(result.validatedToolCalls[2].toolCallId).toBe('call-c');
    });

    it('should preserve order of hallucinated tool calls', () => {
      const agentCalls = [
        createToolCallEntry('fake-a', 'call-a'),
        createToolCallEntry('fake-b', 'call-b'),
        createToolCallEntry('fake-c', 'call-c'),
      ];

      const actualTools: ToolStatus[] = [];

      const result = validateToolCalls(agentCalls, actualTools);

      expect(result.hallucinatedToolCalls).toHaveLength(3);
      expect(result.hallucinatedToolCalls[0].toolCallId).toBe('call-a');
      expect(result.hallucinatedToolCalls[1].toolCallId).toBe('call-b');
      expect(result.hallucinatedToolCalls[2].toolCallId).toBe('call-c');
    });

    it('should handle mixed validated and hallucinated calls in order', () => {
      const agentCalls = [
        createToolCallEntry('real-tool', 'call-1'),
        createToolCallEntry('fake-tool', 'call-2'),
        createToolCallEntry('real-tool', 'call-3'),
        createToolCallEntry('fake-tool', 'call-4'),
      ];

      const actualTools = [
        createToolStatus('real-tool', 'completed', 'tool-1'),
        createToolStatus('real-tool', 'completed', 'tool-2'),
      ];

      const result = validateToolCalls(agentCalls, actualTools);

      expect(result.validatedToolCalls).toHaveLength(2);
      expect(result.validatedToolCalls[0].toolCallId).toBe('call-1');
      expect(result.validatedToolCalls[1].toolCallId).toBe('call-3');

      expect(result.hallucinatedToolCalls).toHaveLength(2);
      expect(result.hallucinatedToolCalls[0].toolCallId).toBe('call-2');
      expect(result.hallucinatedToolCalls[1].toolCallId).toBe('call-4');
    });
  });
});
