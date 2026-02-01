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
  IndexDocument,
  VALID_INDEX_OPTIONS,
  RebuildCoordinator
} from './types';
import { isIgnored } from './mongodb-utils';
import { promptUser } from './prompts';
import {
  bytesToMB,
  formatDuration,
  writeJsonFile
} from './file-utils';
import { RebuildPaths } from './types';
import { getLogger } from './logger';
import { verifyIndex } from './index-operations';

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
  validOptions: string[] = VALID_INDEX_OPTIONS as unknown as string[]
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
    return { status: 'skipped', log: collectionLog };
  }

  const sortedIndexes = processableIndexes.sort((a, b) => (b.size || 0) - (a.size || 0));

  getLogger().info(`\nFound ${sortedIndexes.length} index(es) to rebuild in this collection (largest first):`);
  sortedIndexes.forEach(is =>
    getLogger().info(`  - ${is.name} (~${bytesToMB(is.size || 0).toFixed(3)} MB)`)
  );

  // Notify coordinator that collection processing is starting
  await notifyCoordinator(config.coordinator, 'onCollectionStart', collectionName, sortedIndexes.length);

  let specifyIndexMode = false;
  if (config.safeRun) {
    const [responseChar, responseWord] = await promptUser(
      "\nProceed with these indexes? (yes/no/specify/skip collection) [y/n/s/b]: ",
      ['yes', 'no', 'specify', 'skip'],
      'indexes'
    );
    getLogger().info(`User chose: [${responseWord}].`);

    if (responseChar === 'n') {
      throw new Error("User aborted the operation.");
    }
    if (responseChar === 'b') {
      getLogger().info(`Skipping collection "${collectionName}".`);
      return { status: 'skipped', log: collectionLog };
    }
    if (responseChar === 's') {
      specifyIndexMode = true;
    }
  }

  for (const indexStat of sortedIndexes) {
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

    const coveringKey = { ...originalKey };
    coveringKey[config.cheapSuffixField!] = 1;
    const coveringName = originalName + config.coverSuffix!;
    const coveringOptions: Record<string, any> = { name: coveringName };

    if (Object.prototype.hasOwnProperty.call(originalOptions, 'partialFilterExpression')) {
      coveringOptions.partialFilterExpression = originalOptions.partialFilterExpression;
    }

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

    getLogger().info(`  [3/6] Calling dropIndex for old index '${originalName}'...`);
    await collection.dropIndex(originalName);
    getLogger().info(`  -> Command completed.`);

    getLogger().info(`  [4/6] Calling createIndex for final index '${originalName}'. THIS IS THE MAIN BUILD.`);
    await collection.createIndex(originalKey, { ...originalOptions, name: originalName });
    getLogger().info(`  -> Command completed.`);

    getLogger().info(`  [5/6] Calling verifyIndex for final rebuilt index...`);
    if (!await verifyIndex(collection, originalName, originalKey, originalOptions)) {
      throw new Error(`CRITICAL: Final index '${originalName}' is invalid.`);
    }

    getLogger().info(`  [6/6] Calling dropIndex for covering index '${coveringName}'...`);
    await collection.dropIndex(coveringName);
    getLogger().info(`  -> Command completed.`);

    // Get final index size using indexStats from db.collection.stats()
    const finalStats = await db.command({
      collStats: collection.collectionName,
      indexDetails: false
    });
    const finalIndexSize = finalStats.indexSizes?.[originalName] || 0;
    indexLog.finalSizeMb = bytesToMB(finalIndexSize);
    indexLog.timeSeconds = (new Date().getTime() - indexLog.startTime.getTime()) / 1000;
    collectionLog.indexes[originalName] = indexLog;

    if (!state.completed[collectionName]) {
      state.completed[collectionName] = [];
    }
    state.completed[collectionName].push(originalName);
    writeJsonFile(paths.stateFile, state);
    getLogger().info(`  💾 State file updated.`);

    // Notify coordinator that index rebuild is complete
    await notifyCoordinator(config.coordinator, 'onIndexComplete', collectionName, originalName, indexLog.timeSeconds, true);

    getLogger().info(`--- Rebuild for '${originalName}' complete in ${formatDuration(indexLog.timeSeconds)}. ---`);
  }

  // Calculate collection summary
  const finalCollectionStats = await db.command({
    collStats: collection.collectionName,
    indexDetails: false
  });
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
