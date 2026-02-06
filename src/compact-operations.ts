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
import { ServerVersionInfo } from './version-detection.js';
import { getLogger } from './logger.js';
import { bytesToMB, formatDuration } from './file-utils.js';
import { detectServerVersion } from './version-detection.js';
import { isIgnored } from './mongodb-utils.js';

// Constants
const MAX_COMPACT_ITERATIONS = 10;
const AUTOCOMPACT_POLL_INTERVAL_MS = 5000;
const AUTOCOMPACT_POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const STEPDOWN_RECONNECT_DELAY_MS = 2000;

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

    // Set defaults
    const minSavingsMb = config.minSavingsMb ?? 5000;
    const convergenceTolerance = config.convergenceTolerance ?? 0.20;
    const minConvergenceSizeMb = config.minConvergenceSizeMb ?? 5000;
    const stepDownTimeoutSeconds = config.stepDownTimeoutSeconds ?? 120;
    const forceStepdown = config.forceStepdown ?? (serverVersion.major < 8);
    const enableAutoCompact = config.autoCompact ?? false;

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

    // Phase 3: Handle primary stepDown for <v8
    if (serverVersion.major < 8 && forceStepdown) {
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
            true // isPostStepDown
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
      for (const collectionName of collectionsToProcess) {
        const collectionLog = dbLog.collections[collectionName];
        const autoCompactSuccess = await enableAndMonitorAutoCompact(db, collectionName);
        collectionLog.autoCompactEnabled = true;
        collectionLog.autoCompactReducedSize = autoCompactSuccess;
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
  isPostStepDown: boolean = false
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
      minConvergenceSizeMb
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
  minConvergenceSizeMb: number
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
      const result = await runCompactWithFallback(db, collectionName, iteration);

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
  iteration: number
): Promise<{
  success: boolean;
  sizeMb?: number;
  errors?: CompactErrorRecord[];
}> {
  const errors: CompactErrorRecord[] = [];

  // Try to run compact on secondary with proper readPreference syntax
  try {
    // Use the correct syntax: db.command(commandDoc, options)
    const result = await db.command(
      { compact: collectionName },
      { readPreference: 'secondary' } as any
    );

    if (result.ok === 1) {
      // Get actual size from collStats after compact
      const sizeMb = await getCollectionSize(db, collectionName);
      getLogger().debug(`Compact iteration ${iteration} for ${collectionName}: ${sizeMb.toFixed(0)}MB`);
      return { success: true, sizeMb, errors: errors.length > 0 ? errors : undefined };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // If readPreference on secondary fails, try on primary as fallback
    if (errorMsg.includes('topology') || errorMsg.includes('secondary') || errorMsg.includes('read preference')) {
      getLogger().debug(`Secondary compact failed for ${collectionName}, retrying on primary: ${errorMsg}`);

      errors.push({
        iteration,
        error: errorMsg,
        retrySucceeded: false,
        fallback: 'compact on primary'
      });

      try {
        // Retry on primary
        const retryResult = await db.command({
          compact: collectionName
        } as any);

        if (retryResult.ok === 1) {
          const sizeMb = await getCollectionSize(db, collectionName);
          getLogger().debug(`Compact iteration ${iteration} for ${collectionName} (primary): ${sizeMb.toFixed(0)}MB`);
          errors[errors.length - 1].retrySucceeded = true;
          return { success: true, sizeMb, errors };
        }
      } catch (retryError) {
        const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
        getLogger().debug(`Primary compact also failed: ${retryMsg}`);
        return { success: false, errors };
      }
    }

    getLogger().debug(`Compact failed for ${collectionName} on iteration ${iteration}: ${errorMsg}`);
    errors.push({
      iteration,
      error: errorMsg,
      retrySucceeded: false,
      fallback: undefined
    });

    return { success: false, errors };
  }

  return { success: false, errors };
}

/**
 * Get collection size from collStats on secondary (where compact ran)
 */
async function getCollectionSize(db: Db, collectionName: string): Promise<number> {
  try {
    // Query secondary for size (where we ran compact)
    const stats = await db.command(
      { collStats: collectionName },
      { readPreference: 'secondary' } as any
    );

    // Return total storage size in MB
    const sizeBytes = stats.storageSize || stats.size || 0;
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
 * Enable autoCompact and monitor for primary size reduction
 */
async function enableAndMonitorAutoCompact(
  db: Db,
  collectionName: string
): Promise<boolean> {
  try {
    getLogger().info(`Enabling autoCompact for "${collectionName}"...`);

    // Enable autoCompact
    await db.command({
      autoCompact: true,
      freeSpaceTargetMB: 10,
      runOnce: false
    } as any);

    getLogger().info('AutoCompact enabled, monitoring primary size...');

    // Monitor for size reduction
    const startStats = await db.command({
      collStats: collectionName
    } as any);
    const startSize = startStats.size || 0;

    let reduced = false;
    const startTime = Date.now();

    while (Date.now() - startTime < AUTOCOMPACT_POLL_TIMEOUT_MS) {
      await new Promise(resolve => setTimeout(resolve, AUTOCOMPACT_POLL_INTERVAL_MS));

      const currentStats = await db.command({
        collStats: collectionName
      } as any);
      const currentSize = currentStats.size || 0;

      if (currentSize < startSize) {
        getLogger().info(
          `✅ Primary size reduced: ${bytesToMB(startSize).toFixed(0)}MB → ${bytesToMB(currentSize).toFixed(0)}MB`
        );
        reduced = true;
        break;
      }
    }

    // Disable autoCompact
    await db.command({
      autoCompact: false
    } as any);

    getLogger().info('AutoCompact disabled');
    return reduced;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    getLogger().error(`AutoCompact monitoring failed: ${errorMsg}`);
    return false;
  }
}
