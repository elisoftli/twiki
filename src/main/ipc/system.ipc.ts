/**
 * System IPC Handlers
 *
 * Handles IPC operations for system-level functionality:
 * - System specs
 * - File read/write operations
 * - Logs
 */

import { shell, clipboard } from 'electron';
import { promises as fs } from 'fs';
import { expandWindowsEnvVars } from '../utils';
import { createLogger, getLogFilePath, type Logger } from '../utils/logger.utils';
import { SystemSpecsService } from '../services/system/system-specs.service';
import { createIpcHandlers, createIpcListeners } from './ipc-handler.factory';

/** Check if a path exists (async) */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Setup system specs IPC handlers.
 */
export function setupSystemSpecsIpc(): void {
  createIpcHandlers([
    { channel: 'system-specs:get-status', handler: () => SystemSpecsService.status },
    { channel: 'system-specs:get-specs', handler: () => SystemSpecsService.specs },
  ]);
}

/**
 * Setup file operation IPC handlers.
 */
export function setupFileIpc(): void {
  createIpcHandlers([
    {
      channel: 'file:read-text',
      handler: async (
        _,
        filePath: string
      ): Promise<{ success: boolean; content: string | null; error: string | null }> => {
        try {
          const expandedPath = expandWindowsEnvVars(filePath);
          if (!(await pathExists(expandedPath))) {
            return { success: false, content: null, error: 'File not found' };
          }
          const content = await fs.readFile(expandedPath, 'utf-8');
          return { success: true, content, error: null };
        } catch (error) {
          return {
            success: false,
            content: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },
    {
      channel: 'file:write-text',
      handler: async (
        _,
        { filePath, content }: { filePath: string; content: string }
      ): Promise<{ success: boolean; error: string | null }> => {
        try {
          const expandedPath = expandWindowsEnvVars(filePath);
          await fs.writeFile(expandedPath, content, 'utf-8');
          return { success: true, error: null };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },
  ]);
}

/**
 * Setup logs IPC handlers.
 */
export function setupLogsIpc(): void {
  createIpcHandlers([
    { channel: 'logs:get-path', handler: (): string => getLogFilePath() },
    {
      channel: 'logs:open-in-editor',
      handler: async (): Promise<{ success: boolean; error: string | null }> => {
        try {
          const logPath = getLogFilePath();
          await shell.openPath(logPath);
          return { success: true, error: null };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    },
    {
      channel: 'logs:copy-path',
      handler: (): void => {
        const logPath = getLogFilePath();
        clipboard.writeText(logPath);
      },
    },
  ]);
}

const VALID_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const rendererLoggers = new Map<string, Logger>();

function getRendererLogger(serviceName: string): Logger {
  let logger = rendererLoggers.get(serviceName);
  if (!logger) {
    logger = createLogger(`Renderer:${serviceName}`);
    rendererLoggers.set(serviceName, logger);
  }
  return logger;
}

/**
 * Setup renderer log forwarding IPC listener.
 * Receives log messages from the renderer process and routes them through electron-log.
 * Only used in production — in dev mode the renderer logs to the browser console only.
 */
export function setupRendererLogsIpc(): void {
  createIpcListeners([
    {
      channel: 'logs:renderer',
      handler: (_, data: { level: string; serviceName: string; args: unknown[] }) => {
        const { level, serviceName, args } = data;
        const logger = getRendererLogger(serviceName || 'Renderer');
        const method = VALID_LOG_LEVELS.has(level) ? (level as keyof Logger) : 'info';
        logger[method](...args);
      },
    },
  ]);
}
