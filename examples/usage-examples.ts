import { MongoDBReindexer, ReindexerConfig } from '../src/index';

/**
 * Example: Basic index rebuild
 * 
 * This example demonstrates how to rebuild a simple index with default settings.
 */
async function basicExample() {
  console.log('=== Basic Index Rebuild Example ===\n');

  const config: ReindexerConfig = {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    database: 'testdb',
    collection: 'users',
    indexSpec: { email: 1 },
    verbose: true
  };

  const reindexer = new MongoDBReindexer(config);
  
  try {
    const result = await reindexer.reindex();
    
    if (result.success) {
      console.log('\n✓ Success!');
      console.log(`  Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
      console.log(`  Details: ${result.details}`);
    } else {
      console.error('\n✗ Failed!');
      console.error(`  Error: ${result.error}`);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

/**
 * Example: Unique index rebuild
 * 
 * This example demonstrates how to rebuild a unique index with custom options.
 */
async function uniqueIndexExample() {
  console.log('=== Unique Index Rebuild Example ===\n');

  const config: ReindexerConfig = {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    database: 'testdb',
    collection: 'users',
    indexSpec: { username: 1 },
    indexOptions: {
      unique: true,
      sparse: true
    },
    verbose: true,
    maxVerificationRetries: 15,
    verificationRetryDelayMs: 3000
  };

  const reindexer = new MongoDBReindexer(config);
  
  try {
    const result = await reindexer.reindex();
    
    if (result.success) {
      console.log('\n✓ Success!');
      console.log(`  Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
    } else {
      console.error('\n✗ Failed!');
      console.error(`  Error: ${result.error}`);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

/**
 * Example: Compound index rebuild
 * 
 * This example demonstrates how to rebuild a compound index.
 */
async function compoundIndexExample() {
  console.log('=== Compound Index Rebuild Example ===\n');

  const config: ReindexerConfig = {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    database: 'testdb',
    collection: 'orders',
    indexSpec: {
      customerId: 1,
      orderDate: -1
    },
    verbose: true
  };

  const reindexer = new MongoDBReindexer(config);
  
  try {
    const result = await reindexer.reindex();
    
    if (result.success) {
      console.log('\n✓ Success!');
      console.log(`  Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
    } else {
      console.error('\n✗ Failed!');
      console.error(`  Error: ${result.error}`);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

/**
 * Example: Cleanup orphan indexes
 * 
 * This example demonstrates how to clean up orphan indexes from failed operations.
 */
async function cleanupExample() {
  console.log('=== Cleanup Orphan Indexes Example ===\n');

  const config: ReindexerConfig = {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    database: 'testdb',
    collection: 'users',
    indexSpec: {}, // Not used for cleanup
    verbose: true
  };

  const reindexer = new MongoDBReindexer(config);
  
  try {
    const orphans = await reindexer.cleanupOrphans();
    
    if (orphans.length > 0) {
      console.log(`\n✓ Cleaned up ${orphans.length} orphan index(es):`);
      orphans.forEach(name => console.log(`  - ${name}`));
    } else {
      console.log('\n✓ No orphan indexes found');
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Main execution
const example = process.argv[2] || 'basic';

switch (example) {
  case 'basic':
    basicExample();
    break;
  case 'unique':
    uniqueIndexExample();
    break;
  case 'compound':
    compoundIndexExample();
    break;
  case 'cleanup':
    cleanupExample();
    break;
  default:
    console.error('Unknown example. Available options: basic, unique, compound, cleanup');
    process.exit(1);
}
