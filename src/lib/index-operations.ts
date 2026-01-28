import { Collection, Db, IndexSpecification, Document } from 'mongodb';
import { Logger } from '../utils/logger';
import { IndexInfo } from '../types';

/**
 * Handles MongoDB index operations for the Cover-Swap-Cleanup strategy
 */
export class IndexOperations {
  private collection: Collection;
  private logger: Logger;

  constructor(db: Db, collectionName: string, logger: Logger) {
    this.collection = db.collection(collectionName);
    this.logger = logger;
  }

  /**
   * Get all indexes for the collection
   */
  async listIndexes(): Promise<IndexInfo[]> {
    try {
      const indexes = await this.collection.indexes();
      this.logger.debug(`Found ${indexes.length} indexes on collection`);
      return indexes as IndexInfo[];
    } catch (error) {
      this.logger.error('Failed to list indexes', error);
      throw new Error(`Failed to list indexes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Find an index by its key specification
   */
  async findIndexBySpec(indexSpec: IndexSpecification): Promise<IndexInfo | null> {
    const indexes = await this.listIndexes();
    const indexKey = this.normalizeIndexSpec(indexSpec);
    
    for (const index of indexes) {
      const currentKey = this.normalizeIndexSpec(index.key);
      if (this.areIndexSpecsEqual(indexKey, currentKey)) {
        this.logger.debug(`Found existing index: ${index.name}`);
        return index;
      }
    }
    
    return null;
  }

  /**
   * Create a covering index with a temporary name
   */
  async createCoveringIndex(
    indexSpec: IndexSpecification,
    indexOptions: Document = {},
    namePrefix: string = 'covering_'
  ): Promise<string> {
    const timestamp = Date.now();
    const coveringName = `${namePrefix}${timestamp}`;
    
    this.logger.info(`Creating covering index: ${coveringName}`);
    this.logger.debug(`Index spec:`, indexSpec);
    this.logger.debug(`Index options:`, indexOptions);
    
    try {
      const options = {
        ...indexOptions,
        name: coveringName,
        background: true // Build in background for zero-downtime
      };
      
      await this.collection.createIndex(indexSpec, options);
      this.logger.info(`Successfully created covering index: ${coveringName}`);
      
      return coveringName;
    } catch (error) {
      this.logger.error('Failed to create covering index', error);
      throw new Error(`Failed to create covering index: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Verify that an index exists and is ready
   */
  async verifyIndexExists(indexName: string): Promise<boolean> {
    try {
      const indexes = await this.listIndexes();
      const exists = indexes.some(idx => idx.name === indexName);
      
      if (exists) {
        this.logger.debug(`Verified index exists: ${indexName}`);
      } else {
        this.logger.warn(`Index not found: ${indexName}`);
      }
      
      return exists;
    } catch (error) {
      this.logger.error('Failed to verify index existence', error);
      throw new Error(`Failed to verify index: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Drop an index by name
   */
  async dropIndex(indexName: string): Promise<void> {
    this.logger.info(`Dropping index: ${indexName}`);
    
    try {
      await this.collection.dropIndex(indexName);
      this.logger.info(`Successfully dropped index: ${indexName}`);
    } catch (error) {
      this.logger.error('Failed to drop index', error);
      throw new Error(`Failed to drop index: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Rename an index (achieved by creating with new name and dropping old one)
   */
  async swapIndexNames(oldName: string, newName: string): Promise<void> {
    this.logger.info(`Swapping index names: ${oldName} -> ${newName}`);
    
    try {
      // Get the old index specification
      const indexes = await this.listIndexes();
      const oldIndex = indexes.find(idx => idx.name === oldName);
      
      if (!oldIndex) {
        throw new Error(`Index not found: ${oldName}`);
      }
      
      // Create new index with desired name
      const { name: _name, key, v: _v, ...options } = oldIndex;
      const createOptions = {
        ...options,
        name: newName,
        background: true
      };
      
      this.logger.debug(`Creating new index with name: ${newName}`);
      await this.collection.createIndex(key, createOptions);
      
      // Drop the old index
      this.logger.debug(`Dropping old index: ${oldName}`);
      await this.dropIndex(oldName);
      
      this.logger.info(`Successfully swapped index names`);
    } catch (error) {
      this.logger.error('Failed to swap index names', error);
      throw new Error(`Failed to swap index names: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Find and cleanup orphan indexes (covering indexes left from failed operations)
   */
  async cleanupOrphanIndexes(namePrefix: string = 'covering_'): Promise<string[]> {
    this.logger.info('Searching for orphan indexes...');
    
    try {
      const indexes = await this.listIndexes();
      const orphans = indexes.filter(idx => idx.name.startsWith(namePrefix));
      
      if (orphans.length === 0) {
        this.logger.info('No orphan indexes found');
        return [];
      }
      
      this.logger.warn(`Found ${orphans.length} orphan index(es): ${orphans.map(idx => idx.name).join(', ')}`);
      
      const dropped: string[] = [];
      for (const orphan of orphans) {
        try {
          await this.dropIndex(orphan.name);
          dropped.push(orphan.name);
        } catch (error) {
          this.logger.error(`Failed to drop orphan index: ${orphan.name}`, error);
        }
      }
      
      this.logger.info(`Cleaned up ${dropped.length} orphan index(es)`);
      return dropped;
    } catch (error) {
      this.logger.error('Failed to cleanup orphan indexes', error);
      throw new Error(`Failed to cleanup orphans: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Normalize index specification for comparison
   */
  private normalizeIndexSpec(spec: IndexSpecification): Document {
    if (Array.isArray(spec)) {
      const result: Document = {};
      for (const item of spec) {
        if (Array.isArray(item) && item.length === 2) {
          result[item[0] as string] = item[1];
        }
      }
      return result;
    }
    return spec as Document;
  }

  /**
   * Compare two index specifications for equality
   */
  private areIndexSpecsEqual(spec1: Document, spec2: Document): boolean {
    const keys1 = Object.keys(spec1).sort();
    const keys2 = Object.keys(spec2).sort();
    
    if (keys1.length !== keys2.length) {
      return false;
    }
    
    for (let i = 0; i < keys1.length; i++) {
      if (keys1[i] !== keys2[i] || spec1[keys1[i]] !== spec2[keys2[i]]) {
        return false;
      }
    }
    
    return true;
  }
}
