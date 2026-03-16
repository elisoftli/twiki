/**
 * Shared types for client-side tools
 */

export interface BaseToolOutput {
  success: boolean;
  message: string;
  timestamp: Date;
  path?: string;
}

// Type definitions for structured file modifications
export interface ModifyOperation {
  operationType: 'insertAfterLine' | 'replaceLine' | 'deleteLine';
  lineNumber: number;
  content?: string; // Required for insertAfterLine/replaceLine, not needed for deleteLine
}
