#!/usr/bin/env node

import { Command } from 'commander';
import { MongoClient } from 'mongodb';
import { rebuildIndexes, cleanupOrphanedIndexes } from './index.js';
import { RebuildConfig } from './types.js';
import { DEFAULT_CONFIG } from './constants.js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getLogger, setLogger, ConsoleLogger } from './logger.js';

// Load environment variables
dotenv.config();

// ES module compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import package.json to get version
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

/**
 * Get and validate MongoDB URI from options or environment
 */
function getAndValidateUri(options: any): string {
  const uri = options.uri || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MongoDB URI is required. Provide via --uri or MONGODB_URI env var.');
    process.exit(1);
  }
  return uri;
}

/**
 * Parse comma-separated string into trimmed array
 */
function parseCommaSeparated(value?: string): string[] {
  return value ? value.split(',').map(s => s.trim()) : [];
}

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
      // Initialize logger
      setLogger(new ConsoleLogger(process.env.DEBUG === 'true'));

      // Get and validate URI
      const uri = getAndValidateUri(options);

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

      config.specifiedCollections = parseCommaSeparated(options.specifiedCollections);
      config.ignoredCollections = parseCommaSeparated(options.ignoredCollections);
      config.ignoredIndexes = parseCommaSeparated(options.ignoredIndexes);

      // Connect to MongoDB
      getLogger().info('Connecting to MongoDB...');
      client = new MongoClient(uri);
      await client.connect();
      getLogger().info('✅ Connected to MongoDB');

      // Get the database
      const db = client.db(config.dbName);

      // Run the rebuild
      await rebuildIndexes(db, config);

      getLogger().info('\n✅ Rebuild completed successfully');
      process.exit(0);

    } catch (error) {
      getLogger().error('Fatal error: ' + (error instanceof Error ? error.message : String(error)));
      if (error instanceof Error && error.stack) {
        getLogger().error('Stack trace: ' + error.stack);
      }
      process.exit(1);
    } finally {
      if (client) {
        await client.close();
        getLogger().info('MongoDB connection closed');
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
      // Initialize logger
      setLogger(new ConsoleLogger(process.env.DEBUG === 'true'));

      // Get and validate URI
      const uri = getAndValidateUri(options);

      // Connect to MongoDB
      getLogger().info('Connecting to MongoDB...');
      client = new MongoClient(uri);
      await client.connect();
      getLogger().info('✅ Connected to MongoDB');

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

      getLogger().info('✅ Cleanup completed successfully');
      process.exit(0);

    } catch (error) {
      getLogger().error('Fatal error: ' + (error instanceof Error ? error.message : String(error)));
      process.exit(1);
    } finally {
      if (client) {
        await client.close();
        getLogger().info('MongoDB connection closed');
      }
    }
  });

/**
 * Detect if this module is being run directly (not imported)
 */
function isMainModule(): boolean {
  try {
    const mainModule = pathToFileURL(process.argv[1]).href;
    return mainModule === import.meta.url;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  program.parse(process.argv);
}

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
