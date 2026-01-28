#!/usr/bin/env node

import { Command } from 'commander';
import { MongoClient } from 'mongodb';
import { rebuildIndexes } from './index';
import { RebuildConfig } from './types';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import package.json to get version
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json');

const program = new Command();

program
  .name('mongodb-reindex')
  .description('Zero-downtime MongoDB index rebuilding with Cover-Swap-Cleanup strategy')
  .version(pkg.version);

program
  .command('rebuild')
  .description('Rebuild indexes for a database with zero downtime')
  .requiredOption('-u, --uri <uri>', 'MongoDB connection URI (or use MONGODB_URI env var)')
  .requiredOption('-d, --database <name>', 'Database name')
  .option('--log-dir <dir>', 'Directory for performance logs', 'rebuild_logs')
  .option('--runtime-dir <dir>', 'Directory for runtime state files', '.rebuild_runtime')
  .option('--cover-suffix <suffix>', 'Suffix for covering indexes', '_cover_temp')
  .option('--cheap-field <field>', 'Field name for covering indexes', '_rebuild_cover_field_')
  .option('--no-safe-run', 'Disable interactive prompts (dangerous!)')
  .option('--specified-collections <collections>', 'Comma-separated list of collections to process')
  .option('--ignored-collections <collections>', 'Comma-separated list of collections to ignore')
  .option('--ignored-indexes <indexes>', 'Comma-separated list of indexes to ignore')
  .option('--no-performance-logging', 'Disable performance logging')
  .action(async (options) => {
    let client: MongoClient | null = null;
    
    try {
      // Get URI from option or environment
      const uri = options.uri || process.env.MONGODB_URI;
      if (!uri) {
        console.error('Error: MongoDB URI is required. Provide via --uri or MONGODB_URI env var.');
        process.exit(1);
      }
      
      // Build configuration
      const config: RebuildConfig = {
        dbName: options.database,
        logDir: options.logDir,
        runtimeDir: options.runtimeDir,
        coverSuffix: options.coverSuffix,
        cheapSuffixField: options.cheapField,
        safeRun: options.safeRun,
        performanceLogging: {
          enabled: options.performanceLogging
        }
      };
      
      if (options.specifiedCollections) {
        config.specifiedCollections = options.specifiedCollections.split(',').map((s: string) => s.trim());
      }
      
      if (options.ignoredCollections) {
        config.ignoredCollections = options.ignoredCollections.split(',').map((s: string) => s.trim());
      }
      
      if (options.ignoredIndexes) {
        config.ignoredIndexes = options.ignoredIndexes.split(',').map((s: string) => s.trim());
      }
      
      // Connect to MongoDB
      console.log('Connecting to MongoDB...');
      client = new MongoClient(uri);
      await client.connect();
      console.log('✅ Connected to MongoDB');
      
      // Get the database
      const db = client.db(config.dbName);
      
      // Run the rebuild
      await rebuildIndexes(db, config);
      
      console.log('\n✅ Rebuild completed successfully');
      process.exit(0);
      
    } catch (error) {
      console.error('Fatal error:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error('Stack trace:', error.stack);
      }
      process.exit(1);
    } finally {
      if (client) {
        await client.close();
        console.log('MongoDB connection closed');
      }
    }
  });

program
  .command('cleanup')
  .description('Cleanup orphan indexes from failed operations')
  .requiredOption('-u, --uri <uri>', 'MongoDB connection URI (or use MONGODB_URI env var)')
  .requiredOption('-d, --database <name>', 'Database name')
  .option('--cover-suffix <suffix>', 'Suffix for covering indexes', '_cover_temp')
  .action(async (options) => {
    let client: MongoClient | null = null;
    
    try {
      // Get URI from option or environment
      const uri = options.uri || process.env.MONGODB_URI;
      if (!uri) {
        console.error('Error: MongoDB URI is required. Provide via --uri or MONGODB_URI env var.');
        process.exit(1);
      }
      
      // Connect to MongoDB
      console.log('Connecting to MongoDB...');
      client = new MongoClient(uri);
      await client.connect();
      console.log('✅ Connected to MongoDB');
      
      const db = client.db(options.database);
      const coverSuffix = options.coverSuffix;
      
      // Find orphaned indexes
      console.log("Checking for orphaned temporary indexes...");
      const orphanedIndexes: { collectionName: string; indexName: string }[] = [];
      const collectionsList = await db.listCollections().toArray();
      const collectionNames = collectionsList.map(c => c.name);
      
      for (const collName of collectionNames) {
        const collection = db.collection(collName);
        const indexes = await collection.indexes();
        const orphansInColl = indexes.filter(idx => idx.name && idx.name.endsWith(coverSuffix));
        
        if (orphansInColl.length > 0) {
          orphansInColl.forEach(o => {
            if (o.name) {
              orphanedIndexes.push({ collectionName: collName, indexName: o.name });
            }
          });
        }
      }
      
      if (orphanedIndexes.length === 0) {
        console.log('✅ No orphan indexes found');
        process.exit(0);
      }
      
      console.log(`Found ${orphanedIndexes.length} orphan index(es):`);
      orphanedIndexes.forEach(o => 
        console.log(`  - Collection: "${o.collectionName}", Index: "${o.indexName}"`)
      );
      
      // Clean up
      for (const orphan of orphanedIndexes) {
        await db.collection(orphan.collectionName).dropIndex(orphan.indexName);
        console.log(`  ✅ Dropped: "${orphan.indexName}" from "${orphan.collectionName}"`);
      }
      
      console.log(`✅ Cleaned up ${orphanedIndexes.length} orphan index(es)`);
      process.exit(0);
      
    } catch (error) {
      console.error('Fatal error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    } finally {
      if (client) {
        await client.close();
        console.log('MongoDB connection closed');
      }
    }
  });

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
