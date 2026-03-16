import os from 'node:os';
import log from 'electron-log';
import { is } from '@electron-toolkit/utils';

/**
 * Sensitive patterns to redact from logs.
 * Matches common environment variable names and values that may contain secrets.
 */
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /credential/i,
  /auth/i,
  /email/i,
];

/**
 * OS username for PII redaction. Resolved once at module load.
 */
const OS_USERNAME = os.userInfo().username;

/**
 * Patterns that match the OS username in file paths and environment variable values.
 * Case-insensitive to handle Windows case variations.
 */
function buildUsernamePatterns(username: string): RegExp[] {
  if (!username) return [];
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    // Windows paths: C:\Users\<username>\...
    new RegExp(`(\\\\Users\\\\)${escaped}(\\\\|$)`, 'gi'),
    // Forward-slash Windows paths: C:/Users/<username>/...
    new RegExp(`(/Users/)${escaped}(/|$)`, 'gi'),
    // Linux/macOS home paths: /home/<username>/...
    new RegExp(`(/home/)${escaped}(/|$)`, 'gi'),
  ];
}

const USERNAME_PATH_PATTERNS = buildUsernamePatterns(OS_USERNAME);

/**
 * Redacts the OS username from path strings.
 * Replaces the username segment in paths like C:\Users\JohnDoe\... with [REDACTED].
 */
function redactUsername(value: string): string {
  let result = value;
  for (const pattern of USERNAME_PATH_PATTERNS) {
    result = result.replace(pattern, '$1[REDACTED]$2');
  }
  return result;
}

/**
 * Redacts sensitive values from an object or string.
 * Returns a new object/string with sensitive data replaced with [REDACTED].
 */
function redactSensitive(value: unknown): unknown {
  if (typeof value === 'string') {
    // Check if the string itself looks like a secret (long alphanumeric, starts with sk-, etc.)
    if (/^(sk-|pk-|api-|key-)/i.test(value) || (value.length > 20 && /^[A-Za-z0-9_-]+$/.test(value))) {
      return '[REDACTED]';
    }
    return redactUsername(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }

  if (value !== null && typeof value === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // Check if the key name suggests sensitive data
      const isSensitiveKey = SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitiveKey && typeof val === 'string' && val.length > 0) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitive(val);
      }
    }
    return redacted;
  }

  return value;
}

/**
 * Redacts only PII (username in paths) from a value.
 * Used in dev mode where we want path privacy but full debug visibility for secrets.
 */
function redactPii(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactUsername(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactPii);
  }

  if (value !== null && typeof value === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      redacted[key] = redactPii(val);
    }
    return redacted;
  }

  return value;
}

/**
 * Formats log arguments, redacting sensitive data.
 * PII (username in paths) is always redacted. Secrets are only redacted in production.
 */
function formatArgs(args: unknown[]): unknown[] {
  if (is.dev) {
    // In development, only redact PII (usernames in paths) — keep secrets visible for debugging
    return args.map(redactPii);
  }
  return args.map(redactSensitive);
}

/**
 * Logger interface matching console methods.
 */
export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Creates a logger instance with a service name prefix.
 * All log messages will be prefixed with [serviceName].
 *
 * @example
 * const logger = createLogger('SettingsService');
 * logger.info('Settings loaded'); // Outputs: [SettingsService] Settings loaded
 */
export function createLogger(serviceName: string): Logger {
  const prefix = `[${serviceName}]`;

  return {
    debug: (...args: unknown[]) => {
      log.debug(prefix, ...formatArgs(args));
    },
    info: (...args: unknown[]) => {
      log.info(prefix, ...formatArgs(args));
    },
    log: (...args: unknown[]) => {
      log.info(prefix, ...formatArgs(args));
    },
    warn: (...args: unknown[]) => {
      log.warn(prefix, ...formatArgs(args));
    },
    error: (...args: unknown[]) => {
      log.error(prefix, ...formatArgs(args));
    },
  };
}

/**
 * Configures electron-log with appropriate settings for the environment.
 * Should be called early in the app lifecycle, before other imports.
 */
export function configureLogger(): void {
  // File logging: debug in dev for full visibility, info in prod for relevant logs
  log.transports.file.level = is.dev ? 'debug' : 'info';

  // Console logging: debug in dev, warn in prod (less noise)
  log.transports.console.level = is.dev ? 'debug' : 'warn';

  // Configure file rotation (keep last 3 log files, max 5MB each)
  log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB

  // Format: include timestamp and level
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  log.transports.console.format = '[{level}] {text}';

  // Initialize electron-log (catches unhandled errors)
  log.initialize();

  // Override console methods with electron-log equivalents
  // This ensures all console.* calls go through electron-log
  Object.assign(console, log.functions);
}

/**
 * Returns the path to the current log file.
 * Useful for showing users where to find logs.
 */
export function getLogFilePath(): string {
  return log.transports.file.getFile()?.path ?? 'Unknown';
}
