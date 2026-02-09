import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { rebuildIndexes } from '../src/index.js';
import { cleanupOrphanedIndexes } from '../src/orphan-cleanup.js';
import { RebuildConfig, RebuildState } from '../src/types.js';
import { setLogger, ILogger } from '../src/logger.js';

// --- Mocks ---

class InMemoryLogger implements ILogger {
  infos: string[] = [];
  warns: string[] = [];
  errors: string[] = [];
  debugs: string[] = [];

  info(message: string): void { this.infos.push(message); }
  warn(message: string): void { this.warns.push(message); }
  error(message: string): void { this.errors.push(message); }
  debug(message: string): void { this.debugs.push(message); }

  clear(): void {
    this.infos = [];
    this.warns = [];
    this.errors = [];
    this.debugs = [];
  }
}

// Mock MongoDB structures
const createMockCollection = (name: string, indexes: any[] = []): any => {
  return {
    collectionName: name,
    indexes: mock.fn(async () => indexes),
    createIndex: mock.fn(async () => 'index_created'),
    dropIndex: mock.fn(async () => 'index_dropped'),
    find: mock.fn(() => ({ toArray: async () => [] })),
  };
};

const createMockDb = (collections: any[] = []): any => {
  const collectionMap = new Map(collections.map(c => [c.collectionName, c]));

  return {
    client: {
      options: {
        hosts: [{ host: 'localhost', port: 27017 }]
      }
    },
    listCollections: mock.fn(() => ({
      toArray: async () => collections.map(c => ({ name: c.collectionName }))
    })),
    collection: mock.fn((name: string) => collectionMap.get(name)),
    command: mock.fn(async (cmd) => {
        if (cmd.collStats) {
            return {
                indexSizes: { '_id_': 1024, 'idx_1': 2048 },
                ok: 1
            };
        }
        if (cmd.buildInfo) {
            return { version: '5.0.0' };
        }
        return { ok: 1 };
    }),
    admin: mock.fn(() => ({
      command: mock.fn(async () => ({ version: '5.0.0' }))
    }))
  };
};

// --- Tests ---

describe('Dev-8 Verification', () => {
  let logger: InMemoryLogger;
  const tempDir = path.join(process.cwd(), 'temp-test-dev-8');

  before(() => {
    logger = new InMemoryLogger();
    setLogger(logger);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('1. Backup File Cleanup', () => {
    it('should delete _backup_*.json file on successful rebuild', async () => {
      const mockCollection = createMockCollection('test_coll', [
        { v: 2, key: { _id: 1 }, name: '_id_' },
        { v: 2, key: { name: 1 }, name: 'name_1' }
      ]);
      const mockDb = createMockDb([mockCollection]);

      const config: RebuildConfig = {
        dbName: 'test_db',
        runtimeDir: tempDir,
        logDir: tempDir,
        safeRun: false,
        performanceLogging: { enabled: false }
      };

      await rebuildIndexes(mockDb, config);

      const deleteLog = logger.infos.find(msg => msg.includes('Removed schema backup file'));
      assert.ok(deleteLog, 'Should verify in logs that backup file was removed');

      const files = fs.readdirSync(tempDir);
      const backupFiles = files.filter(f => f.includes('_backup_') && f.endsWith('.json'));
      assert.strictEqual(backupFiles.length, 0, `Backup files should be deleted. Found: ${backupFiles.join(', ')}`);
    });
  });

  describe('2. Strict Orphan Cleanup', () => {

    it('should NOT delete orphan if NOT in state (Automatic Mode)', async () => {
      const coverSuffix = '_cover_temp';
      const orphanName = 'idx_1' + coverSuffix;

      const mockCollection = createMockCollection('strict_coll', [
        { v: 2, key: { _id: 1 }, name: '_id_' },
        { v: 2, key: { a: 1 }, name: orphanName }
      ]);
      const mockDb = createMockDb([mockCollection]);

      const state: RebuildState = { completed: { 'strict_coll': [] } };

      const config: RebuildConfig = {
        dbName: 'test_db',
        coverSuffix: coverSuffix,
        safeRun: false
      };

      await cleanupOrphanedIndexes(mockDb, config, state);

      const dropIndexCalls = (mockCollection.dropIndex.mock.calls as any[]);
      assert.strictEqual(dropIndexCalls.length, 0, 'Should not drop index if not in state');
    });

    it('should delete orphan IF in state (Automatic Mode)', async () => {
        const coverSuffix = '_cover_temp';
        const originalName = 'idx_1';
        const orphanName = originalName + coverSuffix;

        const mockCollection = createMockCollection('strict_coll_2', [
          { v: 2, key: { _id: 1 }, name: '_id_' },
          { v: 2, key: { a: 1 }, name: orphanName }
        ]);
        const mockDb = createMockDb([mockCollection]);

        const state: RebuildState = { completed: { 'strict_coll_2': [originalName] } };

        const config: RebuildConfig = {
          dbName: 'test_db',
          coverSuffix: coverSuffix,
          safeRun: false
        };

        await cleanupOrphanedIndexes(mockDb, config, state);

        const dropIndexCalls = (mockCollection.dropIndex.mock.calls as any[]);
        assert.strictEqual(dropIndexCalls.length, 1, 'Should drop index if in state');
        assert.strictEqual(dropIndexCalls[0].arguments[0], orphanName);
    });

    it('should delete orphan aggressively if NO state provided (CLI Mode)', async () => {
        const coverSuffix = '_cover_temp';
        const orphanName = 'idx_1' + coverSuffix;

        const mockCollection = createMockCollection('cli_coll', [
          { v: 2, key: { _id: 1 }, name: '_id_' },
          { v: 2, key: { a: 1 }, name: orphanName }
        ]);
        const mockDb = createMockDb([mockCollection]);

        const config: RebuildConfig = {
          dbName: 'test_db',
          coverSuffix: coverSuffix,
          safeRun: false
        };

        await cleanupOrphanedIndexes(mockDb, config, undefined);

        const dropIndexCalls = (mockCollection.dropIndex.mock.calls as any[]);
        assert.strictEqual(dropIndexCalls.length, 1, 'Should drop index in CLI mode (no state)');
        assert.strictEqual(dropIndexCalls[0].arguments[0], orphanName);
    });
  });

  describe('3. Error Stack Logging', () => {
    it('should capture error stack in dbLog when critical error occurs', async () => {
      const mockDb = createMockDb([]);
      mockDb.listCollections = mock.fn(() => {
          throw new Error("Simulated Critical Failure");
      });

      const config: RebuildConfig = {
        dbName: 'test_db',
        runtimeDir: tempDir,
        logDir: tempDir,
        safeRun: false,
        performanceLogging: { enabled: false }
      };

      try {
        await rebuildIndexes(mockDb, config);
        assert.fail("Should have thrown error");
      } catch (e) {
        // Expected error
      }

      const configWithLog: RebuildConfig = {
        ...config,
        performanceLogging: { enabled: true }
      };

      try {
        await rebuildIndexes(mockDb, configWithLog);
      } catch (e) {
         // ignore
      }

      const files = fs.readdirSync(tempDir);
      const logFile = files.find(f => f.includes('_rebuild_log_'));
      assert.ok(logFile, "Log file should exist on error");

      const content = JSON.parse(fs.readFileSync(path.join(tempDir, logFile!), 'utf8'));
      assert.strictEqual(content.error, "Simulated Critical Failure");
      assert.ok(content.errorStack, "errorStack should be present in log");
      assert.match(content.errorStack, /Simulated Critical Failure/, "errorStack should match error");
    });
  });

});
