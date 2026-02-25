# Implementation Plan: MongoDB-Reindexer Safety, Correctness, and Quality Hardening

**Spec**: `specs/001-safety-hardening/spec.md`
**Branch**: `001-safety-hardening`
**Created**: 2026-02-24
**Status**: Draft

---

## Technical Context

| Item | Value |
|------|-------|
| Language | TypeScript (ESM, strict mode) |
| Runtime | Node.js, CLI via `commander` |
| MongoDB target | >=4.4 replica sets |
| Test framework | Jest |
| Build | `npm run build` (tsc) |
| Entry point | `src/cli.ts` → `dist/cli.js` |
| Core modules | `src/collection-processor.ts`, `src/index.ts`, `src/index-operations.ts`, `src/compact-operations.ts`, `src/orphan-cleanup.ts`, `src/cli.ts`, `src/constants.ts`, `src/file-utils.ts`, `src/version-detection.ts` |
| Scripts | `scripts/load-env.sh`, `scripts/test-with-env.sh`, `scripts/run-cluster-tests.sh`, `scripts/test-cli-mode.sh`, `scripts/qa-cluster-validation.sh` |
| Docs | `README.md`, `docs/wiki/` |
| State files | `.rebuild_runtime/{clusterName}_state.json` (pre-fix) → `{clusterName}_{dbName}_state.json` (post-fix) |

---

## Existing Bug Inventory

### FR-001/FR-002 — Abort flow does not stop index operations
**File**: `src/collection-processor.ts` ~line 119
**Defect**: `responseChar === 'n'` does not return; execution falls through to the index loop.

### FR-003/FR-004 — State file not scoped to database
**File**: `src/index.ts` ~line 113
**Defect**: `${clusterName}_state.json` — no db disambiguation.

### FR-005/FR-007 — URI content echoed to stdout
**File**: `scripts/load-env.sh` line 13
**Defect**: `echo "   - MONGODB_URI: ${MONGODB_URI:0:50}..."` emits first 50 chars of URI.

### FR-006 — `.env.example` missing
**Defect**: No template file; contributors may use real credentials.

### FR-008 — `.gitignore` status
**Status**: Already compliant — `.env`, `.env.*`, `!.env.example`, `test-reports/` all excluded.

### FR-009 — `load-env.sh` evaluates values as shell expressions
**File**: `scripts/load-env.sh` line 9
**Defect**: `source "$ENV_FILE"` runs the env file as shell script; shell metacharacters in values are executed.

### FR-010 — `test-with-env.sh` evaluates values via `xargs`
**File**: `scripts/test-with-env.sh` line 6
**Defect**: `export $(cat .env.test | grep -v '^#' | xargs)` — word splitting and shell evaluation risk.

### FR-011 — `run-cluster-tests.sh` unset `CLI_EXIT`
**File**: `scripts/run-cluster-tests.sh` ~line 101
**Defect**: `CLI_EXIT` never assigned; summary block uses undefined variable; exit code logic broken.

### FR-012 — `$CONNECTIVITY_STATUS` typo
**File**: `scripts/qa-cluster-validation.sh` ~line 181
**Defect**: `elif [ "CTIVITY_STATUS" = "SKIPPED" ]` — bare string, truncated name; branch never matches.

### FR-013/FR-014/FR-015 — `test-cli-mode.sh` uses non-existent CLI commands/flags
**File**: `scripts/test-cli-mode.sh`
**Defect**: Uses `list` command, `--collection`, `--verbose` — none exist in CLI.

### FR-016/FR-017/FR-018 — Orphan cleanup safety gate absent without state
**File**: `src/orphan-cleanup.ts` ~line 65
**Defect**: Confirmation gated solely on `safeRun`; no dry-run label; no additional gate when state is absent.

### FR-019/FR-020 — `compact` defaults `safeRun: false`, no `--no-safe-run` flag
**File**: `src/cli.ts` ~line 267
**Defect**: `safeRun: false` hardcoded; no opt-out flag declared.

### FR-021 — `autoCompact` not disabled in `finally` block
**File**: `src/compact-operations.ts` ~line 800
**Defect**: Disable call not in `finally`; errors leave autoCompact permanently enabled.

### FR-022 — Docs reference MongoDB >=3.6
**Files**: `README.md`, `docs/wiki/`
**Defect**: Must be updated to >=4.4.

### FR-023 — `collStats.size` used instead of `storageSize` in compact validation
**File**: `src/compact-operations.ts` ~lines 808, 822
**Defect**: `size` is logical data size; `storageSize` tracks on-disk allocation and reflects compaction.

---

## Implementation Areas

### Area 1 — Abort-Flow Fix (FR-001, FR-002)
**Files**: `src/collection-processor.ts`, `src/index.ts`

**1.1** `collection-processor.ts`: After `notifyCoordinator` in the `responseChar === 'n'` branch, add:
```typescript
return { status: 'aborted', log: collectionLog };
```

**1.2** `src/index.ts`: After `rebuildCollectionIndexes` call in the collection loop, add:
```typescript
if (result.status === 'aborted') {
  getLogger().warn('Operation aborted by user. Stopping all further processing.');
  dbLog.error = 'Aborted by user.';
  break;
}
```

**1.3 Tests**: New file `test/collection-processor-abort.test.ts`
- Mock prompt → 'n'. Assert no createIndex/dropIndex calls. Assert return `{ status: 'aborted', ... }`.
- Multi-collection abort: assert second collection never processed.
- Assert exit code 1 on abort.

---

### Area 2 — State File Scoping (FR-003, FR-004)
**Files**: `src/index.ts`, `src/constants.ts`

**2.1** `src/index.ts` ~line 113:
```typescript
const safeDbName = fullConfig.dbName.replace(/[^a-zA-Z0-9_-]/g, '_');
stateFile: `${fullConfig.runtimeDir}/${clusterName}_${safeDbName}_state.json`,
```

**2.2** `src/constants.ts`: Add to `FILE_CONSTANTS`:
```typescript
STATE_FILE_TEMPLATE: '{clusterName}_{dbName}_state.json',
```

**2.3 Tests**: New file `test/state-file-scoping.test.ts`
- Two jobs, same cluster, different dbs → two distinct state file paths.
- DB name with special characters → sanitized filename.

---

### Area 3 — Credential Removal and .env.example (FR-005, FR-006, FR-007, FR-008)
**Files**: `scripts/load-env.sh`, `.env.example` (new)

**3.1** `scripts/load-env.sh`: Remove the echo of `MONGODB_URI` value. Replace with:
```bash
echo "   - MONGODB_URI: [set]"
echo "   - MONGODB_DATABASE: [set]"
```

**3.2** Create `.env.example`:
```bash
# MongoDB Reindexer — Environment Template
# Copy this file to .env and fill in real values.
# NEVER commit .env to version control.

MONGODB_URI=mongodb://user:password@localhost:27017/admin?replicaSet=rs0
MONGODB_DATABASE=your_database_name
MONGODB_TEST_URI=mongodb://user:password@localhost:27017/admin?replicaSet=rs0
MONGODB_TEST_DATABASE=reindex_test
```

**3.3** `.gitignore`: Already compliant — no change required.

**3.4 Tests**: New `test/security-scan.test.ts`
- List tracked git files; assert no real MongoDB URI pattern `/mongodb(\+srv)?:\/\/[^:]+:[^@]+@/`.
- Assert `.env.example` contains only placeholder values.

---

### Area 4 — Shell Script Safety (FR-009, FR-010, FR-011, FR-012)

**4.1** `scripts/load-env.sh`: Replace `source "$ENV_FILE"` with safe while-loop parser:
```bash
while IFS= read -r line || [ -n "$line" ]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  value="${value#\"}" value="${value%\"}"
  value="${value#\'}" value="${value%\'}"
  if [[ "$key" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    export "$key=$value"
  fi
done < "$ENV_FILE"
```

**4.2** `scripts/test-with-env.sh`: Replace `xargs export` pipeline with same safe while-loop parser.

**4.3** `scripts/run-cluster-tests.sh`:
- Add at top: `CLI_EXIT=0` and `NPM_EXIT=0`
- Capture CLI exit: `set +e; ./scripts/test-cli-mode.sh "$URI" "$DB" 2>&1 | tee -a "$RESULTS_FILE"; CLI_EXIT=$?; set -e`
- Same pattern for npm test: `set +e; npm test ...; NPM_EXIT=$?; set -e`

**4.4** `scripts/qa-cluster-validation.sh` ~line 181:
```bash
# Before
elif [ "CTIVITY_STATUS" = "SKIPPED" ]; then
# After
elif [ "$CONNECTIVITY_STATUS" = "SKIPPED" ]; then
```

---

### Area 5 — CLI Contract Alignment in Scripts (FR-013, FR-014, FR-015)
**File**: `scripts/test-cli-mode.sh`

- Remove all `list` command invocations — replace with `--version` check or rebuild dry test.
- Replace `--collection users` with `--specified-collections users`.
- Remove `--verbose` flag from all invocations.
- Use only: `rebuild`, `cleanup`, `compact`.

**5.5 Tests**: New `test/cli-contract.test.ts`
- Assert commands: `rebuild`, `cleanup`, `compact` exist. No `list`.
- Assert `--specified-collections` option exists. No `--collection`.

---

### Area 6 — Orphan Cleanup Safety Gates (FR-016, FR-017, FR-018)
**File**: `src/orphan-cleanup.ts`

**6.1** Always log dry-run label before listing orphan candidates:
```typescript
getLogger().warn('\n⚠️  DRY RUN — The following orphaned indexes were found. No changes have been made yet:');
```

**6.2** Always require confirmation when no state file:
```typescript
if (!state || config.safeRun) {
  const [responseChar] = await promptUser("\nProceed with cleanup? (y/n): ", ['yes', 'no'], 'cleanup');
  if (responseChar === 'n') {
    getLogger().info('Cleanup cancelled by user. No indexes were dropped.');
    return;
  }
}
```

**6.3** State-present path already restricts to confirmed orphans — retain and document.

**6.4 Tests**: New `test/orphan-cleanup.test.ts`
- No-state, user confirms → dropIndex called.
- No-state, user cancels → dropIndex never called. No error thrown.
- No-state, safeRun: false → prompt still fires.
- With state, orphan in completed → dropped.
- With state, orphan NOT in completed → not dropped.

---

### Area 7 — Compact safeRun Default (FR-019, FR-020)
**File**: `src/cli.ts`

**7.1** Add to compact command: `.option('--no-safe-run', 'Disable interactive prompts for compact')`

**7.2** Change compact action:
```typescript
// Before
safeRun: false
// After
safeRun: options.safeRun !== undefined ? options.safeRun : true
```

**7.3 Tests**: Update `test/cli.test.ts`
- compact, no flags → safeRun: true
- compact, --no-safe-run → safeRun: false

---

### Area 8+10 — autoCompact try/finally + storageSize Fix (FR-021, FR-023)
**File**: `src/compact-operations.ts`

**8.1** Wrap all post-enable code in `try/finally`:
```typescript
await runCommandWithReadPreference(db, { autoCompact: true, freeSpaceTargetMB: 10, runOnce: true }, readPreference);
try {
  const startStats = await runCommandWithReadPreference(db, { collStats: collectionName }, readPreference);
  const startSize = startStats.storageSize || 0;  // storageSize per FR-023
  // ... polling loop using currentStats.storageSize ...
} finally {
  try {
    await runCommandWithReadPreference(db, { autoCompact: false }, readPreference);
  } catch (disableErr) {
    getLogger().error(`Failed to disable autoCompact: ${disableErr}. Manual intervention required.`);
  }
}
```

**10.2** `getCollectionSize`:
```typescript
// Before
const sizeBytes = stats.storageSize || stats.size || 0;
// After
const sizeBytes = stats.storageSize ?? 0;
```

**Tests**: New/updated `test/compact-operations.test.ts`
- Mock: polling throws → assert autoCompact:false still sent.
- Mock: storageSize: 1000 before, 900 after → reduced === true.
- Mock: storageSize: undefined → returns 0 with warning.

---

### Area 9 — Docs Version Alignment (FR-022)
**Files**: `README.md`, all `docs/wiki/**/*.md`

Replace all occurrences of `3.6`, `v3.6`, `>=3.6`, `MongoDB 3.6` with `4.4`, `v4.4`, `>=4.4`, `MongoDB 4.4`.

**Tests**: New `test/docs-version.test.ts`
- Read all .md files. Assert no `/MongoDB.*3\.6|=3\.6|v3\.6/i` matches.

---

## Files Changed Summary

| File | FRs | Change Type |
|------|-----|-------------|
| `src/collection-processor.ts` | FR-001, FR-002 | Bug fix: return on abort |
| `src/index.ts` | FR-002, FR-003, FR-004 | Abort detection; state file path |
| `src/constants.ts` | FR-003 | Naming constant |
| `src/orphan-cleanup.ts` | FR-016, FR-017, FR-018 | Safety gate |
| `src/cli.ts` | FR-019, FR-020 | Compact safeRun default; --no-safe-run |
| `src/compact-operations.ts` | FR-021, FR-023 | try/finally; storageSize |
| `scripts/load-env.sh` | FR-007, FR-009 | Remove URI echo; safe parsing |
| `scripts/test-with-env.sh` | FR-010 | Safe env parsing |
| `scripts/run-cluster-tests.sh` | FR-011 | CLI_EXIT; exit code capture |
| `scripts/qa-cluster-validation.sh` | FRCTIVITY_STATUS typo fix |
| `scripts/test-cli-mode.sh` | FR-013, FR-014, FR-015 | Rewrite: remove list, fix flags |
| `.env.example` (new) | FR-006 | Credential template |
| `README.md` | FR-022 | 3.6 → 4.4 |
| `docs/wiki/*.md` | FR-022 | 3.6 → 4.4 |
| `test/collection-processor-abort.test.ts` (new) | FR-001, FR-002 | Abort tests |
| `test/state-file-scoping.test.ts` (new) | FR-003, FR-004 | State isolation tests |
| `test/security-scan.test.ts` (new) | FR-005, FR-006 | Credential scan |
| `test/orphan-cleanup.test.ts` (new) | FR-016, FR-017, FR-018 | Safety gate tests |
| `test/cli.test.ts` (update) | FR-019, FR-020 | Compact safeRun tests |
| `test/compact-operations.test.ts` (new/update) | FR-021, FR-023 | autoCompact/storageSize tests |
| `test/docs-version.test.ts` (new) | FR-022 | Version reference scan |
| `test/cli-contract.test.ts` (new) | FR-013, FR-015 | CLI contract |

---

## Implementation Order

```
Area 1 (Abort fix)               — independent
Area 2 (State scoping)           — independent
Area 3 (Credentials)             — independent
Area 4 (Script safety)           — independent
Area 5 (CLI contract scripts)    — after Area 4
Area 6 (Orphan safety)           — independent
Area 7 (Compact safeRun)         — independent
Area 8+10 (autoCompact+size)     — co-located in same function
Area 9 (Docs)                    — independent, last
```

Parallelizable: Areas 1, 2, 3, 4, 6, 7 can all proceed simultaneously.

---

## Success Criteria Mapping

| SC | Area |
|----|------|
| SC-001: Abort unit tests 100% | Area 1 |
| SC-002: Distinct state files per DB | Area 2 |
| SC-003: Fresh clone credential scan clean | Area 3 |
| SC-004: Scripts exit with accurate codes | Area 4 |
| SC-005: test-cli-mode.sh runs end-to-end | Area 5 |
| SC-006: No-state cleanup no drop without confirm | Area 6 |
| SC-007: compact no-flags → safeRun: true | Area 7 |
| SC-008: autoCompact disabled on error | Area 8 |
| SC-009: Zero >=3.6 references in docs | Area 9 |
| SC-010: storageSize exclusively in compact | Area 10 |
