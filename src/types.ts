/**
 * Configuration for the MongoDB index rebuild process
 */
export interface RebuildConfig {
  /** Database name to process */
  dbName: string;

  /** Cluster name for logging purposes (optional) */
  clusterName?: string;

  /** Directory for performance logs */
  logDir?: string;

  /** Directory for runtime state files */
  runtimeDir?: string;

  /** Suffix for covering/temporary indexes */
  coverSuffix?: string;

  /** Field name added to covering indexes */
  cheapSuffixField?: string;

  /** Enable interactive prompts for safety */
  safeRun?: boolean;

  /** Specific collections to process (overrides ignoredCollections) */
  specifiedCollections?: string[];

  /** Collections to ignore (supports wildcards with *) */
  ignoredCollections?: string[];

  /** Indexes to ignore (supports wildcards with *) */
  ignoredIndexes?: string[];

  /** Performance logging configuration */
  performanceLogging?: {
    enabled: boolean;
  };

  /** Save individual collection logs to files */
  saveCollectionLog?: boolean;

  /** Optional coordinator for rebuild lifecycle hooks */
  coordinator?: RebuildCoordinator;
}

/**
 * State file structure for resumability
 */
export interface RebuildState {
  /** Collections and their completed indexes */
  completed: Record<string, string[]>;
}

/**
 * Statistics for a single index
 */
export interface IndexStat {
  /** Index name */
  name: string;
  /** Index size in bytes */
  size: number;
}

/**
 * Index document from MongoDB
 */
export interface IndexDocument {
  /** Index name */
  name: string;
  /** Index key specification */
  key: Record<string, any>;
  /** Index version */
  v?: number;
  /** Other properties */
  [key: string]: any;
}

/**
 * Performance log for a single index rebuild
 */
export interface IndexLog {
  /** Start time of index rebuild */
  startTime: Date;
  /** Total time in seconds */
  timeSeconds: number;
  /** Initial size in MB */
  initialSizeMb: number;
  /** Final size in MB */
  finalSizeMb: number;
  /** Error message if rebuild failed */
  error?: string;
  /** Number of retry attempts */
  retries?: number;
}

/**
 * Performance log for a collection rebuild
 */
export interface CollectionLog {
  /** Start time of collection rebuild */
  startTime: Date;
  /** Total time in seconds */
  totalTimeSeconds: number;
  /** Initial total size in MB */
  initialSizeMb: number;
  /** Final total size in MB */
  finalSizeMb: number;
  /** Space reclaimed in MB */
  reclaimedMb: number;
  /** Logs for individual indexes */
  indexes: Record<string, IndexLog>;
  /** Warnings encountered during rebuild */
  warnings?: string[];
}

/**
 * Performance log for entire database rebuild
 */
export interface DatabaseLog {
  /** Cluster name */
  clusterName: string;
  /** Database name */
  dbName: string;
  /** Start time ISO string */
  startTime: string;
  /** Total time in seconds */
  totalTimeSeconds: number;
  /** Total initial size in MB */
  totalInitialSizeMb: number;
  /** Total final size in MB */
  totalFinalSizeMb: number;
  /** Total space reclaimed in MB */
  totalReclaimedMb: number;
  /** Logs for individual collections */
  collections: Record<string, CollectionLog>;
  /** Warnings encountered */
  warnings: string[];
  /** Error message if any */
  error?: string;
  /** Error stack trace if any */
  errorStack?: string;
}

/**
 * Information about an orphaned index
 */
export interface OrphanedIndex {
  /** Collection name */
  collectionName: string;
  /** Index name */
  indexName: string;
}

/**
 * File paths for state and logs
 */
export interface RebuildPaths {
  /** State file path */
  stateFile: string;
  /** Backup file path */
  backupFile: string;
  /** Log file path */
  logFile: string;
  /** Directory for collection-level logs */
  collectionLogDir?: string;
}

/**
 * Collection information with statistics
 */
export interface CollectionInfo {
  /** Collection name */
  name: string;
  /** Index statistics */
  indexStats: IndexStat[];
  /** Total index size */
  totalIndexSize: number;
}

/**
 * Valid MongoDB index options
 */
export const VALID_INDEX_OPTIONS = [
  'unique',
  'expireAfterSeconds',
  'partialFilterExpression',
  'sparse',
  'storageEngine',
  'weights',
  'default_language',
  'language_override',
  'textIndexVersion',
  '2dsphereIndexVersion',
  'bits',
  'min',
  'max',
  'bucketSize',
  'hidden',                  // MongoDB 4.4+ - hide index from query planner
  'collation',               // MongoDB 3.4+ - language-aware string comparison
  'wildcardProjection',      // MongoDB 4.2+ - for wildcard indexes
  'columnstoreProjection'    // MongoDB 7.0+ - for columnstore indexes
] as const;

/**
 * Optional coordinator interface for rebuild lifecycle hooks
 * All methods are optional - implement only what you need
 */
export interface RebuildCoordinator {
  /**
   * Called when rebuild process starts for a database
   * @param dbName - Database name
   * @param totalCollections - Number of collections to process
   */
  onRebuildStart?(dbName: string, totalCollections: number): Promise<void> | void;

  /**
   * Called before each collection is processed
   * @param collectionName - Collection name
   * @param indexCount - Number of indexes to rebuild
   */
  onCollectionStart?(collectionName: string, indexCount: number): Promise<void> | void;

  /**
   * Called before each index rebuild
   * @param collectionName - Collection name
   * @param indexName - Index name
   * @param sizeMb - Index size in MB
   */
  onIndexStart?(collectionName: string, indexName: string, sizeMb: number): Promise<void> | void;

  /**
   * Called after each index rebuild completes
   * @param collectionName - Collection name
   * @param indexName - Index name
   * @param durationSeconds - Time taken
   * @param success - Whether rebuild succeeded
   */
  onIndexComplete?(
    collectionName: string,
    indexName: string,
    durationSeconds: number,
    success: boolean
  ): Promise<void> | void;

  /**
   * Called after all indexes in a collection are processed
   * @param collectionName - Collection name
   * @param reclaimedMb - Space reclaimed
   * @param durationSeconds - Total time
   */
  onCollectionComplete?(
    collectionName: string,
    reclaimedMb: number,
    durationSeconds: number
  ): Promise<void> | void;

  /**
   * Called when the entire rebuild process finishes
   * @param dbName - Database name
   * @param totalReclaimedMb - Total space reclaimed
   * @param totalSeconds - Total duration
   * @param success - Whether entire rebuild succeeded
   * @param warning - Any warning encountered
   */
  onRebuildComplete?(
    dbName: string,
    totalReclaimedMb: number,
    totalSeconds: number,
    success: boolean,
    warning?: string
  ): Promise<void> | void;

  /**
   * Called when an error occurs (non-fatal)
   * @param message - Error description
   * @param context - Additional context (collection, index, etc.)
   */
  onError?(message: string, context: Record<string, any>): Promise<void> | void;
}

/**
 * Configuration for the MongoDB collection compact operation
 */
export interface CompactConfig extends RebuildConfig {
  /** Minimum space savings in MB to proceed with compaction (default 5000) */
  minSavingsMb?: number;

  /** Convergence tolerance as decimal (default 0.20 = ±20%) */
  convergenceTolerance?: number;

  /** Minimum measurement size in bytes to count toward convergence (default 5000000000 = 5GB) */
  minConvergenceSizeMb?: number;

  /** Force primary stepDown for MongoDB <8.0 (default false, auto-enabled for <8.0) */
  forceStepdown?: boolean;

  /** Enable autoCompact after convergence for MongoDB 8.0+ (default false) */
  autoCompact?: boolean;

  /** Timeout in seconds for replSetStepDown command (default 120) */
  stepDownTimeoutSeconds?: number;
}

/**
 * Error/retry record for compact operation
 */
export interface CompactErrorRecord {
  /** Iteration number where error occurred */
  iteration: number;

  /** Error message */
  error: string;

  /** Whether retry succeeded */
  retrySucceeded: boolean;

  /** Fallback command used (e.g., "compact without dryRun") */
  fallback?: string;
}

/**
 * Performance log for a collection compact operation
 */
export interface CollectionCompactLog {
  /** Start time of compact operation */
  startTime: Date;

  /** Total time in seconds */
  totalTimeSeconds: number;

  /** Estimated space savings in MB (from dryRun or freeSpaceTargetMB) */
  estimatedSavingsMb: number;

  /** Array of actual measurement sizes in bytes from each iteration */
  measurements: number[];

  /** Whether convergence was detected */
  converged: boolean;

  /** Final measurement size in MB */
  finalMeasurementMb: number;

  /** Number of iterations performed */
  iterations: number;

  /** Whether primary was stepped down (for <v8) */
  steppedDown?: boolean;

  /** Error/retry records */
  errors: CompactErrorRecord[];

  /** Whether autoCompact was enabled (for v8+) */
  autoCompactEnabled?: boolean;

  /** Whether autoCompact saw primary size reduction */
  autoCompactReducedSize?: boolean;
}

/**
 * Performance log for entire database compact operation
 */
export interface CompactDatabaseLog {
  /** Cluster name */
  clusterName: string;

  /** Database name */
  dbName: string;

  /** MongoDB version */
  mongoVersion: string;

  /** Start time ISO string */
  startTime: string;

  /** Total time in seconds */
  totalTimeSeconds: number;

  /** MongoDB version sufficient for autoCompact */
  supportsAutoCompact: boolean;

  /** Primary was stepped down during operation */
  steppedDown: boolean;

  /** Logs for individual collections */
  collections: Record<string, CollectionCompactLog>;

  /** Warnings encountered */
  warnings: string[];

  /** Error message if any */
  error?: string;
}
