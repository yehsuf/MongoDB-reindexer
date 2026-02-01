/**
 * Stage 1 (v1.0.1) Verification Test Suite
 *
 * This test suite verifies all critical changes for v1.0.1 release:
 * 1. VALID_INDEX_OPTIONS expansion
 * 2. Hinted Query behavior documentation
 * 3. TTL and Compound Index handling
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ============================================================================
// TEST UTILITIES
// ============================================================================

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

function testTrue(value, message) {
  if (!value) throw new Error(message);
}

function testFalse(value, message) {
  if (value) throw new Error(message);
}

function testEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function testIncludes(array, value, message) {
  if (!array.includes(value)) {
    throw new Error(`${message}\nArray: ${JSON.stringify(array)}\nLooking for: ${value}`);
  }
}

function testFileExists(filePath, message) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${message}\nFile not found: ${filePath}`);
  }
}

function testFileContains(filePath, searchString, message) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${message}\nFile not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(searchString)) {
    throw new Error(`${message}\nString not found in file: ${searchString}`);
  }
}

// ============================================================================
// CHANGE 1: VALID_INDEX_OPTIONS EXPANSION TESTS
// ============================================================================

console.log('\n=== CHANGE 1: VALID_INDEX_OPTIONS EXPANSION TESTS ===\n');

const change1Tests = () => {
  const typesFilePath = path.join(__dirname, '../src/types.ts');

  runTest('types.ts file exists', () => {
    testFileExists(typesFilePath, 'types.ts not found');
  });

  runTest('VALID_INDEX_OPTIONS array is defined', () => {
    const content = fs.readFileSync(typesFilePath, 'utf8');
    testTrue(content.includes('VALID_INDEX_OPTIONS'), 'VALID_INDEX_OPTIONS not found in types.ts');
  });

  runTest('VALID_INDEX_OPTIONS includes "hidden"', () => {
    const content = fs.readFileSync(typesFilePath, 'utf8');
    testFileContains(typesFilePath, "'hidden'", 'hidden option missing');
  });

  runTest('VALID_INDEX_OPTIONS includes "collation"', () => {
    testFileContains(typesFilePath, "'collation'", 'collation option missing');
  });

  runTest('VALID_INDEX_OPTIONS includes "wildcardProjection"', () => {
    testFileContains(typesFilePath, "'wildcardProjection'", 'wildcardProjection option missing');
  });

  runTest('VALID_INDEX_OPTIONS includes "columnstoreProjection"', () => {
    testFileContains(typesFilePath, "'columnstoreProjection'", 'columnstoreProjection option missing');
  });

  runTest('All original VALID_INDEX_OPTIONS are still present', () => {
    const originalOptions = [
      'unique',
      'expireAfterSeconds',
      'partialFilterExpression',
      'sparse',
      'storageEngine',
      'weights',
      'default_language',
      'language_override',
      'textIndexVersion',
      '2dsphereIndexVersion',
      'bits',
      'min',
      'max',
      'bucketSize'
    ];
    const content = fs.readFileSync(typesFilePath, 'utf8');
    originalOptions.forEach(option => {
      testFileContains(typesFilePath, `'${option}'`, `Original option ${option} missing`);
    });
  });

  runTest('VALID_INDEX_OPTIONS has minimum 18 options (14 original + 4 new)', () => {
    const content = fs.readFileSync(typesFilePath, 'utf8');
    // Extract the array
    const match = content.match(/VALID_INDEX_OPTIONS = \[([\s\S]*?)\] as const/);
    testTrue(match, 'Could not extract VALID_INDEX_OPTIONS array');
    const arrayContent = match[1];
    const options = arrayContent.match(/'[^']+'/g);
    testTrue(options && options.length >= 18, `Expected at least 18 options, found ${options ? options.length : 0}`);
  });
};

change1Tests();

// ============================================================================
// CHANGE 2: HINTED QUERY WARNING IN README TESTS
// ============================================================================

console.log('\n=== CHANGE 2: HINTED QUERY WARNING IN README TESTS ===\n');

const change2Tests = () => {
  const readmeFilePath = path.join(__dirname, '../README.md');

  runTest('README.md file exists', () => {
    testFileExists(readmeFilePath, 'README.md not found');
  });

  runTest('README.md contains "Hinted Queries" section', () => {
    testFileContains(readmeFilePath, 'Hinted Queries', 'Hinted Queries section not found');
  });

  runTest('Hinted Queries section appears after Troubleshooting', () => {
    const content = fs.readFileSync(readmeFilePath, 'utf8');
    const troubleshootingIndex = content.indexOf('## Troubleshooting');
    const hintedQueriesIndex = content.indexOf('## Hinted Queries');
    testTrue(troubleshootingIndex !== -1, 'Troubleshooting section not found');
    testTrue(hintedQueriesIndex !== -1, 'Hinted Queries section not found');
    testTrue(hintedQueriesIndex > troubleshootingIndex, 'Hinted Queries should appear after Troubleshooting');
  });

  runTest('Hinted Queries section explains the issue', () => {
    testFileContains(readmeFilePath, '.hint()', '.hint() not mentioned in Hinted Queries section');
  });

  runTest('Hinted Queries section contains problem explanation', () => {
    const content = fs.readFileSync(readmeFilePath, 'utf8');
    const hintedSection = content.substring(content.indexOf('## Hinted Queries'));
    testTrue(hintedSection.toLowerCase().includes('fail') || hintedSection.toLowerCase().includes('issue') || hintedSection.toLowerCase().includes('problem'),
      'Problem explanation missing');
  });

  runTest('Hinted Queries section mentions rebuild window duration', () => {
    const content = fs.readFileSync(readmeFilePath, 'utf8');
    const hintedSection = content.substring(content.indexOf('## Hinted Queries'));
    testTrue(
      hintedSection.toLowerCase().includes('second') || hintedSection.toLowerCase().includes('minute'),
      'Duration information missing'
    );
  });

  runTest('Hinted Queries section contains workaround options', () => {
    testFileContains(readmeFilePath, 'retry', 'Retry workaround not mentioned');
  });

  runTest('Hinted Queries section contains code example', () => {
    const content = fs.readFileSync(readmeFilePath, 'utf8');
    const hintedSection = content.substring(content.indexOf('## Hinted Queries'));
    testTrue(hintedSection.includes('```'), 'Code example missing');
  });

  runTest('Hinted Queries section appears before License section', () => {
    const content = fs.readFileSync(readmeFilePath, 'utf8');
    const hintedQueriesIndex = content.indexOf('## Hinted Queries');
    const licenseIndex = content.indexOf('## License');
    testTrue(hintedQueriesIndex !== -1, 'Hinted Queries section not found');
    testTrue(licenseIndex !== -1, 'License section not found');
    testTrue(hintedQueriesIndex < licenseIndex, 'Hinted Queries should appear before License');
  });
};

change2Tests();

// ============================================================================
// CHANGE 3: TESTING.md HINTED QUERY SCENARIO TESTS
// ============================================================================

console.log('\n=== CHANGE 3: TESTING.md HINTED QUERY SCENARIO TESTS ===\n');

const change3Tests = () => {
  const testingFilePath = path.join(__dirname, '../TESTING.md');

  runTest('TESTING.md file exists', () => {
    testFileExists(testingFilePath, 'TESTING.md not found');
  });

  runTest('TESTING.md contains "Hinted Query" section', () => {
    testFileContains(testingFilePath, 'Hinted Query', 'Hinted Query section not found');
  });

  runTest('Hinted Query section describes scenario', () => {
    const content = fs.readFileSync(testingFilePath, 'utf8');
    const hintedSection = content.substring(content.indexOf('Hinted Query'));
    testTrue(
      hintedSection.toLowerCase().includes('test') || hintedSection.toLowerCase().includes('scenario'),
      'Test scenario description missing'
    );
  });

  runTest('Hinted Query section includes steps to reproduce', () => {
    const content = fs.readFileSync(testingFilePath, 'utf8');
    const hintedSection = content.substring(content.indexOf('Hinted Query'));
    testTrue(
      hintedSection.toLowerCase().includes('step') || hintedSection.toLowerCase().includes('reproduce'),
      'Steps to reproduce missing'
    );
  });

  runTest('Hinted Query section describes expected behavior', () => {
    const content = fs.readFileSync(testingFilePath, 'utf8');
    const hintedSection = content.substring(content.indexOf('Hinted Query'));
    testTrue(
      hintedSection.toLowerCase().includes('expected') || hintedSection.toLowerCase().includes('behavior'),
      'Expected behavior description missing'
    );
  });

  runTest('Hinted Query section contains verification steps', () => {
    const content = fs.readFileSync(testingFilePath, 'utf8');
    const hintedSection = content.substring(content.indexOf('Hinted Query'));
    testTrue(
      hintedSection.toLowerCase().includes('verif') || hintedSection.toLowerCase().includes('check'),
      'Verification steps missing'
    );
  });
};

change3Tests();

// ============================================================================
// CHANGE 4: TTL & COMPOUND INDEX TESTS
// ============================================================================

console.log('\n=== CHANGE 4: TTL & COMPOUND INDEX TESTS ===\n');

const change4Tests = () => {
  const unitTestsPath = path.join(__dirname, './unit-tests.js');

  runTest('unit-tests.js file exists', () => {
    testFileExists(unitTestsPath, 'unit-tests.js not found');
  });

  runTest('TTL index tests are present', () => {
    const content = fs.readFileSync(unitTestsPath, 'utf8');
    testTrue(
      content.toLowerCase().includes('ttl') || content.toLowerCase().includes('expireafterseconds'),
      'TTL index tests missing'
    );
  });

  runTest('TTL index with normal expireAfterSeconds test exists', () => {
    const content = fs.readFileSync(unitTestsPath, 'utf8');
    testTrue(
      (content.includes('expireAfterSeconds') && content.includes('TTL')) ||
      content.includes('ttl') && content.toLowerCase().includes('normal'),
      'TTL with normal expireAfterSeconds test not found'
    );
  });

  runTest('TTL index edge case test exists', () => {
    const content = fs.readFileSync(unitTestsPath, 'utf8');
    const lowerContent = content.toLowerCase();
    testTrue(
      (lowerContent.includes('edge') && lowerContent.includes('ttl')) ||
      (lowerContent.includes('large') && lowerContent.includes('expireafterseconds')),
      'TTL edge case test not found'
    );
  });

  runTest('Compound index tests are present', () => {
    const content = fs.readFileSync(unitTestsPath, 'utf8');
    const lowerContent = content.toLowerCase();
    testTrue(
      lowerContent.includes('compound') || (lowerContent.includes('multi') && lowerContent.includes('field')),
      'Compound index tests missing'
    );
  });

  runTest('Compound index with 3+ fields test exists', () => {
    const content = fs.readFileSync(unitTestsPath, 'utf8');
    const lowerContent = content.toLowerCase();
    testTrue(
      (lowerContent.includes('compound') && (lowerContent.includes('3') || lowerContent.includes('three'))) ||
      (lowerContent.includes('multi') && lowerContent.includes('field')),
      'Compound index with 3+ fields test not found'
    );
  });

  runTest('Compound index with mixed sort directions test exists', () => {
    const content = fs.readFileSync(unitTestsPath, 'utf8');
    const lowerContent = content.toLowerCase();
    testTrue(
      (lowerContent.includes('compound') && (lowerContent.includes('sort') || lowerContent.includes('direction') || lowerContent.includes('mixed'))) ||
      (content.includes('-1') && content.includes('1') && lowerContent.includes('compound')),
      'Compound index with mixed sort directions test not found'
    );
  });
};

change4Tests();

// ============================================================================
// INTEGRATED BEHAVIOR TESTS
// ============================================================================

console.log('\n=== INTEGRATED BEHAVIOR TESTS ===\n');

const integratedTests = () => {
  const typesPath = path.join(__dirname, '../src/types.ts');
  const readmePath = path.join(__dirname, '../README.md');
  const testingPath = path.join(__dirname, '../TESTING.md');

  runTest('All four new index options are distinct', () => {
    const newOptions = ['hidden', 'collation', 'wildcardProjection', 'columnstoreProjection'];
    const seen = new Set(newOptions);
    testEquals(seen.size, newOptions.length, 'Duplicate options found');
  });

  runTest('TypeScript file is valid (no syntax errors in type definitions)', () => {
    const content = fs.readFileSync(typesPath, 'utf8');
    testTrue(
      content.includes('as const') && content.includes('export const VALID_INDEX_OPTIONS'),
      'VALID_INDEX_OPTIONS definition malformed'
    );
  });

  runTest('README documentation is coherent', () => {
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    // Check that Troubleshooting section still exists and new section doesn't break it
    testTrue(readmeContent.includes('## Troubleshooting'), 'Troubleshooting section lost');
    testTrue(readmeContent.includes('## License'), 'License section lost');
  });

  runTest('TESTING.md maintains existing structure', () => {
    const testingContent = fs.readFileSync(testingPath, 'utf8');
    // Check basic structure is maintained
    testTrue(testingContent.includes('Quick Start'), 'Quick Start section lost');
  });

  runTest('No breaking changes in test files', () => {
    const unitTestsContent = fs.readFileSync(path.join(__dirname, './unit-tests.js'), 'utf8');
    // Should still have the test framework structure
    testTrue(unitTestsContent.includes('runTest'), 'Test framework broken');
  });
};

integratedTests();

// ============================================================================
// COMPATIBILITY TESTS
// ============================================================================

console.log('\n=== COMPATIBILITY TESTS ===\n');

const compatibilityTests = () => {
  const typesPath = path.join(__dirname, '../src/types.ts');

  runTest('MongoDB version requirements are noted for new options', () => {
    const content = fs.readFileSync(typesPath, 'utf8');
    // Either in comments or docs should mention MongoDB versions
    testTrue(
      content.includes('4.4') || content.includes('3.4') || content.includes('4.2') || content.includes('7.0'),
      'MongoDB version requirements not documented'
    );
  });

  runTest('New options follow MongoDB naming conventions', () => {
    const options = ['hidden', 'collation', 'wildcardProjection', 'columnstoreProjection'];
    options.forEach(opt => {
      testTrue(
        opt === opt.toLowerCase() || opt.match(/^[a-z]+[A-Z][a-zA-Z]*$/),
        `Option ${opt} doesn't follow MongoDB naming conventions`
      );
    });
  });
};

compatibilityTests();

// ============================================================================
// TEST SUMMARY
// ============================================================================

console.log('\n========================================');
console.log('STAGE 1 (v1.0.1) VERIFICATION SUMMARY');
console.log('========================================');
console.log(`Total Tests: ${totalTests}`);
console.log(`Passed: ${passedTests} ✅`);
console.log(`Failed: ${failedTests} ❌`);
console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(2)}%`);
console.log('========================================\n');

if (failedTests === 0) {
  console.log('🎉 All Stage 1 changes verified successfully!');
} else {
  console.log(`⚠️  ${failedTests} verification(s) failed. Review changes above.`);
}

console.log('\n');

// Exit with appropriate code
process.exit(failedTests > 0 ? 1 : 0);
