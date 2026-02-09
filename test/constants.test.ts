/**
 * Constants Module Tests - Node Test Runner Format
 * Verification of exported constants
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Constants Module', () => {
  describe('DEFAULT_CONFIG', () => {
    it('should export DEFAULT_CONFIG object', async () => {
      const constants = await import('../dist/constants.js');
      assert.ok(constants.DEFAULT_CONFIG);
      assert.strictEqual(typeof constants.DEFAULT_CONFIG, 'object');
    });
  });

  describe('FILE_CONSTANTS', () => {
    it('should export FILE_CONSTANTS object', async () => {
      const constants = await import('../dist/constants.js');
      assert.ok(constants.FILE_CONSTANTS);
      assert.strictEqual(typeof constants.FILE_CONSTANTS, 'object');
    });
  });

  describe('MONGO_CONSTANTS', () => {
    it('should export MONGO_CONSTANTS object', async () => {
      const constants = await import('../dist/constants.js');
      assert.ok(constants.MONGO_CONSTANTS);
      assert.strictEqual(typeof constants.MONGO_CONSTANTS, 'object');
    });
  });

  describe('Module structure', () => {
    it('should export all required constants', async () => {
      const constants = await import('../dist/constants.js');
      const requiredExports = ['DEFAULT_CONFIG', 'FILE_CONSTANTS', 'MONGO_CONSTANTS'];

      for (const exportName of requiredExports) {
        assert.ok(
          (constants as any)[exportName],
          `Missing export: ${exportName}`
        );
      }
    });
  });
});
