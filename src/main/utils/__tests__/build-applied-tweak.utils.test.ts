/**
 * Build Applied Tweak Utils Tests
 *
 * Tests for converting tool executions to AppliedTweak format:
 * - buildAppliedTweak function
 * - Filtering to revertible tools
 * - Status derivation from tools
 * - Agent response integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Tweak } from '@twiki/shared';
import type { ToolStatus } from '../../interfaces/tool-status.interface';
import type { AgentResponseSchemaType } from '../../schemas/tweak-summary.schema';
import { buildAppliedTweak } from '../build-applied-tweak.utils';

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockTweak = (title = 'Test Tweak'): Tweak => ({
  hash: 'tweak-hash-123',
  groupTitle: 'Test Group',
  title,
  body: 'Test body',
  notes: [],
});

const createToolStatus = (
  toolName: string,
  options: {
    status?: 'pending-approval' | 'completed' | 'error';
    error?: string;
    result?: object;
    toolId?: string;
  } = {}
): ToolStatus => ({
  toolId: options.toolId || `tool-${Math.random()}`,
  toolName,
  args: {},
  status: options.status || 'completed',
  formattedDescription: `${toolName} operation`,
  registeredAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  error: options.error,
  result: options.result,
});

const createAgentResponse = (
  status: 'success' | 'error' | 'warning' = 'success',
  message = 'Tweak applied successfully'
): AgentResponseSchemaType => ({
  status,
  message,
});

// =============================================================================
// Tests
// =============================================================================

describe('Build Applied Tweak Utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('buildAppliedTweak', () => {
    it('should return null when no tools completed', () => {
      const result = buildAppliedTweak('game-123', 456, createMockTweak(), [], null);

      expect(result).toBeNull();
    });

    it('should return null when all tools are non-revertible', () => {
      const tools = [
        createToolStatus('read-file', { result: { isRevertible: false } }),
        createToolStatus('get-system-info', { result: { isRevertible: false } }),
      ];

      const result = buildAppliedTweak('game-123', 456, createMockTweak(), tools, null);

      expect(result).toBeNull();
    });

    it('should build applied tweak from revertible tools', () => {
      const tools = [
        createToolStatus('edit-ini-value', {
          toolId: 'tool-1',
          result: { isRevertible: true },
        }),
        createToolStatus('set-registry-value', {
          toolId: 'tool-2',
          result: { isRevertible: true },
        }),
      ];

      const tweak = createMockTweak('Performance Fix');
      const result = buildAppliedTweak('game-123', 456, tweak, tools, null);

      expect(result).not.toBeNull();
      expect(result!.launcherGameId).toBe('game-123');
      expect(result!.pcgwPageId).toBe(456);
      expect(result!.tweak).toBe(tweak);
      expect(result!.status).toBe('success');
      expect(result!.appliedAt).toBe('2024-01-15T12:00:00.000Z');
      expect(result!.summary.toolCalls).toHaveLength(2);
    });

    it('should filter out non-revertible tools', () => {
      const tools = [
        createToolStatus('edit-ini-value', {
          toolId: 'tool-1',
          result: { isRevertible: true },
        }),
        createToolStatus('read-file', {
          toolId: 'tool-2',
          result: { isRevertible: false },
        }),
        createToolStatus('set-registry-value', {
          toolId: 'tool-3',
          result: { isRevertible: true },
        }),
      ];

      const result = buildAppliedTweak('game-123', 456, createMockTweak(), tools, null);

      expect(result!.summary.toolCalls).toHaveLength(2);
      expect(result!.summary.toolCalls.map((t) => t.toolCallId)).toEqual(['tool-1', 'tool-3']);
    });

    it('should default to revertible when isRevertible is not set', () => {
      const tools = [
        createToolStatus('edit-ini-value', {
          toolId: 'tool-1',
          result: {}, // No isRevertible field
        }),
        createToolStatus('set-registry-value', {
          toolId: 'tool-2',
          result: undefined, // No result
        }),
      ];

      const result = buildAppliedTweak('game-123', 456, createMockTweak(), tools, null);

      expect(result!.summary.toolCalls).toHaveLength(2);
    });

    it('should derive error status from errored tools', () => {
      const tools = [
        createToolStatus('edit-ini-value', {
          result: { isRevertible: true },
        }),
        createToolStatus('set-registry-value', {
          status: 'error',
          error: 'Permission denied',
          result: { isRevertible: true },
        }),
      ];

      const result = buildAppliedTweak('game-123', 456, createMockTweak(), tools, null);

      expect(result!.status).toBe('error');
      expect(result!.summary.status).toBe('error');
    });

    it('should use agent response status when provided', () => {
      const tools = [
        createToolStatus('edit-ini-value', {
          status: 'error',
          error: 'Failed',
          result: { isRevertible: true },
        }),
      ];

      const agentResponse = createAgentResponse('warning', 'Partial success');
      const result = buildAppliedTweak('game-123', 456, createMockTweak(), tools, agentResponse);

      expect(result!.status).toBe('warning');
      expect(result!.summary.status).toBe('warning');
    });

    it('should use agent response message when provided', () => {
      const tools = [
        createToolStatus('edit-ini-value', {
          result: { isRevertible: true },
        }),
      ];

      const agentResponse = createAgentResponse('success', 'Custom success message');
      const result = buildAppliedTweak('game-123', 456, createMockTweak(), tools, agentResponse);

      expect(result!.summary.message).toBe('Custom success message');
    });

    it('should use default message when no agent response', () => {
      const tools = [
        createToolStatus('edit-ini-value', {
          result: { isRevertible: true },
        }),
      ];

      const result = buildAppliedTweak('game-123', 456, createMockTweak(), tools, null);

      expect(result!.summary.message).toBe('Tweak applied');
    });

    it('should convert tool status to tool call entry format', () => {
      const tools = [
        createToolStatus('edit-ini-value', {
          toolId: 'tool-123',
          result: { isRevertible: true, data: 'test' },
        }),
      ];

      const result = buildAppliedTweak('game-123', 456, createMockTweak(), tools, null);

      const toolCall = result!.summary.toolCalls[0];
      expect(toolCall.toolCallId).toBe('tool-123');
      expect(toolCall.toolName).toBe('edit-ini-value');
      expect(toolCall.description).toBe('edit-ini-value operation');
      expect(toolCall.status).toBe('success');
      expect(toolCall.result).toEqual({ isRevertible: true, data: 'test' });
    });

    it('should mark tool call entry as error when tool has error', () => {
      const tools = [
        createToolStatus('edit-ini-value', {
          toolId: 'tool-123',
          error: 'Something went wrong',
          result: { isRevertible: true },
        }),
      ];

      const result = buildAppliedTweak('game-123', 456, createMockTweak(), tools, null);

      const toolCall = result!.summary.toolCalls[0];
      expect(toolCall.status).toBe('error');
    });

    it('should handle mixed revertible and non-revertible tools', () => {
      const tools = [
        createToolStatus('read-ini-value', { result: { isRevertible: false } }),
        createToolStatus('edit-ini-value', { result: { isRevertible: true } }),
        createToolStatus('backup-file', { result: { isRevertible: false } }),
        createToolStatus('set-registry-value', { result: { isRevertible: true } }),
        createToolStatus('verify-changes', { result: { isRevertible: false } }),
      ];

      const result = buildAppliedTweak('game-123', 456, createMockTweak(), tools, null);

      expect(result!.summary.toolCalls).toHaveLength(2);
      const toolNames = result!.summary.toolCalls.map((t) => t.toolName);
      expect(toolNames).toContain('edit-ini-value');
      expect(toolNames).toContain('set-registry-value');
    });

    it('should preserve tool order in summary', () => {
      const tools = [
        createToolStatus('tool-a', { toolId: 'a', result: { isRevertible: true } }),
        createToolStatus('tool-b', { toolId: 'b', result: { isRevertible: true } }),
        createToolStatus('tool-c', { toolId: 'c', result: { isRevertible: true } }),
      ];

      const result = buildAppliedTweak('game-123', 456, createMockTweak(), tools, null);

      expect(result!.summary.toolCalls.map((t) => t.toolCallId)).toEqual(['a', 'b', 'c']);
    });

    it('should include timestamp in tool call entries', () => {
      const tools = [
        createToolStatus('edit-ini-value', {
          result: { isRevertible: true },
        }),
      ];

      const result = buildAppliedTweak('game-123', 456, createMockTweak(), tools, null);

      expect(result!.summary.toolCalls[0].timestamp).toBeDefined();
    });

    it('should handle tools with error status in completed list', () => {
      const tools = [
        createToolStatus('edit-ini-value', {
          status: 'completed',
          result: { isRevertible: true },
        }),
        createToolStatus('set-registry-value', {
          status: 'error',
          error: 'Failed',
          result: { isRevertible: true },
        }),
      ];

      const result = buildAppliedTweak('game-123', 456, createMockTweak(), tools, null);

      expect(result!.status).toBe('error');
      expect(result!.summary.toolCalls).toHaveLength(2);
    });
  });
});
