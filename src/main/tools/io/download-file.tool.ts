import { createTool } from '../tool.factory';
import { z } from 'zod';
import { shell } from 'electron';
import { promises as fs } from 'fs';
import { downloadFile } from './utils/download-file.utils';
import { downloadFileToolSchema } from '@twiki/shared';
import { ToolStatusService } from '../../services/agent/tool-status.service';
import { getUserInput } from '../user-interaction/utils/get-user-input.utils';
import { createLogger } from '../../utils/logger.utils';
import type { AssetInfo, DownloadProgress } from './utils/hosters';

const logger = createLogger('DownloadFile');

type Input = z.infer<typeof downloadFileToolSchema.inputSchema>;

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export const downloadFileTool = createTool({
  ...downloadFileToolSchema,
  execute: async (inputData) => {
    const { downloadUrl, shouldExtract, openAfterDownload, selectionHint } = inputData as unknown as Input;

    // Register tool and wait for user approval
    const { approved, toolId } = await ToolStatusService.registerToolForApproval(
      'download-file-tool',
      inputData as unknown as Record<string, unknown>
    );

    if (!approved) {
      return {
        success: false,
        message: 'Tool execution declined by user',
        timestamp: new Date(),
        downloadPath: '',
        extractPath: undefined,
        extractedFiles: undefined,
        resolvedUrl: '',
        hosterUsed: '',
        fileSize: 0,
        opened: undefined,
        metadata: undefined,
      };
    }

    // Mark as executing
    ToolStatusService.markExecuting(toolId);

    // Create AbortController for cancellation support
    const abortController = new AbortController();

    // Track current download path for cleanup
    let currentDownloadPath: string | undefined;

    // Register cleanup callback for abort handling
    ToolStatusService.registerCleanup(toolId, async () => {
      abortController.abort();

      // Delete partial download file if it exists
      if (currentDownloadPath) {
        try {
          await fs.unlink(currentDownloadPath);
        } catch {
          // File might not exist yet or already deleted
        }
      }
    });

    try {
      // Create asset selection callback using getUserInputTool
      const getUserSelection = async (assets: AssetInfo[]): Promise<number> => {
        const options = assets.map((asset, index) => {
          const sizeStr = asset.size ? ` (${formatFileSize(asset.size)})` : '';
          return `${index + 1}. ${asset.name}${sizeStr}`;
        });

        const result = await getUserInput({
          title: 'Select Download Asset',
          message: 'Multiple download options available. Which file should be downloaded?',
          options: options.slice(0, 10), // Limit to 10 options for UI
        });

        // Parse the selection - try to extract number from "1. filename"
        const match = result.userInput.match(/^(\d+)\./);
        if (match) {
          return parseInt(match[1], 10) - 1;
        }

        // Try direct number input
        const directNum = parseInt(result.userInput, 10);
        if (!isNaN(directNum) && directNum >= 1 && directNum <= assets.length) {
          return directNum - 1;
        }

        // Try matching by filename (partial match)
        const selectedIndex = assets.findIndex((a) =>
          a.name.toLowerCase().includes(result.userInput.toLowerCase())
        );
        return selectedIndex >= 0 ? selectedIndex : 0;
      };

      // Create progress callback to update tool status and log progress
      const onProgress = (progress: DownloadProgress) => {
        // Update tool status with progress for UI display
        ToolStatusService.updateDownloadProgress(toolId, {
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes,
          percentage: progress.percentage,
        });
      };

      const result = await downloadFile({
        downloadUrl,
        shouldExtract,
        getUserSelection,
        onProgress,
        signal: abortController.signal,
        onDownloadPathDetermined: (path) => {
          // Track the download path for cleanup on abort
          currentDownloadPath = path;
        },
        selectionHint,
      });

      // Open the file if requested
      let opened: boolean | undefined = undefined;
      if (openAfterDownload) {
        try {
          // Open the downloaded file (or extracted folder if extraction was performed)
          const pathToOpen = result.extractPath || result.downloadPath;
          await shell.openPath(pathToOpen);
          opened = true;
        } catch {
          opened = false;
        }
      }

      const extractMsg = result.extractPath ? ` and extracted to ${result.extractPath}` : '';
      const openedMsg = opened === true ? ' and opened' : '';

      // Unregister cleanup since download completed successfully
      ToolStatusService.unregisterCleanup(toolId);

      // Log scraped instructions for transparency
      if (result.metadata?.instructions) {
        logger.info(
          'Scraped instructions from',
          result.metadata.sourceUrl,
          '- Title:',
          result.metadata.title
        );
      }

      const output = {
        success: true,
        message: `Downloaded ${result.downloadPath}${extractMsg}${openedMsg} (${formatFileSize(result.fileSize)})`,
        timestamp: new Date(),
        isRevertible: true,
        downloadPath: result.downloadPath,
        extractPath: result.extractPath,
        extractedFiles: result.extractedFiles,
        resolvedUrl: result.resolvedUrl,
        hosterUsed: result.hosterUsed,
        fileSize: result.fileSize,
        opened,
        metadata: result.metadata,
      };

      // Update with result
      ToolStatusService.updateToolResult(toolId, output);

      return output;
    } catch (error) {
      // Unregister cleanup (error path also needs cleanup unregistration)
      ToolStatusService.unregisterCleanup(toolId);

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if this was an abort
      const wasAborted = abortController.signal.aborted || errorMessage.includes('aborted');

      // If aborted, try to clean up the partial file
      if (wasAborted && currentDownloadPath) {
        try {
          await fs.unlink(currentDownloadPath);
        } catch {
          // File might not exist
        }
      }

      // Update with error
      ToolStatusService.updateToolResult(toolId, undefined, errorMessage);

      return {
        success: false,
        message: wasAborted ? 'Download was aborted' : `Failed to download file: ${errorMessage}`,
        timestamp: new Date(),
        downloadPath: '',
        extractPath: undefined,
        extractedFiles: undefined,
        resolvedUrl: '',
        hosterUsed: '',
        fileSize: 0,
        opened: undefined,
        metadata: undefined,
      };
    }
  },
});
