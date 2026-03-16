/**
 * Integrity Service
 *
 * Detects tampering attempts (debuggers, DevTools in production) and
 * signals to other services to use fallback behavior silently.
 * Does NOT alert the user or attacker - just switches to random client IDs.
 */

import { is } from '@electron-toolkit/utils';
import { createLogger } from '../../utils/logger.utils';

const logger = createLogger('IntegrityService');

let tamperingDetected = false;

export const IntegrityService = {
  /**
   * Check if tampering has been detected.
   * When true, services should use fallback/random values.
   */
  isTampered(): boolean {
    return tamperingDetected;
  },

  /**
   * Run integrity checks at startup.
   * Should be called early in the app initialization.
   */
  checkIntegrity(): void {
    // Skip all checks in development mode
    if (is.dev) {
      return;
    }

    this.checkDebuggerFlags();
    this.checkInspector();
  },

  /**
   * Check for debugger command-line flags.
   */
  checkDebuggerFlags(): void {
    const debugFlags = ['--inspect', '--inspect-brk', '--debug', '--debug-brk', '--remote-debugging-port'];
    const hasDebugFlag = process.execArgv.some((arg) =>
      debugFlags.some((flag) => arg.startsWith(flag))
    );

    if (hasDebugFlag) {
      logger.debug('Debug environment detected');
      tamperingDetected = true;
    }
  },

  /**
   * Check if the Node.js inspector is attached.
   */
  checkInspector(): void {
    try {
      // Dynamic import to avoid bundling inspector in production
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const inspector = require('inspector');
      if (inspector.url() !== undefined) {
        logger.debug('Inspector session detected');
        tamperingDetected = true;
      }
    } catch {
      // Inspector module not available, that's fine
    }
  },

  /**
   * Mark tampering as detected.
   * Called by other parts of the app (e.g., DevTools detection in MainWindow).
   */
  markTampered(): void {
    if (!tamperingDetected) {
      logger.debug('Tampering marked by external source');
      tamperingDetected = true;
    }
  },

  /**
   * Reset tampering flag (for testing only).
   */
  resetForTesting(): void {
    tamperingDetected = false;
  },
};
