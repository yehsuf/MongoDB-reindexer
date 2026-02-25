/**
 * Index operation utilities
 * Handles index verification and safety checks
 */

import { Collection, Db } from 'mongodb';
import { VALID_INDEX_OPTIONS } from './types.js';
import { getLogger } from './logger.js';

/**
 * Verify that an index exists, is ready, and matches expected specification
 */
export async function verifyIndex(
  collection: Collection,
  indexName: string,
  expectedKey: Record<string, any>,
  expectedOptions: Record<string, any>
): Promise<boolean> {
  try {
    // Log the exact function call
    getLogger().debug(`  [VERIFY] ===== FUNCTION CALL START =====`);
    getLogger().debug(`  [VERIFY] Function: verifyIndex()`);
    getLogger().debug(`  [VERIFY] Parameters:`);
    getLogger().debug(`    - indexName: ${indexName}`);
    getLogger().debug(`    - expectedKey: ${JSON.stringify(expectedKey)}`);
    getLogger().debug(`    - expectedOptions: ${JSON.stringify(expectedOptions)}`);
    getLogger().debug(`    - collection: ${collection.collectionName}`);

    // Command 1: getIndexes()
    getLogger().debug(`  [VERIFY] ===== COMMAND 1: collection.indexes() =====`);
    const allIndexes = await collection.indexes();
    getLogger().debug(`  [VERIFY] Result count: ${allIndexes.length} indexes`);
    getLogger().debug(`  [VERIFY] All indexes: ${JSON.stringify(allIndexes.map(i => i.name))}`);

    const foundIndex = allIndexes.find(i => i.name === indexName);

    if (!foundIndex) {
      getLogger().error(`  [SAFETY CHECK FAILED] Index '${indexName}' was not found.`);
      return false;
    }

    getLogger().debug(`  [VERIFY] Found index details:`);
    getLogger().debug(`    ${JSON.stringify(foundIndex, null, 2)}`);

    // Check if index is still building (has buildState property from getIndexes)
    if ((foundIndex as any).buildState) {
      getLogger().error(`  [SAFETY CHECK FAILED] Index '${indexName}' is still building or failed (buildState: ${(foundIndex as any).buildState}).`);
      return false;
    }

    // Check key matches
    if (JSON.stringify(foundIndex.key) !== JSON.stringify(expectedKey)) {
      getLogger().error(`  [SAFETY CHECK FAILED] Index '${indexName}' key mismatch.`);
      return false;
    }

    // Check options match
    const finalOptsClean: Record<string, any> = {};
    for (const opt of VALID_INDEX_OPTIONS) {
      if (Object.prototype.hasOwnProperty.call(foundIndex, opt)) {
        finalOptsClean[opt] = foundIndex[opt];
      }
    }

    const optionsMatch = JSON.stringify(finalOptsClean) === JSON.stringify(expectedOptions);
    if (!optionsMatch) {
      getLogger().error(`  [SAFETY CHECK FAILED] Index '${indexName}' options mismatch.`);
      return false;
    }

    // Command 2: $indexStats aggregation
    getLogger().debug(`  [VERIFY] ===== COMMAND 2: aggregate([{$indexStats:{}}]).toArray() =====`);
    getLogger().debug(`  [VERIFY] MongoDB Command: db.${collection.collectionName}.aggregate([{\\$indexStats:{}}]).toArray()`);
    try {
      const indexStats = await collection.aggregate([
        { $indexStats: {} }
      ]).toArray();

      getLogger().debug(`  [VERIFY] Result count: ${indexStats.length} index stats`);
      getLogger().debug(`  [VERIFY] Index stat names: ${JSON.stringify(indexStats.map((s: any) => s.name))}`);

      const stat = (indexStats as any[]).find((s: any) => s.name === indexName);
      if (stat) {
        getLogger().debug(`  [VERIFY] Found stat for index '${indexName}':`);
        getLogger().debug(`    ${JSON.stringify(stat, null, 2)}`);

        if (stat.building === true) {
          getLogger().error(`  [SAFETY CHECK FAILED] Index '${indexName}' is still building (building: true from $indexStats).`);
          return false;
        }
      } else {
        getLogger().debug(`  [VERIFY] Index stat not found in $indexStats results`);
      }
      getLogger().debug(`  [VERIFY] ✅ Index confirmed not building via $indexStats`);
    } catch (statsError) {
      getLogger().debug(`  [VERIFY] ⚠️  Could not check $indexStats: ${statsError}`);
      // Continue - if we can't get stats, rely on getIndexes() check
    }

    getLogger().info(`  [SAFETY CHECK PASSED] Index '${indexName}' is valid and ready.`);
    getLogger().debug(`  [VERIFY] ===== FUNCTION CALL END (SUCCESS) =====`);
    return true;
  } catch (e) {
    getLogger().error(`  [SAFETY CHECK FAILED] Error during verification for '${indexName}'.`);
    getLogger().error(`  [VERIFY] Exception: ${e}`);
    getLogger().debug(`  [VERIFY] ===== FUNCTION CALL END (ERROR) =====`);
    return false;
  }
}

/**
 * Quick check if an existing covering index can be reused
 * Used to determine if covering index from previous run is valid
 * Returns true only if: exists, not building, key and options match
 */
export async function canReuseCoveringIndex(
  collection: Collection,
  indexName: string,
  expectedKey: Record<string, any>,
  expectedOptions: Record<string, any>
): Promise<boolean> {
  try {
    // Log the exact function call
    getLogger().debug(`  [REUSE] ===== FUNCTION CALL START =====`);
    getLogger().debug(`  [REUSE] Function: canReuseCoveringIndex()`);
    getLogger().debug(`  [REUSE] Parameters:`);
    getLogger().debug(`    - indexName: ${indexName}`);
    getLogger().debug(`    - expectedKey: ${JSON.stringify(expectedKey)}`);
    getLogger().debug(`    - expectedOptions: ${JSON.stringify(expectedOptions)}`);
    getLogger().debug(`    - collection: ${collection.collectionName}`);

    // Command 1: getIndexes()
    getLogger().debug(`  [REUSE] ===== COMMAND 1: collection.indexes() =====`);
    const allIndexes = await collection.indexes();
    getLogger().debug(`  [REUSE] Result count: ${allIndexes.length} indexes`);
    getLogger().debug(`  [REUSE] All index names: ${JSON.stringify(allIndexes.map(i => i.name))}`);

    const foundIndex = allIndexes.find(i => i.name === indexName);

    if (!foundIndex) {
      getLogger().debug(`  [REUSE] ❌ Index '${indexName}' not found`);
      return false;
    }

    getLogger().debug(`  [REUSE] ✅ Index '${indexName}' found`);
    getLogger().debug(`  [REUSE] Found index details:`);
    getLogger().debug(`    ${JSON.stringify(foundIndex, null, 2)}`);

    // Check if index is still building (has buildState property from getIndexes)
    if ((foundIndex as any).buildState) {
      getLogger().debug(`  [REUSE] ❌ Index has buildState: ${(foundIndex as any).buildState}`);
      return false;
    }
    getLogger().debug(`  [REUSE] ✅ No buildState property - index is READY`);

    // Check key matches
    if (JSON.stringify(foundIndex.key) !== JSON.stringify(expectedKey)) {
      getLogger().debug(`  [REUSE] ❌ Index key mismatch`);
      getLogger().debug(`    Found key: ${JSON.stringify(foundIndex.key)}`);
      getLogger().debug(`    Expected key: ${JSON.stringify(expectedKey)}`);
      return false;
    }
    getLogger().debug(`  [REUSE] ✅ Index key matches expected`);

    // Check options match
    const foundOptsClean: Record<string, any> = {};
    for (const opt of VALID_INDEX_OPTIONS) {
      if (Object.prototype.hasOwnProperty.call(foundIndex, opt)) {
        foundOptsClean[opt] = foundIndex[opt];
      }
    }

    if (JSON.stringify(foundOptsClean) !== JSON.stringify(expectedOptions)) {
      getLogger().debug(`  [REUSE] ❌ Index options mismatch`);
      getLogger().debug(`    Found options: ${JSON.stringify(foundOptsClean)}`);
      getLogger().debug(`    Expected options: ${JSON.stringify(expectedOptions)}`);
      return false;
    }
    getLogger().debug(`  [REUSE] ✅ Index options match expected`);

    // Command 2: $indexStats aggregation
    getLogger().debug(`  [REUSE] ===== COMMAND 2: aggregate([{$indexStats:{}}]).toArray() =====`);
    getLogger().debug(`  [REUSE] MongoDB Command: db.${collection.collectionName}.aggregate([{\\$indexStats:{}}]).toArray()`);
    try {
      const indexStats = await collection.aggregate([
        { $indexStats: {} }
      ]).toArray();

      getLogger().debug(`  [REUSE] Result count: ${indexStats.length} index stats`);
      getLogger().debug(`  [REUSE] Index stat names: ${JSON.stringify(indexStats.map((s: any) => s.name))}`);

      const stat = (indexStats as any[]).find((s: any) => s.name === indexName);
      if (stat) {
        getLogger().debug(`  [REUSE] Found stat for index '${indexName}':`);
        getLogger().debug(`    ${JSON.stringify(stat, null, 2)}`);

        if (stat.building === true) {
          getLogger().debug(`  [REUSE] ❌ Index is building: building=true`);
          return false;
        }
        getLogger().debug(`  [REUSE] ✅ Index is not building (building is not true)`);
      } else {
        getLogger().debug(`  [REUSE] ⚠️  Index stat not found in $indexStats results`);
      }
    } catch (statsError) {
      getLogger().debug(`  [REUSE] ⚠️  Could not check $indexStats: ${statsError}`);
      // Continue - if we can't get stats, rely on previous checks
    }

    // All checks passed - index can be reused
    getLogger().debug(`  [REUSE] ✅ All checks passed - index is ready to reuse`);
    getLogger().debug(`  [REUSE] ===== FUNCTION CALL END (SUCCESS) =====`);
    return true;
  } catch (e) {
    getLogger().debug(`  [REUSE] ❌ Error checking if index can be reused: ${e}`);
    getLogger().debug(`  [REUSE] ===== FUNCTION CALL END (ERROR) =====`);
    return false;
  }
}

/**
 * Determines the readiness state of a covering index without being destructive.
 * Returns:
 *   'absent'   – index does not exist at all
 *   'building' – index exists but has a buildState (still in progress server-side)
 *   'invalid'  – index exists but key spec does not match
 *   'ready'    – index exists, not building, and key matches
 */
export async function checkCoveringIndexStatus(
  collection: Collection,
  indexName: string,
  key: Record<string, unknown>
): Promise<'ready' | 'building' | 'invalid' | 'absent'> {
  try {
    const allIndexes = await collection.indexes();
    const idx = allIndexes.find((i: any) => i.name === indexName);
    if (!idx) return 'absent';
    if ((idx as any).buildState) return 'building';
    const keyMatches = JSON.stringify(idx.key) === JSON.stringify(key);
    if (!keyMatches) return 'invalid';
    return 'ready';
  } catch {
    return 'absent';
  }
}

/**
 * Polls until a named index build completes, times out, or the index disappears.
 * Returns:
 *   'complete'  – index finished building
 *   'timeout'   – timeoutMs elapsed with build still in progress
 *   'not_found' – index no longer appears in collection.indexes()
 */
export async function waitForIndexBuild(
  collection: Collection,
  indexName: string,
  timeoutMs: number,
  onPoll?: (elapsedMs: number) => void
): Promise<'complete' | 'timeout' | 'not_found'> {
  const startedAt = Date.now();
  let delay = 5_000;
  let atlasM0Mode = false;

  while (true) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= timeoutMs) return 'timeout';

    const allIndexes = await collection.indexes();
    const idx = allIndexes.find((i: any) => i.name === indexName);
    if (!idx) return 'not_found';
    if (!(idx as any).buildState) return 'complete';

    // Corroborate with $indexStats if the tier permits it
    if (!atlasM0Mode) {
      try {
        const stats = await collection.aggregate([{ $indexStats: {} }]).toArray();
        const stat = (stats as any[]).find(s => s.name === indexName);
        if (stat && stat.building === false) return 'complete';
      } catch (err: any) {
        const msg = String(err?.message ?? '').toLowerCase();
        if (
          msg.includes('not authorized') ||
          msg.includes('unauthorized') ||
          msg.includes('not supported')
        ) {
          atlasM0Mode = true;
        }
      }
    }

    onPoll?.(elapsed);
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, 30_000);
  }
}

/**
 * Returns the on-disk size in bytes for a specific index, or null if unavailable.
 */
export async function getIndexSizeBytes(
  db: Db,
  collectionName: string,
  indexName: string
): Promise<number | null> {
  try {
    const result = await db.command({ collStats: collectionName });
    const sizes: Record<string, number> = result?.indexSizes ?? {};
    const size = sizes[indexName];
    return typeof size === 'number' ? size : null;
  } catch {
    return null;
  }
}
