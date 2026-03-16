/**
 * Read file utility - reads file contents with optional line range
 */

import { promises as fs } from 'fs';
import { normalizeLineEndings } from '../../tool.utils';
import { expandWindowsEnvVars } from '../../../utils';
import type { ReadFileParams, ReadFileResult } from './types';

const MAX_LINES = 200;

export async function readFile(params: ReadFileParams): Promise<ReadFileResult> {
  const { path: filePath, startLine, endLine } = params;

  const expandedPath = expandWindowsEnvVars(filePath);
  const rawContent = await fs.readFile(expandedPath, 'utf-8');
  // Normalize line endings for consistent line counting and display
  const fullContent = normalizeLineEndings(rawContent);
  const allLines = fullContent.split('\n');
  const totalLines = allLines.length;

  // If range is specified, return only that range (no size limit)
  if (startLine !== undefined || endLine !== undefined) {
    const start = Math.max(1, Math.min(startLine ?? 1, totalLines));
    const end = Math.max(start, Math.min(endLine ?? totalLines, totalLines));

    const selectedLines = allLines.slice(start - 1, end);
    const content = selectedLines.join('\n');

    return {
      path: expandedPath,
      content,
      lineCount: selectedLines.length,
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
      startLine: start,
      endLine: end,
      totalLines,
    };
  }

  // No range specified - read entire file with size limit
  if (allLines.length > MAX_LINES) {
    throw new Error(
      `File is too large (${allLines.length} lines, max ${MAX_LINES}). ` +
        `Use startLine/endLine parameters to read a specific range, or ` +
        `'readFileAroundPatternTool' to search for specific patterns.`
    );
  }

  return {
    path: expandedPath,
    content: fullContent,
    lineCount: allLines.length,
    sizeBytes: Buffer.byteLength(fullContent, 'utf-8'),
  };
}
