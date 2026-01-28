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
  const { MongoDBReindexer } = require('../dist/index');
  if (!MongoDBReindexer) throw new Error('MongoDBReindexer not exported');
});

// Test 2: Import types
test('Import types', () => {
  const { ReindexState } = require('../dist/index');
  if (!ReindexState) throw new Error('ReindexState not exported');
});

// Test 3: Import IndexOperations
test('Import IndexOperations', () => {
  const { IndexOperations } = require('../dist/index');
  if (!IndexOperations) throw new Error('IndexOperations not exported');
});

// Test 4: Import StateManager
test('Import StateManager', () => {
  const { StateManager } = require('../dist/index');
  if (!StateManager) throw new Error('StateManager not exported');
});

// Test 5: Import Logger
test('Import Logger', () => {
  const { Logger } = require('../dist/utils/logger');
  if (!Logger) throw new Error('Logger not exported');
});

// Test 6: Create Logger instance
test('Create Logger instance', () => {
  const { Logger } = require('../dist/utils/logger');
  const logger = new Logger(false);
  logger.info('Test message');
  logger.debug('Debug message');
  logger.warn('Warning message');
});

// Test 7: Create MongoDBReindexer instance (without connecting)
test('Create MongoDBReindexer instance', () => {
  const { MongoDBReindexer } = require('../dist/index');
  const reindexer = new MongoDBReindexer({
    uri: 'mongodb://localhost:27017',
    database: 'test',
    collection: 'test',
    indexSpec: { field: 1 }
  });
  if (!reindexer) throw new Error('Failed to create reindexer instance');
});

// Test 8: Verify ReindexState enum values
test('Verify ReindexState enum', () => {
  const { ReindexState } = require('../dist/index');
  const expectedStates = [
    'INITIAL', 'COVERING', 'COVERED', 'SWAPPING', 
    'SWAPPED', 'CLEANING', 'COMPLETED', 'FAILED'
  ];
  for (const state of expectedStates) {
    if (!ReindexState[state]) {
      throw new Error(`ReindexState.${state} not found`);
    }
  }
});

// Test 9: Verify CLI exists
test('Verify CLI exists', () => {
  const fs = require('fs');
  const path = require('path');
  const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
  if (!fs.existsSync(cliPath)) {
    throw new Error('CLI file not found');
  }
});

// Test 10: Check package.json configuration
test('Verify package.json configuration', () => {
  const pkg = require('../package.json');
  if (!pkg.bin || !pkg.bin['mongodb-reindex']) {
    throw new Error('CLI bin not configured in package.json');
  }
  if (pkg.main !== 'dist/index.js') {
    throw new Error('Main entry point incorrect');
  }
  if (pkg.types !== 'dist/index.d.ts') {
    throw new Error('Types entry point incorrect');
  }
});

console.log('\n' + '='.repeat(50));
console.log(`Tests completed: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
