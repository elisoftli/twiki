/**
 * Type definitions for System utility functions
 */

export interface SetProcessAffinityParams {
  processName: string;
  affinityMask?: number;
  waitForProcess?: boolean;
  maxWaitSeconds?: number;
}

export interface SetProcessAffinityResult {
  numCPUs: number;
  affinityMask: number;
}

export interface SetFileAttributesParams {
  filePath: string;
  readOnly?: boolean;
  hidden?: boolean;
  system?: boolean;
  archive?: boolean;
}

export interface SetFileAttributesResult {
  path: string;
  attributes: string[];
}

// Registry read/edit types
export type RegistryValueType = 'REG_SZ' | 'REG_DWORD' | 'REG_BINARY' | 'REG_EXPAND_SZ' | 'REG_MULTI_SZ';

export type RegistryOperationType = 'read' | 'set' | 'delete';

export interface RegistryOperation {
  operationType: RegistryOperationType;
  keyPath: string; // e.g., "HKEY_LOCAL_MACHINE\\SOFTWARE\\..."
  valueName: string; // e.g., "(Default)" or specific value name
  valueType?: RegistryValueType; // Only needed for 'set'
  data?: string | number; // Only needed for 'set'
}

export interface ReadEditRegistryParams {
  operations: RegistryOperation[];
}

export interface SingleRegistryResult {
  keyPath: string;
  valueName: string;
  operationType: RegistryOperationType;
  valueType?: string;
  success: boolean;
  error?: string;
  // For 'read': the current value; for 'set'/'delete': the previous value
  value?: string | number | null; // null = doesn't exist
  previousValue?: string | number | null; // For set/delete: what was there before (for revert)
  previousType?: string; // Type of previous value (for revert)
}

export interface ReadEditRegistryResult {
  results: SingleRegistryResult[];
  successfulOperations: number;
  failedOperations: number;
}
