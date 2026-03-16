/**
 * Create file utility - creates a new file with content
 */

import { promises as fs } from 'fs';
import path from 'path';
import { restoreLineEndings, WINDOWS_LINE_ENDING } from '../../tool.utils';
import { expandWindowsEnvVars } from '../../../utils';
import type { CreateFileParams, CreateFileResult } from './types';

export async function createFile(params: CreateFileParams): Promise<CreateFileResult> {
  const { path: filePath, content } = params;

  const expandedPath = expandWindowsEnvVars(filePath);

  // Check if file already exists
  try {
    await fs.access(expandedPath);
    // File exists, return failure
    return {
      path: expandedPath,
      bytesWritten: 0,
      alreadyExists: true,
    };
  } catch {
    // File doesn't exist, continue with creation
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(expandedPath);
  await fs.mkdir(parentDir, { recursive: true });

  // Convert line endings to Windows CRLF for new files
  const windowsContent = restoreLineEndings(content, WINDOWS_LINE_ENDING);

  await fs.writeFile(expandedPath, windowsContent, 'utf-8');
  const bytesWritten = Buffer.byteLength(windowsContent, 'utf-8');

  return {
    path: expandedPath,
    bytesWritten,
  };
}
