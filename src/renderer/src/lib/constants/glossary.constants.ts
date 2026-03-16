/**
 * Glossary anchor mappings for PCGamingWiki links.
 * Maps anchor names to functions that resolve paths from game data.
 */

import type { PCGWConfigPath } from '@twiki/shared';

type PCGWConfigPathType = PCGWConfigPath['pathType'];

export type GlossaryPathResolver = (data: {
  installPath?: string;
  configPaths: PCGWConfigPath[];
}) => { path: string; pathType: PCGWConfigPathType } | null;

type GlossaryData = { installPath?: string; configPaths: PCGWConfigPath[] };

/**
 * Mapping of glossary anchor names to path resolvers.
 * Used for handling Glossary:Game_data links from PCGamingWiki.
 */
export const GLOSSARY_ANCHORS: Record<string, GlossaryPathResolver> = {
  Installation_folder: (data: GlossaryData) =>
    data.installPath ? { path: data.installPath, pathType: 'directory' } : null,

  Configuration_file: (data: GlossaryData) =>
    data.configPaths.length > 0
      ? { path: data.configPaths[0].path, pathType: data.configPaths[0].pathType }
      : null,

  'Configuration_file_(s)': (data: GlossaryData) =>
    data.configPaths.length > 0
      ? { path: data.configPaths[0].path, pathType: data.configPaths[0].pathType }
      : null,

  Save_game: (data: GlossaryData) =>
    data.configPaths.length > 0
      ? { path: data.configPaths[0].path, pathType: data.configPaths[0].pathType }
      : null,

  Save_game_data_location: (data: GlossaryData) =>
    data.configPaths.length > 0
      ? { path: data.configPaths[0].path, pathType: data.configPaths[0].pathType }
      : null,
};

/**
 * Resolve a glossary anchor to a path.
 * Returns null if no matching resolver or if resolver returns null.
 */
export function resolveGlossaryAnchor(
  anchor: string,
  data: GlossaryData
): { path: string; pathType: PCGWConfigPathType } | null {
  // Try exact match first
  if (GLOSSARY_ANCHORS[anchor]) {
    return GLOSSARY_ANCHORS[anchor](data);
  }

  // Try partial match (for anchors like "Configuration_file.28s.29")
  for (const [key, resolver] of Object.entries(GLOSSARY_ANCHORS)) {
    if (anchor.includes(key)) {
      return resolver(data);
    }
  }

  return null;
}
