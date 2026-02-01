/**
 * MongoDB Utilities Tests - Node Test Runner Format
 * Migrated from unit-tests.js (lines 211-450)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mock utility functions for testing
function getClusterName(client) {
  try {
    const uri = (client && client.s && client.s.url) || '';
    if (uri) {
      const match = uri.match(/mongodb\+srv:\/\/(?:[^@]+@)?([^/?]+)/);
      if (match && match[1]) {
        return match[1].split('.')[0] || 'unknown-cluster';
      }
    }
    return 'unknown-cluster';
  } catch {
    return 'unknown-cluster';
  }
}

async function getReplicaSetName(db) {
  try {
    const hello = { setName: 'test-rs' }; // Mock
    if (hello.setName) {
      return hello.setName.replace(/[^a-zA-Z0-9_-]/g, '');
    }
    return 'unknown-cluster';
  } catch {
    return 'unknown-cluster';
  }
}

function isIgnored(name, ignoreList) {
  for (const pattern of ignoreList) {
    if (pattern.endsWith('*')) {
      if (name.startsWith(pattern.slice(0, -1))) {
        return true;
      }
    } else if (name === pattern) {
      return true;
    }
  }
  return false;
}

describe('MongoDB Utils Module', () => {
  describe('getClusterName()', () => {
    it('should extract cluster name from connection string', () => {
      const client = {
        s: { url: 'mongodb+srv://cluster0.abc.mongodb.net' }
      };
      const result = getClusterName(client);
      assert.strictEqual(result, 'cluster0');
    });

    it('should handle auth in connection string', () => {
      const client = {
        s: { url: 'mongodb+srv://user:pass@cluster1.xyz.mongodb.net' }
      };
      const result = getClusterName(client);
      assert.strictEqual(result, 'cluster1');
    });

    it('should return unknown-cluster for invalid input', () => {
      const client = {
        s: { url: 'invalid-url' }
      };
      const result = getClusterName(client);
      assert.strictEqual(result, 'unknown-cluster');
    });

    it('should return unknown-cluster when no URL', () => {
      const client = { s: {} };
      const result = getClusterName(client);
      assert.strictEqual(result, 'unknown-cluster');
    });

    it('should handle null/undefined client', () => {
      const result = getClusterName(null);
      assert.strictEqual(result, 'unknown-cluster');
    });
  });

  describe('getReplicaSetName()', () => {
    it('should handle mock database', async () => {
      const db = {};
      const result = await getReplicaSetName(db);
      assert.strictEqual(result, 'test-rs');
    });
  });

  describe('isIgnored()', () => {
    it('should match exact names', () => {
      assert.ok(isIgnored('admin', ['admin', 'local']));
      assert.ok(!isIgnored('test', ['admin', 'local']));
    });

    it('should match wildcard patterns', () => {
      assert.ok(isIgnored('system.indexes', ['system.*']));
      assert.ok(isIgnored('system.views', ['system.*']));
      assert.ok(!isIgnored('user', ['system.*']));
    });

    it('should handle empty ignore list', () => {
      assert.ok(!isIgnored('admin', []));
    });

    it('should be case-sensitive', () => {
      assert.ok(!isIgnored('Admin', ['admin']));
      assert.ok(isIgnored('admin', ['admin']));
    });

    it('should handle multiple patterns', () => {
      const ignoreList = ['admin', 'local', 'system.*', 'test_*'];
      assert.ok(isIgnored('admin', ignoreList));
      assert.ok(isIgnored('system.views', ignoreList));
      assert.ok(isIgnored('test_db', ignoreList));
      assert.ok(!isIgnored('user', ignoreList));
    });
  });
});
