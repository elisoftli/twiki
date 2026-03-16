import { createLogger } from './logger.utils';

const logger = createLogger('RetryUtils');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Retries an async operation with exponential backoff
 * @param operation The async operation to retry
 * @param context Description of the operation for error messages
 * @returns The result of the operation
 */
export async function withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn(`${context} - attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`);

      // Don't retry on non-retryable errors (4xx except 429)
      // Match patterns like "failed: 404", "failed: 403", etc.
      const statusMatch = lastError.message.match(/failed:\s*(\d{3})/);
      if (statusMatch) {
        const status = parseInt(statusMatch[1], 10);
        // Only retry on 5xx errors or 429 (rate limit)
        if (status >= 400 && status < 500 && status !== 429) {
          throw lastError;
        }
      }

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        logger.info(`${context} - waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`${context} after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}
