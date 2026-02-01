/**
 * Orphaned index cleanup utilities
 * Phase 0 of the Cover-Swap-Cleanup strategy
 */

import { Db } from 'mongodb';
import { RebuildConfig, OrphanedIndex } from './types';
import { promptUser } from './prompts';
import { getLogger } from './logger';

/**
 * Phase 0: Cleanup orphaned temporary indexes
 */
export async function cleanupOrphanedIndexes(db: Db, config: RebuildConfig): Promise<void> {
  getLogger().info("--- Phase 0: Checking for orphaned temporary indexes ---");

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
    getLogger().info("✅ No orphaned indexes found.");
    return;
  }

  getLogger().warn(`\n⚠️ Found ${orphanedIndexes.length} orphaned temporary index(es):`);
  orphanedIndexes.forEach(o =>
    getLogger().info(`   - Collection: "${o.collectionName}", Index: "${o.indexName}"`)
  );

  if (config.safeRun) {
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

  getLogger().info("-> Starting cleanup...");
  for (const orphan of orphanedIndexes) {
    await db.collection(orphan.collectionName).dropIndex(orphan.indexName);
    getLogger().info(`  ✅ Dropped: "${orphan.indexName}" from "${orphan.collectionName}"`);
  }
  getLogger().info("✅ Cleanup complete.");
}
