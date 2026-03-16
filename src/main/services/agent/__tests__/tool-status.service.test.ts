/**
 * ToolStatusService Tests
 *
 * Tests the tool approval workflow state management including:
 * - Tool registration and ID generation
 * - Auto-approval for read-only tools
 * - Approval/decline state transitions
 * - Pending approval promise resolution
 * - Tool result updates with error/success
 * - Snapshot generation for renderer
 * - Cleanup callback registration and execution
 * - Abort flow with pending rejections
 * - Download progress updates
 * - Session abort state checking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock MainWindow before importing ToolStatusService
const mockWebContentsSend = vi.fn();
vi.mock('../../../windows', () => ({
  MainWindow: {
    getWindow: () => ({
      webContents: {
        send: mockWebContentsSend,
      },
    }),
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

// Mock SettingsService
const mockSettings = {
  autoTweaker: {
    autoApproveReadOnly: false,
  },
};
vi.mock('../../core/settings.service', () => ({
  SettingsService: {
    get settings() {
      return mockSettings;
    },
  },
}));

// Mock format-tool-call utils
vi.mock('../../../utils/format-tool-call.utils', () => ({
  formatToolCall: vi.fn().mockImplementation((toolName: string, args: unknown) =>
    `${toolName}: ${JSON.stringify(args)}`
  ),
  formatToolCallStructured: vi.fn().mockImplementation((toolName: string) => ({
    toolName,
    operations: [],
    paths: [],
  })),
}));

import { ToolStatusService } from '../tool-status.service';

describe('ToolStatusService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the service state before each test
    ToolStatusService.reset();
    // Reset settings to default
    mockSettings.autoTweaker = { autoApproveReadOnly: false };
  });

  afterEach(() => {
    // Clean up any pending approvals
    ToolStatusService.reset();
  });

  describe('reset', () => {
    it('should clear all state', async () => {
      // Register a tool to have some state
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });

      // Reset the service
      ToolStatusService.reset();

      // Verify state is cleared
      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.tools).toHaveLength(0);
      expect(snapshot.hasAwaitingApproval).toBe(false);
      expect(snapshot.firstPendingToolId).toBeNull();

      // The pending promise should be rejected
      await expect(promise).rejects.toThrow('Session reset');
    });

    it('should reset abort state', () => {
      // First, trigger an abort
      ToolStatusService.abortAllTools();

      expect(ToolStatusService.isSessionAborting()).toBe(true);

      // Reset should clear abort state
      ToolStatusService.reset();

      expect(ToolStatusService.isSessionAborting()).toBe(false);
    });

    it('should clear cleanup callbacks', async () => {
      // Register a tool and add cleanup
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });
      ToolStatusService.approveOrDeclineTool(
        ToolStatusService.getSnapshot().firstPendingToolId!,
        true
      );
      const { toolId } = await promise;

      const cleanupFn = vi.fn();
      ToolStatusService.registerCleanup(toolId, cleanupFn);

      // Reset clears callbacks without calling them
      ToolStatusService.reset();

      // Abort should not call the cleanup since it was cleared
      await ToolStatusService.abortAllTools();
      expect(cleanupFn).not.toHaveBeenCalled();
    });
  });

  describe('registerToolForApproval', () => {
    it('should generate unique tool IDs', async () => {
      const promise1 = ToolStatusService.registerToolForApproval('read-file-tool', { path: '/a' });
      const promise2 = ToolStatusService.registerToolForApproval('read-file-tool', { path: '/b' });

      const snapshot = ToolStatusService.getSnapshot();
      const toolIds = snapshot.tools.map(t => t.toolId);

      expect(toolIds[0]).not.toBe(toolIds[1]);
      expect(toolIds[0]).toMatch(/^tool-\d+-\d+$/);
      expect(toolIds[1]).toMatch(/^tool-\d+-\d+$/);

      // Clean up by resetting
      ToolStatusService.reset();
      await expect(promise1).rejects.toThrow();
      await expect(promise2).rejects.toThrow();
    });

    it('should create tool status with pending-approval status', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });

      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.tools).toHaveLength(1);
      expect(snapshot.tools[0].status).toBe('pending-approval');
      expect(snapshot.tools[0].toolName).toBe('edit-file-tool');
      expect(snapshot.tools[0].args).toEqual({ path: '/test' });

      // Clean up
      ToolStatusService.reset();
      await expect(promise).rejects.toThrow();
    });

    it('should send snapshot to renderer after registration', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });

      expect(mockWebContentsSend).toHaveBeenCalledWith(
        'agent:tool-status-update',
        expect.objectContaining({
          hasAwaitingApproval: true,
        })
      );

      // Clean up
      ToolStatusService.reset();
      await expect(promise).rejects.toThrow();
    });

    it('should return a promise that waits for approval', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });

      // Promise should be pending
      let resolved = false;
      promise.then(() => { resolved = true; }).catch(() => {});

      // Give it a tick
      await new Promise(r => setTimeout(r, 10));
      expect(resolved).toBe(false);

      // Clean up
      ToolStatusService.reset();
      await expect(promise).rejects.toThrow();
    });
  });

  describe('auto-approval for read-only tools', () => {
    it('should auto-approve read-only tools when setting is enabled', async () => {
      mockSettings.autoTweaker = { autoApproveReadOnly: true };

      const result = await ToolStatusService.registerToolForApproval('read-file-tool', { path: '/test' });

      expect(result.approved).toBe(true);
      expect(result.toolId).toBeDefined();

      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.tools[0].status).toBe('approved');
    });

    it('should auto-approve list-directory-contents-tool when setting is enabled', async () => {
      mockSettings.autoTweaker = { autoApproveReadOnly: true };

      const result = await ToolStatusService.registerToolForApproval('list-directory-contents-tool', { path: '/test' });

      expect(result.approved).toBe(true);
    });

    it('should auto-approve read-file-around-pattern-tool when setting is enabled', async () => {
      mockSettings.autoTweaker = { autoApproveReadOnly: true };

      const result = await ToolStatusService.registerToolForApproval('read-file-around-pattern-tool', {
        path: '/test',
        pattern: 'test',
      });

      expect(result.approved).toBe(true);
    });

    it('should NOT auto-approve non-read-only tools even when setting is enabled', async () => {
      mockSettings.autoTweaker = { autoApproveReadOnly: true };

      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });

      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.tools[0].status).toBe('pending-approval');

      // Clean up
      ToolStatusService.reset();
      await expect(promise).rejects.toThrow();
    });

    it('should NOT auto-approve when setting is disabled', async () => {
      mockSettings.autoTweaker = { autoApproveReadOnly: false };

      const promise = ToolStatusService.registerToolForApproval('read-file-tool', { path: '/test' });

      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.tools[0].status).toBe('pending-approval');

      // Clean up
      ToolStatusService.reset();
      await expect(promise).rejects.toThrow();
    });
  });

  describe('approveOrDeclineTool', () => {
    it('should approve a pending tool and resolve promise', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });

      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      const success = ToolStatusService.approveOrDeclineTool(toolId, true);

      expect(success).toBe(true);

      const result = await promise;
      expect(result.approved).toBe(true);
      expect(result.toolId).toBe(toolId);

      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.tools[0].status).toBe('approved');
    });

    it('should decline a pending tool and resolve promise', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });

      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      const success = ToolStatusService.approveOrDeclineTool(toolId, false);

      expect(success).toBe(true);

      const result = await promise;
      expect(result.approved).toBe(false);

      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.tools[0].status).toBe('declined');
    });

    it('should return false for unknown toolId', () => {
      const success = ToolStatusService.approveOrDeclineTool('unknown-id', true);
      expect(success).toBe(false);
    });

    it('should support modified args on approval', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', {
        path: '/test',
        content: 'original',
      });

      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      const modifiedArgs = { path: '/test', content: 'modified' };
      ToolStatusService.approveOrDeclineTool(toolId, true, modifiedArgs);

      const result = await promise;
      expect(result.modifiedArgs).toEqual(modifiedArgs);

      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.tools[0].args).toEqual(modifiedArgs);
      expect(snapshot.tools[0].initialArgs).toEqual({ path: '/test', content: 'original' });
    });

    it('should send snapshot to renderer after approval', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });
      mockWebContentsSend.mockClear();

      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(toolId, true);

      expect(mockWebContentsSend).toHaveBeenCalledWith(
        'agent:tool-status-update',
        expect.objectContaining({
          hasAwaitingApproval: false,
        })
      );

      await promise;
    });
  });

  describe('markExecuting', () => {
    it('should update tool status to executing', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });
      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(toolId, true);
      await promise;

      ToolStatusService.markExecuting(toolId);

      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.tools[0].status).toBe('executing');
    });

    it('should send snapshot to renderer', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });
      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(toolId, true);
      await promise;
      mockWebContentsSend.mockClear();

      ToolStatusService.markExecuting(toolId);

      expect(mockWebContentsSend).toHaveBeenCalled();
    });
  });

  describe('updateToolResult', () => {
    it('should update status to completed on success', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });
      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(toolId, true);
      await promise;

      ToolStatusService.updateToolResult(toolId, { success: true, message: 'Done' });

      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.tools[0].status).toBe('completed');
      expect(snapshot.tools[0].result).toEqual({ success: true, message: 'Done' });
      expect(snapshot.tools[0].error).toBeUndefined();
    });

    it('should update status to error on failure', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });
      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(toolId, true);
      await promise;

      ToolStatusService.updateToolResult(toolId, undefined, 'File not found');

      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.tools[0].status).toBe('error');
      expect(snapshot.tools[0].error).toBe('File not found');
    });

    it('should ignore unknown toolId', () => {
      // Should not throw
      ToolStatusService.updateToolResult('unknown-id', { success: true });

      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.tools).toHaveLength(0);
    });
  });

  describe('getSnapshot', () => {
    it('should return empty snapshot initially', () => {
      const snapshot = ToolStatusService.getSnapshot();

      expect(snapshot.tools).toEqual([]);
      expect(snapshot.hasAwaitingApproval).toBe(false);
      expect(snapshot.firstPendingToolId).toBeNull();
    });

    it('should correctly identify first pending tool', async () => {
      const promise1 = ToolStatusService.registerToolForApproval('tool-a', { id: 1 });
      const promise2 = ToolStatusService.registerToolForApproval('tool-b', { id: 2 });

      const snapshot = ToolStatusService.getSnapshot();

      expect(snapshot.hasAwaitingApproval).toBe(true);
      // First pending tool should be the one registered first (by registeredAt timestamp)
      expect(snapshot.tools[0].toolName).toBe('tool-a');
      expect(snapshot.firstPendingToolId).toBe(snapshot.tools[0].toolId);

      // Clean up
      ToolStatusService.reset();
      await expect(promise1).rejects.toThrow();
      await expect(promise2).rejects.toThrow();
    });

    it('should update firstPendingToolId after approval', async () => {
      const promise1 = ToolStatusService.registerToolForApproval('tool-a', { id: 1 });
      const promise2 = ToolStatusService.registerToolForApproval('tool-b', { id: 2 });

      const firstToolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(firstToolId, true);
      await promise1;

      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.firstPendingToolId).not.toBe(firstToolId);
      expect(snapshot.tools.find(t => t.toolId === snapshot.firstPendingToolId)?.toolName).toBe('tool-b');

      // Clean up
      ToolStatusService.reset();
      await expect(promise2).rejects.toThrow();
    });
  });

  describe('hasCompletedModificationTools', () => {
    it('should return false when no tools', () => {
      expect(ToolStatusService.hasCompletedModificationTools()).toBe(false);
    });

    it('should return false when only read-only tools completed', async () => {
      mockSettings.autoTweaker = { autoApproveReadOnly: true };

      await ToolStatusService.registerToolForApproval('read-file-tool', { path: '/test' });
      const snapshot = ToolStatusService.getSnapshot();
      const toolId = snapshot.tools[0].toolId;
      ToolStatusService.markExecuting(toolId);
      ToolStatusService.updateToolResult(toolId, { success: true });

      expect(ToolStatusService.hasCompletedModificationTools()).toBe(false);
    });

    it('should return true when modification tool completed', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });
      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(toolId, true);
      await promise;

      ToolStatusService.markExecuting(toolId);
      ToolStatusService.updateToolResult(toolId, { success: true });

      expect(ToolStatusService.hasCompletedModificationTools()).toBe(true);
    });

    it('should return false when modification tool failed', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });
      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(toolId, true);
      await promise;

      ToolStatusService.markExecuting(toolId);
      ToolStatusService.updateToolResult(toolId, undefined, 'Error');

      expect(ToolStatusService.hasCompletedModificationTools()).toBe(false);
    });
  });

  describe('updateDownloadProgress', () => {
    it('should update download progress on tool with download operation', async () => {
      // Mock formatToolCallStructured to return download operation
      const { formatToolCallStructured } = await import('../../../utils/format-tool-call.utils');
      vi.mocked(formatToolCallStructured).mockReturnValueOnce({
        displayName: 'Download File',
        iconType: 'download',
        summary: 'Download file.zip',
        operations: [{ type: 'download' as const, url: 'http://example.com/file.zip', displayUrl: 'example.com/file.zip', shouldExtract: false, openAfterDownload: false }],
      });

      const promise = ToolStatusService.registerToolForApproval('download-file-tool', {
        url: 'http://example.com/file.zip',
      });
      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;

      const progress = {
        downloadedBytes: 500,
        totalBytes: 1000,
        percentage: 50,
      };
      ToolStatusService.updateDownloadProgress(toolId, progress);

      const snapshot = ToolStatusService.getSnapshot();
      const downloadOp = snapshot.tools[0].displayInfo?.operations.find(
        (op) => op.type === 'download'
      );
      expect(downloadOp?.progress).toEqual(progress);

      // Clean up
      ToolStatusService.reset();
      await expect(promise).rejects.toThrow();
    });

    it('should ignore unknown toolId', () => {
      // Should not throw
      ToolStatusService.updateDownloadProgress('unknown-id', {
        downloadedBytes: 500,
        totalBytes: 1000,
        percentage: 50,
      });
    });
  });

  describe('registerCleanup / unregisterCleanup', () => {
    it('should register cleanup callback', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });
      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(toolId, true);
      await promise;

      const cleanup = vi.fn();
      ToolStatusService.registerCleanup(toolId, cleanup);

      // Trigger abort to run cleanups
      await ToolStatusService.abortAllTools();

      expect(cleanup).toHaveBeenCalled();
    });

    it('should unregister cleanup callback', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });
      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(toolId, true);
      await promise;

      const cleanup = vi.fn();
      ToolStatusService.registerCleanup(toolId, cleanup);
      ToolStatusService.unregisterCleanup(toolId);

      // Trigger abort - cleanup should not run
      await ToolStatusService.abortAllTools();

      expect(cleanup).not.toHaveBeenCalled();
    });
  });

  describe('isSessionAborting', () => {
    it('should return false initially', () => {
      expect(ToolStatusService.isSessionAborting()).toBe(false);
    });

    it('should return true after abortAllTools', async () => {
      await ToolStatusService.abortAllTools();
      expect(ToolStatusService.isSessionAborting()).toBe(true);
    });

    it('should return false after reset', async () => {
      await ToolStatusService.abortAllTools();
      ToolStatusService.reset();
      expect(ToolStatusService.isSessionAborting()).toBe(false);
    });
  });

  describe('abortAllTools', () => {
    it('should reject all pending approvals', async () => {
      const promise1 = ToolStatusService.registerToolForApproval('tool-a', { id: 1 });
      const promise2 = ToolStatusService.registerToolForApproval('tool-b', { id: 2 });

      await ToolStatusService.abortAllTools();

      await expect(promise1).rejects.toThrow('Session aborted');
      await expect(promise2).rejects.toThrow('Session aborted');
    });

    it('should run all cleanup callbacks', async () => {
      const promise1 = ToolStatusService.registerToolForApproval('tool-a', { id: 1 });
      const toolId1 = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(toolId1, true);
      await promise1;

      const promise2 = ToolStatusService.registerToolForApproval('tool-b', { id: 2 });
      const toolId2 = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(toolId2, true);
      await promise2;

      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn().mockResolvedValue(undefined);

      ToolStatusService.registerCleanup(toolId1, cleanup1);
      ToolStatusService.registerCleanup(toolId2, cleanup2);

      await ToolStatusService.abortAllTools();

      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });
      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(toolId, true);
      await promise;

      const cleanup = vi.fn().mockRejectedValue(new Error('Cleanup failed'));
      ToolStatusService.registerCleanup(toolId, cleanup);

      // Should not throw
      await expect(ToolStatusService.abortAllTools()).resolves.toBeUndefined();
    });

    it('should mark executing tools as error', async () => {
      const promise = ToolStatusService.registerToolForApproval('edit-file-tool', { path: '/test' });
      const toolId = ToolStatusService.getSnapshot().firstPendingToolId!;
      ToolStatusService.approveOrDeclineTool(toolId, true);
      await promise;
      ToolStatusService.markExecuting(toolId);

      await ToolStatusService.abortAllTools();

      const snapshot = ToolStatusService.getSnapshot();
      expect(snapshot.tools[0].status).toBe('error');
      expect(snapshot.tools[0].error).toBe('Aborted by user');
    });

    it('should send snapshot to renderer after abort', async () => {
      mockWebContentsSend.mockClear();

      await ToolStatusService.abortAllTools();

      expect(mockWebContentsSend).toHaveBeenCalledWith(
        'agent:tool-status-update',
        expect.any(Object)
      );
    });
  });
});
