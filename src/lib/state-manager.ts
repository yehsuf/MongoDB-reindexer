import { promises as fs } from 'fs';
import { hostname } from 'os';
import { StateInfo } from '../types';
import { Logger } from '../utils/logger';

/**
 * Manages persistent state for reindex operations
 * Supports cluster-aware state files for resuming operations
 */
export class StateManager {
  private stateFilePath: string;
  private logger: Logger;
  private nodeId: string;

  constructor(stateFilePath: string, logger: Logger) {
    this.stateFilePath = stateFilePath;
    this.logger = logger;
    this.nodeId = hostname();
  }

  /**
   * Save the current state to disk
   */
  async saveState(state: StateInfo): Promise<void> {
    try {
      const stateWithNode: StateInfo = {
        ...state,
        nodeId: this.nodeId,
        timestamp: new Date()
      };
      
      const stateJson = JSON.stringify(stateWithNode, null, 2);
      await fs.writeFile(this.stateFilePath, stateJson, 'utf-8');
      
      this.logger.debug(`State saved: ${state.state} at ${this.stateFilePath}`);
    } catch (error) {
      this.logger.error('Failed to save state', error);
      throw new Error(`Failed to save state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load the state from disk
   */
  async loadState(): Promise<StateInfo | null> {
    try {
      const stateJson = await fs.readFile(this.stateFilePath, 'utf-8');
      const state = JSON.parse(stateJson) as StateInfo;
      
      // Convert timestamp string back to Date object
      state.timestamp = new Date(state.timestamp);
      
      this.logger.debug(`State loaded: ${state.state} from ${this.stateFilePath}`);
      this.logger.info(`Resuming from previous state: ${state.state} (saved by node: ${state.nodeId || 'unknown'})`);
      
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.debug('No existing state file found');
        return null;
      }
      this.logger.error('Failed to load state', error);
      throw new Error(`Failed to load state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete the state file
   */
  async cleanupState(): Promise<void> {
    try {
      await fs.unlink(this.stateFilePath);
      this.logger.debug(`State file deleted: ${this.stateFilePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('Failed to delete state file', error);
      }
    }
  }

  /**
   * Check if state file exists
   */
  async hasState(): Promise<boolean> {
    try {
      await fs.access(this.stateFilePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate that the saved state is for the same operation
   */
  validateState(state: StateInfo, database: string, collection: string): boolean {
    if (state.database !== database || state.collection !== collection) {
      this.logger.warn(
        `State file is for different collection: ${state.database}.${state.collection} vs ${database}.${collection}`
      );
      return false;
    }
    return true;
  }
}
