import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModDBResolver } from '../moddb-resolver.utils';

// Check if running in Electron environment
const isElectron = process.versions.electron !== undefined;

describe('ModDBResolver', () => {
  const resolver = new ModDBResolver();

  describe('canHandle', () => {
    it('should handle mod download page URLs', () => {
      expect(
        resolver.canHandle(
          'https://www.moddb.com/mods/a-gui-mod-for-bioshock-remastered/downloads/a-gui-mod-version-15'
        )
      ).toBe(true);
    });

    it('should handle game download page URLs', () => {
      expect(
        resolver.canHandle('https://www.moddb.com/games/some-game/downloads/some-file')
      ).toBe(true);
    });

    it('should handle addon download page URLs', () => {
      expect(
        resolver.canHandle('https://www.moddb.com/addons/some-addon/downloads/some-file')
      ).toBe(true);
    });

    it('should handle direct download URLs with numeric ID', () => {
      expect(resolver.canHandle('https://www.moddb.com/downloads/290164')).toBe(true);
    });

    it('should handle mirror URLs as passthrough', () => {
      expect(
        resolver.canHandle(
          'https://www.moddb.com/downloads/mirror/290164/131/f95e07789a2919aa7a91c2ac9a569595'
        )
      ).toBe(true);
    });

    it('should not handle non-ModDB URLs', () => {
      expect(resolver.canHandle('https://github.com/user/repo/releases')).toBe(false);
    });

    it('should not handle ModDB URLs that are not downloads', () => {
      expect(
        resolver.canHandle('https://www.moddb.com/mods/a-gui-mod-for-bioshock-remastered')
      ).toBe(false);
    });

    it('should handle URLs without www prefix', () => {
      expect(
        resolver.canHandle('https://moddb.com/mods/some-mod/downloads/some-file')
      ).toBe(true);
    });

    it('should handle URLs with trailing slash', () => {
      expect(
        resolver.canHandle('https://www.moddb.com/mods/some-mod/downloads/some-file/')
      ).toBe(true);
    });
  });

  describe('resolve - mirror passthrough', () => {
    it('should passthrough mirror URLs directly', async () => {
      const mirrorUrl =
        'https://www.moddb.com/downloads/mirror/290164/131/f95e07789a2919aa7a91c2ac9a569595';
      const result = await resolver.resolve(mirrorUrl);

      // Should return the same URL
      expect(result.downloadUrl).toBe(mirrorUrl);

      // Should extract filename from URL path
      expect(result.fileName).toBe('f95e07789a2919aa7a91c2ac9a569595');
    });
  });

  // Network tests are skipped when not in Electron due to Cloudflare protection
  // ModDB uses Cloudflare which requires browser-like behavior only available in Electron
  describe.skipIf(!isElectron)('resolve - network tests (requires Electron)', () => {
    it('should resolve a mod download page URL to a direct mirror link', { timeout: 30000 }, async () => {
      const result = await resolver.resolve(
        'https://www.moddb.com/mods/a-gui-mod-for-bioshock-remastered/downloads/a-gui-mod-version-15'
      );

      // Should return a mirror download URL
      expect(result.downloadUrl).toMatch(
        /^https:\/\/www\.moddb\.com\/downloads\/mirror\/290164\/\d+\/[a-f0-9]+$/
      );

      // Should have a filename with proper extension
      expect(result.fileName).toMatch(/\.(zip|rar|7z|exe)$/i);

      // Should have metadata
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.fileId).toBe('290164');
    });

    it('should get a working download URL that returns 200', { timeout: 30000 }, async () => {
      const result = await resolver.resolve(
        'https://www.moddb.com/mods/a-gui-mod-for-bioshock-remastered/downloads/a-gui-mod-version-15'
      );

      // Verify the download URL is accessible with a HEAD request
      const headResponse = await fetch(result.downloadUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      expect(headResponse.ok).toBe(true);
      expect(headResponse.status).toBe(200);

      // Should have a content-length (file size)
      const contentLength = headResponse.headers.get('content-length');
      expect(contentLength).toBeDefined();
      expect(parseInt(contentLength!, 10)).toBeGreaterThan(0);
    });
  });

  // Unit tests with mocked fetch to test parsing logic
  describe('resolve - parsing logic', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      // Mock fetch for parsing tests
    });

    afterEach(() => {
      global.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it('should parse download page HTML correctly', async () => {
      // Mock the download page HTML
      const downloadPageHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Mod v1.0 file - Test Mod for Test Game - ModDB</title>
          <meta property="og:title" content="Test Mod v1.0">
        </head>
        <body>
          <a href="/downloads/start/123456" class="button">Download Now</a>
        </body>
        </html>
      `;

      // Mock the start page HTML
      const startPageHtml = `
        <!DOCTYPE html>
        <html>
        <body>
          <p>Click to <a href="/downloads/mirror/123456/1/abc123def">download TestMod.zip</a></p>
          <script>window.location.href="https://www.moddb.com/downloads/mirror/123456/1/abc123def";</script>
        </body>
        </html>
      `;

      let fetchCallCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        const html = fetchCallCount === 1 ? downloadPageHtml : startPageHtml;
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => html,
        };
      }) as typeof fetch;

      const result = await resolver.resolve(
        'https://www.moddb.com/mods/test-mod/downloads/test-mod-v10'
      );

      expect(result.downloadUrl).toBe('https://www.moddb.com/downloads/mirror/123456/1/abc123def');
      expect(result.fileName).toBe('TestMod.zip');
      expect(result.metadata?.fileId).toBe('123456');
    });

    it('should handle 404 errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '',
      }) as typeof fetch;

      await expect(
        resolver.resolve('https://www.moddb.com/mods/nonexistent/downloads/file')
      ).rejects.toThrow('ModDB file not found');
    });

    it('should handle 403 errors with clear message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => '',
      }) as typeof fetch;

      await expect(
        resolver.resolve('https://www.moddb.com/mods/test/downloads/file')
      ).rejects.toThrow('ModDB blocked the request');
    });

    it('should throw error when no download link found', async () => {
      const htmlWithNoLink = `
        <!DOCTYPE html>
        <html>
        <head><title>Test Page - ModDB</title></head>
        <body><p>No download link here</p></body>
        </html>
      `;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => htmlWithNoLink,
      }) as typeof fetch;

      await expect(
        resolver.resolve('https://www.moddb.com/mods/test/downloads/file')
      ).rejects.toThrow('Could not find download link');
    });
  });
});
