/**
 * MongoDB Zero-Downtime Index Rebuilder
 * 
 * Universal rebuild script ported from mongosh to TypeScript.
 * Implements the Cover-Swap-Cleanup strategy with dual verification,
 * cluster awareness, state file resumability, and interactive prompts.
 */

import { Db, Collection, MongoClient } from 'mongodb';
import {
  RebuildConfig,
  RebuildState,
  IndexStat,
  IndexLog,
  CollectionLog,
  DatabaseLog,
  OrphanedIndex,
  RebuildPaths,
  CollectionInfo,
  IndexDocument,
  VALID_INDEX_OPTIONS
} from './types';
import {
  getClusterName,
  getReplicaSetName,
  isIgnored,
  promptUser,
  ensureDir,
  readJsonFile,
  writeJsonFile,
  deleteFile,
  bytesToMB,
  formatDuration
} from './utils';

/**
 * Verify that an index exists and matches expected specification
 */
async function verifyIndex(
  collection: Collection,
  indexName: string,
  expectedKey: Record<string, any>,
  expectedOptions: Record<string, any>
): Promise<boolean> {
  try {
    const allIndexes = await collection.indexes();
    const foundIndex = allIndexes.find(i => i.name === indexName);
    
    if (!foundIndex) {
      console.error(`  [SAFETY CHECK FAILED] Index '${indexName}' was not found.`);
      return false;
    }
    
    if (JSON.stringify(foundIndex.key) !== JSON.stringify(expectedKey)) {
      console.error(`  [SAFETY CHECK FAILED] Index '${indexName}' key mismatch.`);
      return false;
    }
    
    const finalOptsClean: Record<string, any> = {};
    for (const opt of VALID_INDEX_OPTIONS) {
      if (Object.prototype.hasOwnProperty.call(foundIndex, opt)) {
        finalOptsClean[opt] = foundIndex[opt];
      }
    }
    
    const optionsMatch = JSON.stringify(finalOptsClean) === JSON.stringify(expectedOptions);
    if (!optionsMatch) {
      console.error(`  [SAFETY CHECK FAILED] Index '${indexName}' options mismatch.`);
      return false;
    }
    
    console.log(`  [SAFETY CHECK PASSED] Index '${indexName}' is valid.`);
    return true;
  } catch (e) {
    console.error(`  [SAFETY CHECK FAILED] Error during verification for '${indexName}'.`, e);
    return false;
  }
}

/**
 * Phase 0: Cleanup orphaned temporary indexes
 */
async function cleanupOrphanedIndexes(db: Db, config: RebuildConfig): Promise<void> {
  console.log("--- Phase 0: Checking for orphaned temporary indexes ---");
  
  const orphanedIndexes: OrphanedIndex[] = [];
  const collectionNames = (await db.listCollections().toArray()).map(c => c.name);
  
  for (const collName of collectionNames) {
    const collection = db.collection(collName);
    const indexes = await collection.indexes();
    const orphansInColl = indexes.filter(idx => idx.name && idx.name.endsWith(config.coverSuffix!));
    
    if (orphansInColl.length > 0) {
      orphansInColl.forEach(o => {
        if (o.name) {
          orphanedIndexes.push({ collectionName: collName, indexName: o.name });
        }
      });
    }
  }
  
  if (orphanedIndexes.length === 0) {
    console.log("✅ No orphaned indexes found.");
    return;
  }
  
  console.warn(`\n⚠️ Found ${orphanedIndexes.length} orphaned temporary index(es):`);
  orphanedIndexes.forEach(o => 
    console.log(`   - Collection: "${o.collectionName}", Index: "${o.indexName}"`)
  );
  
  if (config.safeRun) {
    const [responseChar, responseWord] = await promptUser(
      "\nProceed with cleanup? (y/n): ",
      ['yes', 'no'],
      [
        { value: 'yes', description: 'Drop all orphaned temporary indexes' },
        { value: 'no', description: 'Abort cleanup operation and exit' }
      ]
    );
    console.log(`User chose: [${responseWord}].`);
    if (responseChar === 'n') {
      throw new Error("User aborted cleanup operation.");
    }
  }
  
  console.log("-> Starting cleanup...");
  for (const orphan of orphanedIndexes) {
    await db.collection(orphan.collectionName).dropIndex(orphan.indexName);
    console.log(`  ✅ Dropped: "${orphan.indexName}" from "${orphan.collectionName}"`);
  }
  console.log("✅ Cleanup complete.");
}

/**
 * Rebuild indexes for a single collection
 */
async function rebuildCollectionIndexes(
  db: Db,
  collection: Collection,
  backedUpIndexes: IndexDocument[],
  indexStats: IndexStat[],
  state: RebuildState,
  paths: RebuildPaths,
  config: RebuildConfig
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
      console.log(`\nℹ️ Skipping index: "${idx.name}" (already marked as completed in state file).`);
    }
    
    return !isAlreadyCompleted && 
           idx && 
           !idx.unique && 
           idx.name !== '_id_' && 
           !isIgnored(idx.name, config.ignoredIndexes || []);
  });
  
  if (processableIndexes.length === 0) {
    console.log("\nNo indexes in this collection require rebuild.");
    return { status: 'skipped', log: collectionLog };
  }
  
  const sortedIndexes = processableIndexes.sort((a, b) => (b.size || 0) - (a.size || 0));
  
  console.log(`\nFound ${sortedIndexes.length} index(es) to rebuild in this collection (largest first):`);
  sortedIndexes.forEach(is => 
    console.log(`  - ${is.name} (~${bytesToMB(is.size || 0).toFixed(3)} MB)`)
  );
  
  let specifyIndexMode = false;
  if (config.safeRun) {
    const [responseChar, responseWord] = await promptUser(
      "\nProceed with these indexes? (yes/no/specify/skip collection) [y/n/s/b]: ",
      ['yes', 'no', 'specify', 'skip'],
      [
        { value: 'yes', description: 'Rebuild all listed indexes in this collection' },
        { value: 'no', description: 'Abort the entire rebuild operation' },
        { value: 'specify', description: 'Interactively choose which indexes to rebuild' },
        { value: 'skip', description: 'Skip this collection and move to the next one' }
      ]
    );
    console.log(`User chose: [${responseWord}].`);
    
    if (responseChar === 'n') {
      throw new Error("User aborted the operation.");
    }
    if (responseChar === 'b') {
      console.log(`Skipping collection "${collectionName}".`);
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
        [
          { value: 'yes', description: 'Rebuild this index using Cover-Swap-Cleanup' },
          { value: 'no', description: 'Skip this index and continue to the next one' }
        ]
      );
      console.log(`  User chose: [${continueWord}].`);
      
      if (continueWithIndex === 'n') {
        console.log(`  Skipping index "${originalName}".`);
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
    
    console.log(`\n--- Processing index: "${originalName}" (~${initialSizeMb.toFixed(3)} MB) ---`);
    
    const originalKey = idx.key;
    const originalOptions: Record<string, any> = {};
    for (const opt of VALID_INDEX_OPTIONS) {
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
    
    console.log(`  [1/6] Calling createIndex for covering index '${coveringName}'.`);
    await collection.createIndex(coveringKey, coveringOptions);
    console.log(`  -> Command completed.`);
    
    console.log(`  [2/6] Calling verifyIndex for covering index...`);
    const expectedCoveringOptions: Record<string, any> = {};
    if (coveringOptions.partialFilterExpression) {
      expectedCoveringOptions.partialFilterExpression = coveringOptions.partialFilterExpression;
    }
    if (!await verifyIndex(collection, coveringName, coveringKey, expectedCoveringOptions)) {
      throw new Error(`Safety check failure for covering index.`);
    }
    
    console.log(`  [3/6] Calling dropIndex for old index '${originalName}'...`);
    await collection.dropIndex(originalName);
    console.log(`  -> Command completed.`);
    
    console.log(`  [4/6] Calling createIndex for final index '${originalName}'. THIS IS THE MAIN BUILD.`);
    await collection.createIndex(originalKey, { ...originalOptions, name: originalName });
    console.log(`  -> Command completed.`);
    
    console.log(`  [5/6] Calling verifyIndex for final rebuilt index...`);
    if (!await verifyIndex(collection, originalName, originalKey, originalOptions)) {
      throw new Error(`CRITICAL: Final index '${originalName}' is invalid.`);
    }
    
    console.log(`  [6/6] Calling dropIndex for covering index '${coveringName}'...`);
    await collection.dropIndex(coveringName);
    console.log(`  -> Command completed.`);
    
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
    console.log(`  💾 State file updated.`);
    
    console.log(`--- Rebuild for '${originalName}' complete in ${formatDuration(indexLog.timeSeconds)}. ---`);
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
  
  console.log(`\n================ Collection "${collectionName}" complete in ${formatDuration(collectionLog.totalTimeSeconds)}. ================`);
  return { status: 'completed', log: collectionLog };
}

/**
 * Main rebuild function - accepts a Db instance and configuration
 * This is the library API that can be imported and used programmatically
 */
export async function rebuildIndexes(db: Db, config: RebuildConfig): Promise<DatabaseLog> {
  // Set defaults
  const fullConfig: Required<RebuildConfig> = {
    dbName: config.dbName,
    logDir: config.logDir || 'rebuild_logs',
    runtimeDir: config.runtimeDir || '.rebuild_runtime',
    coverSuffix: config.coverSuffix || '_cover_temp',
    cheapSuffixField: config.cheapSuffixField || '_rebuild_cover_field_',
    safeRun: config.safeRun !== undefined ? config.safeRun : true,
    specifiedCollections: config.specifiedCollections || [],
    ignoredCollections: config.ignoredCollections || [],
    ignoredIndexes: config.ignoredIndexes || [],
    performanceLogging: config.performanceLogging || { enabled: true }
  };
  
  let state: RebuildState = { completed: {} };
  const dbLog: DatabaseLog = {
    clusterName: 'unknown',
    dbName: fullConfig.dbName,
    startTime: new Date().toISOString(),
    totalTimeSeconds: 0,
    totalInitialSizeMb: 0,
    totalFinalSizeMb: 0,
    totalReclaimedMb: 0,
    collections: {},
    error: null
  };
  
  let paths: RebuildPaths = {
    stateFile: '',
    backupFile: '',
    logFile: ''
  };
  
  try {
    console.log(`\n### Starting UNIVERSAL index rebuild for database: "${fullConfig.dbName}" ###`);
    
    // Get cluster name
    const client = db.client as MongoClient;
    let clusterName = getClusterName(client);
    if (clusterName === 'unknown-cluster') {
      clusterName = await getReplicaSetName(db);
    }
    
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    dbLog.clusterName = clusterName;
    
    paths = {
      stateFile: `${fullConfig.runtimeDir}/${clusterName}_state.json`,
      backupFile: `${fullConfig.runtimeDir}/${clusterName}_backup_${timestamp}.json`,
      logFile: `${fullConfig.logDir}/${clusterName}_rebuild_log_${timestamp}.json`
    };
    
    ensureDir(fullConfig.runtimeDir);
    if (fullConfig.performanceLogging.enabled) {
      ensureDir(fullConfig.logDir);
    }
    
    // Load state if exists
    state = readJsonFile(paths.stateFile, { completed: {} });
    if (Object.keys(state.completed).length > 0) {
      console.log(`-> Loading state from previous run...`);
    }
    
    // Phase 0: Cleanup orphans
    await cleanupOrphanedIndexes(db, fullConfig);
    
    // Phase 2: Discover and backup collections
    console.log("\n--- Phase 2: Discovering and backing up all collections ---");
    const collectionsList = await db.listCollections().toArray();
    const allCollectionNames = collectionsList.map(c => c.name);
    const allIndexesBackup: Record<string, IndexDocument[]> = {};
    const collectionStatsList: CollectionInfo[] = [];
    
    for (const name of allCollectionNames) {
      const collection = db.collection(name);
      allIndexesBackup[name] = await collection.indexes() as IndexDocument[];
      
      const stats = await db.command({
        collStats: name,
        indexDetails: false
      });
      const indexSizes = stats.indexSizes || {};
      const indexStatsArray: IndexStat[] = Object.entries(indexSizes).map(([indexName, indexSize]) => ({
        name: indexName,
        size: indexSize as number
      }));
      
      collectionStatsList.push({
        name,
        indexStats: indexStatsArray,
        totalIndexSize: 0
      });
    }
    
    writeJsonFile(paths.backupFile, allIndexesBackup);
    console.log(`✅ Index backup created at: "${paths.backupFile}"`);
    
    // Phase 3: Filter and sort collections
    console.log("\n--- Phase 3: Filtering and sorting target collections ---");
    let collectionsToProcess: CollectionInfo[];
    
    if (fullConfig.specifiedCollections.length > 0) {
      collectionsToProcess = collectionStatsList.filter(c => 
        fullConfig.specifiedCollections.includes(c.name)
      );
      if (fullConfig.ignoredCollections.length > 0) {
        console.warn("⚠️ WARNING: `specifiedCollections` is overriding `ignoredCollections`.");
      }
    } else {
      collectionsToProcess = collectionStatsList.filter(c => 
        !isIgnored(c.name, fullConfig.ignoredCollections)
      );
    }
    
    if (collectionsToProcess.length === 0) {
      throw new Error("No collections match the specified criteria.");
    }
    
    for (const coll of collectionsToProcess) {
      coll.totalIndexSize = coll.indexStats.reduce((sum, stat) => sum + (stat.size || 0), 0);
    }
    
    const sortedCollections = collectionsToProcess.sort((a, b) => b.totalIndexSize - a.totalIndexSize);
    
    console.log("\nCollections to be processed (largest first):");
    sortedCollections.forEach(c => 
      console.log(`  - ${c.name} (~${bytesToMB(c.totalIndexSize).toFixed(3)} MB)`)
    );
    
    let specifyCollectionMode = false;
    if (fullConfig.safeRun) {
      const [responseChar, responseWord] = await promptUser(
        "\nProceed with these collections? (yes/no/specify) [y/n/s]: ",
        ['yes', 'no', 'specify'],
        [
          { value: 'yes', description: 'Process all listed collections' },
          { value: 'no', description: 'Abort the entire operation' },
          { value: 'specify', description: 'Interactively choose which collections to process' }
        ]
      );
      console.log(`User chose: [${responseWord}].`);
      
      if (responseChar === 'n') {
        throw new Error("User aborted.");
      }
      if (responseChar === 's') {
        specifyCollectionMode = true;
      }
    }
    
    // Phase 4: Rebuild process
    console.log("\n--- Phase 4: Beginning rebuild process ---");
    for (const collectionInfo of sortedCollections) {
      if (specifyCollectionMode) {
        const [continueWithColl, continueWord] = await promptUser(
          `\nProcess collection "${collectionInfo.name}"? (y/n/end): `,
          ['yes', 'no', 'end'],
          [
            { value: 'yes', description: 'Process this collection and its indexes' },
            { value: 'no', description: 'Skip this collection and continue to next' },
            { value: 'end', description: 'Stop processing and exit (save progress)' }
          ]
        );
        console.log(`User chose: [${continueWord}].`);
        
        if (continueWithColl === 'n') {
          console.log(`Skipping collection "${collectionInfo.name}".`);
          continue;
        }
        if (continueWithColl === 'e') {
          throw new Error("User chose to end operation.");
        }
      }
      
      const collection = db.collection(collectionInfo.name);
      const result = await rebuildCollectionIndexes(
        db,
        collection,
        allIndexesBackup[collectionInfo.name],
        collectionInfo.indexStats,
        state,
        paths,
        fullConfig
      );
      
      if (result.status !== 'skipped') {
        dbLog.collections[collectionInfo.name] = result.log;
      }
    }
    
    // Calculate final summary
    dbLog.totalTimeSeconds = (new Date().getTime() - new Date(dbLog.startTime).getTime()) / 1000;
    
    let totalInitialSize = 0;
    let totalFinalSize = 0;
    for (const collName in dbLog.collections) {
      totalInitialSize += dbLog.collections[collName].initialSizeMb;
      totalFinalSize += dbLog.collections[collName].finalSizeMb;
    }
    
    dbLog.totalInitialSizeMb = totalInitialSize;
    dbLog.totalFinalSizeMb = totalFinalSize;
    dbLog.totalReclaimedMb = totalInitialSize - totalFinalSize;
    
    console.log("\n\n### ✅✅✅ ALL-CLEAR: DATABASE REBUILD IS FULLY COMPLETE! ✅✅✅ ###");
    
    if (fullConfig.performanceLogging.enabled) {
      console.log("\n--- PERFORMANCE SUMMARY ---");
      console.log(JSON.stringify(dbLog, null, 2));
      writeJsonFile(paths.logFile, dbLog);
      console.log(`\n✅ Performance log saved to: "${paths.logFile}"`);
    }
    
    // Clean up state file on success
    deleteFile(paths.stateFile);
    console.log(`\n✅ Run completed successfully. Removed state file: "${paths.stateFile}"`);
    
  } catch (e) {
    console.error(`\n\n❌❌❌ A CRITICAL ERROR OCCURRED! SCRIPT ABORTED. ❌❌❌`);
    dbLog.error = e instanceof Error ? e.message : String(e);
    
    if (fullConfig.performanceLogging.enabled && paths.logFile) {
      try {
        writeJsonFile(paths.logFile, dbLog);
        console.log(`\n⚠️ Partial performance log with error saved to: "${paths.logFile}"`);
      } catch (writeErr) {
        console.error("Could not write partial log file.", writeErr);
      }
    }
    
    throw e;
  }
  
  return dbLog;
}
