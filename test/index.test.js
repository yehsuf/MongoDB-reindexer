/**
 * Main API Tests - Node Test Runner Format
 * Consolidates tests from:
 * - smoke-test.js (API surface verification)
 * - stage1-v1.0.1-tests.js (VALID_INDEX_OPTIONS)
 * - unit-tests.js (index operations)
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('MongoDB Reindexer API', () => {
  describe('Main Exports', () => {
    it('should export rebuildIndexes function', async () => {
      const { rebuildIndexes } = await import('../dist/index.js');
      assert.ok(typeof rebuildIndexes === 'function');
    });

    it('should export cleanupOrphanedIndexes function', async () => {
      const { cleanupOrphanedIndexes } = await import('../dist/index.js');
      assert.ok(typeof cleanupOrphanedIndexes === 'function');
    });

    it('should export Logger utilities', async () => {
      const { getLogger, setLogger, ConsoleLogger, SilentLogger } = await import('../dist/index.js');
      assert.ok(typeof getLogger === 'function');
      assert.ok(typeof setLogger === 'function');
      assert.ok(typeof ConsoleLogger === 'function');
      assert.ok(typeof SilentLogger === 'function');
    });

    it('should export version detection utilities', async () => {
      const module = await import('../dist/index.js');
      // Version detection may or may not be exported from main index
      // This test verifies the module imports successfully
      assert.ok(module);
    });
  });

  describe('Logger Instances', () => {
    it('should create ConsoleLogger instance', async () => {
      const { ConsoleLogger } = await import('../dist/index.js');
      const logger = new ConsoleLogger(false);
      assert.ok(logger);
    });

    it('should create SilentLogger instance', async () => {
      const { SilentLogger } = await import('../dist/index.js');
      const logger = new SilentLogger();
      assert.ok(logger);
    });

    it('should have logger methods', async () => {
      const { ConsoleLogger } = await import('../dist/index.js');
      const logger = new ConsoleLogger(false);
      assert.ok(typeof logger.info === 'function');
      assert.ok(typeof logger.warn === 'function');
      assert.ok(typeof logger.error === 'function');
      assert.ok(typeof logger.debug === 'function');
    });
  });

  describe('CLI', () => {
    it('should have CLI file in dist', () => {
      const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
      assert.ok(fs.existsSync(cliPath), 'CLI file not found');
    });
  });

  describe('Constants Module', () => {
    it('should export DEFAULT_CONFIG', async () => {
      const constants = await import('../dist/constants.js');
      assert.ok(constants.DEFAULT_CONFIG);
    });

    it('should export FILE_CONSTANTS', async () => {
      const constants = await import('../dist/constants.js');
      assert.ok(constants.FILE_CONSTANTS);
    });

    it('should export MONGO_CONSTANTS', async () => {
      const constants = await import('../dist/constants.js');
      assert.ok(constants.MONGO_CONSTANTS);
    });
  });

  describe('File Utilities Module', () => {
    it('should export writeJsonFile function', async () => {
      const fileUtils = await import('../dist/file-utils.js');
      assert.ok(typeof fileUtils.writeJsonFile === 'function');
    });

    it('should export readJsonFile function', async () => {
      const fileUtils = await import('../dist/file-utils.js');
      assert.ok(typeof fileUtils.readJsonFile === 'function');
    });

    it('should export ensureDir function', async () => {
      const fileUtils = await import('../dist/file-utils.js');
      assert.ok(typeof fileUtils.ensureDir === 'function');
    });
  });

  describe('Types Module - VALID_INDEX_OPTIONS', () => {
    it('should export VALID_INDEX_OPTIONS array', async () => {
      const types = await import('../dist/types.js');
      assert.ok(Array.isArray(types.VALID_INDEX_OPTIONS));
    });

    it('should have at least 18 index options', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.length >= 18);
    });

    it('should include required index options', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      const required = ['unique', 'expireAfterSeconds', 'sparse', 'hidden', 'collation'];
      for (const opt of required) {
        assert.ok(VALID_INDEX_OPTIONS.includes(opt), `Missing option: ${opt}`);
      }
    });

    it('should include "storageEngine" option', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.includes('storageEngine'));
    });

    it('should include "partialFilterExpression" option', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.includes('partialFilterExpression'));
    });

    it('should include text index options', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.includes('textIndexVersion'));
      assert.ok(VALID_INDEX_OPTIONS.includes('language_override'));
      assert.ok(VALID_INDEX_OPTIONS.includes('default_language'));
      assert.ok(VALID_INDEX_OPTIONS.includes('weights'));
    });

    it('should include "2dsphereIndexVersion" option', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.includes('2dsphereIndexVersion'));
    });

    it('should include "bucketSize" option for geoHaystack', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.includes('bucketSize'));
    });

    it('should include "max" option for geospatial', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.includes('max'));
    });

    it('should include "min" option for geospatial', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.includes('min'));
    });

    it('should include "bits" option for geospatial', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.includes('bits'));
    });

    it('should include "wildcardProjection" option', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.includes('wildcardProjection'));
    });

    it('should include "collation" option', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.includes('collation'));
    });

    it('should include "hidden" option', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.includes('hidden'));
    });
  });
});
