/**
 * Configuration for the MongoDB index rebuild process
 */
export interface RebuildConfig {
  /** Database name to process */
  dbName: string;
  
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
  /** Error message if any */
  error: string | null;
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
  'bucketSize'
] as const;
