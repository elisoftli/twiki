/**
 * Formatters for system-related tools (registry, compatibility, archives).
 */

import type {
  PathOperation,
  MoveOperation,
  SystemOperation,
  RegistryOperation,
} from '../../interfaces/tool-display.interface';
import type { FormatterEntry } from './types';
import { extractFileName, extractKeyName } from './formatter-utils';

// === Extract Archive Tool ===
export const extractArchiveTool: FormatterEntry = {
  config: { displayName: 'Extract Archive', iconType: 'folder-input' },
  formatSimple: (args) => {
    return `Extract archive: ${args.archivePath}${args.extractPath ? `\nTo: ${args.extractPath}` : ''}`;
  },
  formatStructured: (args, ctx) => {
    const archivePath = String(args.archivePath || '');
    const extractPath = args.extractPath ? String(args.extractPath) : undefined;
    ctx.operations.push({
      type: 'path',
      path: archivePath,
      fileName: extractFileName(archivePath),
      detail: extractPath ? `to: ${extractFileName(extractPath)}` : undefined,
    } as PathOperation);
  },
};

// === Create Archive Tool ===
export const createArchiveTool: FormatterEntry = {
  config: { displayName: 'Create Archive', iconType: 'folder-output' },
  formatSimple: (args) => {
    return `Create archive: ${args.archivePath}\nFrom: ${args.sourcePath}`;
  },
  formatStructured: (args, ctx) => {
    const sourcePath = String(args.sourcePath || '');
    const archivePath = String(args.archivePath || '');
    ctx.operations.push({
      type: 'move',
      sourcePath,
      sourceFileName: extractFileName(sourcePath),
      destPath: archivePath,
      destFileName: extractFileName(archivePath),
    } as MoveOperation);
  },
};

// === Set Process Affinity Tool ===
export const setProcessAffinityTool: FormatterEntry = {
  config: { displayName: 'Set CPU Affinity', iconType: 'settings' },
  formatSimple: (args) => {
    return `Set CPU affinity for: ${args.processName}\nCores: ${args.affinityMask}`;
  },
  formatStructured: (args, ctx) => {
    const processName = String(args.processName || '');
    ctx.operations.push({
      type: 'system',
      target: processName,
      targetName: processName,
      setting: `cores: ${args.affinityMask || 'all'}`,
    } as SystemOperation);
  },
};

// === Set Compatibility Flags Tool ===
export const setCompatibilityFlagsTool: FormatterEntry = {
  config: { displayName: 'Set Compatibility', iconType: 'settings' },
  formatSimple: (args) => {
    const flags: string[] = [];
    if (args.disableFullscreenOptimizations) flags.push('Disable Fullscreen Optimizations');
    if (args.runAsAdmin) flags.push('Run as Admin');
    if (args.highDpiAware) flags.push('High DPI Aware');
    if (args.compatibilityMode) flags.push(`Compatibility: ${args.compatibilityMode}`);
    return `Set compatibility flags for: ${args.executablePath}\nFlags: ${flags.length > 0 ? flags.join(', ') : 'none'}`;
  },
  formatStructured: (args, ctx) => {
    const execPath = String(args.executablePath || '');
    const flags = args.flags as string[] | undefined;
    ctx.operations.push({
      type: 'system',
      target: execPath,
      targetName: extractFileName(execPath),
      setting: flags?.join(', ') || 'none',
    } as SystemOperation);
  },
};

// === Set File Attributes Tool ===
export const setFileAttributesTool: FormatterEntry = {
  config: { displayName: 'Set File Attributes', iconType: 'settings' },
  formatSimple: (args) => {
    return `Set file attributes: ${args.path}\nRead-only: ${args.readOnly ? 'Yes' : 'No'}`;
  },
  formatStructured: (args, ctx) => {
    const path = String(args.path || '');
    const attrs: string[] = [];
    if (args.readOnly) attrs.push('read-only');
    if (args.hidden) attrs.push('hidden');
    if (args.system) attrs.push('system');
    ctx.operations.push({
      type: 'system',
      target: path,
      targetName: extractFileName(path),
      setting: attrs.length > 0 ? attrs.join(', ') : 'none',
    } as SystemOperation);
  },
};

// === Registry Tool ===
export const registryTool: FormatterEntry = {
  config: { displayName: 'Registry', iconType: 'database' },
  formatSimple: (args) => {
    const action = args.action as string;
    const keyPath = `${args.rootKey}\\${args.subKey}`;
    if (action === 'read') {
      return `Read registry: ${keyPath}\nValue: ${args.valueName}`;
    } else if (action === 'set') {
      return `Set registry: ${keyPath}\n${args.valueName} = ${args.value}`;
    } else if (action === 'delete') {
      return `Delete registry value: ${keyPath}\nValue: ${args.valueName}`;
    }
    return `Registry operation: ${keyPath}`;
  },
  formatStructured: (args, ctx) => {
    const ops = args.operations as
      | Array<{
          operationType: 'read' | 'set' | 'delete';
          keyPath: string;
          valueName: string;
          data?: string | number;
        }>
      | undefined;
    if (ops && ops.length > 0) {
      for (const op of ops) {
        ctx.operations.push({
          type: 'registry',
          action: op.operationType,
          keyPath: op.keyPath,
          keyName: extractKeyName(op.keyPath),
          valueName: op.valueName,
          value: op.data,
        } as RegistryOperation);
      }
    }
  },
};

/**
 * All system tool formatters.
 */
export const systemToolFormatters: Record<string, FormatterEntry> = {
  'extract-archive-tool': extractArchiveTool,
  'create-archive-tool': createArchiveTool,
  'set-process-affinity-tool': setProcessAffinityTool,
  'set-compatibility-flags-tool': setCompatibilityFlagsTool,
  'set-file-attributes-tool': setFileAttributesTool,
  'read-edit-registry-tool': registryTool,
};
