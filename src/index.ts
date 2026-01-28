/**
 * MongoDB Zero-Downtime Index Rebuilder
 * 
 * Implements the Cover-Swap-Cleanup strategy for rebuilding MongoDB indexes
 * without downtime. Supports cluster-aware state files, orphan cleanup,
 * and resilient verification loops.
 * 
 * @example
 * ```typescript
 * import { MongoDBReindexer } from 'mongodb-reindexer';
 * 
 * const reindexer = new MongoDBReindexer({
 *   uri: 'mongodb://localhost:27017',
 *   database: 'mydb',
 *   collection: 'mycollection',
 *   indexSpec: { fieldName: 1 },
 *   verbose: true
 * });
 * 
 * const result = await reindexer.reindex();
 * console.log(result);
 * ```
 */

export { MongoDBReindexer } from './lib/reindexer';
export { IndexOperations } from './lib/index-operations';
export { StateManager } from './lib/state-manager';
export { Logger } from './utils/logger';

export type {
  ReindexerConfig,
  ReindexResult,
  StateInfo,
  IndexInfo
} from './types';

export { ReindexState } from './types';
