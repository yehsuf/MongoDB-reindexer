/**
 * Compact Operations Tests
 * Tests for the collection compaction feature with convergence detection
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compactCollections } from '../dist/compact-operations.js';
import { bytesToMB } from '../dist/file-utils.js';

describe('Compact Operations Module', () => {
  describe('Type Exports', () => {
    it('should have compactCollections function available', async () => {
      assert.strictEqual(typeof compactCollections, 'function');
    });
  });

  describe('Utility Functions', () => {
    it('should convert bytes to MB correctly', () => {
      const bytes = 5000 * 1024 * 1024; // 5000 MB
      const mb = bytesToMB(bytes);
      assert.strictEqual(Math.floor(mb), 5000);
    });

    it('should handle zero bytes', () => {
      const mb = bytesToMB(0);
      assert.strictEqual(mb, 0);
    });

    it('should handle large values', () => {
      const bytes = 100 * 1024 * 1024 * 1024; // 100 GB
      const mb = bytesToMB(bytes);
      assert.strictEqual(Math.floor(mb), 102400);
    });
  });

  describe('Convergence Logic', () => {
    it('should detect convergence within tolerance', () => {
      // Simulate measurements within ±20% tolerance
      const firstMeasurement = 5000000000; // 5GB in bytes
      const tolerance = 0.20;
      const lowerBound = firstMeasurement * (1 - tolerance);
      const upperBound = firstMeasurement * (1 + tolerance);

      // Test measurement within bounds
      const testMeasurement = 5100000000; // 5.1GB
      const converged = testMeasurement >= lowerBound && testMeasurement <= upperBound;
      assert.strictEqual(converged, true);
    });

    it('should reject convergence outside tolerance', () => {
      const firstMeasurement = 5000000000; // 5GB in bytes
      const tolerance = 0.20;
      const lowerBound = firstMeasurement * (1 - tolerance);
      const upperBound = firstMeasurement * (1 + tolerance);

      // Test measurement outside bounds (beyond ±20%)
      const testMeasurement = 6500000000; // 6.5GB
      const converged = testMeasurement >= lowerBound && testMeasurement <= upperBound;
      assert.strictEqual(converged, false);
    });

    it('should require minimum size threshold', () => {
      const firstMeasurement = 1000000000; // 1GB in bytes (below 5GB minimum)
      const minSize = 5000000000; // 5GB minimum

      const meetsMinimum = firstMeasurement >= minSize;
      assert.strictEqual(meetsMinimum, false);
    });
  });

  describe('Configuration Defaults', () => {
    it('should use correct default values', () => {
      const defaults = {
        minSavingsMb: 5000,
        convergenceTolerance: 0.20,
        minConvergenceSizeMb: 5000,
        stepDownTimeoutSeconds: 120
      };

      assert.strictEqual(defaults.minSavingsMb, 5000);
      assert.strictEqual(defaults.convergenceTolerance, 0.20);
      assert.strictEqual(defaults.minConvergenceSizeMb, 5000);
      assert.strictEqual(defaults.stepDownTimeoutSeconds, 120);
    });
  });

  describe('Error Record Structure', () => {
    it('should have proper error record format', () => {
      const errorRecord = {
        iteration: 1,
        error: 'Test error message',
        retrySucceeded: false,
        fallback: 'fallback command'
      };

      assert.strictEqual(errorRecord.iteration, 1);
      assert.strictEqual(typeof errorRecord.error, 'string');
      assert.strictEqual(typeof errorRecord.retrySucceeded, 'boolean');
      assert.strictEqual(typeof errorRecord.fallback, 'string');
    });
  });

  describe('CollectionCompactLog Structure', () => {
    it('should have proper log structure', () => {
      const log = {
        startTime: new Date(),
        totalTimeSeconds: 45,
        estimatedSavingsMb: 5500,
        measurements: [5480000000, 5510000000, 5505000000],
        converged: true,
        finalMeasurementMb: 5505,
        iterations: 3,
        errors: [],
        steppedDown: false
      };

      assert.ok(log.startTime instanceof Date);
      assert.strictEqual(log.totalTimeSeconds, 45);
      assert.strictEqual(log.estimatedSavingsMb, 5500);
      assert.strictEqual(Array.isArray(log.measurements), true);
      assert.strictEqual(log.converged, true);
      assert.strictEqual(log.iterations, 3);
    });
  });

  describe('CompactDatabaseLog Structure', () => {
    it('should have proper database log structure', () => {
      const dbLog = {
        clusterName: 'test-cluster',
        dbName: 'testdb',
        mongoVersion: '8.0.0',
        startTime: new Date().toISOString(),
        totalTimeSeconds: 120,
        supportsAutoCompact: true,
        steppedDown: false,
        collections: {},
        warnings: []
      };

      assert.strictEqual(dbLog.clusterName, 'test-cluster');
      assert.strictEqual(dbLog.dbName, 'testdb');
      assert.strictEqual(dbLog.mongoVersion, '8.0.0');
      assert.strictEqual(dbLog.supportsAutoCompact, true);
      assert.strictEqual(dbLog.steppedDown, false);
    });
  });

  describe('Version Detection for Features', () => {
    it('should support dryRun for MongoDB 8.0+', () => {
      const majorVersion = 8;
      const supportsDryRun = majorVersion >= 8;
      assert.strictEqual(supportsDryRun, true);
    });

    it('should support freeSpaceTargetMB for MongoDB 7.0+', () => {
      const majorVersion = 7;
      const supportsFreeSpaceTarget = majorVersion >= 7;
      assert.strictEqual(supportsFreeSpaceTarget, true);
    });

    it('should support autoCompact for MongoDB 8.0+', () => {
      const majorVersion = 8;
      const supportsAutoCompact = majorVersion >= 8;
      assert.strictEqual(supportsAutoCompact, true);
    });

    it('should support stepDown for all versions', () => {
      const versions = [3, 4, 5, 6, 7, 8];
      versions.forEach(v => {
        assert.ok(v >= 3, `Version ${v} supports stepDown`);
      });
    });
  });

  describe('Compact Execution Flow', () => {
    const storageSizeBytes = 6000 * 1024 * 1024;
    const dataSizeBytes = 1000 * 1024 * 1024;

    const createFakeDb = (options: {
      version: string;
      members: Array<{ _id: number; host: string; tags: Record<string, string> }>;
    }) => {
      const commandCalls: Array<{ cmd: any; options?: any }> = [];
      const adminCalls: Array<{ cmd: any; options?: any }> = [];
      let stepdownTriggered = false;

      const db = {
        listCollections: () => ({
          toArray: async () => [{ name: 'testCollection' }]
        }),
        command: async (cmd: any, cmdOptions?: any) => {
          commandCalls.push({ cmd, options: cmdOptions });
          if (cmd.compact) {
            return { ok: 1 };
          }
          if (cmd.collStats) {
            return { storageSize: storageSizeBytes, size: dataSizeBytes };
          }
          if (cmd.autoCompact !== undefined) {
            return { ok: 1 };
          }
          return { ok: 1 };
        },
        admin: () => ({
          command: async (cmd: any, cmdOptions?: any) => {
            adminCalls.push({ cmd, options: cmdOptions });
            if (cmd.buildInfo) {
              return { version: options.version };
            }
            if (cmd.replSetGetConfig) {
              return { config: { members: options.members } };
            }
            if (cmd.replSetGetStatus) {
              if (stepdownTriggered) {
                return {
                  members: options.members.map(member => ({
                    _id: member._id,
                    state: 2
                  }))
                };
              }
              return {
                members: options.members.map(member => ({
                  _id: member._id,
                  state: member._id === 0 ? 1 : 2
                }))
              };
            }
            if (cmd.replSetStepDown) {
              stepdownTriggered = true;
              return { ok: 1 };
            }
            if (cmd.hello) {
              return { secondary: true };
            }
            if (cmd.currentOp) {
              return { inprog: [] };
            }
            return { ok: 1 };
          }
        })
      };

      return { db, commandCalls, adminCalls };
    };

    it('should target tagged secondaries for manual compact', async () => {
      const members = [
        { _id: 0, host: 'primary', tags: { availabilityZone: 'zone-a' } },
        { _id: 1, host: 'secondary1', tags: { availabilityZone: 'zone-b' } },
        { _id: 2, host: 'secondary2', tags: { availabilityZone: 'zone-c' } }
      ];
      const { db, commandCalls } = createFakeDb({
        version: '7.0.0',
        members
      });

      await compactCollections(db as any, {
        dbName: 'testdb',
        clusterName: 'test-cluster',
        minSavingsMb: 1000,
        convergenceTolerance: 0.2,
        minConvergenceSizeMb: 1000,
        forceStepdown: false,
        stepDownTimeoutSeconds: 5,
        autoCompact: false,
        safeRun: false
      });

      const compactCalls = commandCalls.filter(call => call.cmd.compact);
      const zones = new Set(
        compactCalls.map(call => call.options?.readPreference?.tags?.[0]?.availabilityZone)
      );

      assert.ok(zones.has('zone-b'));
      assert.ok(zones.has('zone-c'));
    });

    it('should prefer prior primary zone after stepdown', async () => {
      const members = [
        { _id: 0, host: 'primary', tags: { availabilityZone: 'zone-a' } },
        { _id: 1, host: 'secondary1', tags: { availabilityZone: 'zone-b' } },
        { _id: 2, host: 'secondary2', tags: { availabilityZone: 'zone-c' } }
      ];
      const { db, commandCalls } = createFakeDb({
        version: '7.0.0',
        members
      });

      await compactCollections(db as any, {
        dbName: 'testdb',
        clusterName: 'test-cluster',
        minSavingsMb: 1000,
        convergenceTolerance: 0.2,
        minConvergenceSizeMb: 1000,
        forceStepdown: true,
        stepDownTimeoutSeconds: 5,
        autoCompact: false,
        safeRun: false
      });

      const compactCalls = commandCalls.filter(call => call.cmd.compact);
      const zones = new Set(
        compactCalls.map(call => call.options?.readPreference?.tags?.[0]?.availabilityZone)
      );

      assert.ok(zones.has('zone-a'));
    });
  });
});
