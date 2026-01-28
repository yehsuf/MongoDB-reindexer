#!/usr/bin/env node

/**
 * Interactive test for the help system
 * 
 * This script demonstrates the new help functionality in interactive prompts.
 * Run this to see how the help system works without needing a MongoDB connection.
 */

const { promptUser } = require('../dist/utils');

async function testHelp() {
  console.log('=== Testing Help System for Interactive Prompts ===\n');
  console.log('This demonstrates the built-in help for user input stages.');
  console.log('Try typing "help", "h", or "?" at any prompt to see available options.\n');

  // Test 1: Simple yes/no prompt with help
  console.log('\n--- Test 1: Simple Decision ---');
  const [choice1, word1] = await promptUser(
    'Do you want to continue? (y/n): ',
    ['yes', 'no'],
    [
      { value: 'yes', description: 'Continue with the operation' },
      { value: 'no', description: 'Abort and exit' }
    ]
  );
  console.log(`You chose: ${word1} (${choice1})\n`);

  // Test 2: Multi-option prompt with help
  console.log('\n--- Test 2: Multiple Options ---');
  const [choice2, word2] = await promptUser(
    'How would you like to proceed? (yes/no/specify) [y/n/s]: ',
    ['yes', 'no', 'specify'],
    [
      { value: 'yes', description: 'Process all items automatically' },
      { value: 'no', description: 'Skip all and continue' },
      { value: 'specify', description: 'Choose items individually' }
    ]
  );
  console.log(`You chose: ${word2} (${choice2})\n`);

  console.log('\n✅ Help system test complete!');
  console.log('\nKey features demonstrated:');
  console.log('  - Type "help", "h", or "?" at any prompt');
  console.log('  - Contextual help explains each option');
  console.log('  - Help shows without interrupting workflow');
  console.log('  - Clear descriptions for each choice');
}

// Run the test
testHelp().catch(console.error);
