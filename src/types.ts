import { Document, IndexSpecification } from 'mongodb';

/**
 * Configuration options for the MongoDB reindexer
 */
export interface ReindexerConfig {
  /** MongoDB connection URI */
  uri: string;
  /** Database name */
  database: string;
  /** Collection name */
  collection: string;
  /** Index specification to rebuild */
  indexSpec: IndexSpecification;
  /** Index options */
  indexOptions?: Document;
  /** State file path for resuming operations */
  stateFilePath?: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Maximum number of verification retries */
  maxVerificationRetries?: number;
  /** Verification retry delay in milliseconds */
  verificationRetryDelayMs?: number;
  /** Timeout for index operations in milliseconds */
  operationTimeoutMs?: number;
}

/**
 * State of the reindex operation
 */
export enum ReindexState {
  INITIAL = 'INITIAL',
  COVERING = 'COVERING',
  COVERED = 'COVERED',
  SWAPPING = 'SWAPPING',
  SWAPPED = 'SWAPPED',
  CLEANING = 'CLEANING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

/**
 * Persistent state information
 */
export interface StateInfo {
  /** Current state of the operation */
  state: ReindexState;
  /** Timestamp when state was last updated */
  timestamp: Date;
  /** Database name */
  database: string;
  /** Collection name */
  collection: string;
  /** Index specification */
  indexSpec: IndexSpecification;
  /** Name of the temporary covering index */
  coveringIndexName?: string;
  /** Name of the original index to be replaced */
  originalIndexName?: string;
  /** Error message if operation failed */
  error?: string;
  /** Cluster node identifier */
  nodeId?: string;
}

/**
 * Result of a reindex operation
 */
export interface ReindexResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Final state */
  state: ReindexState;
  /** Time taken in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** Additional details */
  details?: string;
}

/**
 * Index information from MongoDB
 */
export interface IndexInfo {
  /** Index name */
  name: string;
  /** Index key specification */
  key: Document;
  /** Index version */
  v?: number;
  /** Additional index properties */
  [key: string]: any;
}
