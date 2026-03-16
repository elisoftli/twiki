/**
 * Retry Utils Tests
 *
 * Tests for exponential backoff retry logic:
 * - Successful operations on first attempt
 * - Retries with exponential backoff
 * - Error classification and non-retryable errors
 * - HTTP status code handling (4xx vs 5xx)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import { withRetry } from '../retry.utils';

// =============================================================================
// Tests
// =============================================================================

describe('Retry Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('withRetry', () => {
    it('should return result on successful first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const resultPromise = withRetry(operation, 'Test operation');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed on second attempt', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');

      const resultPromise = withRetry(operation, 'Test operation');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry up to 3 times before failing', async () => {
      const error = new Error('Persistent failure');
      const operation = vi.fn().mockRejectedValue(error);

      const resultPromise = withRetry(operation, 'Test operation');
      resultPromise.catch(() => {});
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow('Test operation after 3 attempts: Persistent failure');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff delays', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const resultPromise = withRetry(operation, 'Test operation');

      // First attempt fails immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(operation).toHaveBeenCalledTimes(1);

      // Wait for first retry delay (1000ms * 1 = 1000ms)
      await vi.advanceTimersByTimeAsync(1000);
      expect(operation).toHaveBeenCalledTimes(2);

      // Wait for second retry delay (1000ms * 2 = 2000ms)
      await vi.advanceTimersByTimeAsync(2000);
      expect(operation).toHaveBeenCalledTimes(3);

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      expect(result).toBe('success');
    });

    it('should not retry on 400 status errors', async () => {
      const error = new Error('Request failed: 400');
      const operation = vi.fn().mockRejectedValue(error);

      const resultPromise = withRetry(operation, 'API call');
      // Attach catch handler immediately to prevent unhandled rejection warning
      resultPromise.catch(() => {});
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow('Request failed: 400');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 403 status errors', async () => {
      const error = new Error('Request failed: 403');
      const operation = vi.fn().mockRejectedValue(error);

      const resultPromise = withRetry(operation, 'API call');
      resultPromise.catch(() => {});
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow('Request failed: 403');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 404 status errors', async () => {
      const error = new Error('Request failed: 404');
      const operation = vi.fn().mockRejectedValue(error);

      const resultPromise = withRetry(operation, 'API call');
      resultPromise.catch(() => {});
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow('Request failed: 404');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 rate limit errors', async () => {
      const error = new Error('Request failed: 429');
      const operation = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const resultPromise = withRetry(operation, 'API call');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should retry on 500 status errors', async () => {
      const error = new Error('Request failed: 500');
      const operation = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const resultPromise = withRetry(operation, 'API call');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on 502 status errors', async () => {
      const error = new Error('Request failed: 502');
      const operation = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const resultPromise = withRetry(operation, 'API call');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on 503 status errors', async () => {
      const error = new Error('Request failed: 503');
      const operation = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const resultPromise = withRetry(operation, 'API call');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should handle non-Error exceptions', async () => {
      const operation = vi.fn().mockRejectedValue('string error');

      const resultPromise = withRetry(operation, 'Test operation');
      resultPromise.catch(() => {});
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow('Test operation after 3 attempts: string error');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should handle null/undefined rejections', async () => {
      const operation = vi.fn().mockRejectedValue(null);

      const resultPromise = withRetry(operation, 'Test operation');
      resultPromise.catch(() => {});
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow('Test operation after 3 attempts: null');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should retry on network errors', async () => {
      const error = new Error('ECONNREFUSED');
      const operation = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const resultPromise = withRetry(operation, 'Network operation');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should succeed on third attempt', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('finally!');

      const resultPromise = withRetry(operation, 'Test operation');
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('finally!');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should include context in final error message', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Some error'));

      const resultPromise = withRetry(operation, 'Fetching user data');
      resultPromise.catch(() => {});
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow('Fetching user data after 3 attempts: Some error');
    });
  });
});
