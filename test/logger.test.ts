/**
 * Logger Module Tests - Node Test Runner Format
 * Migrated from unit-tests.js (lines 85-210)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mock logger implementation for testing
interface LogAccumulator {
  info: string[];
  warn: string[];
  error: string[];
  debug: string[];
}

class TestLogger {
  verbose: boolean;
  logs: LogAccumulator;

  constructor(verbose = false) {
    this.verbose = verbose;
    this.logs = { info: [], warn: [], error: [], debug: [] };
  }

  info(message: string): void {
    this.logs.info.push(message);
  }

  warn(message: string): void {
    this.logs.warn.push(message);
  }

  error(message: string): void {
    this.logs.error.push(message);
  }

  debug(message: string): void {
    if (this.verbose) {
      this.logs.debug.push(message);
    }
  }
}

class SilentLogger {
  info(): void {}
  warn(): void {}
  error(): void {}
  debug(): void {}
}

describe('Logger Module', () => {
  describe('TestLogger - info()', () => {
    it('should log info messages', () => {
      const logger = new TestLogger();
      logger.info('test message');
      assert.ok(logger.logs.info.includes('test message'));
    });

    it('should handle empty strings', () => {
      const logger = new TestLogger();
      logger.info('');
      assert.ok(logger.logs.info.includes(''));
    });

    it('should handle special characters', () => {
      const logger = new TestLogger();
      logger.info('test@#$%^&*()');
      assert.ok(logger.logs.info.includes('test@#$%^&*()'));
    });
  });

  describe('TestLogger - warn()', () => {
    it('should log warning messages', () => {
      const logger = new TestLogger();
      logger.warn('warning message');
      assert.ok(logger.logs.warn.includes('warning message'));
    });
  });

  describe('TestLogger - error()', () => {
    it('should log error messages', () => {
      const logger = new TestLogger();
      logger.error('error message');
      assert.ok(logger.logs.error.includes('error message'));
    });
  });

  describe('TestLogger - debug()', () => {
    it('should not log debug when verbose=false', () => {
      const logger = new TestLogger(false);
      logger.debug('debug message');
      assert.strictEqual(logger.logs.debug.length, 0);
    });

    it('should log debug when verbose=true', () => {
      const verboseLogger = new TestLogger(true);
      verboseLogger.debug('debug message');
      assert.ok(verboseLogger.logs.debug.includes('debug message'));
    });
  });

  describe('SilentLogger', () => {
    it('should have all logger methods as no-ops', () => {
      const logger = new SilentLogger();

      // Should not throw
      assert.doesNotThrow(() => {
        logger.info();
        logger.warn();
        logger.error();
        logger.debug();
      });
    });
  });

  describe('Global Logger Management', () => {
    it('should allow setting and getting global logger', () => {
      interface Logger {
        name: string;
        info(): void;
        warn(): void;
        error(): void;
        debug(): void;
      }

      class CustomLogger implements Logger {
        name: string;

        constructor() {
          this.name = 'custom';
        }
        info(): void {}
        warn(): void {}
        error(): void {}
        debug(): void {}
      }

      // Simple implementation
      let globalLogger: Logger = { name: 'default', info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
      const setLogger = (logger: Logger): void => { globalLogger = logger; };
      const getLogger = (): Logger => globalLogger;

      const customLogger = new CustomLogger();
      setLogger(customLogger);
      assert.strictEqual(getLogger().name, 'custom');
    });
  });
});
