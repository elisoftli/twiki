/**
 * Types for user interaction utilities
 */

/**
 * Parameters for getting user input
 */
export interface GetUserInputParams {
  /** Title for the input dialog */
  title: string;
  /** Message/question to display to the user */
  message: string;
  /** Array of options for the user to choose from (max 10) */
  options?: string[];
}

/**
 * Result from user input dialog
 */
export interface GetUserInputResult {
  /** The user's selected input */
  userInput: string;
  /** Timestamp when the input was received (ISO 8601 format) */
  timestamp: Date;
}

/**
 * Internal response structure for IPC communication
 */
export interface UserInputIpcResponse {
  requestId: string;
  userInput: string;
  cancelled: boolean;
}
