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
  RebuildCoordinator
} from './types';
import {
  getClusterName,
  getReplicaSetName,
  isIgnored
} from './mongodb-utils';
import { promptUser } from './prompts';
import {
  ensureDir,
  readJsonFile,
  writeJsonFile,
  deleteFile,
  bytesToMB
} from './file-utils';
import { DEFAULT_CONFIG } from './constants';
import { getLogger } from './logger';
import { cleanupOrphanedIndexes } from './orphan-cleanup';
import { rebuildCollectionIndexes } from './collection-processor';
import { detectServerVersion, getValidOptionsForVersion } from './version-detection';

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
    logDir: config.logDir || DEFAULT_CONFIG.LOG_DIR,
    runtimeDir: config.runtimeDir || DEFAULT_CONFIG.RUNTIME_DIR,
    coverSuffix: config.coverSuffix || DEFAULT_CONFIG.COVER_SUFFIX,
    cheapSuffixField: config.cheapSuffixField || DEFAULT_CONFIG.CHEAP_SUFFIX_FIELD,
    safeRun: config.safeRun !== undefined ? config.safeRun : DEFAULT_CONFIG.SAFE_RUN,
    specifiedCollections: config.specifiedCollections || [],
    ignoredCollections: config.ignoredCollections || [],
    ignoredIndexes: config.ignoredIndexes || [],
    performanceLogging: config.performanceLogging || DEFAULT_CONFIG.PERFORMANCE_LOGGING,
    coordinator: config.coordinator
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
      logFile: `${fullConfig.logDir}/${clusterName}_rebuild_log_${timestamp}.json`
    };

    ensureDir(fullConfig.runtimeDir);
    if (fullConfig.performanceLogging.enabled) {
      ensureDir(fullConfig.logDir);
    }

    // Load state if exists
    state = readJsonFile(paths.stateFile, { completed: {} });
    if (Object.keys(state.completed).length > 0) {
      getLogger().info(`-> Loading state from previous run...`);
    }

    // Phase 0: Cleanup orphans
    await cleanupOrphanedIndexes(db, fullConfig);

    // Detect MongoDB server version
    const serverVersion = await detectServerVersion(db);
    getLogger().info(`\n-> Detected MongoDB server version: ${serverVersion.fullVersion}`);
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
      throw new Error("No collections match the specified criteria.");
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
        throw new Error("User aborted.");
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
        fullConfig,
        validOptions
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

    // Clean up state file on success
    deleteFile(paths.stateFile);
    getLogger().info(`\n✅ Run completed successfully. Removed state file: "${paths.stateFile}"`);

  } catch (e) {
    getLogger().error(`\n\n❌❌❌ A CRITICAL ERROR OCCURRED! SCRIPT ABORTED. ❌❌❌`);
    dbLog.error = e instanceof Error ? e.message : String(e);

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
export { ILogger, ConsoleLogger, SilentLogger, getLogger, setLogger } from './logger';
export { RebuildCoordinator } from './types';
export { ServerVersionInfo, detectServerVersion, getValidOptionsForVersion, filterIndexOptions } from './version-detection';
