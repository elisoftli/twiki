/**
 * Edit file utility - makes precise edits using string matching
 */

import { createBackup, unescapeString, readFileNormalized, writeFileWithLineEnding } from '../../tool.utils';
import { expandWindowsEnvVars } from '../../../utils';
import { computeFileHash, FILE_NOT_EXISTS_HASH } from '../../../utils/file-hash.utils';
import type { EditFileParams, EditFileResult, EditOperation, FailedOperation } from './types';

export async function editFile(params: EditFileParams): Promise<EditFileResult> {
  const { path: filePath, operations, dryRun = false, expectedFileHash } = params;

  const expandedPath = expandWindowsEnvVars(filePath);

  // Compute hash BEFORE any modification
  const beforeHash = (await computeFileHash(expandedPath)) ?? FILE_NOT_EXISTS_HASH;

  // Validate file hasn't changed since read (if hash provided)
  if (expectedFileHash && expectedFileHash !== beforeHash) {
    throw new Error(
      `File has been modified since it was read. Expected hash: ${expectedFileHash}, current hash: ${beforeHash}. Re-read the file before editing.`
    );
  }

  // Create backup before modifying (unless dry run)
  const backupPath = dryRun ? undefined : await createBackup(expandedPath);

  // Read file content with normalized line endings (LF) for consistent processing
  const { content, lineEnding } = await readFileNormalized(expandedPath);
  let currentContent = content;

  const operationsApplied: EditOperation[] = [];
  const operationsFailed: FailedOperation[] = [];

  // Process each operation
  for (const op of operations) {
    const { oldString, newString, replaceAll = false, appendToEnd = false } = op;
    const unescapedNew = unescapeString(newString);

    // Handle append-to-end mode
    if (appendToEnd) {
      // Ensure there's a newline before appending (unless file is empty or already ends with newline)
      const needsNewline = currentContent.length > 0 && !currentContent.endsWith('\n');
      currentContent = currentContent + (needsNewline ? '\n' : '') + unescapedNew;
      operationsApplied.push(op);
      continue;
    }

    // Standard replace mode
    const unescapedOld = unescapeString(oldString);

    // Count occurrences
    const occurrences = currentContent.split(unescapedOld).length - 1;

    if (occurrences === 0) {
      operationsFailed.push({
        operation: op,
        error: `String not found: "${oldString.length > 50 ? oldString.substring(0, 50) + '...' : oldString}"`,
      });
      continue;
    }

    if (!replaceAll && occurrences > 1) {
      operationsFailed.push({
        operation: op,
        error: `String found ${occurrences} times - use replaceAll=true or provide more context to make it unique`,
      });
      continue;
    }

    // Apply replacement
    if (replaceAll) {
      currentContent = currentContent.split(unescapedOld).join(unescapedNew);
    } else {
      currentContent = currentContent.replace(unescapedOld, unescapedNew);
    }

    operationsApplied.push(op);
  }

  // Write modified content (unless dry run)
  let afterHash = beforeHash;

  if (!dryRun && operationsApplied.length > 0) {
    await writeFileWithLineEnding(expandedPath, currentContent, lineEnding);
    afterHash = (await computeFileHash(expandedPath))!; // File must exist after write
  }

  return {
    path: expandedPath,
    backupPath,
    operationsApplied,
    operationsFailed: operationsFailed.length > 0 ? operationsFailed : undefined,
    wasDryRun: dryRun,
    fileHashes: [
      {
        filePath: expandedPath,
        beforeHash,
        afterHash,
      },
    ],
  };
}
