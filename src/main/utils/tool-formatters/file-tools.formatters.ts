/**
 * Formatters for file-related tools (read, edit, create, move).
 */

import type {
  PathOperation,
  StringReplaceOperation,
  ContentOperation,
  MoveOperation,
} from '../../interfaces/tool-display.interface';
import type { FormatterEntry } from './types';
import { truncate, extractFileName, createEditable } from './formatter-utils';

// === Read File Tool ===
export const readFileTool: FormatterEntry = {
  config: { displayName: 'Read File', iconType: 'file-text' },
  formatSimple: (args) => {
    if (args.startLine !== undefined || args.endLine !== undefined) {
      return `Read lines ${args.startLine ?? 1}-${args.endLine ?? 'end'}: ${args.path}`;
    }
    return `Read file: ${args.path}`;
  },
  formatStructured: (args, ctx) => {
    const path = String(args.path || '');
    const detail =
      args.startLine !== undefined || args.endLine !== undefined
        ? `lines ${args.startLine ?? 1}-${args.endLine ?? 'end'}`
        : undefined;
    ctx.operations.push({
      type: 'path',
      path,
      fileName: extractFileName(path),
      detail,
    } as PathOperation);
  },
};

// === Read File Around Pattern Tool ===
export const readFileAroundPatternTool: FormatterEntry = {
  config: { displayName: 'Search in File', iconType: 'file-text' },
  formatSimple: (args) => {
    const searches = args.searches as Array<{ searchText: string }> | undefined;
    const patterns = searches?.map((s) => s.searchText).join(', ') || '';
    return `Search in file: ${args.path}\nPatterns: ${patterns}`;
  },
  formatStructured: (args, ctx) => {
    const path = String(args.path || '');
    const searches = args.searches as Array<{ searchText: string }> | undefined;
    const patterns = searches?.map((s) => s.searchText).join(', ') || '';
    ctx.operations.push({
      type: 'path',
      path,
      fileName: extractFileName(path),
      detail: patterns ? `patterns: ${patterns}` : undefined,
    } as PathOperation);
  },
};

// === List Directory Contents Tool ===
export const listDirectoryContentsTool: FormatterEntry = {
  config: { displayName: 'List Directory', iconType: 'folder' },
  formatSimple: (args) => {
    return `List directory: ${args.path}${args.fileNameSearch ? `\nFilter: ${args.fileNameSearch}` : ''}${args.depth ? `\nDepth: ${args.depth}` : ''}`;
  },
  formatStructured: (args, ctx) => {
    const path = String(args.path || '');
    const detail = args.fileNameSearch ? `filter: ${args.fileNameSearch}` : undefined;
    ctx.operations.push({
      type: 'path',
      path,
      fileName: extractFileName(path) || path,
      detail,
    } as PathOperation);
  },
};

// === Insert At Pattern Tool ===
export const insertAtPatternTool: FormatterEntry = {
  config: { displayName: 'Insert at Pattern', iconType: 'file-text' },
  formatSimple: (args) => {
    return `Insert ${args.position} pattern in: ${args.path}\nPattern: ${args.searchText}\nContent: ${truncate(String(args.contentToInsert), 50)}`;
  },
  formatStructured: (args, ctx) => {
    const path = String(args.path || '');
    ctx.operations.push({
      type: 'content',
      path,
      fileName: extractFileName(path),
      action: args.position === 'before' ? 'insert-before' : 'insert-after',
      pattern: truncate(String(args.searchText || ''), 30),
      contentPreview: truncate(String(args.contentToInsert || ''), 50),
    } as ContentOperation);
  },
};

// === Append To File Tool ===
export const appendToFileTool: FormatterEntry = {
  config: { displayName: 'Append to File', iconType: 'file-text' },
  formatSimple: (args) => {
    return `Append to file: ${args.path}\nContent: ${truncate(String(args.content), 80)}`;
  },
  formatStructured: (args, ctx) => {
    const path = String(args.path || '');
    ctx.operations.push({
      type: 'content',
      path,
      fileName: extractFileName(path),
      action: 'append',
      contentPreview: truncate(String(args.content || ''), 50),
    } as ContentOperation);
  },
};

// === Edit File Tool ===
export const editFileTool: FormatterEntry = {
  config: { displayName: 'Edit File', iconType: 'file-text' },
  formatSimple: (args) => {
    const operations = args.operations as Array<{ oldString: string; newString: string; replaceAll?: boolean }> | undefined;
    if (operations && operations.length > 0) {
      const changes = operations
        .slice(0, 3)
        .map((op) => `  "${truncate(op.oldString, 25)}" → "${truncate(op.newString, 25)}"${op.replaceAll ? ' (all)' : ''}`)
        .join('\n');
      const more = operations.length > 3 ? `\n  ...and ${operations.length - 3} more` : '';
      return `Edit file: ${args.path}\n${changes}${more}`;
    }
    return `Edit file: ${args.path}`;
  },
  formatStructured: (args, ctx) => {
    const path = String(args.path || '');
    const fileName = extractFileName(path);
    const ops = args.operations as
      | Array<{ oldString: string; newString: string; replaceAll?: boolean }>
      | undefined;
    if (ops && ops.length > 0) {
      for (const op of ops) {
        ctx.operations.push({
          type: 'string-replace',
          path,
          fileName,
          oldString: truncate(op.oldString, 50),
          newString: op.newString,
          replaceAll: op.replaceAll,
          editable: createEditable(op.newString, 'text'),
        } as StringReplaceOperation);
      }
    }
  },
};

// === Create File Tool ===
export const createFileTool: FormatterEntry = {
  config: { displayName: 'Create File', iconType: 'file' },
  formatSimple: (args) => {
    return `Create file: ${args.path}\nContent: ${truncate(String(args.content), 80)}`;
  },
  formatStructured: (args, ctx) => {
    const path = String(args.path || '');
    const content = String(args.content || '');
    ctx.operations.push({
      type: 'content',
      path,
      fileName: extractFileName(path),
      action: 'create',
      contentPreview: content,
      editable: createEditable(content, 'code'),
    } as ContentOperation);
  },
};

// === Move/Copy File Tool ===
export const moveCopyFileTool: FormatterEntry = {
  config: { displayName: 'Move / Copy / Rename', iconType: 'arrow-right-left' },
  formatSimple: (args) => {
    const operations = args.operations as Array<{ sourcePath: string; destinationPath: string; copyOnly?: boolean }> | undefined;
    if (operations && operations.length > 0) {
      const moves = operations
        .slice(0, 3)
        .map((op) => `  ${op.sourcePath} → ${op.destinationPath}${op.copyOnly ? ' (copy)' : ''}`)
        .join('\n');
      const more = operations.length > 3 ? `\n  ...and ${operations.length - 3} more` : '';
      return `Move/Copy files:\n${moves}${more}`;
    }
    return `Move/Copy files`;
  },
  formatStructured: (args, ctx) => {
    const ops = args.operations as Array<{ sourcePath: string; destinationPath: string; copyOnly?: boolean }> | undefined;
    if (ops && ops.length > 0) {
      for (const op of ops) {
        ctx.operations.push({
          type: 'move',
          sourcePath: op.sourcePath,
          sourceFileName: extractFileName(op.sourcePath),
          destPath: op.destinationPath,
          destFileName: extractFileName(op.destinationPath),
          isCopy: op.copyOnly,
        } as MoveOperation);
      }
    }
  },
};

/**
 * All file tool formatters.
 */
export const fileToolFormatters: Record<string, FormatterEntry> = {
  'read-file-tool': readFileTool,
  'read-file-around-pattern-tool': readFileAroundPatternTool,
  'list-directory-contents-tool': listDirectoryContentsTool,
  'insert-at-pattern-tool': insertAtPatternTool,
  'append-to-file-tool': appendToFileTool,
  'edit-file-tool': editFileTool,
  'create-file-tool': createFileTool,
  'move-copy-file-or-directory-tool': moveCopyFileTool,
};
