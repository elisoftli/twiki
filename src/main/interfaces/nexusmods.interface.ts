/**
 * NexusMods API types for mod browsing and downloads.
 */

/** NexusMods game (from games GraphQL query) */
export interface NexusModsGame {
  id: number;
  name: string;
  domainName: string;
  modCount: number;
}

/** NexusMods mod (from mods GraphQL query) */
export interface NexusModsMod {
  uid: string;
  modId: number;
  gameId: number;
  name: string;
  summary: string;
  description: string;
  version: string;
  author: string;
  status: string;
  downloads: number;
  endorsements: number;
  pictureUrl: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
  adultContent: boolean;
  modCategory: { name: string } | null;
  modRequirements: {
    nexusRequirements: {
      nodes: NexusModsRequirement[];
      totalCount: number;
    };
  } | null;
}

/** NexusMods mod file */
export interface NexusModsModFile {
  fileId: number;
  modId: number;
  name: string;
  version: string;
  description: string | null;
  category:
    | 'MAIN'
    | 'UPDATE'
    | 'OPTIONAL'
    | 'OLD_VERSION'
    | 'MISCELLANEOUS'
    | 'REMOVED'
    | 'ARCHIVED';
  categoryId: number;
  size: number; // KB
  sizeInBytes: number | null;
  date: number; // Unix timestamp
  uri: string; // Archive filename (NOT download URL)
  primary: number; // 1 = primary file
  scannedV2: string; // Virus scan status
  changelogText: string[];
}

/** NexusMods mod requirement/dependency */
export interface NexusModsRequirement {
  modId: string;
  modName: string;
  gameId: string;
  notes: string | null;
  url: string;
  externalRequirement: boolean;
}

/** Download URL from REST v1 API */
export interface NexusModsDownloadUrl {
  URI: string;
  name: string;
  short_name: string;
}

/** Paginated search result from GraphQL mods query */
export interface NexusModsSearchResult {
  nodes: NexusModsMod[];
  totalCount: number;
}

/** Sort options for mod search */
export type NexusModsSortField =
  | 'relevance'
  | 'downloads'
  | 'endorsements'
  | 'updatedAt'
  | 'name';
export type NexusModsSortDirection = 'ASC' | 'DESC';

export interface NexusModsSort {
  field: NexusModsSortField;
  direction: NexusModsSortDirection;
}
