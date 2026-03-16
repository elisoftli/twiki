const isDev = !import.meta.env.PROD;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Serializes an argument for IPC transfer.
 * Error objects lose their message/stack through structured clone, so convert them to plain objects.
 */
function serializeArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    return { name: arg.name, message: arg.message, stack: arg.stack };
  }
  return arg;
}

/**
 * Forwards a log message to the main process via IPC for persistence in electron-log.
 */
function forward(level: LogLevel, serviceName: string, args: unknown[]): void {
  try {
    window.api.logs.forward(level, serviceName, args.map(serializeArg));
  } catch {
    // Silently ignore if IPC bridge is not available (e.g., during early init)
  }
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Creates a logger instance with a service name prefix.
 * - Dev mode: logs to browser console only (all levels visible in DevTools)
 * - Production: forwards warn and error to main process via IPC for electron-log persistence
 */
export function createLogger(serviceName: string): Logger {
  const prefix = `[${serviceName}]`;

  if (isDev) {
    return {
      debug: (...args: unknown[]) => console.debug(prefix, ...args),
      info: (...args: unknown[]) => console.info(prefix, ...args),
      log: (...args: unknown[]) => console.log(prefix, ...args),
      warn: (...args: unknown[]) => console.warn(prefix, ...args),
      error: (...args: unknown[]) => console.error(prefix, ...args),
    };
  }

  return {
    debug: () => {},
    info: (...args: unknown[]) => forward('info', serviceName, args),
    log: () => {},
    warn: (...args: unknown[]) => forward('warn', serviceName, args),
    error: (...args: unknown[]) => forward('error', serviceName, args),
  };
}

/** Backward-compatible default logger */
export const logger = createLogger('Renderer');
