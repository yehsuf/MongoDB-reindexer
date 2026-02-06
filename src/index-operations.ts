/**
 * Index operation utilities
 * Handles index verification and safety checks
 */

import { Collection } from 'mongodb';
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
    const allIndexes = await collection.indexes();
    const foundIndex = allIndexes.find(i => i.name === indexName);

    if (!foundIndex) {
      getLogger().error(`  [SAFETY CHECK FAILED] Index '${indexName}' was not found.`);
      return false;
    }

    // CRITICAL: Check if index is in "building" or failed state
    // MongoDB indexes have a 'buildState' property when building
    if ((foundIndex as any).buildState) {
      getLogger().error(`  [SAFETY CHECK FAILED] Index '${indexName}' is still building or failed (buildState: ${(foundIndex as any).buildState}).`);
      return false;
    }

    // Additional check: indexes method might not show building indexes, so verify with indexExists
    try {
      const indexInfo: any = await collection.indexInformation({ full: true });
      const indexEntry = indexInfo[indexName];
      if (!indexEntry) {
        getLogger().error(`  [SAFETY CHECK FAILED] Index '${indexName}' not found in indexInformation.`);
        return false;
      }
    } catch (infoError) {
      getLogger().warn(`  Warning: Could not verify index via indexInformation: ${infoError}`);
      // Continue with regular checks
    }

    if (JSON.stringify(foundIndex.key) !== JSON.stringify(expectedKey)) {
      getLogger().error(`  [SAFETY CHECK FAILED] Index '${indexName}' key mismatch.`);
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
      getLogger().error(`  [SAFETY CHECK FAILED] Index '${indexName}' options mismatch.`);
      return false;
    }

    getLogger().info(`  [SAFETY CHECK PASSED] Index '${indexName}' is valid and ready.`);
    return true;
  } catch (e) {
    getLogger().error(`  [SAFETY CHECK FAILED] Error during verification for '${indexName}'.`);
    getLogger().error(String(e));
    return false;
  }
}
