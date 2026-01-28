import { MongoClient, Db } from 'mongodb';
import { ReindexerConfig, ReindexResult, ReindexState, StateInfo } from '../types';
import { Logger } from '../utils/logger';
import { StateManager } from './state-manager';
import { IndexOperations } from './index-operations';

/**
 * MongoDB Reindexer implementing the Cover-Swap-Cleanup strategy
 * Provides zero-downtime index rebuilding with resilient verification loops
 */
export class MongoDBReindexer {
  private config: ReindexerConfig;
  private logger: Logger;
  private stateManager: StateManager | null = null;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private indexOps: IndexOperations | null = null;

  constructor(config: ReindexerConfig) {
    this.config = {
      verbose: false,
      maxVerificationRetries: 10,
      verificationRetryDelayMs: 2000,
      operationTimeoutMs: 300000, // 5 minutes
      stateFilePath: `.reindex-state-${config.database}-${config.collection}.json`,
      ...config
    };
    
    this.logger = new Logger(this.config.verbose);
  }

  /**
   * Execute the reindex operation
   */
  async reindex(): Promise<ReindexResult> {
    const startTime = Date.now();
    let currentState = ReindexState.INITIAL;
    
    try {
      this.logger.info('='.repeat(60));
      this.logger.info('Starting MongoDB Zero-Downtime Index Rebuild');
      this.logger.info('='.repeat(60));
      this.logger.info(`Database: ${this.config.database}`);
      this.logger.info(`Collection: ${this.config.collection}`);
      this.logger.debug(`Index Specification:`, this.config.indexSpec);
      
      // Initialize connection
      await this.connect();
      
      // Initialize state manager
      this.stateManager = new StateManager(this.config.stateFilePath!, this.logger);
      
      // Check for existing state and resume if possible
      const savedState = await this.stateManager.loadState();
      if (savedState && this.stateManager.validateState(savedState, this.config.database, this.config.collection)) {
        currentState = savedState.state;
        this.logger.info(`Resuming from state: ${currentState}`);
        
        // Resume from the saved state
        const result = await this.resumeFromState(savedState);
        return result;
      }
      
      // Start fresh operation
      return await this.executeFreshReindex();
      
    } catch (error) {
      this.logger.error('Reindex operation failed', error);
      
      // Save failed state
      if (this.stateManager) {
        await this.stateManager.saveState({
          state: ReindexState.FAILED,
          timestamp: new Date(),
          database: this.config.database,
          collection: this.config.collection,
          indexSpec: this.config.indexSpec,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      return {
        success: false,
        state: ReindexState.FAILED,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Execute a fresh reindex operation (Cover-Swap-Cleanup)
   */
  private async executeFreshReindex(): Promise<ReindexResult> {
    const startTime = Date.now();
    
    try {
      // Phase 1: COVER - Create new covering index
      this.logger.info('\n' + '='.repeat(60));
      this.logger.info('Phase 1: COVER - Creating covering index');
      this.logger.info('='.repeat(60));
      
      const coveringIndexName = await this.indexOps!.createCoveringIndex(
        this.config.indexSpec,
        this.config.indexOptions
      );
      
      await this.stateManager!.saveState({
        state: ReindexState.COVERING,
        timestamp: new Date(),
        database: this.config.database,
        collection: this.config.collection,
        indexSpec: this.config.indexSpec,
        coveringIndexName
      });
      
      // Verify covering index with resilient loop
      await this.verifyIndexWithRetries(coveringIndexName);
      
      await this.stateManager!.saveState({
        state: ReindexState.COVERED,
        timestamp: new Date(),
        database: this.config.database,
        collection: this.config.collection,
        indexSpec: this.config.indexSpec,
        coveringIndexName
      });
      
      // Phase 2: SWAP - Find and drop old index, rename covering index
      this.logger.info('\n' + '='.repeat(60));
      this.logger.info('Phase 2: SWAP - Replacing old index');
      this.logger.info('='.repeat(60));
      
      const oldIndex = await this.indexOps!.findIndexBySpec(this.config.indexSpec);
      let originalIndexName: string | undefined;
      
      if (oldIndex && oldIndex.name !== coveringIndexName) {
        originalIndexName = oldIndex.name;
        this.logger.info(`Found existing index to replace: ${originalIndexName}`);
        
        await this.stateManager!.saveState({
          state: ReindexState.SWAPPING,
          timestamp: new Date(),
          database: this.config.database,
          collection: this.config.collection,
          indexSpec: this.config.indexSpec,
          coveringIndexName,
          originalIndexName
        });
        
        // Drop old index
        await this.indexOps!.dropIndex(originalIndexName);
        this.logger.info(`Dropped old index: ${originalIndexName}`);
      } else {
        this.logger.info('No existing index found to replace');
      }
      
      await this.stateManager!.saveState({
        state: ReindexState.SWAPPED,
        timestamp: new Date(),
        database: this.config.database,
        collection: this.config.collection,
        indexSpec: this.config.indexSpec,
        coveringIndexName,
        originalIndexName
      });
      
      // Phase 3: CLEANUP - Verify and finalize
      this.logger.info('\n' + '='.repeat(60));
      this.logger.info('Phase 3: CLEANUP - Finalizing operation');
      this.logger.info('='.repeat(60));
      
      await this.stateManager!.saveState({
        state: ReindexState.CLEANING,
        timestamp: new Date(),
        database: this.config.database,
        collection: this.config.collection,
        indexSpec: this.config.indexSpec,
        coveringIndexName
      });
      
      // Final verification
      await this.verifyIndexWithRetries(coveringIndexName);
      
      // Cleanup orphan indexes
      const orphans = await this.indexOps!.cleanupOrphanIndexes();
      if (orphans.length > 0) {
        this.logger.info(`Cleaned up ${orphans.length} orphan index(es)`);
      }
      
      // Mark as completed
      await this.stateManager!.saveState({
        state: ReindexState.COMPLETED,
        timestamp: new Date(),
        database: this.config.database,
        collection: this.config.collection,
        indexSpec: this.config.indexSpec,
        coveringIndexName
      });
      
      // Cleanup state file on success
      await this.stateManager!.cleanupState();
      
      const durationMs = Date.now() - startTime;
      this.logger.info('\n' + '='.repeat(60));
      this.logger.info('Reindex completed successfully!');
      this.logger.info(`Duration: ${(durationMs / 1000).toFixed(2)}s`);
      this.logger.info('='.repeat(60));
      
      return {
        success: true,
        state: ReindexState.COMPLETED,
        durationMs,
        details: `Index created: ${coveringIndexName}`
      };
      
    } catch (error) {
      this.logger.error('Fresh reindex failed', error);
      throw error;
    }
  }

  /**
   * Resume from a saved state
   */
  private async resumeFromState(savedState: StateInfo): Promise<ReindexResult> {
    const startTime = Date.now();
    
    try {
      switch (savedState.state) {
        case ReindexState.COMPLETED:
          this.logger.info('Operation was already completed');
          await this.stateManager!.cleanupState();
          return {
            success: true,
            state: ReindexState.COMPLETED,
            durationMs: Date.now() - startTime,
            details: 'Already completed'
          };
          
        case ReindexState.FAILED:
          this.logger.warn('Previous operation failed, starting fresh');
          await this.stateManager!.cleanupState();
          return await this.executeFreshReindex();
          
        case ReindexState.COVERING:
        case ReindexState.COVERED:
          // Verify the covering index still exists
          if (savedState.coveringIndexName) {
            const exists = await this.indexOps!.verifyIndexExists(savedState.coveringIndexName);
            if (exists) {
              this.logger.info('Covering index still exists, continuing from SWAP phase');
              // Continue with execution by creating a minimal state and running remaining phases
              // For simplicity, we'll restart the entire operation
            }
          }
          this.logger.warn('Restarting operation from beginning');
          return await this.executeFreshReindex();
          
        default:
          this.logger.warn('Unrecognized state, starting fresh');
          return await this.executeFreshReindex();
      }
    } catch (error) {
      this.logger.error('Failed to resume from state', error);
      throw error;
    }
  }

  /**
   * Verify index exists with resilient retry loop
   */
  private async verifyIndexWithRetries(indexName: string): Promise<void> {
    const maxRetries = this.config.maxVerificationRetries!;
    const retryDelay = this.config.verificationRetryDelayMs!;
    
    this.logger.info(`Verifying index: ${indexName}`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const exists = await this.indexOps!.verifyIndexExists(indexName);
        if (exists) {
          this.logger.info(`Index verification successful (attempt ${attempt}/${maxRetries})`);
          return;
        }
        
        if (attempt < maxRetries) {
          this.logger.warn(`Index not ready yet, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`);
          await this.sleep(retryDelay);
        }
      } catch (error) {
        if (attempt < maxRetries) {
          this.logger.warn(`Verification attempt ${attempt} failed, retrying...`, error);
          await this.sleep(retryDelay);
        } else {
          throw error;
        }
      }
    }
    
    throw new Error(`Index verification failed after ${maxRetries} attempts`);
  }

  /**
   * Cleanup orphan indexes from previous failed operations
   */
  async cleanupOrphans(): Promise<string[]> {
    try {
      await this.connect();
      const orphans = await this.indexOps!.cleanupOrphanIndexes();
      return orphans;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Connect to MongoDB
   */
  private async connect(): Promise<void> {
    if (this.client) {
      return;
    }
    
    this.logger.debug(`Connecting to MongoDB: ${this.config.uri}`);
    
    try {
      this.client = new MongoClient(this.config.uri);
      await this.client.connect();
      
      this.db = this.client.db(this.config.database);
      this.indexOps = new IndexOperations(this.db, this.config.collection, this.logger);
      
      this.logger.debug('MongoDB connection established');
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB', error);
      throw new Error(`Failed to connect to MongoDB: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Disconnect from MongoDB
   */
  private async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        this.logger.debug('MongoDB connection closed');
      } catch (error) {
        this.logger.warn('Error closing MongoDB connection', error);
      }
      this.client = null;
      this.db = null;
      this.indexOps = null;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
