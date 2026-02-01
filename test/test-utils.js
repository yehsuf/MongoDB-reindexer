/**
 * Shared test utilities
 *
 * Common functions and helpers used across all test files
 */

let passed = 0;
let failed = 0;

/**
 * Run a test case
 * @param {string} name - Test name/description
 * @param {Function} fn - Test function
 */
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

/**
 * Print test summary
 * @param {string} testName - Name of test suite
 */
function printSummary(testName) {
  console.log('\n' + '='.repeat(50));
  console.log(`${testName}: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
}

/**
 * Reset counters for a new test suite
 */
function resetCounters() {
  passed = 0;
  failed = 0;
}

/**
 * Get test results
 * @returns {Object} Object with passed and failed counts
 */
function getResults() {
  return { passed, failed };
}

module.exports = {
  test,
  printSummary,
  resetCounters,
  getResults
};
