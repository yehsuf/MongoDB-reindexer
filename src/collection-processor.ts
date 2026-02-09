/**
 * Collection processor utilities
 * Handles the rebuild of indexes for a single collection
 */

import { Db, Collection } from 'mongodb';
import {
  RebuildConfig,
  RebuildState,
  IndexStat,
  IndexLog,
  CollectionLog,
  DatabaseLog,
  IndexDocument,
  VALID_INDEX_OPTIONS,
  RebuildCoordinator
} from './types.js';
import { isIgnored } from './mongodb-utils.js';
import { promptUser } from './prompts.js';
import {
  bytesToMB,
  formatDuration,
  writeJsonFile
} from './file-utils.js';
import { RebuildPaths } from './types.js';
import { getLogger } from './logger.js';
import { verifyIndex, canReuseCoveringIndex } from './index-operations.js';

/**
 * Helper to safely notify coordinator methods
 */
async function notifyCoordinator<K extends keyof RebuildCoordinator>(
  coordinator: RebuildCoordinator | undefined,
  method: K,
  ...args: Parameters<NonNullable<RebuildCoordinator[K]>>
): Promise<void> {
  if (coordinator && coordinator[method]) {
    try {
      await (coordinator[method] as Function)(...args);
    } catch (e) {
      getLogger().debug(`Coordinator.${method} threw: ${e}`);
    }
  }
}

/**
 * Rebuild indexes for a single collection
 */
export async function rebuildCollectionIndexes(
  db: Db,
  collection: Collection,
  backedUpIndexes: IndexDocument[],
  indexStats: IndexStat[],
  state: RebuildState,
  paths: RebuildPaths,
  config: RebuildConfig,
  validOptions: string[] = VALID_INDEX_OPTIONS as unknown as string[],
  dbLog?: DatabaseLog
): Promise<{ status: string; log: CollectionLog }> {
  const collectionName = collection.collectionName;
  const collectionLog: CollectionLog = {
    startTime: new Date(),
    totalTimeSeconds: 0,
    initialSizeMb: 0,
    finalSizeMb: 0,
    reclaimedMb: 0,
    indexes: {}
  };

  // Filter processable indexes
  const processableIndexes = indexStats.filter(indexStat => {
    // Exclude temp indexes
    if (indexStat.name.endsWith(config.coverSuffix!)) {
      return false;
    }

    const idx = backedUpIndexes.find(i => i.name === indexStat.name);
    const isAlreadyCompleted = state.completed[collectionName]?.includes(idx?.name || '');

    if (isAlreadyCompleted && idx) {
      getLogger().info(`\nℹ️ Skipping index: "${idx.name}" (already marked as completed in state file).`);
    }

    return !isAlreadyCompleted &&
      idx &&
      !idx.unique &&
      idx.name !== '_id_' &&
      !isIgnored(idx.name, config.ignoredIndexes || []);
  });

  if (processableIndexes.length === 0) {
    getLogger().info("\nNo indexes in this collection require rebuild.");
    return {status: 'skipped', log: collectionLog};
  }

  const sortedIndexes = processableIndexes.sort((a, b) => (b.size || 0) - (a.size || 0));

  getLogger().info(`\n--- Collection: "${collectionName}" ---`);
  getLogger().info(`\nFound ${sortedIndexes.length} index(es) to rebuild in this collection (largest first):`);
  sortedIndexes.forEach(is =>
    getLogger().info(`  - ${is.name} (~${bytesToMB(is.size || 0).toFixed(3)} MB)`)
  );

  // Notify coordinator that collection processing is starting
  await notifyCoordinator(config.coordinator, 'onCollectionStart', collectionName, sortedIndexes.length);

  let specifyIndexMode = false;
  if (config.safeRun) {
    const [responseChar, responseWord] = await promptUser(
      "\nProceed with these indexes? (yes/no/specify/back) [y/n/s/b]: ",
      ['yes', 'no', 'specify', 'back'],
      'indexes'
    );
    getLogger().info(`User chose: [${responseWord}].`);

    if (responseChar === 'n') {
      getLogger().warn("User aborted the operation.");
      // Notify coordinator about abortion and break out
      await notifyCoordinator(
        config.coordinator,
        'onRebuildComplete',
        config.dbName,
        0,
        0,
        true,
        'Aborted by user at collection confirmation step.'
      );
      getLogger().warn("User aborted the operation.");
    }
    if (responseChar === 'b') {
      getLogger().info(`Skipping collection "${collectionName}".`);
      return {status: 'skipped', log: collectionLog};
    }
    if (responseChar === 's') {
      specifyIndexMode = true;
    }
  }

  for (const indexStat of sortedIndexes) {
    try {
      const originalName = indexStat.name;
      const idx = backedUpIndexes.find(i => i.name === originalName)!;

      if (specifyIndexMode) {
        const [continueWithIndex, continueWord] = await promptUser(
          `  -> Process index "${originalName}"? (y/n): `,
          ['yes', 'no'],
          'index-specify'
        );
        getLogger().info(`  User chose: [${continueWord}].`);

        if (continueWithIndex === 'n') {
          getLogger().info(`  Skipping index "${originalName}".`);
          continue;
        }
      }

      const initialSizeMb = bytesToMB(indexStat.size || 0);
      const indexLog: IndexLog = {
        startTime: new Date(),
        timeSeconds: 0,
        initialSizeMb,
        finalSizeMb: 0
      };

      getLogger().info(`\n--- Processing index: "${originalName}" (~${initialSizeMb.toFixed(3)} MB) ---`);

      // Notify coordinator that index rebuild is starting
      await notifyCoordinator(config.coordinator, 'onIndexStart', collectionName, originalName, initialSizeMb);

      const originalKey = idx.key;
      const originalOptions: Record<string, any> = {};
      for (const opt of validOptions) {
        if (Object.prototype.hasOwnProperty.call(idx, opt)) {
          originalOptions[opt] = idx[opt];
        }
      }

      const coveringKey = {...originalKey};
      coveringKey[config.cheapSuffixField!] = 1;
      const coveringName = originalName + config.coverSuffix!;
      const coveringOptions: Record<string, any> = {name: coveringName};

      if (Object.prototype.hasOwnProperty.call(originalOptions, 'partialFilterExpression')) {
        coveringOptions.partialFilterExpression = originalOptions.partialFilterExpression;
      }

      // Retry logic wrapper
      let attemptCount = 0;
      let rebuildSuccess = false;
      const maxAttempts = 2; // Initial attempt + 1 retry

      while (attemptCount < maxAttempts && !rebuildSuccess) {
        attemptCount++;
        try {
          if (attemptCount > 1) {
            getLogger().warn(`  ⚠️  Retry attempt ${attemptCount - 1} for index "${originalName}"...`);
          }

          // Check for existing covering index from previous runs
          let coveringIndexExists = false;
          try {
            const allIndexes = await collection.indexes();
            getLogger().debug(`  [DEBUG] Total indexes in collection: ${allIndexes.length}`);
            getLogger().debug(`  [DEBUG] Looking for covering index: '${coveringName}'`);

            const existingCovering = allIndexes.find(i => i.name === coveringName);

            if (existingCovering) {
              getLogger().debug(`  [DEBUG] Found existing covering index`);
              getLogger().debug(`  [DEBUG] Existing index key: ${JSON.stringify(existingCovering.key)}`);
              getLogger().debug(`  [DEBUG] Expected covering key: ${JSON.stringify(coveringKey)}`);
              getLogger().debug(`  [DEBUG] Existing buildState: ${(existingCovering as any).buildState || 'none'}`);

              getLogger().info(`  [1/6] Found existing covering index '${coveringName}' from previous run. Verifying...`);

              // Verify the existing covering index
              const expectedCoveringOptions: Record<string, any> = {};
              if (coveringOptions.partialFilterExpression) {
                expectedCoveringOptions.partialFilterExpression = coveringOptions.partialFilterExpression;
              }
              getLogger().debug(`  [DEBUG] Expected covering options: ${JSON.stringify(expectedCoveringOptions)}`);

              const isValid = await canReuseCoveringIndex(collection, coveringName, coveringKey, expectedCoveringOptions);
              getLogger().debug(`  [DEBUG] canReuseCoveringIndex returned: ${isValid}`);

              if (isValid) {
                getLogger().info(`  ✅ Existing covering index is valid and ready. Reusing it (skipping creation).`);
                getLogger().debug(`  [DEBUG] Will skip createIndex step`);
                coveringIndexExists = true;
              } else {
                getLogger().warn(`  ⚠️  Existing covering index is invalid or incomplete. Will rebuild.`);
                getLogger().debug(`  [DEBUG] Will drop invalid covering index and recreate`);
                // Drop the invalid covering index
                try {
                  await collection.dropIndex(coveringName);
                  getLogger().info(`  🧹 Dropped invalid covering index.`);
                  getLogger().debug(`  [DEBUG] Successfully dropped invalid covering index`);
                } catch (dropErr) {
                  getLogger().warn(`  Warning: Could not drop invalid covering index: ${dropErr}`);
                  getLogger().debug(`  [DEBUG] Error dropping invalid covering index: ${dropErr}`);
                }
              }
            } else {
              getLogger().debug(`  [DEBUG] No existing covering index found with name: '${coveringName}'`);
              getLogger().debug(`  [DEBUG] Available indexes: ${allIndexes.map(i => i.name).join(', ')}`);
            }
          } catch (checkErr) {
            getLogger().debug(`  Could not check for existing covering index: ${checkErr}`);
            getLogger().debug(`  [DEBUG] Error type: ${checkErr instanceof Error ? checkErr.constructor.name : typeof checkErr}`);
            getLogger().debug(`  [DEBUG] Will continue with normal flow and create new covering index`);
            // Continue with normal flow
          }

          // Create covering index if it doesn't exist or was invalid
          if (!coveringIndexExists) {
            getLogger().info(`  [1/6] Calling createIndex for covering index '${coveringName}'.`);
            await collection.createIndex(coveringKey, coveringOptions);
            getLogger().info(`  -> Command completed.`);

            getLogger().info(`  [2/6] Calling verifyIndex for covering index...`);
            const expectedCoveringOptions: Record<string, any> = {};
            if (coveringOptions.partialFilterExpression) {
              expectedCoveringOptions.partialFilterExpression = coveringOptions.partialFilterExpression;
            }
            if (!await verifyIndex(collection, coveringName, coveringKey, expectedCoveringOptions)) {
              throw new Error(`Safety check failure for covering index.`);
            }
          } else {
            // Covering index already exists and is valid
            getLogger().info(`  [2/6] Covering index already verified. Proceeding with rebuild.`);
          }

          getLogger().info(`  [3/6] Calling dropIndex for old index '${originalName}'...`);
          await collection.dropIndex(originalName);
          getLogger().info(`  -> Command completed.`);

          getLogger().info(`  [4/6] Calling createIndex for final index '${originalName}'. THIS IS THE MAIN BUILD.`);
          await collection.createIndex(originalKey, {...originalOptions, name: originalName});
          getLogger().info(`  -> Command completed.`);

          getLogger().info(`  [5/6] Calling verifyIndex for final rebuilt index...`);
          if (!await verifyIndex(collection, originalName, originalKey, originalOptions)) {
            throw new Error(`CRITICAL: Final index '${originalName}' is invalid.`);
          }

          getLogger().info(`  [6/6] Calling dropIndex for covering index '${coveringName}'...`);
          await collection.dropIndex(coveringName);
          getLogger().info(`  -> Command completed.`);

          // Success - record time and metrics
          indexLog.timeSeconds = (new Date().getTime() - indexLog.startTime.getTime()) / 1000;
          if (attemptCount > 1) {
            indexLog.retries = attemptCount - 1;
            getLogger().info(`  ✅ Succeeded after ${attemptCount - 1} retry attempt(s).`);
          }
          collectionLog.indexes[originalName] = indexLog;

          if (!state.completed[collectionName]) {
            state.completed[collectionName] = [];
          }
          state.completed[collectionName].push(originalName);
          writeJsonFile(paths.stateFile, state);
          getLogger().info(`  💾 State file updated.`);

          // Notify coordinator that index rebuild is complete
          await notifyCoordinator(
            config.coordinator,
            'onIndexComplete',
            collectionName,
            originalName,
            indexLog.timeSeconds,
            true
          );

          getLogger().info(`\n--- Rebuild for '${originalName}' complete in ${formatDuration(indexLog.timeSeconds)}. ---`);
          rebuildSuccess = true;

        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          getLogger().error(`  ❌ Failed to rebuild index '${originalName}': ${errorMsg}`);

          if (attemptCount < maxAttempts) {
            getLogger().warn(`  ⚠️  Will retry once more...`);
            // Clean up any partial state before retry
            try {
              const allIndexes = await collection.indexes();
              if (allIndexes.find(i => i.name === coveringName)) {
                getLogger().info(`  🧹 Cleaning up covering index before retry...`);
                await collection.dropIndex(coveringName);
              }
            } catch (cleanupError) {
              getLogger().debug(`  Cleanup error (non-critical): ${cleanupError}`);
            }
            // Small delay before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            // Max retries exhausted - log and continue with other indexes
            getLogger().error(`  ❌ Max retries exhausted for index '${originalName}'. Continuing with other indexes...`);

            // Record the failure
            indexLog.error = errorMsg;
            indexLog.retries = attemptCount - 1;
            indexLog.timeSeconds = (new Date().getTime() - indexLog.startTime.getTime()) / 1000;
            collectionLog.indexes[originalName] = indexLog;

            // Add warning to collection log
            if (!collectionLog.warnings) {
              collectionLog.warnings = [];
            }
            const warningMsg = `Failed to rebuild index "${originalName}" after ${attemptCount - 1} retry: ${errorMsg}`;
            collectionLog.warnings.push(warningMsg);

            // Add warning to database log if available
            if (dbLog) {
              dbLog.warnings.push(`Collection "${collectionName}", index "${originalName}": Failed after ${attemptCount - 1} retry - ${errorMsg}`);
            }

            // Log to console for immediate visibility
            console.warn(`\n⚠️  WARNING: Failed to rebuild index "${originalName}" in collection "${collectionName}"`);
            console.warn(`   Error: ${errorMsg}`);
            console.warn(`   Retries attempted: ${attemptCount - 1}`);
            console.warn(`   This index will be skipped. Manual intervention may be required.\n`);

            if (e instanceof Error && e.stack) {
              getLogger().debug(`  Stack trace: ${e.stack}`);
            }
          }
        }
      }
    } catch (outerError) {
      // This catches any unexpected errors outside the retry loop
      console.error(`❌ Unexpected error processing index: ${outerError instanceof Error ? outerError.message : String(outerError)}`);
      if (outerError instanceof Error && outerError.stack) {
        console.error('Stack: ' + outerError.stack);
      }
    }
  }

  // PASS 2: Measurement (Rebuild-Then-Measure)
  // Fetch stats once at the end to ensure accuracy and avoid "null" stats issues
  getLogger().info(`\n--- Finalizing statistics for collection "${collectionName}"... ---`);

  const finalCollectionStats = await db.command({
    collStats: collection.collectionName
  });

  // Backfill final sizes for all processed indexes
  for (const indexName in collectionLog.indexes) {
    const finalIndexSize = finalCollectionStats.indexSizes?.[indexName] || 0;
    collectionLog.indexes[indexName].finalSizeMb = bytesToMB(finalIndexSize);
    getLogger().info(`  - Measured final size for '${indexName}': ${collectionLog.indexes[indexName].finalSizeMb.toFixed(3)} MB`);
  }

  let initialTotalSize = 0;
  for (const stat of indexStats) {
    initialTotalSize += (stat.size || 0);
  }

  collectionLog.initialSizeMb = bytesToMB(initialTotalSize);
  const finalIndexSizes = Object.values(finalCollectionStats.indexSizes || {}) as number[];
  collectionLog.finalSizeMb = bytesToMB(finalIndexSizes.reduce((sum, size) => sum + size, 0));
  collectionLog.reclaimedMb = collectionLog.initialSizeMb - collectionLog.finalSizeMb;
  collectionLog.totalTimeSeconds = (new Date().getTime() - collectionLog.startTime.getTime()) / 1000;

  // Notify coordinator that collection processing is complete
  await notifyCoordinator(config.coordinator, 'onCollectionComplete', collectionName, collectionLog.reclaimedMb, collectionLog.totalTimeSeconds);

  getLogger().info(`\n================ Collection "${collectionName}" complete in ${formatDuration(collectionLog.totalTimeSeconds)}. ================`);
  return { status: 'completed', log: collectionLog };
}
