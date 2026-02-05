#!/usr/bin/env node

import { Command } from 'commander';
import { MongoClient } from 'mongodb';
import { rebuildIndexes, cleanupOrphanedIndexes,  } from './index.js';
import { RebuildConfig } from './types.js';
import { DEFAULT_CONFIG } from './constants.js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getLogger, setLogger, ConsoleLogger } from './logger.js';
import {runtimeDeprecatedCleanup} from "./runtime-dep-cleanup.js";
import {getClusterName, getReplicaSetName} from "./mongodb-utils.js";

// Load environment variables
dotenv.config();

// Add at the very top of the file after imports, before anything else runs:
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
  process.exit(1);
});

// ES module compatible __dirname equivalent
export const __filename = fileURLToPath(import.meta.url);
export const __dirname = dirname(__filename);
export const __pathToRuntimeDir = join(__dirname, '..', DEFAULT_CONFIG.RUNTIME_DIR);

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
  // Basic validation (could be improved with regex or URI parsing)
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    console.error('Error: Invalid MongoDB URI. Must start with mongodb:// or mongodb+srv://');
    process.exit(1);
  }
  return uri;
}

/**
 * Get and validate database name from options or environment
 */
function getDbName(options: any): string {
  const dbName: string = options.database || process.env.MONGODB_DATABASE;
  if (!dbName) {
    console.error('Error: Database name is required. Provide via --database or MONGODB_DATABASE env var.');
    process.exit(1);
  }
  return dbName;

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
  .option('-u, --uri <uri>', 'MongoDB connection URI (or use MONGODB_URI env var)')
  .option('-d, --database <name>', 'Database name (or use MONGODB_DATABASE env var)')
  .option('--log-dir <directory>', 'Directory for performance logs', DEFAULT_CONFIG.LOG_DIR)
  .option('--runtime-dir <directory>', 'Directory for runtime state files', DEFAULT_CONFIG.RUNTIME_DIR)
  .option('--cover-suffix <suffix>', 'Suffix for covering indexes', DEFAULT_CONFIG.COVER_SUFFIX)
  .option('--cheap-field <field>', 'Field name for covering indexes', DEFAULT_CONFIG.CHEAP_SUFFIX_FIELD)
  .option('--no-safe-run', 'Disable interactive prompts (dangerous!)')
  .option('--specified-collections <collections>', 'Comma-separated list of collections to process')
  .option('--ignored-collections <collections>', 'Comma-separated list of collections to ignore')
  .option('--ignored-indexes <indexes>', 'Comma-separated list of indexes to ignore')
  .option('--no-performance-logging', 'Disable performance logging')
  .option('--save-collection-log', 'Save individual collection logs to files', true)
  .action(async (options) => {
    let client: MongoClient | null = null;

    try {
      // Initialize logger
      setLogger(new ConsoleLogger(process.env.DEBUG === 'true'));

      // Get and validate URI
      const uri = getAndValidateUri(options);

      // Get and validate database name
      const dbName = getDbName(options);

      // Connect to MongoDB
      getLogger().info('Connecting to MongoDB...');
      client = new MongoClient(uri);
      await client.connect();
      getLogger().info('✅ Connected to MongoDB');

      // Get the database
      const db = client.db(dbName);
      let clusterName = getClusterName(client);
      if (clusterName === 'unknown-cluster') {
        clusterName = await getReplicaSetName(db);
      }


      // Build configuration
      const config: RebuildConfig = {
        dbName,
        clusterName,
        logDir: options.logDir,
        runtimeDir: options.runtimeDir,
        coverSuffix: options.coverSuffix,
        cheapSuffixField: options.cheapField,
        safeRun: options.safeRun,
        performanceLogging: {
          enabled: options.performanceLogging
        },
        saveCollectionLog: options.saveCollectionLog
      };

      config.specifiedCollections = parseCommaSeparated(options.specifiedCollections);
      config.ignoredCollections = parseCommaSeparated(options.ignoredCollections);
      config.ignoredIndexes = parseCommaSeparated(options.ignoredIndexes);

      // Run the rebuild
      const rebuildResult = await rebuildIndexes(db, config);

      if(rebuildResult.error) {
        getLogger().error('Rebuild encountered errors: ' + rebuildResult.error);
        process.exitCode = 1;
      } else if(rebuildResult.warnings && rebuildResult.warnings.length > 0) {
        getLogger().warn('Rebuild completed with warnings:');
        rebuildResult.warnings.forEach((warning) => {
          getLogger().warn(' - ' + warning);
        });
        process.exitCode = 0;
      } else {
        getLogger().info('\n✅ Rebuild completed successfully');
        process.exitCode = 0;
      }

    } catch (error) {
      getLogger().error('Fatal error: ' + (error instanceof Error ? error.message : String(error)));
      if (error instanceof Error && error.stack) {
        getLogger().error('Stack trace: ' + error.stack);
      }
      process.exitCode = 1;
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
  .option('-u, --uri <uri>', 'MongoDB connection URI (or use MONGODB_URI env var)')
  .option('-d, --database <name>', 'Database name (or use MONGODB_DATABASE env var)')
  .option('--cover-suffix <suffix>', 'Suffix for covering indexes', DEFAULT_CONFIG.COVER_SUFFIX)
  .action(async (options) => {
    let client: MongoClient | null = null;

    try {
      // Initialize logger
      setLogger(new ConsoleLogger(process.env.DEBUG === 'true'));

      // Get and validate URI and database name
      // (These functions validate and exit on failure, so no need for additional checks)
      const uri = getAndValidateUri(options);
      const dbName = getDbName(options);

      // Connect to MongoDB
      getLogger().info('Connecting to MongoDB...');
      client = new MongoClient(uri);
      await client.connect();
      getLogger().info('✅ Connected to MongoDB');


      const db = client.db(dbName);
      const coverSuffix = options.coverSuffix;

      let clusterName = getClusterName(client);
      if (clusterName === 'unknown-cluster') {
        clusterName = await getReplicaSetName(db);
      }

      // Create config for cleanup function
      const config: RebuildConfig = {
        dbName: dbName,
        coverSuffix,
        safeRun: true  // Always use safe mode in CLI cleanup
      };

      // Use the shared cleanup function
      await cleanupOrphanedIndexes(db, config);
      await runtimeDeprecatedCleanup(__pathToRuntimeDir, clusterName);

      getLogger().info('✅ Cleanup completed successfully');
      process.exitCode = 0;

    } catch (error) {
      getLogger().error('Fatal error: ' + (error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
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
  // Show help if no command provided
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
  program.parse(process.argv);
}
