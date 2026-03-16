/**
 * ToolExecutorService Tests
 *
 * Tests the tool executor service including:
 * - Tool registry lookup
 * - Tool execution
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock tool registry with inline definition
vi.mock('../../../tools', () => ({
  toolRegistry: {
    'read-file-tool': { execute: vi.fn().mockResolvedValue({ success: true, message: 'Tool executed' }) },
    'edit-file-tool': { execute: vi.fn().mockResolvedValue({ success: true, message: 'Tool executed' }) },
    'create-file-tool': { execute: vi.fn().mockResolvedValue({ success: true, message: 'Tool executed' }) },
  },
}));

// Mock logger
vi.mock('../../../utils/logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import { ToolExecutorService } from '../tool-executor.service';
import { toolRegistry } from '../../../tools';

// =============================================================================
// Tests
// =============================================================================

describe('ToolExecutorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('execute', () => {
    it('should execute a registered tool successfully', async () => {
      const result = await ToolExecutorService.execute('read-file-tool', {
        path: '/test/file.txt',
      });

      expect(result.success).toBe(true);
      expect(toolRegistry['read-file-tool'].execute).toHaveBeenCalledWith({ path: '/test/file.txt' });
    });

    it('should return error for unknown tool', async () => {
      const result = await ToolExecutorService.execute('unknown-tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown tool: unknown-tool');
      expect(result.result).toEqual({
        success: false,
        message: 'Tool "unknown-tool" is not registered',
        timestamp: expect.any(String),
      });
    });

    it('should handle tool execution returning success: false', async () => {
      vi.mocked(toolRegistry['read-file-tool'].execute).mockResolvedValue({
        success: false,
        message: 'File not found',
      } as any);

      const result = await ToolExecutorService.execute('read-file-tool', {
        path: '/nonexistent/file.txt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('should handle tool execution throwing an error', async () => {
      vi.mocked(toolRegistry['read-file-tool'].execute).mockRejectedValue(new Error('Permission denied'));

      const result = await ToolExecutorService.execute('read-file-tool', {
        path: '/protected/file.txt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
      expect(result.result).toEqual({
        success: false,
        message: 'Tool execution failed: Permission denied',
        timestamp: expect.any(String),
      });
    });
  });

  describe('hasExecutor', () => {
    it('should return true for registered tools', () => {
      expect(ToolExecutorService.hasExecutor('read-file-tool')).toBe(true);
      expect(ToolExecutorService.hasExecutor('edit-file-tool')).toBe(true);
      expect(ToolExecutorService.hasExecutor('create-file-tool')).toBe(true);
    });

    it('should return false for unregistered tools', () => {
      expect(ToolExecutorService.hasExecutor('unknown-tool')).toBe(false);
    });
  });

  describe('getRegisteredTools', () => {
    it('should return list of registered tool names', () => {
      const tools = ToolExecutorService.getRegisteredTools();

      expect(tools).toContain('read-file-tool');
      expect(tools).toContain('edit-file-tool');
      expect(tools).toContain('create-file-tool');
    });
  });
});
