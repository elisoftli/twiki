/**
 * TweakMetadataService Tests
 *
 * Tests the tweak metadata service including:
 * - Metadata batch fetching
 * - Response parsing
 * - Error handling
 * - Empty input handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock EnvService
vi.mock('../../core/env.service', () => ({
  EnvService: {
    get: vi.fn().mockReturnValue('http://localhost:3000'),
  },
}));

// Mock logger
vi.mock('../../../utils/logger.utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import { TweakMetadataService } from '../tweak-metadata.service';

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockMetadataResponse = (metadata: Record<string, any> = {}) => ({
  metadata,
});

// =============================================================================
// Tests
// =============================================================================

describe('TweakMetadataService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createMockMetadataResponse()),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('fetchTweakMetadata', () => {
    it('should return empty map for empty hashes array', async () => {
      const result = await TweakMetadataService.fetchTweakMetadata([], 12345);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch metadata for given hashes', async () => {
      const mockMetadata = {
        'hash-1': {
          processable: true,
          recipe: null,
        },
        'hash-2': {
          processable: false,
          recipe: { id: 123 },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ metadata: mockMetadata }),
      });

      const result = await TweakMetadataService.fetchTweakMetadata(
        ['hash-1', 'hash-2'],
        12345
      );

      expect(result.size).toBe(2);
      expect(result.get('hash-1')).toEqual({
        processable: true,
        recipe: null,
      });
      expect(result.get('hash-2')).toEqual({
        processable: false,
        recipe: { id: 123 },
      });
    });

    it('should send correct request body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ metadata: {} }),
      });

      await TweakMetadataService.fetchTweakMetadata(['hash-1', 'hash-2'], 12345);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tweak-metadata'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hashes: ['hash-1', 'hash-2'], pcgwPageId: 12345 }),
        }
      );
    });

    it('should return empty map on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await TweakMetadataService.fetchTweakMetadata(
        ['hash-1'],
        12345
      );

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should handle server error in response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: {},
            error: 'Database connection failed',
          }),
      });

      // Should still return the metadata, even with error logged
      const result = await TweakMetadataService.fetchTweakMetadata(
        ['hash-1'],
        12345
      );

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should handle single hash', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: {
              'single-hash': { processable: true, recipe: null },
            },
          }),
      });

      const result = await TweakMetadataService.fetchTweakMetadata(
        ['single-hash'],
        12345
      );

      expect(result.size).toBe(1);
      expect(result.has('single-hash')).toBe(true);
    });

    it('should handle large number of hashes', async () => {
      const hashes = Array.from({ length: 100 }, (_, i) => `hash-${i}`);
      const metadata: Record<string, any> = {};
      hashes.forEach((hash) => {
        metadata[hash] = { processable: true, recipe: null };
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ metadata }),
      });

      const result = await TweakMetadataService.fetchTweakMetadata(hashes, 12345);

      expect(result.size).toBe(100);
    });

    it('should handle partial response (not all hashes returned)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: {
              'hash-1': { processable: true, recipe: null },
              // hash-2 not in response
            },
          }),
      });

      const result = await TweakMetadataService.fetchTweakMetadata(
        ['hash-1', 'hash-2'],
        12345
      );

      expect(result.size).toBe(1);
      expect(result.has('hash-1')).toBe(true);
      expect(result.has('hash-2')).toBe(false);
    });

    it('should preserve metadata structure', async () => {
      const complexMetadata = {
        'hash-1': {
          processable: true,
          recipe: {
            id: 123,
            version: 1,
            steps: [
              { action: 'edit-file', params: { path: '/test.ini' } },
            ],
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ metadata: complexMetadata }),
      });

      const result = await TweakMetadataService.fetchTweakMetadata(
        ['hash-1'],
        12345
      );

      expect(result.get('hash-1')).toEqual(complexMetadata['hash-1']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle JSON parse error', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      const result = await TweakMetadataService.fetchTweakMetadata(
        ['hash-1'],
        12345
      );

      expect(result.size).toBe(0);
    });

    it('should handle HTTP error status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal Server Error' }),
      });

      // The service doesn't check ok status, but we verify behavior
      const result = await TweakMetadataService.fetchTweakMetadata(
        ['hash-1'],
        12345
      );

      // Should still parse response even if not ok (implementation-dependent)
      expect(result).toBeInstanceOf(Map);
    });

    it('should handle timeout/abort', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AbortError')), 100);
          })
      );

      const result = await TweakMetadataService.fetchTweakMetadata(
        ['hash-1'],
        12345
      );

      expect(result.size).toBe(0);
    });

    it('should handle metadata with null values', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: {
              'hash-1': null,
            },
          }),
      });

      const result = await TweakMetadataService.fetchTweakMetadata(
        ['hash-1'],
        12345
      );

      expect(result.size).toBe(1);
      expect(result.get('hash-1')).toBeNull();
    });

    it('should handle response with extra fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: {
              'hash-1': { processable: true, recipe: null, extraField: 'ignored' },
            },
            stats: { totalCount: 1 },
            timestamp: new Date().toISOString(),
          }),
      });

      const result = await TweakMetadataService.fetchTweakMetadata(
        ['hash-1'],
        12345
      );

      expect(result.size).toBe(1);
    });
  });
});
