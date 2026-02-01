#!/usr/bin/env node

/**
 * Smoke tests for MongoDB Reindexer
 *
 * These tests verify that the code structure is correct and all modules
 * can be imported without errors. They don't require a MongoDB connection.
 */

console.log('Running smoke tests...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    failed++;
  }
}

// Test 1: Import main module
test('Import main module', () => {
  const { rebuildIndexes } = require('../dist/index');
  if (!rebuildIndexes) throw new Error('rebuildIndexes not exported');
});

// Test 2: Import cleanupOrphanedIndexes
test('Import cleanupOrphanedIndexes', () => {
  const { cleanupOrphanedIndexes } = require('../dist/index');
  if (!cleanupOrphanedIndexes) throw new Error('cleanupOrphanedIndexes not exported');
});

// Test 3: Import Logger utilities
test('Import Logger utilities', () => {
  const { getLogger, setLogger, ConsoleLogger, SilentLogger } = require('../dist/index');
  if (!getLogger) throw new Error('getLogger not exported');
  if (!setLogger) throw new Error('setLogger not exported');
  if (!ConsoleLogger) throw new Error('ConsoleLogger not exported');
  if (!SilentLogger) throw new Error('SilentLogger not exported');
});

// Test 4: Import types
test('Import types', () => {
  const types = require('../dist/types');
  if (!types.VALID_INDEX_OPTIONS) throw new Error('VALID_INDEX_OPTIONS not exported');
});

// Test 5: Create ConsoleLogger instance
test('Create ConsoleLogger instance', () => {
  const { ConsoleLogger } = require('../dist/index');
  const logger = new ConsoleLogger(false);
  if (!logger) throw new Error('Failed to create ConsoleLogger instance');
});

// Test 6: Create SilentLogger instance
test('Create SilentLogger instance', () => {
  const { SilentLogger } = require('../dist/index');
  const logger = new SilentLogger();
  if (!logger) throw new Error('Failed to create SilentLogger instance');
});

// Test 7: Logger methods exist
test('Logger methods exist', () => {
  const { ConsoleLogger } = require('../dist/index');
  const logger = new ConsoleLogger(false);
  if (typeof logger.info !== 'function') throw new Error('logger.info not a function');
  if (typeof logger.warn !== 'function') throw new Error('logger.warn not a function');
  if (typeof logger.error !== 'function') throw new Error('logger.error not a function');
  if (typeof logger.debug !== 'function') throw new Error('logger.debug not a function');
});

// Test 8: Verify CLI exists
test('Verify CLI exists', () => {
  const fs = require('fs');
  const path = require('path');
  const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
  if (!fs.existsSync(cliPath)) {
    throw new Error('CLI file not found');
  }
});

// Test 9: Verify default exports exist
test('Verify default constants', () => {
  const constants = require('../dist/constants');
  if (!constants.DEFAULT_CONFIG) throw new Error('DEFAULT_CONFIG not found');
  if (!constants.FILE_CONSTANTS) throw new Error('FILE_CONSTANTS not found');
  if (!constants.MONGO_CONSTANTS) throw new Error('MONGO_CONSTANTS not found');
});

// Test 10: Verify file utilities exist
test('Verify file utilities', () => {
  const fileUtils = require('../dist/file-utils');
  if (typeof fileUtils.ensureDir !== 'function') throw new Error('ensureDir not found');
  if (typeof fileUtils.readJsonFile !== 'function') throw new Error('readJsonFile not found');
  if (typeof fileUtils.writeJsonFile !== 'function') throw new Error('writeJsonFile not found');
});

// Print summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`Total: ${passed + failed}`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
