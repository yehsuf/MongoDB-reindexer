/**
 * MongoDB collection compact operations
 * Handles space validation, iterative compaction with convergence detection,
 * primary stepDown for <v8, and optional autoCompact for v8+
 */

import { Db } from 'mongodb';
import {
  CompactConfig,
  CompactDatabaseLog,
  CollectionCompactLog,
  CompactErrorRecord
} from './types.js';
import { ServerVersionInfo, validateMinimumVersion } from './version-detection.js';
import { getLogger } from './logger.js';
import { bytesToMB, formatDuration } from './file-utils.js';
import { detectServerVersion } from './version-detection.js';
import { isIgnored } from './mongodb-utils.js';

// Constants
const MAX_COMPACT_ITERATIONS = 10;
const AUTOCOMPACT_POLL_INTERVAL_MS = 5000;
const AUTOCOMPACT_POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const STEPDOWN_RECONNECT_DELAY_MS = 2000;
const AVAILABILITY_ZONE_TAG = 'availabilityZone';

type ReadPreferenceOptions = {
  mode: 'secondary' | 'secondaryPreferred' | 'primary';
  tags?: Array<Record<string, string>>;
};

type SecondaryTarget = {
  zone: string;
  readPreference: ReadPreferenceOptions;
};

type MemberInfo = {
  _id: number;
  host?: string;
  tags?: Record<string, string>;
};

type MemberStatus = {
  _id: number;
  state?: number;
};

function createCollectionLog(): CollectionCompactLog {
  return {
    startTime: new Date(),
    totalTimeSeconds: 0,
    estimatedSavingsMb: 0,
    measurements: [],
    converged: false,
    finalMeasurementMb: 0,
    iterations: 0,
    errors: []
  };
}

async function runCommandWithReadPreference(
  db: Db,
  commandDoc: Record<string, unknown>,
  readPreference?: ReadPreferenceOptions
): Promise<any> {
  if (readPreference) {
    return db.command(commandDoc as any, { readPreference } as any);
  }
  return db.command(commandDoc as any);
}

async function runAdminCommandWithReadPreference(
  db: Db,
  commandDoc: Record<string, unknown>,
  readPreference?: ReadPreferenceOptions
): Promise<any> {
  if (readPreference) {
    return db.admin().command(commandDoc as any, { readPreference } as any);
  }
  return db.admin().command(commandDoc as any);
}

async function getReplicaSetInfo(db: Db): Promise<{
  configMembers: MemberInfo[];
  statusMembers: MemberStatus[];
}> {
  const configResult = await runAdminCommandWithReadPreference(db, {
    replSetGetConfig: 1
  });
  const statusResult = await runAdminCommandWithReadPreference(db, {
    replSetGetStatus: 1
  });

  return {
    configMembers: configResult?.config?.members ?? [],
    statusMembers: statusResult?.members ?? []
  };
}

async function getPrimaryAvailabilityZone(db: Db): Promise<string | undefined> {
  const { configMembers, statusMembers } = await getReplicaSetInfo(db);
  const statusById = new Map(statusMembers.map(member => [member._id, member]));
  const primaryMember = configMembers.find(member => {
    const status = statusById.get(member._id);
    return status?.state === 1;
  });

  return primaryMember?.tags?.[AVAILABILITY_ZONE_TAG];
}

async function getSecondaryTargets(
  db: Db,
  preferredZones: string[] = []
): Promise<SecondaryTarget[]> {
  const { configMembers, statusMembers } = await getReplicaSetInfo(db);
  const statusById = new Map(statusMembers.map((member: any) => [member._id, member]));

  const targets: SecondaryTarget[] = [];
  const seenHosts = new Set<string>();

  for (const member of configMembers) {
    const status = statusById.get(member._id);
    if (!status || status.state !== 2) {
      continue;
    }

    const availabilityZone = member.tags?.[AVAILABILITY_ZONE_TAG];
    const hostKey = member.host || `member-${member._id}`;
    const zoneKey = availabilityZone || hostKey;

    if (seenHosts.has(hostKey)) {
      continue;
    }

    seenHosts.add(hostKey);

    const readPreference: ReadPreferenceOptions = availabilityZone
      ? { mode: 'secondary', tags: [{ [AVAILABILITY_ZONE_TAG]: availabilityZone }] }
      : { mode: 'secondary' };

    targets.push({
      zone: zoneKey,
      readPreference
    });
  }

  if (preferredZones.length > 0) {
    const preferredSet = new Set(preferredZones);
    return [
      ...targets.filter(target => preferredSet.has(target.zone)),
      ...targets.filter(target => !preferredSet.has(target.zone))
    ];
  }

  return targets;
}

/**
 * Compact all collections in a database with iterative secondary verification
 */
export async function compactCollections(
  db: Db,
  config: CompactConfig
): Promise<CompactDatabaseLog> {
  const startTime = new Date();
  const dbLog: CompactDatabaseLog = {
    clusterName: config.clusterName || 'unknown-cluster',
    dbName: config.dbName,
    mongoVersion: 'unknown',
    startTime: startTime.toISOString(),
    totalTimeSeconds: 0,
    supportsAutoCompact: false,
    steppedDown: false,
    collections: {},
    warnings: []
  };

  try {
    // Detect MongoDB version
    getLogger().info(`\n### Starting collection compact for database: "${config.dbName}" ###`);
    const serverVersion = await detectServerVersion(db);
    dbLog.mongoVersion = serverVersion.fullVersion;
    dbLog.supportsAutoCompact = serverVersion.major >= 8;

    getLogger().info(`-> Detected MongoDB server version: ${serverVersion.fullVersion}`);

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

    // Set defaults
    const minSavingsMb = config.minSavingsMb ?? 5000;
    const convergenceTolerance = config.convergenceTolerance ?? 0.20;
    const minConvergenceSizeMb = config.minConvergenceSizeMb ?? 5000;
    const stepDownTimeoutSeconds = config.stepDownTimeoutSeconds ?? 120;
    const forceStepdown = config.forceStepdown ?? (serverVersion.major < 8);

    getLogger().info(`-> Min savings threshold: ${minSavingsMb}MB`);
    getLogger().info(`-> Convergence tolerance: ±${(convergenceTolerance * 100).toFixed(0)}%`);
    getLogger().info(`-> Min convergence size: ${minConvergenceSizeMb}MB`);

    // Phase 1: Get collections to process
    getLogger().info('\n--- Phase 1: Discovering collections ---');
    const collectionsList = await db.listCollections().toArray();
    let collectionsToProcess = collectionsList
      .map(c => c.name)
      .filter(name => !isIgnored(name, config.ignoredCollections || []));

    if (config.specifiedCollections && config.specifiedCollections.length > 0) {
      collectionsToProcess = collectionsToProcess.filter(name =>
        config.specifiedCollections!.includes(name)
      );
    }

    if (collectionsToProcess.length === 0) {
      getLogger().error('No collections match the specified criteria.');
      dbLog.error = 'No collections match the specified criteria.';
      return dbLog;
    }

    getLogger().info(`Found ${collectionsToProcess.length} collection(s) to process`);
    collectionsToProcess.forEach(name => getLogger().info(`  - ${name}`));

    // Check for filter-aware logic
    const hasFilters = 
      (config.specifiedCollections && config.specifiedCollections.length > 0) ||
      (config.ignoredCollections && config.ignoredCollections.length > 0);
    
    const forceManualCompact = config.forceManualCompact ?? false;
    let enableAutoCompact = config.autoCompact ?? (serverVersion.major >= 8);

    // Handle filter-aware logic for autoCompact
    if (serverVersion.major >= 8 && enableAutoCompact && !forceManualCompact && hasFilters) {
      if (config.safeRun) {
        // Interactive mode: prompt user
        getLogger().warn('\n⚠️  Collection filters provided, but autoCompact is node-wide (affects ALL collections).');
        getLogger().info('Options:');
        getLogger().info('  (y) Use manual compact instead (honors your filters)');
        getLogger().info('  (n) Proceed with autoCompact anyway (filters will be ignored)');
        
        const { promptUser } = await import('./prompts.js');
        const [choice] = await promptUser(
          'Use manual compact instead? (y/n): ',
          ['yes', 'no']
        );
        
        if (choice === 'y') {
          getLogger().info('Using manual compact to honor collection filters.');
          enableAutoCompact = false;
        } else {
          getLogger().warn('Proceeding with autoCompact - collection filters will be ignored.');
        }
      } else {
        // Non-interactive mode: auto-select manual compact
        getLogger().warn('⚠️  Collection filters provided. Defaulting to manual compact (non-interactive mode).');
        enableAutoCompact = false;
      }
    }

    if (forceManualCompact && serverVersion.major >= 8) {
      getLogger().info('--force-manual-compact flag set. Using manual compact.');
      enableAutoCompact = false;
    }

    const useAutoCompactOnly = serverVersion.major >= 8 && enableAutoCompact;

    if (useAutoCompactOnly) {
      getLogger().info('\n--- Phase 2: Skipping manual compact (autoCompact enabled) ---');
      for (const collectionName of collectionsToProcess) {
        dbLog.collections[collectionName] = createCollectionLog();
      }
    } else {
      // Phase 2: Compact all collections on secondaries
      getLogger().info('\n--- Phase 2: Compacting collections on secondaries ---');
      for (const collectionName of collectionsToProcess) {
        const collectionLog = await compactSingleCollection(
          db,
          collectionName,
          serverVersion,
          minSavingsMb,
          convergenceTolerance,
          minConvergenceSizeMb
        );
        dbLog.collections[collectionName] = collectionLog;
      }
    }

    // Phase 3: Handle primary stepDown for <v8
    let previousPrimaryZone: string | undefined;
    if (!useAutoCompactOnly && serverVersion.major < 8 && forceStepdown) {
      previousPrimaryZone = await getPrimaryAvailabilityZone(db);
      getLogger().info('\n--- Phase 3: Stepping down primary (MongoDB <8.0 required for full convergence) ---');
      const stepDownSuccess = await performPrimaryStepDown(db, stepDownTimeoutSeconds);
      dbLog.steppedDown = stepDownSuccess;

      if (stepDownSuccess) {
        getLogger().info('\n--- Phase 4: Re-compacting collections after stepDown ---');
        for (const collectionName of collectionsToProcess) {
          const collectionLog = dbLog.collections[collectionName];
          const recompactLog = await compactSingleCollection(
            db,
            collectionName,
            serverVersion,
            minSavingsMb,
            convergenceTolerance,
            minConvergenceSizeMb,
            true, // isPostStepDown
            previousPrimaryZone ? [previousPrimaryZone] : []
          );
          // Merge with existing log, keeping earlier measurements
          collectionLog.measurements.push(...recompactLog.measurements);
          collectionLog.iterations += recompactLog.iterations;
          collectionLog.steppedDown = true;
          collectionLog.finalMeasurementMb = recompactLog.finalMeasurementMb;
          collectionLog.totalTimeSeconds = (new Date().getTime() - collectionLog.startTime.getTime()) / 1000;
        }
      }
    }

    // Phase 5: Handle autoCompact for v8+
    if (serverVersion.major >= 8 && enableAutoCompact) {
      getLogger().info('\n--- Phase 5: Enabling autoCompact (MongoDB 8.0+) ---');
      getLogger().info('autoCompact is a node-level operation that compacts ALL collections on each node.');
      
      const secondaryTargets = await getSecondaryTargets(db);
      if (secondaryTargets.length < 2) {
        const warning = 'Fewer than 2 distinct secondary targets found. AutoCompact will run on available nodes only.';
        dbLog.warnings.push(warning);
        getLogger().warn(`⚠️  ${warning}`);
      }

      // Run autoCompact on primary first
      const primarySuccess = await runAutoCompactOnNode(db, 'primary');
      if (primarySuccess) {
        getLogger().info('✅ AutoCompact completed on primary');
      } else {
        getLogger().warn('⚠️  AutoCompact did not complete successfully on primary');
      }

      // Run autoCompact on each distinct secondary
      for (const target of secondaryTargets) {
        const secondarySuccess = await runAutoCompactOnNode(db, target.zone, target.readPreference);
        if (secondarySuccess) {
          getLogger().info(`✅ AutoCompact completed on ${target.zone}`);
        } else {
          getLogger().warn(`⚠️  AutoCompact did not complete successfully on ${target.zone}`);
        }
      }

      // Mark all collections as having autoCompact enabled
      for (const collectionName of collectionsToProcess) {
        const collectionLog = dbLog.collections[collectionName] || createCollectionLog();
        collectionLog.autoCompactEnabled = true;
        collectionLog.autoCompactReducedSize = primarySuccess;
        collectionLog.totalTimeSeconds =
          (new Date().getTime() - collectionLog.startTime.getTime()) / 1000;
        dbLog.collections[collectionName] = collectionLog;
      }
    }

    dbLog.totalTimeSeconds = (new Date().getTime() - startTime.getTime()) / 1000;
    getLogger().info(
      `\n✅ Compact operation completed in ${formatDuration(dbLog.totalTimeSeconds)}`
    );

    return dbLog;
  } catch (error) {
    dbLog.totalTimeSeconds = (new Date().getTime() - startTime.getTime()) / 1000;
    const errorMsg = error instanceof Error ? error.message : String(error);
    dbLog.error = errorMsg;
    getLogger().error(`\n❌ Compact operation failed: ${errorMsg}`);
    return dbLog;
  }
}

/**
 * Compact a single collection with iterative verification
 */
async function compactSingleCollection(
  db: Db,
  collectionName: string,
  serverVersion: ServerVersionInfo,
  minSavingsMb: number,
  convergenceTolerance: number,
  minConvergenceSizeMb: number,
  isPostStepDown: boolean = false,
  preferredZones: string[] = []
): Promise<CollectionCompactLog> {
  const startTime = new Date();
  const collectionLog: CollectionCompactLog = {
    startTime,
    totalTimeSeconds: 0,
    estimatedSavingsMb: 0,
    measurements: [],
    converged: false,
    finalMeasurementMb: 0,
    iterations: 0,
    errors: []
  };

  try {
    getLogger().info(`\n--- Collection: "${collectionName}" ---`);

    // Phase A: Validate estimated space savings
    if (!isPostStepDown) {
      const estimatedBytes = await validateSpaceSavings(db, collectionName, serverVersion);
      const estimatedMb = bytesToMB(estimatedBytes);

      // Skip if estimated savings is below minimum threshold
      if (estimatedMb < minSavingsMb) {
        getLogger().info(
          `⏭️  Skipping collection "${collectionName}" - estimated savings ${estimatedMb.toFixed(0)}MB below ${minSavingsMb}MB threshold`
        );
        collectionLog.estimatedSavingsMb = estimatedMb;
        return collectionLog;
      }

      collectionLog.estimatedSavingsMb = estimatedMb;
      getLogger().info(
        `📊 Estimated space savings: ${collectionLog.estimatedSavingsMb.toFixed(0)}MB`
      );
    }

    // Phase B: Iterative compaction until convergence
    getLogger().info(`🔄 Running iterative compact on secondaries...`);
    const convergenceResult = await iterativeCompact(
      db,
      collectionName,
      convergenceTolerance,
      minConvergenceSizeMb,
      preferredZones
    );

    collectionLog.measurements = convergenceResult.measurements;
    collectionLog.converged = convergenceResult.converged;
    collectionLog.iterations = convergenceResult.iterations;
    collectionLog.errors = convergenceResult.errors;
    collectionLog.finalMeasurementMb = bytesToMB(
      convergenceResult.measurements[convergenceResult.measurements.length - 1] || 0
    );

    if (convergenceResult.converged) {
      getLogger().info(
        `✅ Convergence detected after ${convergenceResult.iterations} iteration(s)`
      );
      getLogger().info(
        `   Measurements (MB): [${convergenceResult.measurements
          .map(m => bytesToMB(m).toFixed(0))
          .join(', ')}]`
      );
    } else {
      getLogger().warn(
        `⚠️  No convergence after ${convergenceResult.iterations} iteration(s) (max ${MAX_COMPACT_ITERATIONS})`
      );
      getLogger().warn(
        `   Measurements (MB): [${convergenceResult.measurements
          .map(m => bytesToMB(m).toFixed(0))
          .join(', ')}]`
      );
    }

    // Log errors/retries if any
    if (convergenceResult.errors.length > 0) {
      getLogger().info(`⚠️  Encountered ${convergenceResult.errors.length} error(s) during compaction:`);
      convergenceResult.errors.forEach(err => {
        getLogger().info(`   Iteration ${err.iteration}: ${err.error}`);
        if (err.fallback) {
          getLogger().info(`   → Retried with: ${err.fallback} (${err.retrySucceeded ? '✅' : '❌'})`);
        }
      });
    }

    collectionLog.totalTimeSeconds = (new Date().getTime() - startTime.getTime()) / 1000;
    return collectionLog;
  } catch (error) {
    collectionLog.totalTimeSeconds = (new Date().getTime() - startTime.getTime()) / 1000;
    const errorMsg = error instanceof Error ? error.message : String(error);
    getLogger().error(`❌ Failed to compact "${collectionName}": ${errorMsg}`);
    return collectionLog;
  }
}

/**
 * Validate estimated space savings before compacting
 * Returns estimated bytes to reclaim, or -1 if below threshold
 */
async function validateSpaceSavings(
  db: Db,
  collectionName: string,
  serverVersion: ServerVersionInfo
): Promise<number> {
  try {
    if (serverVersion.major >= 8) {
      // Use dryRun for accurate estimation
      try {
        const result = await db.command({
          compact: collectionName,
          dryRun: true
        } as any);

        if (result.ok === 1 && result.bytesFreed !== undefined) {
          return result.bytesFreed;
        }
      } catch (dryRunError) {
        getLogger().debug(`dryRun not supported for ${collectionName}, falling back to collStats estimate`);
        // Fallback to collStats estimation
      }
    }

    // For v7 and below, or if dryRun failed, estimate from collStats
    return await estimateFromCollStats(db, collectionName);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    getLogger().debug(`Space validation for "${collectionName}" failed: ${errorMsg}`);
    // Return 0 to indicate we couldn't estimate
    return 0;
  }
}

/**
 * Estimate space savings from collection statistics
 */
async function estimateFromCollStats(
  db: Db,
  collectionName: string
): Promise<number> {
  try {
    const stats = await db.command({
      collStats: collectionName
    } as any);

    // Estimate potential savings as difference between storageSize and dataSize
    // This represents fragmentation and potentially reclaimable space
    const storageSize = stats.storageSize || 0;
    const dataSize = stats.size || 0;
    const wastedSpace = Math.max(0, storageSize - dataSize);

    getLogger().debug(`${collectionName}: storageSize=${bytesToMB(storageSize).toFixed(0)}MB, dataSize=${bytesToMB(dataSize).toFixed(0)}MB, estimated savings=${bytesToMB(wastedSpace).toFixed(0)}MB`);

    return wastedSpace;
  } catch (error) {
    getLogger().debug(`Failed to get collStats for ${collectionName}: ${error}`);
    return 0;
  }
}

/**
 * Run compact iteratively until convergence detected
 */
async function iterativeCompact(
  db: Db,
  collectionName: string,
  convergenceTolerance: number,
  minConvergenceSizeMb: number,
  preferredZones: string[] = []
): Promise<{
  measurements: number[];
  converged: boolean;
  iterations: number;
  errors: CompactErrorRecord[];
}> {
  const measurements: number[] = [];
  const errors: CompactErrorRecord[] = [];
  let iteration = 0;

  while (iteration < MAX_COMPACT_ITERATIONS) {
    iteration++;
    try {
      // Run compact with secondary read preference
      const result = await runCompactWithFallback(
        db,
        collectionName,
        iteration,
        preferredZones
      );

      if (result.success && result.sizeMb !== undefined) {
        const sizeBytes = result.sizeMb * 1024 * 1024;
        measurements.push(sizeBytes);

        getLogger().debug(`Iteration ${iteration}: ${result.sizeMb.toFixed(0)}MB`);

        // Check for convergence
        if (measurements.length >= 2) {
          const converged = checkConvergence(
            measurements,
            convergenceTolerance,
            minConvergenceSizeMb * 1024 * 1024
          );
          if (converged) {
            return { measurements, converged: true, iterations: iteration, errors };
          }
        }
      }

      // If errors occurred but command succeeded, record them
      if (result.errors && result.errors.length > 0) {
        errors.push(...result.errors);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      getLogger().debug(`Iteration ${iteration} failed: ${errorMsg}`);
      // Continue to next iteration on error
    }

    // Small delay between iterations
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return {
    measurements,
    converged: false,
    iterations: iteration,
    errors
  };
}

/**
 * Run compact command with fallback error handling
 */
async function runCompactWithFallback(
  db: Db,
  collectionName: string,
  iteration: number,
  preferredZones: string[] = []
): Promise<{
  success: boolean;
  sizeMb?: number;
  errors?: CompactErrorRecord[];
}> {
  const errors: CompactErrorRecord[] = [];

  try {
    const secondaryTargets = await getSecondaryTargets(db, preferredZones);

    if (secondaryTargets.length === 0) {
      const errorMsg = 'No active secondary targets available for compact.';
      getLogger().debug(errorMsg);
      errors.push({
        iteration,
        error: errorMsg,
        retrySucceeded: false,
        fallback: undefined
      });
      return { success: false, errors };
    }

    if (secondaryTargets.length < 2) {
      getLogger().warn('⚠️  Fewer than 2 distinct secondary targets found for compact.');
    }

    let selectedTarget: SecondaryTarget | undefined;
    let successCount = 0;

    for (const target of secondaryTargets.slice(0, 2)) {
      getLogger().info(`\nTargeting Secondary Zone: ${target.zone}`);
      try {
        const result = await runCommandWithReadPreference(
          db,
          { compact: collectionName },
          target.readPreference
        );

        if (result.ok === 1) {
          selectedTarget = selectedTarget ?? target;
          successCount += 1;
          getLogger().debug(`Compact iteration ${iteration} succeeded on ${target.zone}`);
        } else {
          const errorMsg = JSON.stringify(result);
          errors.push({
            iteration,
            error: errorMsg,
            retrySucceeded: false,
            fallback: undefined
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        getLogger().debug(`Compact failed on ${target.zone}: ${errorMsg}`);
        errors.push({
          iteration,
          error: errorMsg,
          retrySucceeded: false,
          fallback: undefined
        });
      }
    }

    if (successCount > 0 && selectedTarget) {
      const sizeMb = await getCollectionSize(
        db,
        collectionName,
        selectedTarget.readPreference
      );
      getLogger().debug(`Compact iteration ${iteration} for ${collectionName}: ${sizeMb.toFixed(0)}MB`);
      return { success: true, sizeMb, errors: errors.length > 0 ? errors : undefined };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    getLogger().debug(`Compact failed for ${collectionName} on iteration ${iteration}: ${errorMsg}`);
    errors.push({
      iteration,
      error: errorMsg,
      retrySucceeded: false,
      fallback: undefined
    });
  }

  return { success: false, errors };
}

/**
 * Get collection size from collStats on the same node used for compact
 */
async function getCollectionSize(
  db: Db,
  collectionName: string,
  readPreference?: ReadPreferenceOptions
): Promise<number> {
  try {
    // Query secondary for size (where we ran compact)
    const stats = await runCommandWithReadPreference(
      db,
      { collStats: collectionName },
      readPreference
    );

    // Return total storage size in MB
    const sizeBytes = stats.storageSize ?? 0;
    return bytesToMB(sizeBytes);
  } catch (error) {
    getLogger().debug(`Failed to get collection size for ${collectionName}: ${error}`);
    return 0;
  }
}

/**
 * Check if measurements have converged within tolerance
 */
function checkConvergence(
  measurements: number[],
  tolerance: number,
  minSize: number
): boolean {
  if (measurements.length < 2) {
    return false;
  }

  // Get first and last measurements
  const firstMeasurement = measurements[0];
  const lastMeasurement = measurements[measurements.length - 1];

  // Special case: If last 2+ measurements are identical, consider converged
  // This means compact isn't doing anything (no space to reclaim)
  if (measurements.length >= 2) {
    const lastTwo = measurements.slice(-2);
    if (lastTwo[0] === lastTwo[1]) {
      // Check if we have 3 identical in a row for extra confidence
      if (measurements.length >= 3) {
        const lastThree = measurements.slice(-3);
        if (lastThree[0] === lastThree[1] && lastThree[1] === lastThree[2]) {
          return true; // 3 identical = definitely converged
        }
      }
    }
  }

  // Both must be above minimum size for normal tolerance check
  if (firstMeasurement < minSize || lastMeasurement < minSize) {
    return false;
  }

  // Calculate tolerance bounds (±tolerance around first measurement)
  const lowerBound = firstMeasurement * (1 - tolerance);
  const upperBound = firstMeasurement * (1 + tolerance);

  // Check if last measurement is within bounds
  return lastMeasurement >= lowerBound && lastMeasurement <= upperBound;
}

/**
 * Perform primary stepDown and wait for secondary promotion
 */
async function performPrimaryStepDown(
  db: Db,
  timeoutSeconds: number
): Promise<boolean> {
  try {
    getLogger().info(`Stepping down primary (timeout: ${timeoutSeconds}s)...`);

    try {
      await db.admin().command({
        replSetStepDown: timeoutSeconds
      } as any);
    } catch (error) {
      // Connection error is expected during stepDown, continue
      const errorMsg = error instanceof Error ? error.message : String(error);
      getLogger().debug(`Expected connection error during stepDown: ${errorMsg}`);
    }

    // Wait for connection to recover
    getLogger().info('Waiting for secondary promotion...');
    await new Promise(resolve => setTimeout(resolve, STEPDOWN_RECONNECT_DELAY_MS));

    // Verify we are now secondary
    const hello = await db.admin().command({ hello: 1 } as any);
    if (hello.secondary === true) {
      getLogger().info('✅ Successfully stepped down to secondary');
      return true;
    } else {
      getLogger().warn('⚠️  Unexpected server state after stepDown');
      return false;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    getLogger().error(`❌ Primary stepDown failed: ${errorMsg}`);
    return false;
  }
}

/**
 * Run autoCompact on a single node (primary or secondary)
 * autoCompact is a node-level admin command that compacts ALL collections on the node
 */
async function runAutoCompactOnNode(
  db: Db,
  targetLabel: string,
  readPreference?: ReadPreferenceOptions
): Promise<boolean> {
  getLogger().info(`Enabling autoCompact on ${targetLabel}...`);

  try {
    // Enable autoCompact with runOnce
    await runAdminCommandWithReadPreference(
      db,
      {
        autoCompact: true,
        freeSpaceTargetMB: 10,
        runOnce: true
      },
      readPreference
    );

    getLogger().info(`AutoCompact enabled on ${targetLabel}, monitoring progress...`);

    const startTime = Date.now();

    // Poll currentOp until autoCompact completes or times out
    while (Date.now() - startTime < AUTOCOMPACT_POLL_TIMEOUT_MS) {
      await new Promise(resolve => setTimeout(resolve, AUTOCOMPACT_POLL_INTERVAL_MS));

      const stillRunning = await isAutoCompactRunning(db, readPreference);
      if (!stillRunning) {
        getLogger().info(`AutoCompact runOnce completed on ${targetLabel}.`);
        return true;
      }
    }

    getLogger().warn(`AutoCompact on ${targetLabel} timed out after ${AUTOCOMPACT_POLL_TIMEOUT_MS}ms`);
    return false;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    getLogger().error(`AutoCompact failed on ${targetLabel}: ${errorMsg}`);
    return false;
  } finally {
    // Always disable autoCompact
    try {
      await runAdminCommandWithReadPreference(
        db,
        { autoCompact: false },
        readPreference
      );
      getLogger().info(`AutoCompact disabled on ${targetLabel}`);
    } catch (error) {
      getLogger().warn(`Failed to disable autoCompact on ${targetLabel}: ${error}`);
    }
  }
}

async function isAutoCompactRunning(
  db: Db,
  readPreference?: ReadPreferenceOptions
): Promise<boolean> {
  try {
    const currentOp = await runAdminCommandWithReadPreference(
      db,
      { currentOp: 1, active: true },
      readPreference
    );
    const inProgress = currentOp?.inprog ?? [];
    return inProgress.some(
      (op: any) =>
        op?.command?.autoCompact !== undefined ||
        (typeof op?.desc === 'string' && op.desc.includes('autoCompact'))
    );
  } catch (error) {
    getLogger().debug(`Failed to check autoCompact status: ${error}`);
    return false;
  }
}
