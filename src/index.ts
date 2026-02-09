/**
 * MongoDB Zero-Downtime Index Rebuilder
 *
 * Universal rebuild script ported from mongosh to TypeScript.
 * Implements the Cover-Swap-Cleanup strategy with dual verification,
 * cluster awareness, state file resumability, and interactive prompts.
 */

import { Db, MongoClient } from 'mongodb';
import {
  RebuildConfig,
  RebuildState,
  IndexStat,
  CollectionInfo,
  IndexDocument,
  DatabaseLog,
  RebuildPaths,
  RebuildCoordinator,
  SessionInfo
} from './types.js';
import {
  getClusterName,
  getReplicaSetName,
  isIgnored
} from './mongodb-utils.js';
import { promptUser } from './prompts.js';
import {
  ensureDir,
  readJsonFile,
  writeJsonFile,
  deleteFile,
  bytesToMB
} from './file-utils.js';
import { DEFAULT_CONFIG } from './constants.js';
import { getLogger } from './logger.js';
import { cleanupOrphanedIndexes } from './orphan-cleanup.js';
import { rebuildCollectionIndexes } from './collection-processor.js';
import { detectServerVersion, getValidOptionsForVersion, validateMinimumVersion } from './version-detection.js';
import {runtimeDeprecatedCleanup} from "./runtime-dep-cleanup.js";
import {PATH_TO_RUNTIME_DIR} from "./paths.js";

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
 * Main rebuild function - accepts a Db instance and configuration
 * This is the library API that can be imported and used programmatically
 */
export async function rebuildIndexes(db: Db, config: RebuildConfig): Promise<DatabaseLog> {
  // Set defaults
  const fullConfig = {
    dbName: config.dbName,
    clusterName: config.clusterName || 'unknown-cluster',
    logDir: config.logDir || DEFAULT_CONFIG.LOG_DIR,
    runtimeDir: config.runtimeDir || DEFAULT_CONFIG.RUNTIME_DIR,
    coverSuffix: config.coverSuffix || DEFAULT_CONFIG.COVER_SUFFIX,
    cheapSuffixField: config.cheapSuffixField || DEFAULT_CONFIG.CHEAP_SUFFIX_FIELD,
    safeRun: config.safeRun !== undefined ? config.safeRun : DEFAULT_CONFIG.SAFE_RUN,
    specifiedCollections: config.specifiedCollections || [],
    ignoredCollections: config.ignoredCollections || [],
    ignoredIndexes: config.ignoredIndexes || [],
    performanceLogging: config.performanceLogging || DEFAULT_CONFIG.PERFORMANCE_LOGGING,
    saveCollectionLog: config.saveCollectionLog !== undefined ? config.saveCollectionLog : false,
    coordinator: config.coordinator
  };

  let state: RebuildState = { completed: {} };
  const dbLog: DatabaseLog = {
    clusterName: fullConfig.clusterName,
    dbName: fullConfig.dbName,
    startTime: new Date().toISOString(),
    totalTimeSeconds: 0,
    totalInitialSizeMb: 0,
    totalFinalSizeMb: 0,
    totalReclaimedMb: 0,
    collections: {},
    warnings: []
  };

  let paths: RebuildPaths = {
    stateFile: '',
    backupFile: '',
    logFile: ''
  };

  try {
    getLogger().info(`\n### Starting UNIVERSAL index rebuild for database: "${fullConfig.dbName}" ###`);

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
      logFile: `${fullConfig.logDir}/${clusterName}_rebuild_log_${timestamp}.json`,
      collectionLogDir: fullConfig.saveCollectionLog ? `${fullConfig.logDir}/${clusterName}_collections_${timestamp}` : undefined
    };

    ensureDir(fullConfig.runtimeDir);
    if (fullConfig.performanceLogging.enabled) {
      ensureDir(fullConfig.logDir);
    }
    if (fullConfig.saveCollectionLog && paths.collectionLogDir) {
      ensureDir(paths.collectionLogDir);
    }

    // Load state if exists
    state = readJsonFile(paths.stateFile, { completed: {}, sessions: [] });
    if (Object.keys(state.completed).length > 0) {
      getLogger().info(`-> Loading state from previous run...`);
    }

    // Load cumulative log from previous sessions
    let previousSessionCount = 0;
    let cumulativeTimeSeconds = 0;
    let prevIndexCount = 0;

    if (state.cumulativeLog) {
      previousSessionCount = state.sessions?.length || 0;
      cumulativeTimeSeconds = state.cumulativeLog.totalTimeSeconds;
      prevIndexCount = Object.values(state.cumulativeLog.collections)
        .reduce((sum, coll) => sum + Object.keys(coll.indexes).length, 0);

      // Initialize dbLog from cumulative data
      dbLog.startTime = state.cumulativeLog.startTime; // Keep original first session start time
      dbLog.collections = JSON.parse(JSON.stringify(state.cumulativeLog.collections)); // Deep copy
      dbLog.warnings = [...state.cumulativeLog.warnings];

      getLogger().info(`-> Loading cumulative log from ${previousSessionCount} previous session(s)...`);
      getLogger().info(`   ↳ Previous sessions rebuilt ${prevIndexCount} indexes`);
      getLogger().info(`   ↳ Previous cumulative time: ${cumulativeTimeSeconds.toFixed(1)}s`);
      getLogger().info(`   ↳ Previous cumulative reclaimed: ${state.cumulativeLog.totalReclaimedMb.toFixed(2)}MB`);
    }

    // Track current session
    const currentSessionId = `session_${timestamp}`;
    const currentSession: SessionInfo = {
      sessionId: currentSessionId,
      startTime: new Date().toISOString(),
      totalTimeSeconds: 0,
      indexesRebuilt: 0,
      status: 'in-progress'
    };
    state.sessions = state.sessions || [];
    state.sessions.push(currentSession);

    // Phase 0: Cleanup orphans
    await cleanupOrphanedIndexes(db, fullConfig, state);
    await runtimeDeprecatedCleanup(PATH_TO_RUNTIME_DIR, clusterName);

    // Detect MongoDB server version
    const serverVersion = await detectServerVersion(db);
    getLogger().info(`\n-> Detected MongoDB server version: ${serverVersion.fullVersion}`);

    // Validate minimum MongoDB version (v4.4+)
    if (!validateMinimumVersion(serverVersion, '4.4')) {
      const errorMsg = `MongoDB v4.4+ required. Current version: v${serverVersion.fullVersion}`;
      getLogger().error(`\n❌ ${errorMsg}`);
      getLogger().error(`\nReason: Requires:
  - buildState property for index build status detection
  - $indexStats aggregation with building flag
  - Reliable index verification across replica sets`);
      throw new Error(errorMsg);
    }
    getLogger().info(`✅ MongoDB version requirement satisfied (v${serverVersion.major}.${serverVersion.minor}+)`);

    const validOptions = getValidOptionsForVersion(serverVersion);
    getLogger().debug(`-> Supported index options: ${validOptions.join(', ')}`);

    // Phase 2: Discover and backup collections
    getLogger().info("\n--- Phase 2: Discovering and backing up all collections ---");
    const collectionsList = await db.listCollections().toArray();
    const allCollectionNames = collectionsList.map(c => c.name);
    const allIndexesBackup: Record<string, IndexDocument[]> = {};
    const collectionStatsList: CollectionInfo[] = [];

    for (const name of allCollectionNames) {
      const collection = db.collection(name);
      allIndexesBackup[name] = await collection.indexes() as IndexDocument[];

      const stats = await db.command({
        collStats: name
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
    getLogger().info(`✅ Index backup created at: "${paths.backupFile}"`);

    // Phase 3: Filter and sort collections
    getLogger().info("\n--- Phase 3: Filtering and sorting target collections ---");
    let collectionsToProcess: CollectionInfo[];

    if (fullConfig.specifiedCollections.length > 0) {
      collectionsToProcess = collectionStatsList.filter(c =>
        fullConfig.specifiedCollections.includes(c.name)
      );
      if (fullConfig.ignoredCollections.length > 0) {
        getLogger().warn("⚠️ WARNING: `specifiedCollections` is overriding `ignoredCollections`.");
      }
    } else {
      collectionsToProcess = collectionStatsList.filter(c =>
        !isIgnored(c.name, fullConfig.ignoredCollections)
      );
    }

    if (collectionsToProcess.length === 0) {
      getLogger().error("No collections match the specified criteria.");
      dbLog.error = "No collections match the specified criteria.";
      return dbLog;
    }

    for (const coll of collectionsToProcess) {
      coll.totalIndexSize = coll.indexStats.reduce((sum, stat) => sum + (stat.size || 0), 0);
    }

    const sortedCollections = collectionsToProcess.sort((a, b) => b.totalIndexSize - a.totalIndexSize);

    getLogger().info("\nCollections to be processed (largest first):");
    sortedCollections.forEach(c =>
      getLogger().info(`  - ${c.name} (~${bytesToMB(c.totalIndexSize).toFixed(3)} MB)`)
    );

    let specifyCollectionMode = false;
    if (fullConfig.safeRun) {
      const [responseChar, responseWord] = await promptUser(
        "\nProceed with these collections? (yes/no/specify) [y/n/s]: ",
        ['yes', 'no', 'specify'],
        'collections'
      );
      getLogger().info(`User chose: [${responseWord}].`);

      if (responseChar === 'n') {
        getLogger().info("User chose not to proceed. Operation aborted.");
        dbLog.warnings.push("User aborted.");
        return dbLog;
      }
      if (responseChar === 's') {
        specifyCollectionMode = true;
      }
    }

    // Phase 4: Rebuild process
    getLogger().info("\n--- Phase 4: Beginning rebuild process ---");

    // Notify coordinator that rebuild is starting
    await notifyCoordinator(fullConfig.coordinator, 'onRebuildStart', fullConfig.dbName, sortedCollections.length);

    for (const collectionInfo of sortedCollections) {
      if (specifyCollectionMode) {
        const [continueWithColl, continueWord] = await promptUser(
          `\nProcess collection "${collectionInfo.name}"? (y/n/end): `,
          ['yes', 'no', 'end'],
          'collection-specify'
        );
        getLogger().info(`User chose: [${continueWord}].`);

        if (continueWithColl === 'n') {
          getLogger().info(`Skipping collection "${collectionInfo.name}".`);
          continue;
        }
        if (continueWithColl === 'e') {
          getLogger().info(`User chose to end operation. Finishing rebuild...`);
          break;
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
        fullConfig,
        validOptions,
        dbLog
      );

      if (result.status !== 'skipped') {
        const collectionName = collectionInfo.name;
        const newCollectionLog = result.log;
        const existingCollectionLog = dbLog.collections[collectionName];

        // Phase 3: Merge collection results (combine with previous sessions)
        if (existingCollectionLog) {
          // Collection was processed in a previous session - merge results
          const mergedLog = {
            ...existingCollectionLog,
            indexes: {
              ...existingCollectionLog.indexes,
              ...newCollectionLog.indexes  // New indexes from current session override/add to existing
            }
          };

          // Recalculate collection totals
          mergedLog.totalTimeSeconds = existingCollectionLog.totalTimeSeconds + newCollectionLog.totalTimeSeconds;
          mergedLog.finalSizeMb = newCollectionLog.finalSizeMb;  // Use most recent final size
          mergedLog.reclaimedMb = mergedLog.initialSizeMb - mergedLog.finalSizeMb;

          dbLog.collections[collectionName] = mergedLog;

          getLogger().info(`   [CUMULATIVE] Time for "${collectionName}": ${mergedLog.totalTimeSeconds.toFixed(2)}s`);
          getLogger().info(`   [CUMULATIVE] Space reclaimed: ${mergedLog.reclaimedMb.toFixed(2)}MB`);
        } else {
          // First time seeing this collection in any session
          dbLog.collections[collectionName] = newCollectionLog;
        }

        // Update current session stats
        currentSession.indexesRebuilt += Object.keys(newCollectionLog.indexes).length;

        // Save cumulative state after each collection (for crash recovery)
        state.cumulativeLog = dbLog;
        writeJsonFile(paths.stateFile, state);

        // Save individual collection log if enabled
        if (fullConfig.saveCollectionLog && paths.collectionLogDir) {
          const collectionLogPath = `${paths.collectionLogDir}/${collectionInfo.name}_log.json`;
          writeJsonFile(collectionLogPath, dbLog.collections[collectionName]);
          getLogger().info(`✅ Collection log saved to: "${collectionLogPath}"`);
        }
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

    // Phase 4: Update current session and finalize
    const currentSessionEndTime = new Date().toISOString();
    const currentSessionDuration = (new Date(currentSessionEndTime).getTime() - new Date(currentSession.startTime).getTime()) / 1000;
    currentSession.endTime = currentSessionEndTime;
    currentSession.totalTimeSeconds = currentSessionDuration;
    currentSession.status = 'completed';

    // Phase 5: Build session history for final log
    dbLog.sessionHistory = state.sessions?.map(session => ({
      sessionId: session.sessionId,
      startTime: session.startTime,
      endTime: session.endTime || new Date().toISOString(),
      durationSeconds: session.totalTimeSeconds,
      indexesRebuilt: session.indexesRebuilt,
      status: session.status as 'completed' | 'failed'
    })) || [];

    // Notify coordinator that rebuild is complete
    await notifyCoordinator(
      fullConfig.coordinator,
      'onRebuildComplete',
      fullConfig.dbName,
      dbLog.totalReclaimedMb,
      dbLog.totalTimeSeconds,
      true
    );

    getLogger().info("\n\n### ✅✅✅ ALL-CLEAR: DATABASE REBUILD IS FULLY COMPLETE! ✅✅✅ ###");

    if (fullConfig.performanceLogging.enabled) {
      getLogger().info("\n--- PERFORMANCE SUMMARY ---");
      getLogger().info(JSON.stringify(dbLog, null, 2));
      writeJsonFile(paths.logFile, dbLog);
      getLogger().info(`\n✅ Performance log saved to: "${paths.logFile}"`);
    }

    // Log multi-session summary if more than one session
    if (dbLog.sessionHistory && dbLog.sessionHistory.length > 1) {
      getLogger().info(`\n📊 Multi-Session Summary:`);
      getLogger().info(`   Total sessions: ${dbLog.sessionHistory.length}`);
      getLogger().info(`   Total time (all sessions): ${dbLog.totalTimeSeconds.toFixed(2)}s`);
      const totalIndexesRebuilt = dbLog.sessionHistory.reduce((sum, session) => sum + session.indexesRebuilt, 0);
      getLogger().info(`   Total indexes rebuilt: ${totalIndexesRebuilt}`);
      getLogger().info(`   Total space reclaimed: ${dbLog.totalReclaimedMb.toFixed(2)}MB`);
      dbLog.sessionHistory.forEach((session, idx) => {
        getLogger().info(`\n   Session ${idx + 1}: ${session.sessionId}`);
        getLogger().info(`     Duration: ${session.durationSeconds.toFixed(2)}s`);
        getLogger().info(`     Indexes rebuilt: ${session.indexesRebuilt}`);
        getLogger().info(`     Status: ${session.status}`);
      });
    }

    // Clean up state file on success
    deleteFile(paths.stateFile);
    getLogger().info(`\n✅ Run completed successfully. Removed state file: "${paths.stateFile}"`);

    // Clean up backup file on success
    deleteFile(paths.backupFile);
    getLogger().info(`\n✅ Removed schema backup file (unused in this mode): "${paths.backupFile}"`);

  } catch (e) {
    getLogger().error(`\n\n❌❌❌ A CRITICAL ERROR OCCURRED! SCRIPT ABORTED. ❌❌❌`);
    dbLog.error = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && e.stack) {
      dbLog.errorStack = e.stack;
    }

    if (fullConfig.performanceLogging.enabled && paths.logFile) {
      try {
        writeJsonFile(paths.logFile, dbLog);
        getLogger().info(`\n⚠️ Partial performance log with error saved to: "${paths.logFile}"`);
      } catch (writeErr) {
        getLogger().error("Could not write partial log file: " + String(writeErr));
      }
    }

    throw e;
  }

  return dbLog;
}

export { cleanupOrphanedIndexes };
export { compactCollections } from './compact-operations.js';
export { ConsoleLogger, SilentLogger, getLogger, setLogger } from './logger.js';
export type { ILogger } from './logger.js';
export type { RebuildCoordinator, CompactConfig, CompactDatabaseLog, CollectionCompactLog } from './types.js';
export { detectServerVersion, getValidOptionsForVersion, filterIndexOptions } from './version-detection.js';
export type { ServerVersionInfo } from './version-detection.js';
