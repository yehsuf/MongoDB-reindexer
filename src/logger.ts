/**
 * Logger abstraction for decoupling business logic from I/O
 * This enables testing without output capture and allows output redirection
 */

export interface ILogger {
  /**
   * Log informational message
   */
  info(message: string): void;

  /**
   * Log warning message
   */
  warn(message: string): void;

  /**
   * Log error message
   */
  error(message: string): void;

  /**
   * Log debug message (only if verbose)
   */
  debug(message: string): void;
}

/**
 * Console-based logger implementation
 */
export class ConsoleLogger implements ILogger {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  info(message: string): void {
    console.log(message);
  }

  warn(message: string): void {
    console.warn(message);
  }

  error(message: string): void {
    console.error(message);
  }

  debug(message: string): void {
    if (this.verbose) {
      console.debug(message);
    }
  }
}

/**
 * Silent logger for testing (suppresses all output)
 */
export class SilentLogger implements ILogger {
  info(): void { /* no-op */ }
  warn(): void { /* no-op */ }
  error(): void { /* no-op */ }
  debug(): void { /* no-op */ }
}

/**
 * Global logger instance
 */
let globalLogger: ILogger = new ConsoleLogger();

/**
 * Set the global logger instance
 */
export function setLogger(logger: ILogger): void {
  globalLogger = logger;
}

/**
 * Get the global logger instance
 */
export function getLogger(): ILogger {
  return globalLogger;
}
