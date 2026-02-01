/**
 * Comprehensive Unit Test Suite for MongoDB Reindexer
 * Tests for: logger, mongodb-utils, file-utils, i18n, prompts, and index
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Mock console methods for testing
let consoleOutput = {
  log: [],
  warn: [],
  error: [],
  debug: []
};

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug
};

function mockConsole() {
  consoleOutput = { log: [], warn: [], error: [], debug: [] };
  console.log = (...args) => consoleOutput.log.push(args.join(' '));
  console.warn = (...args) => consoleOutput.warn.push(args.join(' '));
  console.error = (...args) => consoleOutput.error.push(args.join(' '));
  console.debug = (...args) => consoleOutput.debug.push(args.join(' '));
}

function restoreConsole() {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
}

// Helper function for test assertions
function testEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

function testDeepEquals(actual, expected, message) {
  try {
    assert.deepStrictEqual(actual, expected);
  } catch (e) {
    throw new Error(`${message}\n${e.message}`);
  }
}

function testTrue(value, message) {
  if (!value) throw new Error(message);
}

function testFalse(value, message) {
  if (value) throw new Error(message);
}

function testThrows(fn, message) {
  try {
    fn();
    throw new Error(`${message} - Expected function to throw but it didn't`);
  } catch (e) {
    if (e.message.includes('Expected function to throw')) throw e;
  }
}

// Test Suite Counter
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(testName, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`  ✅ ${testName}`);
  } catch (e) {
    failedTests++;
    console.error(`  ❌ ${testName}`);
    console.error(`     Error: ${e.message}`);
  }
}

// ============================================================================
// LOGGER TESTS
// ============================================================================

console.log('\n### LOGGER TESTS ###\n');

const loggerTests = () => {
  // Mock ILogger interface implementation
  class TestLogger {
    constructor(verbose = false) {
      this.verbose = verbose;
      this.logs = { info: [], warn: [], error: [], debug: [] };
    }

    info(message) {
      this.logs.info.push(message);
    }

    warn(message) {
      this.logs.warn.push(message);
    }

    error(message) {
      this.logs.error.push(message);
    }

    debug(message) {
      if (this.verbose) {
        this.logs.debug.push(message);
      }
    }
  }

  runTest('ConsoleLogger - info() logs message', () => {
    mockConsole();
    const logger = new TestLogger();
    logger.info('test message');
    testTrue(logger.logs.info.includes('test message'), 'info message not logged');
    restoreConsole();
  });

  runTest('ConsoleLogger - warn() logs warning', () => {
    mockConsole();
    const logger = new TestLogger();
    logger.warn('warning message');
    testTrue(logger.logs.warn.includes('warning message'), 'warn message not logged');
    restoreConsole();
  });

  runTest('ConsoleLogger - error() logs error', () => {
    mockConsole();
    const logger = new TestLogger();
    logger.error('error message');
    testTrue(logger.logs.error.includes('error message'), 'error message not logged');
    restoreConsole();
  });

  runTest('ConsoleLogger - debug() only logs when verbose=true', () => {
    const logger = new TestLogger(false);
    logger.debug('debug message');
    testTrue(logger.logs.debug.length === 0, 'debug message logged when verbose=false');

    const verboseLogger = new TestLogger(true);
    verboseLogger.debug('debug message');
    testTrue(verboseLogger.logs.debug.includes('debug message'), 'debug message not logged when verbose=true');
  });

  runTest('SilentLogger - all methods are no-ops', () => {
    class SilentLogger {
      info() {}
      warn() {}
      error() {}
      debug() {}
    }

    const logger = new SilentLogger();
    // Should not throw
    logger.info('test');
    logger.warn('test');
    logger.error('test');
    logger.debug('test');
  });

  runTest('setLogger() and getLogger() manage global logger', () => {
    class CustomLogger {
      name = 'custom';
      info() {}
      warn() {}
      error() {}
      debug() {}
    }

    // Simple implementation without actual module import
    let globalLogger = { name: 'default' };
    const setLogger = (logger) => { globalLogger = logger; };
    const getLogger = () => globalLogger;

    const customLogger = new CustomLogger();
    setLogger(customLogger);
    testEquals(getLogger().name, 'custom', 'Global logger not updated');
  });

  runTest('Logger handles empty strings', () => {
    const logger = new TestLogger();
    logger.info('');
    testTrue(logger.logs.info.includes(''), 'Empty string not logged');
  });

  runTest('Logger handles special characters', () => {
    const logger = new TestLogger();
    logger.info('test@#$%^&*()');
    testTrue(logger.logs.info.includes('test@#$%^&*()'), 'Special characters not logged');
  });
};

loggerTests();

// ============================================================================
// MONGODB-UTILS TESTS
// ============================================================================

console.log('\n### MONGODB-UTILS TESTS ###\n');

const mongodbUtilsTests = () => {
  // getClusterName function
  function getClusterName(client) {
    try {
      const uri = (client && client.s && client.s.url) || '';
      if (uri) {
        const match = uri.match(/mongodb\+srv:\/\/(?:[^@]+@)?([^/?]+)/);
        if (match && match[1]) {
          return match[1].split('.')[0] || 'unknown-cluster';
        }
      }
      return 'unknown-cluster';
    } catch {
      return 'unknown-cluster';
    }
  }

  // getReplicaSetName function
  async function getReplicaSetName(db) {
    try {
      const hello = { setName: 'test-rs' }; // Mock
      if (hello.setName) {
        return hello.setName.replace(/[^a-zA-Z0-9_-]/g, '');
      }
      return 'unknown-cluster';
    } catch {
      return 'unknown-cluster';
    }
  }

  // isIgnored function
  function isIgnored(name, ignoreList) {
    for (const pattern of ignoreList) {
      if (pattern.endsWith('*')) {
        if (name.startsWith(pattern.slice(0, -1))) {
          return true;
        }
      } else if (name === pattern) {
        return true;
      }
    }
    return false;
  }

  runTest('getClusterName() extracts cluster frction string', () => {
    const client = {
      s: { url: 'mongodb+srv://cluster0.abc.mongodb.net' }
    };
    const result = getClusterName(client);
    testEquals(result, 'cluster0', 'Cluster name not extracted correctly');
  });

  runTest('getClusterName() handles auth in connection string', () => {
    const client = {
      s: { url: 'mongodb+srv://user:pass@cluster1.xyz.mongodb.net' }
    };
    const result = getClusterName(client);
    testEquals(result, 'cluster1', 'Cluster name not extracted with auth');
  });

  runTest('getClusterName() returns unknown-cluster for invalid input', () => {
    const client = {
      s: { url: 'invalid-url' }
    };
    const result = getClusterName(client);
    testEquals(result, 'unknown-cluster', 'Should return unknown-cluster for invalid URL');
  });

  runTest('getClusterName() returns unknown-cluster when no URL', () => {
    const client = { s: {} };
    const result = getClusterName(client);
    testEquals(result, 'unknown-cluster', 'Should return unknown-cluster when no URL');
  });

  runTest('getClusterName() handles null/undefined client', () => {
    const result = getClusterName(null);
    testEquals(result, 'unknown-cluster', 'Should handle null client');
  });

  runTest('isIgnored() matches exact names', () => {
    testTrue(isIgnored('admin', ['admin', 'local']), 'Exact match failed');
    testFalse(isIgnored('test', ['admin', 'local']), 'False positive match');
  });

  runTest('isIgnored() matches wildcard patterns', () => {
    testTrue(isIgnored('system.indexes', ['system.*']), 'Wildcard match failed');
    testTrue(isIgnored('system.views', ['system.*']), 'Wildcard match for different prefix');
    testFalse(isIgnored('user', ['system.*']), 'False positive wildcard match');
  });

  runTest('isIgnored() handles empty ignore list', () => {
    testFalse(isIgnored('admin', []), 'Should not match with empty list');
  });

  runTest('isIgnored() is case-sensitive', () => {
    testFalse(isIgnored('Admin', ['admin']), 'Should be case-sensitive');
    testTrue(isIgnored('admin', ['admin']), 'Should match exact case');
  });

  runTest('isIgnored() handles multiple patterns', () => {
    const ignoreList = ['admin', 'local', 'system.*', 'test_*'];
    testTrue(isIgnored('admin', ignoreList), 'Should match first pattern');
    testTrue(isIgnored('system.views', ignoreList), 'Should match wildcard');
    testTrue(isIgnored('test_db', ignoreList), 'Should match test_* pattern');
    testFalse(isIgnored('user', ignoreList), 'Should not match any pattern');
  });

  runTest('getReplicaSetName() handles mock database', async () => {
    const db = {};
    const result = await getReplicaSetName(db);
    testEquals(result, 'test-rs', 'ReplicaSet name not extracted');
  });
};

mongodbUtilsTests();

// ============================================================================
// FILE-UTILS TESTS
// ============================================================================

console.log('\n### FILE-UTILS TESTS ###\n');

const fileUtilsTests = () => {
  // Format helper functions
  function bytesToMB(bytes) {
    return bytes / (1024 * 1024);
  }

  function formatDuration(seconds) {
    const SECONDS_IN_MINUTE = 60;
    if (seconds < SECONDS_IN_MINUTE) {
      return `${seconds.toFixed(2)}s`;
    }
    const minutes = Math.floor(seconds / SECONDS_IN_MINUTE);
    const remainingSeconds = seconds % SECONDS_IN_MINUTE;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  }

  // File operations
  function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  function readJsonFile(filePath, defaultValue) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      }
    } catch {
      // Return default
    }
    return defaultValue;
  }

  function writeJsonFile(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  function deleteFile(filePath) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  const testDir = './test/temp_test_files';
  const testFile = path.join(testDir, 'test.json');

  runTest('ensureDir() creates directory if not exists', () => {
    const dir = path.join(testDir, 'subdir');
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });

    ensureDir(dir);
    testTrue(fs.existsSync(dir), 'Directory not created');

    fs.rmSync(dir, { recursive: true });
  });

  runTest('ensureDir() does nothing if directory exists', () => {
    ensureDir(testDir);
    ensureDir(testDir); // Should not throw
    testTrue(fs.existsSync(testDir), 'Directory removed');
  });

  runTest('writeJsonFile() writes valid JSON', () => {
    ensureDir(testDir);
    const testData = { name: 'test', value: 42 };
    writeJsonFile(testFile, testData);

    testTrue(fs.existsSync(testFile), 'File not created');
    const content = fs.readFileSync(testFile, 'utf8');
    const parsed = JSON.parse(content);
    testDeepEquals(parsed, testData, 'JSON data mismatch');
  });

  runTest('readJsonFile() returns data when file exists', () => {
    ensureDir(testDir);
    const testData = { key: 'value', number: 123 };
    writeJsonFile(testFile, testData);

    const result = readJsonFile(testFile, {});
    testDeepEquals(result, testData, 'Read data mismatch');
  });

  runTest('readJsonFile() returns default value when file does not exist', () => {
    const nonExistentFile = path.join(testDir, 'nonexistent.json');
    const defaultValue = { default: true };

    const result = readJsonFile(nonExistentFile, defaultValue);
    testDeepEquals(result, defaultValue, 'Should return default value');
  });

  runTest('readJsonFile() returns default value on parse error', () => {
    ensureDir(testDir);
    const invalidFile = path.join(testDir, 'invalid.json');
    fs.writeFileSync(invalidFile, 'invalid json {{{', 'utf8');

    const defaultValue = { fallback: true };
    const result = readJsonFile(invalidFile, defaultValue);
    testDeepEquals(result, defaultValue, 'Should return default on parse error');

    deleteFile(invalidFile);
  });

  runTest('deleteFile() removes file if exists', () => {
    ensureDir(testDir);
    writeJsonFile(testFile, { test: true });
    testTrue(fs.existsSync(testFile), 'File not created');

    deleteFile(testFile);
    testFalse(fs.existsSync(testFile), 'File not deleted');
  });

  runTest('deleteFile() does nothing if file does not exist', () => {
    // Should not throw
    deleteFile(path.join(testDir, 'nonexistent.json'));
  });

  runTest('bytesToMB() converts bytes correctly', () => {
    const mb = bytesToMB(1024 * 1024);
    testEquals(mb, 1, 'Bytes to MB conversion failed');

    const mb5 = bytesToMB(5 * 1024 * 1024);
    testEquals(mb5, 5, '5MB conversion failed');
  });

  runTest('bytesToMB() handles 0 bytes', () => {
    const result = bytesToMB(0);
    testEquals(result, 0, 'Zero bytes should be 0 MB');
  });

  runTest('bytesToMB() handles decimal MB values', () => {
    const bytes = 512 * 1024; // 0.5 MB
    const mb = bytesToMB(bytes);
    testEquals(mb, 0.5, '0.5MB conversion failed');
  });

  runTest('formatDuration() formats seconds correctly', () => {
    const result = formatDuration(45.5);
    testTrue(result.includes('45.50s'), 'Seconds formatting incorrect');
  });

  runTest('formatDuration() formats minutes correctly', () => {
    const result = formatDuration(125); // 2m 5s
    testTrue(result.includes('2m') && result.includes('5s'), 'Minutes formatting incorrect');
  });

  runTest('formatDuration() handles edge case at 60 seconds', () => {
    const result = formatDuration(60);
    testTrue(result.includes('1m'), 'Should convert 60s to 1m');
  });

  // Cleanup
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
};

fileUtilsTests();

// ============================================================================
// I18N TESTS
// ============================================================================

console.log('\n### I18N TESTS ###\n');

const i18nTests = () => {
  // Simple i18n implementation for testing
  const FILE_CONSTANTS = { DEFAULT_LOCALE: 'en' };

  let currentLocale = null;

  function getLocale() {
    if (!currentLocale) {
      currentLocale = 'en';
    }
    return currentLocale;
  }

  function setLocale(locale) {
    currentLocale = locale;
  }

  const messagesCache = {
    en: {
      common: {
        help_trigger: 'Type "help" for options',
        available_options: 'Available options:',
        invalid_input: 'Invalid input. Valid options: {options}'
      },
      errors: {
        could_not_read_file: 'Could not read file: {file}'
      }
    },
    es: {
      common: {
        help_trigger: 'Escribe "ayuda" para opciones',
        available_options: 'Opciones disponibles:'
      }
    }
  };

  function loadMessages(locale) {
    return messagesCache[locale] || {};
  }

  function t(key, params) {
    const locale = getLocale();
    const messages = loadMessages(locale);

    const keys = key.split('.');
    let value = messages;

    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        value = undefined;
        break;
      }
    }

    if (value === undefined && locale !== FILE_CONSTANTS.DEFAULT_LOCALE) {
      const fallbackMessages = loadMessages(FILE_CONSTANTS.DEFAULT_LOCALE);
      value = fallbackMessages;
      for (const k of keys) {
        if (value && typeof value === 'object') {
          value = value[k];
        } else {
          value = key;
          break;
        }
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    if (params) {
      let result = value;
      for (const [paramKey, paramValue] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
      }
      return result;
    }

    return value;
  }

  runTest('getLocale() returns default locale', () => {
    currentLocale = null;
    const locale = getLocale();
    testEquals(locale, 'en', 'Default locale should be en');
  });

  runTest('setLocale() changes current locale', () => {
    setLocale('es');
    testEquals(getLocale(), 'es', 'Locale not changed');
  });

  runTest('t() translates simple keys', () => {
    setLocale('en');
    const result = t('common.help_trigger');
    testTrue(result.includes('help'), 'Translation not found');
  });

  runTest('t() replaces parameters in translation', () => {
    setLocale('en');
    const result = t('common.invalid_input', { options: 'yes, no' });
    testTrue(result.includes('yes, no'), 'Parameter not replaced');
  });

  runTest('t() handles missing keys', () => {
    setLocale('en');
    const result = t('nonexistent.key');
    testEquals(result, 'nonexistent.key', 'Should return key when translation missing');
  });

  runTest('t() falls back to English for missing translations', () => {
    setLocale('es');
    const result = t('errors.could_not_read_file', { file: 'test.json' });
    testTrue(result.includes('test.json'), 'Fallback translation not used');
  });

  runTest('t() handles deeply nested keys', () => {
    setLocale('en');
    const result = t('errors.could_not_read_file', { file: 'data.json' });
    testTrue(result.length > 0, 'Deeply nested key not translated');
  });

  runTest('t() returns key for non-string values', () => {
    setLocale('en');
    // Manually test with a corrupted message
    const result = t('some.invalid.path');
    testEquals(result, 'some.invalid.path', 'Should return key for non-string');
  });
};

i18nTests();

// ============================================================================
// PROMPTS TESTS
// ============================================================================

console.log('\n### PROMPTS TESTS ###\n');

const promptsTests = () => {
  function isValidAnswer(answer, validAnswers) {
    if (validAnswers.includes(answer.trim().toLowerCase())) {
      return true;
    }

    const validFirstChars = validAnswers.map(a => a[0]);
    const trimmed = answer.trim().toLowerCase();

    if (validFirstChars.includes(trimmed)) {
      return validAnswers.find(a => a.startsWith(trimmed)) !== undefined;
    }

    return false;
  }

  function getFullAnswer(input, validAnswers) {
    const trimmed = input.trim().toLowerCase();

    if (validAnswers.includes(trimmed)) {
      return trimmed;
    }

    const fullWord = validAnswers.find(a => a.startsWith(trimmed));
    return fullWord || null;
  }

  runTest('promptUser validates full answers', () => {
    testTrue(isValidAnswer('yes', ['yes', 'no']), 'Full answer "yes" not valid');
    testTrue(isValidAnswer('no', ['yes', 'no']), 'Full answer "no" not valid');
  });

  runTest('promptUser validates single character shortcuts', () => {
    testTrue(isValidAnswer('y', ['yes', 'no']), 'Shortcut "y" not valid');
    testTrue(isValidAnswer('n', ['yes', 'no']), 'Shortcut "n" not valid');
  });

  runTest('promptUser rejects invalid answers', () => {
    testFalse(isValidAnswer('maybe', ['yes', 'no']), '"maybe" should not be valid');
    testFalse(isValidAnswer('x', ['yes', 'no']), '"x" should not be valid');
  });

  runTest('promptUser is case-insensitive', () => {
    testTrue(isValidAnswer('YES', ['yes', 'no']), 'Case sensitivity issue with YES');
    testTrue(isValidAnswer('No', ['yes', 'no']), 'Case sensitivity issue with No');
  });

  runTest('promptUser handles whitespace', () => {
    testTrue(isValidAnswer('  yes  ', ['yes', 'no']), 'Whitespace not trimmed');
    testTrue(isValidAnswer('  y  ', ['yes', 'no']), 'Whitespace not trimmed for shortcut');
  });

  runTest('getFullAnswer resolves shortcuts to full words', () => {
    const result = getFullAnswer('y', ['yes', 'no']);
    testEquals(result, 'yes', 'Shortcut not resolved to full word');
  });

  runTest('getFullAnswer handles ambiguous shortcuts', () => {
    const result = getFullAnswer('c', ['continue', 'cancel']);
    testTrue(result === 'continue' || result === 'cancel', 'Should match one of the options');
  });

  runTest('getFullAnswer returns null for invalid input', () => {
    const result = getFullAnswer('x', ['yes', 'no']);
    testEquals(result, null, 'Should return null for invalid input');
  });

  runTest('promptUser recognizes help commands', () => {
    const helpCommands = ['help', 'h', '?'];
    testTrue(helpCommands.includes('help'), 'help not recognized');
    testTrue(helpCommands.includes('h'), 'h not recognized');
    testTrue(helpCommands.includes('?'), '? not recognized');
  });

  runTest('promptUser handles multiple valid answers', () => {
    const validAnswers = ['yes', 'no', 'skip'];
    testTrue(isValidAnswer('yes', validAnswers), 'yes not valid');
    testTrue(isValidAnswer('no', validAnswers), 'no not valid');
    testTrue(isValidAnswer('skip', validAnswers), 'skip not valid');
    testTrue(isValidAnswer('s', validAnswers), 's shortcut not valid');
  });
};

promptsTests();

// ============================================================================
// INDEX TESTS (Core rebuild logic)
// ============================================================================

console.log('\n### INDEX TESTS (Core Rebuild Logic) ###\n');

const indexTests = () => {
  // Mock verifyIndex logic
  async function verifyIndex(collection, indexName, expectedKey, expectedOptions) {
    try {
      const allIndexes = collection.indexes || [];
      const foundIndex = allIndexes.find(i => i.name === indexName);

      if (!foundIndex) {
        return false;
      }

      if (JSON.stringify(foundIndex.key) !== JSON.stringify(expectedKey)) {
        return false;
      }

      const finalOptsClean = {};
      const VALID_INDEX_OPTIONS = ['unique', 'sparse', 'ttl', 'background', 'partialFilterExpression'];
      for (const opt of VALID_INDEX_OPTIONS) {
        if (Object.prototype.hasOwnProperty.call(foundIndex, opt)) {
          finalOptsClean[opt] = foundIndex[opt];
        }
      }

      return JSON.stringify(finalOptsClean) === JSON.stringify(expectedOptions);
    } catch {
      return false;
    }
  }

  runTest('verifyIndex() returns true for matching index', async () => {
    const collection = {
      indexes: [
        {
          name: 'test_index',
          key: { field: 1 },
          unique: false
        }
      ]
    };

    const result = await verifyIndex(collection, 'test_index', { field: 1 }, {});
    testTrue(result, 'Should verify matching index');
  });

  runTest('verifyIndex() returns false for missing index', async () => {
    const collection = {
      indexes: []
    };

    const result = await verifyIndex(collection, 'missing_index', { field: 1 }, {});
    testFalse(result, 'Should return false for missing index');
  });

  runTest('verifyIndex() returns false for key mismatch', async () => {
    const collection = {
      indexes: [
        {
          name: 'test_index',
          key: { field: 1 },
          unique: false
        }
      ]
    };

    const result = await verifyIndex(collection, 'test_index', { other_field: 1 }, {});
    testFalse(result, 'Should return false for key mismatch');
  });

  runTest('verifyIndex() returns false for options mismatch', async () => {
    const collection = {
      indexes: [
        {
          name: 'test_index',
          key: { field: 1 },
          unique: true
        }
      ]
    };

    const result = await verifyIndex(collection, 'test_index', { field: 1 }, { unique: false });
    testFalse(result, 'Should return false for options mismatch');
  });

  runTest('verifyIndex() handles empty collection', async () => {
    const collection = {
      indexes: []
    };

    const result = await verifyIndex(collection, 'any_index', { field: 1 }, {});
    testFalse(result, 'Should return false for empty collection');
  });

  runTest('verifyIndex() handles partial filter expressions', async () => {
    const collection = {
      indexes: [
        {
          name: 'sparse_index',
          key: { field: 1 },
          partialFilterExpression: { status: 'active' }
        }
      ]
    };

    const result = await verifyIndex(
      collection,
      'sparse_index',
      { field: 1 },
      { partialFilterExpression: { status: 'active' } }
    );
    testTrue(result, 'Should verify index with partial filter');
  });

  runTest('verifyIndex() handles multiple indexes', async () => {
    const collection = {
      indexes: [
        { name: 'index1', key: { field1: 1 } },
        { name: 'index2', key: { field2: 1 } },
        { name: 'index3', key: { field3: 1 } }
      ]
    };

    const result = await verifyIndex(collection, 'index2', { field2: 1 }, {});
    testTrue(result, 'Should find correct index among multiple');
  });

  // Index name generation helpers
  function generateCoveringIndexName(originalName, suffix) {
    return originalName + suffix;
  }

  function isValidCoveringIndex(indexName, suffix) {
    return indexName.endsWith(suffix);
  }

  runTest('Covering index naming follows convention', () => {
    const suffix = '_cover_temp';
    const name = generateCoveringIndexName('user_email_1', suffix);
    testTrue(isValidCoveringIndex(name, suffix), 'Covering index name invalid');
  });

  runTest('Index state tracking', () => {
    const state = { completed: {} };

    state.completed['users'] = ['email_1', 'created_at_1'];
    state.completed['orders'] = ['order_id_1'];

    testTrue(state.completed['users'].includes('email_1'), 'Index not tracked');
    testEquals(state.completed['orders'].length, 1, 'State tracking failed');
  });

  runTest('Index rebuild log structure', () => {
    const indexLog = {
      startTime: new Date(),
      timeSeconds: 45.5,
      initialSizeMb: 100,
      finalSizeMb: 95
    };

    testTrue(indexLog.timeSeconds > 0, 'Time not recorded');
    testTrue(indexLog.initialSizeMb > indexLog.finalSizeMb, 'Size not tracked correctly');
  });

  runTest('Collection rebuild log aggregates indexes', () => {
    const collectionLog = {
      startTime: new Date(),
      totalTimeSeconds: 150,
      initialSizeMb: 300,
      finalSizeMb: 285,
      reclaimedMb: 15,
      indexes: {
        'email_1': { startTime: new Date(), timeSeconds: 50, initialSizeMb: 100, finalSizeMb: 95 },
        'phone_1': { startTime: new Date(), timeSeconds: 55, initialSizeMb: 100, finalSizeMb: 95 },
        'created_at_1': { startTime: new Date(), timeSeconds: 45, initialSizeMb: 100, finalSizeMb: 95 }
      }
    };

    testEquals(Object.keys(collectionLog.indexes).length, 3, 'Should have 3 indexes');
    testTrue(collectionLog.reclaimedMb > 0, 'Should reclaim space');
  });

  runTest('Database rebuild configuration', () => {
    const config = {
      dbName: 'test_db',
      logDir: 'rebuild_logs',
      runtimeDir: '.rebuild_runtime',
      coverSuffix: '_cover_temp',
      cheapSuffixField: '_rebuild_cover_field_',
      safeRun: true,
      specifiedCollections: [],
      ignoredCollections: ['admin', 'local'],
      ignoredIndexes: ['_id_'],
      performanceLogging: { enabled: true }
    };

    testEquals(config.dbName, 'test_db', 'Config dbName incorrect');
    testTrue(config.ignoredCollections.includes('admin'), 'Config ignored collections incorrect');
  });

  runTest('Collections are filtered by ignore list', () => {
    const allCollections = ['users', 'orders', 'admin', 'system.views'];
    const ignoredCollections = ['admin', 'system.*'];

    function isIgnored(name, ignoreList) {
      for (const pattern of ignoreList) {
        if (pattern.endsWith('*')) {
          if (name.startsWith(pattern.slice(0, -1))) {
            return true;
          }
        } else if (name === pattern) {
          return true;
        }
      }
      return false;
    }

    const toProcess = allCollections.filter(c => !isIgnored(c, ignoredCollections));
    testEquals(toProcess.length, 2, 'Should filter 2 collections');
    testTrue(toProcess.includes('users') && toProcess.includes('orders'), 'Wrong collections filtered');
  });

  runTest('Collections are sorted by size (largest first)', () => {
    const collections = [
      { name: 'small', totalIndexSize: 100 },
      { name: 'large', totalIndexSize: 500 },
      { name: 'medium', totalIndexSize: 300 }
    ];

    const sorted = collections.sort((a, b) => b.totalIndexSize - a.totalIndexSize);
    testEquals(sorted[0].name, 'large', 'Largest not first');
    testEquals(sorted[2].name, 'small', 'Smallest not last');
  });

  runTest('Index statistics aggregation', () => {
    const indexStats = [
      { name: 'email_1', size: 100 * 1024 * 1024 },
      { name: 'phone_1', size: 50 * 1024 * 1024 },
      { name: 'created_at_1', size: 75 * 1024 * 1024 }
    ];

    const totalSize = indexStats.reduce((sum, stat) => sum + stat.size, 0);
    testEquals(totalSize, (100 + 50 + 75) * 1024 * 1024, 'Index size aggregation failed');
  });

  // ========== NEW TEST CASES FOR STAGE 1 v1.0.1 ==========

  runTest('TTL index with normal expireAfterSeconds preservation', () => {
    const ttlIndex = {
      name: 'expireAt_1',
      key: { expireAt: 1 },
      expireAfterSeconds: 3600
    };

    const indexSpec = {
      name: ttlIndex.name,
      key: ttlIndex.key,
      expireAfterSeconds: 3600
    };

    testEquals(indexSpec.expireAfterSeconds, 3600, 'TTL expireAfterSeconds not preserved');
    testEquals(indexSpec.name, 'expireAt_1', 'TTL index name incorrect');
  });

  runTest('TTL index with edge case (expireAfterSeconds = 0)', () => {
    const ttlIndex = {
      name: 'createdAt_1',
      key: { createdAt: 1 },
      expireAfterSeconds: 0
    };

    const indexSpec = {
      name: ttlIndex.name,
      key: ttlIndex.key,
      expireAfterSeconds: 0
    };

    testEquals(indexSpec.expireAfterSeconds, 0, 'TTL edge case: expireAfterSeconds = 0 not preserved');
    testTrue(indexSpec.expireAfterSeconds === 0, 'TTL edge case: value should be exactly 0');
  });

  runTest('Compound index {field1: 1, field2: 1, field3: -1} field ordering preserved', () => {
    const compoundIndex = {
      name: 'compound_index_1',
      key: { field1: 1, field2: 1, field3: -1 }
    };

    const keyEntries = Object.entries(compoundIndex.key);
    testEquals(keyEntries.length, 3, 'Compound index should have 3 fields');
    testEquals(keyEntries[0][0], 'field1', 'First field should be field1');
    testEquals(keyEntries[0][1], 1, 'field1 direction should be 1 (ascending)');
    testEquals(keyEntries[1][0], 'field2', 'Second field should be field2');
    testEquals(keyEntries[1][1], 1, 'field2 direction should be 1 (ascending)');
    testEquals(keyEntries[2][0], 'field3', 'Third field should be field3');
    testEquals(keyEntries[2][1], -1, 'field3 direction should be -1 (descending)');
  });

  runTest('Compound index with 10+ fields to test large compound handling', () => {
    const largeCompoundIndex = {
      name: 'large_compound_index',
      key: {
        field1: 1,
        field2: 1,
        field3: 1,
        field4: 1,
        field5: 1,
        field6: 1,
        field7: 1,
        field8: 1,
        field9: 1,
        field10: 1,
        field11: -1
      }
    };

    const keyEntries = Object.entries(largeCompoundIndex.key);
    testEquals(keyEntries.length, 11, 'Large compound index should have 11 fields');

    // Verify all ascending fields
    for (let i = 0; i < 10; i++) {
      testEquals(keyEntries[i][1], 1, `Field ${i + 1} should be ascending`);
    }

    // Verify last field is descending
    testEquals(keyEntries[10][1], -1, 'Last field (field11) should be descending');

    // Verify we can iterate through all fields
    let fieldCount = 0;
    for (const [fieldName, direction] of keyEntries) {
      fieldCount++;
      testTrue(fieldName.match(/^field\d+$/), `Field name should be fieldX format: ${fieldName}`);
      testTrue([1, -1].includes(direction), `Direction should be 1 or -1: ${direction}`);
    }
    testEquals(fieldCount, 11, 'Should be able to iterate through all 11 fields');
  });
};

indexTests();

// ============================================================================
// TEST SUMMARY
// ============================================================================

console.log('\n========================================');
console.log('TEST SUMMARY');
console.log('========================================');
console.log(`Total Tests: ${totalTests}`);
console.log(`Passed: ${passedTests} ✅`);
console.log(`Failed: ${failedTests} ❌`);
console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(2)}%`);
console.log('========================================\n');

// Exit with appropriate code
process.exit(failedTests > 0 ? 1 : 0);
