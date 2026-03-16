/**
 * Read file around pattern utility - searches for multiple patterns and returns surrounding lines
 */

import { promises as fs } from 'fs';
import { normalizeLineEndings } from '../../tool.utils';
import { expandWindowsEnvVars } from '../../../utils';
import type { ReadFileAroundPatternParams, ReadFileAroundPatternResult, SingleSearchResult } from './types';

export async function readFileAroundPattern(params: ReadFileAroundPatternParams): Promise<ReadFileAroundPatternResult> {
  const { path: filePath, searches } = params;

  const expandedPath = expandWindowsEnvVars(filePath);
  const rawContent = await fs.readFile(expandedPath, 'utf-8');
  // Normalize line endings for consistent pattern matching and line counting
  const fullContent = normalizeLineEndings(rawContent);
  const allLines = fullContent.split('\n');

  const results: SingleSearchResult[] = [];

  for (const search of searches) {
    const { searchText, contextLines = 100, isRegex = false, caseInsensitive = false } = search;

    // Find all lines containing the search text (plain text or regex)
    const matchedLines: number[] = [];

    // Build regex with appropriate flags
    const regexFlags = caseInsensitive ? 'i' : '';
    const regex = isRegex ? new RegExp(searchText, regexFlags) : null;

    // For plain text search with case-insensitive, pre-compute lowercase search text
    const searchLower = !isRegex && caseInsensitive ? searchText.toLowerCase() : searchText;

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      let matches: boolean;

      if (isRegex) {
        matches = regex!.test(line);
      } else if (caseInsensitive) {
        matches = line.toLowerCase().includes(searchLower);
      } else {
        matches = line.includes(searchText);
      }

      if (matches) {
        matchedLines.push(i + 1); // 1-indexed
      }
    }

    if (matchedLines.length === 0) {
      // Pattern not found - add a "not found" result
      results.push({
        searchText,
        found: false,
        content: '',
        matchedLine: 0,
        startLine: 0,
        endLine: 0,
        totalMatches: 0,
        allMatchedLines: [],
      });
      continue;
    }

    // Get context around the first match
    const firstMatch = matchedLines[0];
    const startLine = Math.max(1, firstMatch - contextLines);
    const endLine = Math.min(allLines.length, firstMatch + contextLines);

    const selectedLines = allLines.slice(startLine - 1, endLine);
    const content = selectedLines.join('\n');

    results.push({
      searchText,
      found: true,
      content,
      matchedLine: firstMatch,
      startLine,
      endLine,
      totalMatches: matchedLines.length,
      allMatchedLines: matchedLines,
    });
  }

  return {
    path: expandedPath,
    results,
  };
}
