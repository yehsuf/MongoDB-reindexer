#!/usr/bin/env node

import { Command } from 'commander';
import { MongoDBReindexer } from './lib/reindexer';
import { ReindexerConfig } from './types';

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
  .description('Rebuild an index with zero downtime')
  .requiredOption('-u, --uri <uri>', 'MongoDB connection URI')
  .requiredOption('-d, --database <name>', 'Database name')
  .requiredOption('-c, --collection <name>', 'Collection name')
  .requiredOption('-i, --index <spec>', 'Index specification as JSON (e.g., \'{"field": 1}\')')
  .option('-o, --options <options>', 'Index options as JSON (e.g., \'{"unique": true}\')')
  .option('-s, --state-file <path>', 'Path to state file for resuming operations')
  .option('-v, --verbose', 'Enable verbose logging', false)
  .option('--max-retries <number>', 'Maximum verification retries', '10')
  .option('--retry-delay <ms>', 'Verification retry delay in milliseconds', '2000')
  .action(async (options) => {
    try {
      // Parse index specification
      let indexSpec: any;
      try {
        indexSpec = JSON.parse(options.index);
      } catch (error) {
        console.error('Error: Invalid index specification JSON');
        process.exit(1);
      }

      // Parse index options if provided
      let indexOptions: any = {};
      if (options.options) {
        try {
          indexOptions = JSON.parse(options.options);
        } catch (error) {
          console.error('Error: Invalid index options JSON');
          process.exit(1);
        }
      }

      // Build configuration
      const config: ReindexerConfig = {
        uri: options.uri,
        database: options.database,
        collection: options.collection,
        indexSpec,
        indexOptions,
        verbose: options.verbose,
        maxVerificationRetries: parseInt(options.maxRetries, 10),
        verificationRetryDelayMs: parseInt(options.retryDelay, 10)
      };

      if (options.stateFile) {
        config.stateFilePath = options.stateFile;
      }

      // Execute reindex
      const reindexer = new MongoDBReindexer(config);
      const result = await reindexer.reindex();

      if (result.success) {
        console.log('\n✓ Reindex completed successfully');
        process.exit(0);
      } else {
        console.error('\n✗ Reindex failed:', result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('Fatal error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('cleanup')
  .description('Cleanup orphan indexes from failed operations')
  .requiredOption('-u, --uri <uri>', 'MongoDB connection URI')
  .requiredOption('-d, --database <name>', 'Database name')
  .requiredOption('-c, --collection <name>', 'Collection name')
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(async (options) => {
    try {
      const config: ReindexerConfig = {
        uri: options.uri,
        database: options.database,
        collection: options.collection,
        indexSpec: {}, // Not used for cleanup
        verbose: options.verbose
      };

      const reindexer = new MongoDBReindexer(config);
      const orphans = await reindexer.cleanupOrphans();

      if (orphans.length > 0) {
        console.log(`✓ Cleaned up ${orphans.length} orphan index(es):`);
        orphans.forEach(name => console.log(`  - ${name}`));
      } else {
        console.log('✓ No orphan indexes found');
      }

      process.exit(0);
    } catch (error) {
      console.error('Fatal error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
