import { MongoClient } from 'mongodb';
import { rebuildIndexes } from '../src';
import { RebuildConfig } from '../src/types';

/**
 * Example 1: Basic database rebuild
 *
 * This example demonstrates how to rebuild all non-unique indexes
 * in a database with default settings.
 */
async function basicExample() {
  console.log('=== Basic Database Rebuild Example ===\n');

  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');

  try {
    await client.connect();
    const db = client.db('testdb');

    const config: RebuildConfig = {
      dbName: 'testdb',
      safeRun: false,  // Disable interactive prompts for this example
      performanceLogging: {
        enabled: true
      }
    };

    const result = await rebuildIndexes(db, config);

    console.log('\n✓ Success!');
    console.log(`  Duration: ${result.totalTimeSeconds.toFixed(2)}s`);
    console.log(`  Space Reclaimed: ${result.totalReclaimedMb.toFixed(2)} MB`);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

/**
 * Example 2: Rebuild with collection filtering
 *
 * This example demonstrates how to rebuild indexes only for specific collections.
 */
async function filteredCollectionsExample() {
  console.log('=== Filtered Collections Rebuild Example ===\n');

  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');

  try {
    await client.connect();
    const db = client.db('testdb');

    const config: RebuildConfig = {
      dbName: 'testdb',
      specifiedCollections: ['users', 'orders'],  // Only these collections
      safeRun: false,
      logDir: './custom_logs',
      performanceLogging: {
        enabled: true
      }
    };

    const result = await rebuildIndexes(db, config);

    console.log('\n✓ Success!');
    console.log(`  Collections Processed: ${Object.keys(result.collections).length}`);
    console.log(`  Duration: ${result.totalTimeSeconds.toFixed(2)}s`);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

/**
 * Example 3: Rebuild with wildcard ignores
 *
 * This example demonstrates using wildcard patterns to ignore collections and indexes.
 */
async function wildcardIgnoreExample() {
  console.log('=== Wildcard Ignore Rebuild Example ===\n');

  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');

  try {
    await client.connect();
    const db = client.db('testdb');

    const config: RebuildConfig = {
      dbName: 'testdb',
      ignoredCollections: ['system.*', 'temp_*'],  // Ignore system and temp collections
      ignoredIndexes: ['_id_', 'unique_*'],        // Ignore _id and unique indexes
      safeRun: false,
      performanceLogging: {
        enabled: true
      }
    };

    const result = await rebuildIndexes(db, config);

    console.log('\n✓ Success!');
    console.log(`  Duration: ${result.totalTimeSeconds.toFixed(2)}s`);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

/**
 * Example 4: Interactive mode with safe run
 *
 * This example demonstrates the interactive mode where the user
 * is prompted to confirm each operation.
 */
async function interactiveModeExample() {
  console.log('=== Interactive Mode Rebuild Example ===\n');

  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');

  try {
    await client.connect();
    const db = client.db('testdb');

    const config: RebuildConfig = {
      dbName: 'testdb',
      safeRun: true,  // Enable interactive prompts
      performanceLogging: {
        enabled: true
      }
    };

    // User will be prompted to confirm:
    // - Which collections to process
    // - Which indexes to rebuild
    // - Cleanup operations
    const result = await rebuildIndexes(db, config);

    console.log('\n✓ Success!');
    console.log(`  Duration: ${result.totalTimeSeconds.toFixed(2)}s`);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

/**
 * Example 5: Cleanup orphan indexes programmatically
 *
 * This example demonstrates how to find and clean up orphaned indexes.
 */
async function cleanupOrphansExample() {
  console.log('=== Cleanup Orphan Indexes Example ===\n');

  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');

  try {
    await client.connect();
    const db = client.db('testdb');

    // Find orphaned indexes
    const collections = await db.listCollections().toArray();
    const coverSuffix = '_cover_temp';
    let orphanCount = 0;

    for (const collInfo of collections) {
      const collection = db.collection(collInfo.name);
      const indexes = await collection.indexes();
      const orphans = indexes.filter(idx =>
        idx.name && idx.name.endsWith(coverSuffix)
      );

      for (const orphan of orphans) {
        if (orphan.name) {
          console.log(`  Dropping orphan: ${collInfo.name}.${orphan.name}`);
          await collection.dropIndex(orphan.name);
          orphanCount++;
        }
      }
    }

    if (orphanCount > 0) {
      console.log(`\n✓ Cleaned up ${orphanCount} orphan index(es)`);
    } else {
      console.log('\n✓ No orphan indexes found');
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Main execution
const example = process.argv[2] || 'basic';

switch (example) {
  case 'basic':
    basicExample();
    break;
  case 'filtered':
    filteredCollectionsExample();
    break;
  case 'wildcard':
    wildcardIgnoreExample();
    break;
  case 'interactive':
    interactiveModeExample();
    break;
  case 'cleanup':
    cleanupOrphansExample();
    break;
  default:
    console.error('Unknown example. Available options: basic, filtered, wildcard, interactive, cleanup');
    process.exit(1);
}

