#!/usr/bin/env node

/**
 * Main test runner that executes all tests
 *
 * This script runs all test suites and aggregates the results
 */

const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const testFiles = [
  'test/smoke-test.js',
  'test/test-help-system.js'
];

let totalPassed = 0;
let totalFailed = 0;

async function runTests() {
  console.log('📋 MongoDB Reindexer - Test Suite Runner\n');
  console.log('='.repeat(60));
  console.log('Running all tests...\n');

  for (const testFile of testFiles) {
    console.log(`\n▶ Running: ${testFile}`);
    console.log('-'.repeat(60));

    try {
      const { stdout, stderr } = await execAsync(`node ${testFile}`, {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024
      });

      if (stdout) {
        console.log(stdout);
      }
      if (stderr && !stderr.includes('deprecated')) {
        console.error(stderr);
      }
    } catch (error) {
      console.error(`❌ Error running ${testFile}:`);
      console.error(error.message);
      totalFailed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests completed\n');
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
