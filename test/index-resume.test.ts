/**
 * Unit tests for connection-drop resilience functions added to index-operations.ts:
 *   - waitForIndexBuild
 *   - checkCoveringIndexStatus
 *   - getIndexSizeBytes
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  waitForIndexBuild,
  checkCoveringIndexStatus,
  getIndexSizeBytes,
} from '../dist/index-operations.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeCollection(overrides: Partial<{
  indexes: () => Promise<any[]>;
  aggregate: (pipeline: any[]) => { toArray: () => Promise<any[]> };
  collectionName: string;
}> = {}) {
  return {
    collectionName: 'testCol',
    indexes: mock.fn(overrides.indexes ?? (async () => [] as any[])),
    aggregate: overrides.aggregate
      ? overrides.aggregate
      : mock.fn((_pipeline: any[]) => ({ toArray: async () => [] as any[] })),
  };
}

function makeDb(overrides: Partial<{
  aggregateResults?: any[];
  aggregateThrows?: boolean;
}> = {}) {
  return {
    collection: (_name: string) => ({
      aggregate: (_pipeline: any[]) => ({
        toArray: overrides.aggregateThrows
          ? async () => { throw new Error('aggregate failed'); }
          : async () => overrides.aggregateResults ?? [],
      }),
    }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 1 — waitForIndexBuild
// ═════════════════════════════════════════════════════════════════════════════

describe('Group 1 — waitForIndexBuild', () => {
  // ── Test 1 ─────────────────────────────────────────────────────────────────
  it("resolves 'complete' when buildState disappears after two polls", async () => {
    let callCount = 0;
    const coll = makeCollection({
      indexes: async () => {
        callCount++;
        if (callCount <= 2) {
          // Still building
          return [{ name: 'myIndex', buildState: 'building', key: {} }];
        }
        // Build finished – no buildState
        return [{ name: 'myIndex', key: {} }];
      },
    });

    // Use an aggregate stub that always returns the index as non-building
    // so the corroboration path doesn't short-circuit on $indexStats; rely
    // purely on collection.indexes() disappearing buildState on 3rd call.
    const aggregateStub = (_pipeline: any[]) => ({
      toArray: async () => [] as any[],
    });
    (coll as any).aggregate = aggregateStub;

    // Speed up the internal sleep so the test completes quickly.
    const origSetTimeout = globalThis.setTimeout;
    const origDateNow = Date.now;
    let nowCalls = 0;
    // Give each iteration a low elapsed value so the timeout (set high) never fires.
    const HIGH_TIMEOUT = 60_000;
    Date.now = () => (nowCalls++ === 0 ? 0 : nowCalls * 5);
    (globalThis as any).setTimeout = (fn: () => void, _delay: number) =>
      origSetTimeout(fn, 0);

    try {
      const result = await waitForIndexBuild(coll as any, 'myIndex', HIGH_TIMEOUT);
      assert.strictEqual(result, 'complete');
    } finally {
      (globalThis as any).setTimeout = origSetTimeout;
      Date.now = origDateNow;
    }
  });

  // ── Test 2 ─────────────────────────────────────────────────────────────────
  it("resolves 'timeout' when the build never completes within timeoutMs", async () => {
    const coll = makeCollection({
      indexes: async () => [{ name: 'myIndex', buildState: 'building', key: {} }],
    });
    (coll as any).aggregate = (_pipeline: any[]) => ({
      toArray: async () => [] as any[],
    });

    // Fake setTimeout (resolve immediately) and Date.now (make elapsed exceed
    // timeoutMs after the first full iteration).
    const origSetTimeout = globalThis.setTimeout;
    const origDateNow = Date.now;
    let nowCalls = 0;
    // Sequence: startedAt=0, first-loop-check=0 (<50 → pass), second-loop-check=100 (≥50 → timeout)
    const nowSequence = [0, 0, 100];
    Date.now = () => nowSequence[Math.min(nowCalls++, nowSequence.length - 1)];
    (globalThis as any).setTimeout = (fn: () => void, _delay: number) =>
      origSetTimeout(fn, 0);

    try {
      const result = await waitForIndexBuild(coll as any, 'myIndex', 50);
      assert.strictEqual(result, 'timeout');
    } finally {
      (globalThis as any).setTimeout = origSetTimeout;
      Date.now = origDateNow;
    }
  });

  // ── Test 3 ─────────────────────────────────────────────────────────────────
  it("Atlas M0: $indexStats 'not authorized' error triggers graceful fallback and returns 'complete'", async () => {
    let indexCallCount = 0;
    const coll = makeCollection({
      indexes: async () => {
        indexCallCount++;
        if (indexCallCount === 1) {
          return [{ name: 'myIndex', buildState: 'building', key: {} }];
        }
        // Second poll: build done
        return [{ name: 'myIndex', key: {} }];
      },
    });

    // aggregate throws an authorization error (Atlas M0 freetier)
    (coll as any).aggregate = (_pipeline: any[]) => ({
      toArray: async () => {
        throw new Error('not authorized on testdb');
      },
    });

    const origSetTimeout = globalThis.setTimeout;
    const origDateNow = Date.now;
    let nowCalls = 0;
    Date.now = () => (nowCalls++ === 0 ? 0 : nowCalls * 5);
    (globalThis as any).setTimeout = (fn: () => void, _delay: number) =>
      origSetTimeout(fn, 0);

    try {
      // Must not throw
      const result = await waitForIndexBuild(coll as any, 'myIndex', 60_000);
      assert.strictEqual(result, 'complete');
    } finally {
      (globalThis as any).setTimeout = origSetTimeout;
      Date.now = origDateNow;
    }
  });

  // ── Test 4 ─────────────────────────────────────────────────────────────────
  it("resolves 'not_found' when the index disappears from the collection", async () => {
    const coll = makeCollection({
      indexes: async () => [],  // index is gone
    });
    (coll as any).aggregate = (_pipeline: any[]) => ({
      toArray: async () => [] as any[],
    });

    const result = await waitForIndexBuild(coll as any, 'myIndex', 60_000);
    assert.strictEqual(result, 'not_found');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Group 2 — checkCoveringIndexStatus
// ═════════════════════════════════════════════════════════════════════════════

describe('Group 2 — checkCoveringIndexStatus', () => {
  // ── Test 5 ─────────────────────────────────────────────────────────────────
  it("returns 'building' when the index has a buildState property", async () => {
    const coll = makeCollection({
      indexes: async () => [
        { name: 'coverIndex', key: { a: 1 }, buildState: 'in_progress' },
      ],
    });

    const status = await checkCoveringIndexStatus(
      coll as any,
      'coverIndex',
      { a: 1 }
    );
    assert.strictEqual(status, 'building');
  });

  // ── Test 6 ─────────────────────────────────────────────────────────────────
  it("returns 'absent' when the index is not found in the collection", async () => {
    const coll = makeCollection({
      indexes: async () => [],
    });

    const status = await checkCoveringIndexStatus(
      coll as any,
      'coverIndex',
      { a: 1 }
    );
    assert.strictEqual(status, 'absent');
  });

  // ── Test 7 ─────────────────────────────────────────────────────────────────
  it("returns 'ready' when index exists, no buildState, and key matches", async () => {
    const coll = makeCollection({
      indexes: async () => [
        { name: 'coverIndex', key: { a: 1 } },
      ],
    });

    const status = await checkCoveringIndexStatus(
      coll as any,
      'coverIndex',
      { a: 1 }
    );
    assert.strictEqual(status, 'ready');
  });

  // ── Test 8 ─────────────────────────────────────────────────────────────────
  it("returns 'invalid' when index exists but key spec does not match", async () => {
    const coll = makeCollection({
      indexes: async () => [
        { name: 'coverIndex', key: { b: 1 } }, // different key from expected { a: 1 }
      ],
    });

    const status = await checkCoveringIndexStatus(
      coll as any,
      'coverIndex',
      { a: 1 }
    );
    assert.strictEqual(status, 'invalid');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Group 3 — getIndexSizeBytes
// ═════════════════════════════════════════════════════════════════════════════

describe('Group 3 — getIndexSizeBytes', () => {
  // ── Test 9 ─────────────────────────────────────────────────────────────────
  it('returns the correct byte size when $indexStats contains the named index', async () => {
    const db = makeDb({
      aggregateResults: [{ name: 'myIndex', size: 12345 }],
    });

    const size = await getIndexSizeBytes(db as any, 'myCollection', 'myIndex');
    assert.strictEqual(size, 12345);
  });

  // ── Test 10 ────────────────────────────────────────────────────────────────
  it('returns null (fail-open) when aggregate throws', async () => {
    const db = makeDb({ aggregateThrows: true });

    // Must not throw
    const size = await getIndexSizeBytes(db as any, 'myCollection', 'myIndex');
    assert.strictEqual(size, null);
  });
});
