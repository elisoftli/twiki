/**
 * Tool Formatter Registry
 *
 * Central registry for all tool formatters. Each formatter provides both
 * simple text formatting and structured display info generation.
 */

import type { ToolDisplayInfo, ToolOperation, PathOperation } from '../../interfaces/tool-display.interface';
import type { FormatterRegistry, ToolConfig } from './types';
import { fileToolFormatters } from './file-tools.formatters';
import { systemToolFormatters } from './system-tools.formatters';
import { miscToolFormatters } from './misc-tools.formatters';
import { truncate, extractFileName } from './formatter-utils';

// Re-export types
export type { FormatterEntry, FormatterRegistry, ToolConfig } from './types';

/**
 * Combined registry of all tool formatters.
 */
export const FORMATTER_REGISTRY: FormatterRegistry = {
  ...fileToolFormatters,
  ...systemToolFormatters,
  ...miscToolFormatters,
};

/**
 * Format a tool call into a user-friendly text description.
 * @param toolName - The name of the tool being called
 * @param args - The arguments passed to the tool
 * @returns A formatted, human-readable description
 */
export function formatToolCall(toolName: string, args: Record<string, unknown>): string {
  const entry = FORMATTER_REGISTRY[toolName];

  if (entry) {
    return entry.formatSimple(args);
  }

  return formatDefaultSimple(toolName, args);
}

/**
 * Format a tool call into structured display info for rich UI rendering.
 * @param toolName - The name of the tool being called
 * @param args - The arguments passed to the tool
 * @returns Structured display info with operations
 */
export function formatToolCallStructured(
  toolName: string,
  args: Record<string, unknown>
): ToolDisplayInfo {
  const entry = FORMATTER_REGISTRY[toolName];
  const operations: ToolOperation[] = [];

  let config: ToolConfig;

  if (entry) {
    config = entry.config;
    entry.formatStructured(args, { operations });
  } else {
    config = {
      displayName: toolName.replace(/-tool$/, '').replace(/-/g, ' '),
      iconType: 'file',
    };
    // For unknown tools, create a generic path operation if path exists
    if (args.path) {
      const path = String(args.path);
      operations.push({
        type: 'path',
        path,
        fileName: extractFileName(path),
      } as PathOperation);
    }
  }

  return {
    displayName: config.displayName,
    iconType: config.iconType,
    summary: buildSummary(config.displayName, operations),
    operations,
  };
}

/**
 * Default formatting for unknown tools - shows tool name and key arguments.
 */
function formatDefaultSimple(toolName: string, args: Record<string, unknown>): string {
  const readableName = toolName
    .replace(/Tool$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/-/g, ' ')
    .trim();

  const argEntries = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .slice(0, 4);

  if (argEntries.length === 0) {
    return readableName;
  }

  const argLines = argEntries.map(([key, value]) => {
    const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `${key}: ${truncate(displayValue, 60)}`;
  });

  return `${readableName}\n${argLines.join('\n')}`;
}

/**
 * Build a compact summary string from operations.
 */
function buildSummary(displayName: string, operations: ToolOperation[]): string {
  if (operations.length === 0) return displayName;

  const firstOp = operations[0];

  if (operations.length === 1) {
    switch (firstOp.type) {
      case 'path':
        return firstOp.detail ? `${firstOp.fileName} (${firstOp.detail})` : firstOp.fileName;
      case 'move':
        return `${firstOp.sourceFileName} → ${firstOp.destFileName}`;
      case 'string-replace':
        return `${truncate(firstOp.oldString, 20)} → ${truncate(firstOp.newString, 20)}`;
      case 'registry':
        return `${firstOp.action} ${firstOp.keyName}\\${firstOp.valueName}`;
      case 'content':
        return firstOp.fileName;
      case 'system':
        return firstOp.targetName;
      case 'user-input':
        return truncate(firstOp.message, 40);
      case 'launch-options': {
        const launcherDisplay = firstOp.launcher.charAt(0).toUpperCase() + firstOp.launcher.slice(1);
        return `${launcherDisplay}: ${firstOp.options || '(clear)'}`;
      }
      case 'download': {
        const flags = [firstOp.shouldExtract && 'extract', firstOp.openAfterDownload && 'open'].filter(Boolean);
        const flagsStr = flags.length > 0 ? ` (${flags.join(', ')})` : '';
        return `${firstOp.displayUrl}${flagsStr}`;
      }
      default:
        return displayName;
    }
  }

  // For multiple string-replace operations, show count of edits
  if (firstOp.type === 'string-replace') {
    return `${operations.length} edits`;
  }

  return `${operations.length} operations`;
}
