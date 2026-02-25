/**
 * Orphaned index cleanup utilities
 * Phase 0 of the Cover-Swap-Cleanup strategy
 */

import { Db } from 'mongodb';
import { RebuildConfig, RebuildState, OrphanedIndex } from './types.js';
import { promptUser } from './prompts.js';
import { getLogger } from './logger.js';

/**
 * Phase 0: Cleanup orphaned temporary indexes
 */
export async function cleanupOrphanedIndexes(db: Db, config: RebuildConfig, state?: RebuildState): Promise<void> {
  getLogger().info("--- Phase 0: Checking for orphaned temporary indexes ---");

  const orphanedIndexes: OrphanedIndex[] = [];
  const collectionNames = (await db.listCollections().toArray()).map(c => c.name);

  for (const collName of collectionNames) {
    const collection = db.collection(collName);
    const indexes = await collection.indexes();

    // Filter for indexes with the cover suffix
    const orphansInColl = indexes.filter(idx => {
      // Must have name and end with suffix
      if (!idx.name || !idx.name.endsWith(config.coverSuffix!)) {
        return false;
      }

      // If state is provided (Automatic Mode), use STRICT cleanup
      // Only delete if the original index was marked as completed
      if (state) {
        const originalName = idx.name.slice(0, -config.coverSuffix!.length);
        const completedForColl = state.completed[collName] || [];
        // If not in completed list, it might be a temp index from a run that crashed
        // BEFORE completion, so strictly speaking we shouldn't touch it automatically?
        // Plan says: "check if the original index name exists in state.completed[collName]. STRICT."
        return completedForColl.includes(originalName);
      }

      // If no state (CLI Mode), use AGGRESSIVE cleanup (include all matchers)
      return true;
    });

    if (orphansInColl.length > 0) {
      orphansInColl.forEach(o => {
        if (o.name) {
          orphanedIndexes.push({ collectionName: collName, indexName: o.name });
        }
      });
    }
  }

  if (orphanedIndexes.length === 0) {
    getLogger().info("✅ No orphaned indexes found.");
    return;
  }

  getLogger().warn(`\n⚠️ Found ${orphanedIndexes.length} orphaned temporary index(es):`);
  orphanedIndexes.forEach(o =>
    getLogger().info(`   - Collection: "${o.collectionName}", Index: "${o.indexName}"`)
  );

  if (config.safeRun) {
    if (config.autoConfirm) {
      getLogger().info('Auto-confirming cleanup (--yes flag set).');
    } else {
      const [responseChar, responseWord] = await promptUser(
        "\nProceed with cleanup? (y/n): ",
        ['yes', 'no'],
        'cleanup'
      );
      getLogger().info(`User chose: [${responseWord}].`);
      if (responseChar === 'n') {
        throw new Error("User aborted cleanup operation.");
      }
    }
  }

  getLogger().info("-> Starting cleanup...");
  for (const orphan of orphanedIndexes) {
    await db.collection(orphan.collectionName).dropIndex(orphan.indexName);
    getLogger().info(`  ✅ Dropped: "${orphan.indexName}" from "${orphan.collectionName}"`);
  }
  getLogger().info("✅ Cleanup complete.");
}
