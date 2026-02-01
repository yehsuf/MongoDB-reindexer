/**
 * Types Module Tests - Node Test Runner Format
 * Additional type verification tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Types Module', () => {
  describe('VALID_INDEX_OPTIONS completeness', () => {
    it('should export VALID_INDEX_OPTIONS', async () => {
      const types = await import('../dist/types.js');
      assert.ok(types.VALID_INDEX_OPTIONS);
      assert.ok(Array.isArray(types.VALID_INDEX_OPTIONS));
    });

    it('should contain standard index options', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      const standardOptions = [
        'unique',
        'sparse',
        'expireAfterSeconds',
        'partialFilterExpression'
      ];

      for (const option of standardOptions) {
        assert.ok(
          VALID_INDEX_OPTIONS.includes(option as any),
          `Missing standard option: ${option}`
        );
      }
    });

    it('should contain MongoDB 4.4+ options', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      const modernOptions = ['hidden'];

      for (const option of modernOptions) {
        assert.ok(
          VALID_INDEX_OPTIONS.includes(option as any),
          `Missing modern option: ${option}`
        );
      }
    });

    it('should contain collation option', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.includes('collation'));
    });

    it('should contain wildcard index options', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      assert.ok(VALID_INDEX_OPTIONS.includes('wildcardProjection'));
    });

    it('should contain geospatial options', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      const geoOptions = ['bits', 'min', 'max', 'bucketSize', '2dsphereIndexVersion'];

      for (const option of geoOptions) {
        assert.ok(
          VALID_INDEX_OPTIONS.includes(option as any),
          `Missing geo option: ${option}`
        );
      }
    });

    it('should contain text index options', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      const textOptions = [
        'weights',
        'default_language',
        'language_override',
        'textIndexVersion'
      ];

      for (const option of textOptions) {
        assert.ok(
          VALID_INDEX_OPTIONS.includes(option as any),
          `Missing text option: ${option}`
        );
      }
    });

    it('should not contain duplicate options', async () => {
      const { VALID_INDEX_OPTIONS } = await import('../dist/types.js');
      const uniqueOptions = new Set(VALID_INDEX_OPTIONS);
      assert.strictEqual(
        uniqueOptions.size,
        VALID_INDEX_OPTIONS.length,
        'VALID_INDEX_OPTIONS contains duplicates'
      );
    });
  });

  describe('Type exports', () => {
    it('should export type definitions', async () => {
      const types = await import('../dist/types.js');
      // Verify the module loads without errors
      assert.ok(types);
    });
  });
});
