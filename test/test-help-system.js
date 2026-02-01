#!/usr/bin/env node

/**
 * Interactive test for the help system
 * 
 * This script demonstrates the new help functionality in interactive prompts
 * using JSON configuration files from the help/prompts directory.
 * Run this to see how the help system works without needing a MongoDB connection.
 */

const { promptUser } = require('../dist/utils');

async function testHelp() {
  console.log('=== Testing JSON-Based Help System for Interactive Prompts ===\n');
  console.log('This demonstrates the built-in help system that loads from JSON files.');
  console.log('Try typing "help", "h", or "?" at any prompt to see available options.\n');
  console.log('Help files are loaded from: help/prompts/*.json\n');

  // Test 1: Cleanup prompt (uses cleanup.json)
  console.log('\n--- Test 1: Cleanup Prompt (uses cleanup.json) ---');
  const [choice1, word1] = await promptUser(
    'Proceed with cleanup? (y/n): ',
    ['yes', 'no'],
    'cleanup'  // Loads help/prompts/cleanup.json
  );
  console.log(`You chose: ${word1} (${choice1})\n`);

  // Test 2: Collections prompt (uses collections.json)
  console.log('\n--- Test 2: Collections Prompt (uses collections.json) ---');
  const [choice2, word2] = await promptUser(
    'Proceed with these collections? (yes/no/specify) [y/n/s]: ',
    ['yes', 'no', 'specify'],
    'collections'  // Loads help/prompts/collections.json
  );
  console.log(`You chose: ${word2} (${choice2})\n`);

  // Test 3: Inline help (backward compatibility)
  console.log('\n--- Test 3: Inline Help (backward compatibility) ---');
  const [choice3, word3] = await promptUser(
    'Use inline help? (y/n): ',
    ['yes', 'no'],
    [
      { value: 'yes', description: 'Uses inline help definition' },
      { value: 'no', description: 'Skips this test' }
    ]
  );
  console.log(`You chose: ${word3} (${choice3})\n`);

  console.log('\n✅ Help system test complete!');
  console.log('\nKey features demonstrated:');
  console.log('  ✓ Type "help", "h", or "?" at any prompt');
  console.log('  ✓ Help loaded from JSON configuration files');
  console.log('  ✓ Contextual help explains each option with details');
  console.log('  ✓ Help shows without interrupting workflow');
  console.log('  ✓ Backward compatible with inline help arrays');
  console.log('\nHelp files location: help/prompts/');
  console.log('  - cleanup.json');
  console.log('  - collections.json');
  console.log('  - collection-specify.json');
  console.log('  - indexes.json');
  console.log('  - index-specify.json');
}

// Run the test
testHelp().catch(console.error);
