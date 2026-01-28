/**
 * Logger utility for verbose diagnostic logging
 */
export class Logger {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Log informational message
   */
  info(message: string, ...args: any[]): void {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
  }

  /**
   * Log verbose/debug message (only if verbose mode is enabled)
   */
  debug(message: string, ...args: any[]): void {
    if (this.verbose) {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | any, ...args: any[]): void {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
    if (error) {
      if (error instanceof Error) {
        console.error(`  Stack: ${error.stack}`);
      } else {
        console.error(`  Details:`, error);
      }
    }
  }

  /**
   * Set verbose mode
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }
}
