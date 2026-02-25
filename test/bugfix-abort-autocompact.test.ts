/**
 * Targeted unit tests for Bug fixes:
 *  Bug 2 — abort path ('n') in collection-processor.ts must return immediately
 *  Bug 1 — autoCompact must target db.admin().command() and disable in finally
 *
 * Strategy for Group A (abort flow)
 * ───────────────────────────────────
 * tsx uses its own ESM loader, making mock.module() unavailable.  Instead we
 * inject the user's answer by temporarily replacing process.stdin with a
 * PassThrough stream.  readline.createInterface reads process.stdin at call
 * time, so the swap happens before promptUser executes.
 *
 * Timing: we start the function, yield via setImmediate so readline has time
 * to register its 'line' handler, then push the answer.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { rebuildCollectionIndexes } from '../dist/collection-processor.js';
import { compactCollections } from '../dist/compact-operations.js';

// ── stdin-injection helper ────────────────────────────────────────────────

/**
 * Replace process.stdin with a PassThrough, start fn(), then push the answer
 * once readline's 'line' handler is registered (after one setImmediate tick).
 */
async function withStdinLine<T>(line: string, fn: () => Promise<T>): Promise<T> {
  const mockStream = new PassThrough();
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin')!;

  Object.defineProperty(process, 'stdin', {
    value: mockStream,
    configurable: true,
    enumerable: true,
    writable: true,
  });

  const resultPromise = fn();

  // Wait for readline.question to register its listener before pushing data;
  // setImmediate fires after all pending microtasks complete.
  await new Promise<void>(res => setImmediate(res));
  mockStream.write(line + '\n');

  try {
    return await resultPromise;
  } finally {
    Object.defineProperty(process, 'stdin', originalDescriptor);
    mockStream.destroy();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Group A — Abort Flow Correctness (collection-processor.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe('Group A — Abort Flow Correctness', () => {
  // ── test fixtures ─────────────────────────────────────────────────────────

  function makeCollectionSpy(name: string = 'users') {
    return {
      collectionName: name,
      indexes: mock.fn(async () => [] as any[]),
      createIndex: mock.fn(async (_key: any, _opts: any) => 'ok'),
      dropIndex: mock.fn(async (_name: string) => undefined as void),
    };
  }

  function makeDb() {
    return {
      command: async (cmd: any) => {
        if (cmd.collStats) return { indexSizes: {} };
        return { ok: 1 };
      }
    };
  }

  const backedUpIndexes = [
    { name: 'email_1', key: { email: 1 }, v: 2 }   // non-unique, non-_id_
  ];
  const indexStats = [{ name: 'email_1', size: 100 * 1024 * 1024 }];
  const baseState     = () => ({ completed: {} as Record<string, string[]> });
  const basePaths     = {
    stateFile:  '/tmp/qa-test-state.json',
    backupFile: '/tmp/qa-test-backup.json',
    logFile:    '/tmp/qa-test.log',
  };
  const safeRunConfig = {
    dbName: 'testdb', safeRun: true,
    coverSuffix: '_covering', cheapSuffixField: '_cheap',
    ignoredIndexes: [] as string[],
  };

  // ── tests ─────────────────────────────────────────────────────────────────

  it('should return skipped status immediately when user answers n to abort prompt', async () => {
    const coll = makeCollectionSpy();

    // Inject 'n' into stdin so promptUser resolves with ['n','no']
    const result = await withStdinLine('n', () =>
      rebuildCollectionIndexes(
        makeDb() as any, coll as any, backedUpIndexes, indexStats,
        baseState(), basePaths, safeRunConfig
      )
    );

    assert.strictEqual(
      result.status, 'skipped',
      `Expected status 'skipped' but got '${result.status}'`
    );
    assert.strictEqual(
      coll.createIndex.mock.calls.length, 0,
      'collection.createIndex must NOT be called when user answers n'
    );
    assert.strictEqual(
      coll.dropIndex.mock.calls.length, 0,
      'collection.dropIndex must NOT be called when user answers n'
    );
  });

  it('should return skipped status immediately when there are no processable indexes', async () => {
    const coll = makeCollectionSpy();
    const noSafeRunConfig = { ...safeRunConfig, safeRun: false };

    const result = await rebuildCollectionIndexes(
      makeDb() as any, coll as any, [], [],   // empty backedUpIndexes → processableIndexes = 0
      baseState(), basePaths, noSafeRunConfig
    );

    assert.strictEqual(result.status, 'skipped');
    assert.strictEqual(coll.createIndex.mock.calls.length, 0,
      'createIndex must not be called when there is nothing to process');
    assert.strictEqual(coll.dropIndex.mock.calls.length, 0,
      'dropIndex must not be called when there is nothing to process');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group B — AutoCompact Node-Level Behaviour (compact-operations.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe('Group B — AutoCompact Node-Level Behaviour', () => {

  // ── helpers ───────────────────────────────────────────────────────────────

  const STORAGE_BYTES = 6_000 * 1024 * 1024;
  const DATA_BYTES    = 1_000 * 1024 * 1024;

  type CommandCall = { cmd: Record<string, unknown>; opts?: any };

  function makeDbV8(options: {
    throwOnAutoCompactEnable?: boolean;
  } = {}) {
    const commandCalls: CommandCall[] = [];
    const adminCalls:   CommandCall[] = [];

    const members = [
      { _id: 0, host: 'primary:27017',   tags: { availabilityZone: 'zone-a' } },
      { _id: 1, host: 'secondary1:27017', tags: { availabilityZone: 'zone-b' } },
      { _id: 2, host: 'secondary2:27017', tags: { availabilityZone: 'zone-c' } },
    ];

    const db = {
      listCollections: () => ({
        toArray: async () => [{ name: 'testCol' }],
      }),
      command: async (cmd: any, opts?: any) => {
        commandCalls.push({ cmd, opts });
        if (cmd.collStats)  return { storageSize: STORAGE_BYTES, size: DATA_BYTES };
        if (cmd.dataSize)   return { estimate: STORAGE_BYTES - DATA_BYTES };
        return { ok: 1 };
      },
      admin: () => ({
        command: async (cmd: any, opts?: any) => {
          adminCalls.push({ cmd, opts });

          if (cmd.buildInfo) {
            return { version: '8.0.0' };
          }
          if (cmd.replSetGetConfig) {
            return { config: { members } };
          }
          if (cmd.replSetGetStatus) {
            return {
              members: members.map(m => ({ _id: m._id, state: m._id === 0 ? 1 : 2 }))
            };
          }
          // Throw to simulate enable failure when requested
          if (cmd.autoCompact === true && options.throwOnAutoCompactEnable) {
            throw new Error('Simulated autoCompact enable failure');
          }
          if (cmd.currentOp) {
            // Return empty inprog → autoCompact completes immediately
            return { inprog: [] };
          }
          return { ok: 1 };
        }
      }),
    };

    return { db, commandCalls, adminCalls };
  }

  // ─────────────────────────────────────────────────────────────────────────

  it('should call autoCompact via db.admin().command, NOT via db.command', async () => {
    const { db, commandCalls, adminCalls } = makeDbV8();

    await compactCollections(db as any, {
      dbName: 'testdb',
      clusterName: 'test-cluster',
      minSavingsMb: 1,
      convergenceTolerance: 0.2,
      minConvergenceSizeMb: 1,
      forceStepdown: false,
      stepDownTimeoutSeconds: 5,
      autoCompact: true,
      safeRun: false,
    });

    // The enable command must hit admin().command
    const adminAutoCompactEnable = adminCalls.find(
      c => c.cmd.autoCompact === true && c.cmd.runOnce === true
    );
    assert.ok(
      adminAutoCompactEnable !== undefined,
      `Expected db.admin().command({ autoCompact: true, runOnce: true }) call; adminCalls were: ${JSON.stringify(adminCalls.map(c => c.cmd))}`
    );
    assert.deepStrictEqual(
      adminAutoCompactEnable!.cmd,
      { autoCompact: true, freeSpaceTargetMB: 10, runOnce: true },
      'autoCompact enable command must have correct structure'
    );

    // The db.command (non-admin) must NOT have been used for autoCompact
    const dbAutoCompact = commandCalls.find(c => 'autoCompact' in c.cmd);
    assert.strictEqual(
      dbAutoCompact, undefined,
      `db.command should NOT be called for autoCompact; found: ${JSON.stringify(dbAutoCompact?.cmd)}`
    );
  });

  it('should disable autoCompact in finally block even when enable throws', async () => {
    const { db, adminCalls } = makeDbV8({ throwOnAutoCompactEnable: true });

    // The operation may log an error but must not throw to the caller
    const result = await compactCollections(db as any, {
      dbName: 'testdb',
      clusterName: 'test-cluster',
      minSavingsMb: 1,
      convergenceTolerance: 0.2,
      minConvergenceSizeMb: 1,
      forceStepdown: false,
      stepDownTimeoutSeconds: 5,
      autoCompact: true,
      safeRun: false,
    });

    // The disable command must appear in adminCalls regardless of the error
    const disableCall = adminCalls.find(c => c.cmd.autoCompact === false);
    assert.ok(
      disableCall !== undefined,
      `Expected db.admin().command({ autoCompact: false }) in finally block; adminCalls: ${JSON.stringify(adminCalls.map(c => c.cmd))}`
    );

    // The overall function should return a log (not throw)
    assert.ok(result !== null && typeof result === 'object',
      'compactCollections should return a log object even on error');
  });
});
