/**
 * Centralized constants for MongoDB Reindexer
 */

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  LOG_DIR: 'rebuild_logs',
  RUNTIME_DIR: '.rebuild_runtime',
  COVER_SUFFIX: '_cover_temp',
  CHEAP_SUFFIX_FIELD: '_rebuild_cover_field_',
  SAFE_RUN: true,
  PERFORMANCE_LOGGING: { enabled: true }
} as const;

/**
 * File and directory constants
 */
export const FILE_CONSTANTS = {
  STATE_FILE_NAME: 'rebuild_state.json',
  LOG_FILE_SUFFIX: '_rebuild_log.json',
  LOCALE_CONFIG_PATH: 'locales/config.json',
  DEFAULT_LOCALE: 'en'
} as const;

/**
 * MongoDB constants
 */
export const MONGO_CONSTANTS = {
  UNKNOWN_CLUSTER: 'unknown-cluster',
  HELLO_COMMAND: { hello: 1 },
  ID_INDEX_NAME: '_id_'
} as const;

/**
 * Time and size formatting constants
 */
export const FORMAT_CONSTANTS = {
  BYTES_TO_MB_DIVISOR: 1024 * 1024,
  SECONDS_IN_MINUTE: 60
} as const;

/**
 * Help and prompt constants
 */
export const PROMPT_CONSTANTS = {
  HELP_COMMANDS: ['help', 'h', '?'] as readonly string[],
  VALID_RESPONSES: {
    YES_NO: ['yes', 'no'],
    CONTINUE_ABORT: ['continue', 'abort']
  }
} as const;
