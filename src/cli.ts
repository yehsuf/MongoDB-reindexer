#!/usr/bin/env node

import { Command } from 'commander';
import { MongoClient } from 'mongodb';
import { rebuildIndexes, cleanupOrphanedIndexes } from './index';
import { RebuildConfig } from './types';
import { DEFAULT_CONFIG } from './constants';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables
dotenv.config();

// Import package.json to get version
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

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
  .option('--log-dir <dir>', 'Directory for performance logs', DEFAULT_CONFIG.LOG_DIR)
  .option('--runtime-dir <dir>', 'Directory for runtime state files', DEFAULT_CONFIG.RUNTIME_DIR)
  .option('--cover-suffix <suffix>', 'Suffix for covering indexes', DEFAULT_CONFIG.COVER_SUFFIX)
  .option('--cheap-field <field>', 'Field name for covering indexes', DEFAULT_CONFIG.CHEAP_SUFFIX_FIELD)
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
  .option('--cover-suffix <suffix>', 'Suffix for covering indexes', DEFAULT_CONFIG.COVER_SUFFIX)
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

      // Create config for cleanup function
      const config: RebuildConfig = {
        dbName: options.database,
        coverSuffix,
        safeRun: true  // Always use safe mode in CLI cleanup
      };

      // Use the shared cleanup function
      await cleanupOrphanedIndexes(db, config);

      console.log('✅ Cleanup completed successfully');
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
