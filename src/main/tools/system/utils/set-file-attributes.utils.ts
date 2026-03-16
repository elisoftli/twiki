/**
 * Set file attributes utility - sets Windows file attributes
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { expandWindowsEnvVars } from '../../../utils';
import type { SetFileAttributesParams, SetFileAttributesResult } from './types';

const execAsync = promisify(exec);

/**
 * Get current file attributes by parsing attrib command output.
 * Output format: "A    R    H  S  C:\path\to\file.txt"
 * Returns an object with boolean flags for each attribute.
 */
async function getCurrentAttributes(
  filePath: string
): Promise<{ readOnly: boolean; hidden: boolean; system: boolean; archive: boolean }> {
  const { stdout } = await execAsync(`attrib "${filePath}"`);

  // attrib output has attributes in fixed positions before the path
  // Format: "A    R    H  S  C:\path\to\file.txt"
  // The attributes appear in the first ~20 characters
  const attributeSection = stdout.substring(0, 20);

  return {
    archive: attributeSection.includes('A'),
    readOnly: attributeSection.includes('R'),
    hidden: attributeSection.includes('H'),
    system: attributeSection.includes('S'),
  };
}

export async function setFileAttributes(params: SetFileAttributesParams): Promise<SetFileAttributesResult> {
  const { filePath, readOnly, hidden, system, archive } = params;

  const expandedPath = expandWindowsEnvVars(filePath);

  // Get current attributes to determine what actually needs to change
  const current = await getCurrentAttributes(expandedPath);

  const attributeChanges: string[] = [];
  const appliedAttributes: string[] = [];

  // Only apply changes for attributes that are actually different
  if (readOnly !== undefined && readOnly !== current.readOnly) {
    attributeChanges.push(readOnly ? '+R' : '-R');
    appliedAttributes.push(readOnly ? 'ReadOnly' : '-ReadOnly');
  }

  if (hidden !== undefined && hidden !== current.hidden) {
    attributeChanges.push(hidden ? '+H' : '-H');
    appliedAttributes.push(hidden ? 'Hidden' : '-Hidden');
  }

  if (system !== undefined && system !== current.system) {
    attributeChanges.push(system ? '+S' : '-S');
    appliedAttributes.push(system ? 'System' : '-System');
  }

  if (archive !== undefined && archive !== current.archive) {
    attributeChanges.push(archive ? '+A' : '-A');
    appliedAttributes.push(archive ? 'Archive' : '-Archive');
  }

  // If no actual changes needed, return early
  if (attributeChanges.length === 0) {
    return {
      path: expandedPath,
      attributes: [],
    };
  }

  // Build the attrib command
  const command = `attrib ${attributeChanges.join(' ')} "${expandedPath}"`;

  await execAsync(command);

  return {
    path: expandedPath,
    attributes: appliedAttributes,
  };
}
