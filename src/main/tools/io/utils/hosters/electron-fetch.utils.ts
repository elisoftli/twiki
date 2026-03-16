/**
 * Electron BrowserWindow-based fetch utility
 *
 * Provides a way to fetch URLs using a hidden BrowserWindow to bypass
 * Cloudflare and similar JavaScript-based protection mechanisms.
 *
 * Usage:
 * ```ts
 * const response = await electronBrowserFetch('https://example.com/page', {
 *   sessionPartition: 'persist:my-resolver',
 *   contentReadyCheck: (html) => html.includes('expected-content'),
 * });
 * const html = await response.text();
 * ```
 */

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Timeout for Cloudflare challenge (usually completes in 2-5 seconds)
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_CHECK_INTERVAL_MS = 500;
// Time to wait before retrying with a fresh window when stuck on Cloudflare
const DEFAULT_CLOUDFLARE_RETRY_MS = 6000;

/**
 * Response interface mimicking fetch Response for consistency
 */
export interface ElectronFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}

/**
 * Options for electronBrowserFetch
 */
export interface ElectronBrowserFetchOptions {
  /** Session partition name for cookie isolation (e.g., 'persist:my-hoster') */
  sessionPartition?: string;
  /** Custom User-Agent string */
  userAgent?: string;
  /** Timeout in milliseconds (default: 15000) */
  timeoutMs?: number;
  /** Interval between content checks in milliseconds (default: 500) */
  checkIntervalMs?: number;
  /**
   * Time in milliseconds to wait before retrying with a fresh window
   * when stuck on Cloudflare challenge (default: 6000)
   */
  cloudflareRetryMs?: number;
  /**
   * Custom function to check if the page content is ready.
   * Should return true when the expected content is available.
   * If not provided, defaults to checking for common download patterns.
   */
  contentReadyCheck?: (html: string) => boolean;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Check if HTML content is a Cloudflare challenge page
 */
export function isCloudflareChallenge(html: string): boolean {
  return (
    html.includes('challenge-platform') ||
    html.includes('Just a moment...') ||
    html.includes('cf-browser-verification') ||
    html.includes('__cf_chl_opt')
  );
}

/**
 * Default content ready check - looks for common download page indicators
 */
function defaultContentReadyCheck(html: string): boolean {
  return (
    html.includes('/downloads/start/') ||
    html.includes('/downloads/mirror/') ||
    html.includes('class="button"') ||
    html.includes('download-link') ||
    html.includes('direct-download')
  );
}

/**
 * Result from a single fetch attempt
 */
interface FetchAttemptResult {
  success: boolean;
  response?: ElectronFetchResponse;
  error?: Error;
  stuckOnCloudflare?: boolean;
}

/**
 * Attempt to fetch a URL with a single BrowserWindow instance.
 * Returns early if stuck on Cloudflare challenge for too long.
 */
async function attemptFetchWithWindow(
  url: string,
  BrowserWindow: typeof import('electron').BrowserWindow,
  options: {
    sessionPartition: string;
    userAgent: string;
    checkIntervalMs: number;
    cloudflareRetryMs: number;
    contentReadyCheck: (html: string) => boolean;
    log: (...args: unknown[]) => void;
    debug: boolean;
  }
): Promise<FetchAttemptResult> {
  const { sessionPartition, userAgent, checkIntervalMs, cloudflareRetryMs, contentReadyCheck, log, debug } = options;

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 1280,
      height: 720,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: sessionPartition,
      },
    });

    win.webContents.setUserAgent(userAgent);
    log('[ElectronFetch] BrowserWindow created, loading URL...');

    let resolved = false;
    let checkIntervalId: NodeJS.Timeout;
    let cloudflareRetryTimeoutId: NodeJS.Timeout;
    let checkCount = 0;
    let stuckOnCloudflare = true; // Assume stuck until proven otherwise

    const cleanup = () => {
      log('[ElectronFetch] Cleanup called, resolved:', resolved);
      if (checkIntervalId) clearInterval(checkIntervalId);
      if (cloudflareRetryTimeoutId) clearTimeout(cloudflareRetryTimeoutId);
      if (!win.isDestroyed()) {
        log('[ElectronFetch] Destroying window...');
        win.destroy();
      }
    };

    const resolveAttempt = (result: FetchAttemptResult) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    // Set timeout to retry if stuck on Cloudflare challenge
    cloudflareRetryTimeoutId = setTimeout(() => {
      if (stuckOnCloudflare) {
        log('[ElectronFetch] Stuck on Cloudflare for', cloudflareRetryMs, 'ms, triggering retry...');
        resolveAttempt({ success: false, stuckOnCloudflare: true });
      }
    }, cloudflareRetryMs);

    // Handle navigation errors
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      log('[ElectronFetch] did-fail-load:', errorCode, errorDescription);
      if (errorCode !== -3) {
        // -3 is aborted, which is normal during redirects
        resolveAttempt({
          success: false,
          error: new Error(`Failed to load page: ${errorDescription} (${errorCode})`),
        });
      }
    });

    // Check periodically if Cloudflare challenge has completed
    const checkForContent = async () => {
      if (resolved || win.isDestroyed()) return;

      checkCount++;
      log('[ElectronFetch] Check #' + checkCount + ' for content...');

      try {
        const html = await win.webContents.executeJavaScript(
          'document.documentElement.outerHTML'
        );

        const htmlLength = html.length;
        const isChallenge = isCloudflareChallenge(html);
        const contentReady = contentReadyCheck(html);

        log('[ElectronFetch] HTML length:', htmlLength);
        log('[ElectronFetch] Is Cloudflare challenge:', isChallenge);
        log('[ElectronFetch] Content ready:', contentReady);

        // Update stuck status - we're not stuck if we're past Cloudflare
        if (!isChallenge) {
          stuckOnCloudflare = false;
        }

        // Check if we're past Cloudflare
        if (!isChallenge) {
          if (contentReady) {
            log('[ElectronFetch] Content found! Resolving...');
            if (debug) {
              log('[ElectronFetch] HTML preview:', html.substring(0, 500));
            }
            resolveAttempt({
              success: true,
              response: {
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => html,
              },
            });
          } else {
            log('[ElectronFetch] Past Cloudflare but content not found yet');
            // Log the title to see what page we're on
            const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
            log('[ElectronFetch] Page title:', titleMatch ? titleMatch[1] : 'N/A');
          }
        } else {
          log('[ElectronFetch] Still on Cloudflare challenge page');
        }
      } catch (err) {
        log('[ElectronFetch] Error checking content:', err);
        // Page might not be ready yet, continue checking
      }
    };

    // Start checking for content after page starts loading
    win.webContents.on('did-finish-load', () => {
      log('[ElectronFetch] did-finish-load event fired');
      checkIntervalId = setInterval(checkForContent, checkIntervalMs);
      checkForContent();
    });

    if (debug) {
      win.webContents.on('did-navigate', (_event, navUrl) => {
        log('[ElectronFetch] did-navigate to:', navUrl);
      });

      win.webContents.on('did-redirect-navigation', (_event, navUrl) => {
        log('[ElectronFetch] did-redirect-navigation to:', navUrl);
      });
    }

    // Load the URL
    win.loadURL(url).catch((error) => {
      log('[ElectronFetch] loadURL error:', error.message);
      resolveAttempt({
        success: false,
        error: new Error(`Failed to load URL: ${error.message}`),
      });
    });
  });
}

/**
 * Fetch a URL using Electron's BrowserWindow to bypass Cloudflare protection.
 *
 * This loads the page in a hidden browser window, waits for any JavaScript
 * challenges (like Cloudflare) to complete, then extracts the HTML content.
 *
 * If stuck on Cloudflare challenge for too long, it will retry with a fresh
 * browser window.
 *
 * @param url The URL to fetch
 * @param options Configuration options
 * @returns A Response-like object with the page HTML
 */
export async function electronBrowserFetch(
  url: string,
  options: ElectronBrowserFetchOptions = {}
): Promise<ElectronFetchResponse> {
  const {
    sessionPartition = 'persist:electron-fetch',
    userAgent = DEFAULT_USER_AGENT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
    cloudflareRetryMs = DEFAULT_CLOUDFLARE_RETRY_MS,
    contentReadyCheck = defaultContentReadyCheck,
    debug = false,
  } = options;

  const log = debug ? console.log.bind(console) : () => {};

  log('[ElectronFetch] Fetching:', url);

  try {
    const { BrowserWindow } = await import('electron');

    if (!BrowserWindow) {
      log('[ElectronFetch] BrowserWindow not available, falling back to fetch');
      throw new Error('Electron BrowserWindow not available');
    }

    log('[ElectronFetch] Creating BrowserWindow with partition:', sessionPartition);

    const startTime = Date.now();
    let attemptCount = 0;

    // Keep retrying until timeout is reached
    while (Date.now() - startTime < timeoutMs) {
      attemptCount++;
      const remainingTime = timeoutMs - (Date.now() - startTime);

      log(`[ElectronFetch] Attempt #${attemptCount}, remaining time: ${remainingTime}ms`);

      // Don't start a new attempt if we don't have enough time
      if (remainingTime < cloudflareRetryMs / 2) {
        log('[ElectronFetch] Not enough time for another attempt');
        break;
      }

      const result = await attemptFetchWithWindow(url, BrowserWindow, {
        sessionPartition,
        userAgent,
        checkIntervalMs,
        cloudflareRetryMs: Math.min(cloudflareRetryMs, remainingTime),
        contentReadyCheck,
        log,
        debug,
      });

      if (result.success && result.response) {
        log(`[ElectronFetch] Success on attempt #${attemptCount}`);
        return result.response;
      }

      if (result.error && !result.stuckOnCloudflare) {
        // Non-Cloudflare error, don't retry
        throw result.error;
      }

      if (result.stuckOnCloudflare) {
        log(`[ElectronFetch] Attempt #${attemptCount} stuck on Cloudflare, will retry with fresh window...`);
        // Small delay before retrying
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // All attempts failed
    throw new Error(`Request timed out after ${timeoutMs}ms (${attemptCount} attempts)`);
  } catch (err) {
    if (err instanceof Error && err.message.includes('timed out')) {
      throw err;
    }

    log('[ElectronFetch] Caught error, falling back to fetch:', err);
    // Electron not available (e.g., running tests), fall back to native fetch
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    log('[ElectronFetch] Fetch fallback response status:', response.status);

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text: () => response.text(),
    };
  }
}
