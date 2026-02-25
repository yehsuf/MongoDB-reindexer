# Session Context — Developer Agent Brief

**Date**: 2026-02-25  
**Project**: MongoDB-reindexer — TypeScript CLI for zero-downtime index rebuilds (Cover-Swap-Cleanup) and compact/autoCompact flows.  
**Agent reading this**: Developer  
**Prepared by**: Plan Agent

---

## 1. Project Context

`src/` contains a TypeScript CLI tool compiled to `dist/` via `npm run build`.  
Key files:
- `src/compact-operations.ts` — All compact + autoCompact logic
- `src/collection-processor.ts` — Per-collection rebuild/abort flow
- `src/cli.ts` — Commander.js CLI entry point
- `scripts/run-cluster-tests.sh` — Combined CLI + NPM test runner
- `scripts/test-cli-mode.sh` — CLI smoke-test script
- `scripts/qa-cluster-validation.sh` — QA environment validation script

---

## 2. Bugs to Fix

### Bug 1 — autoCompact semantic mismatch (`src/compact-operations.ts`) **CRITICAL**

**Checklist — autoCompact correctness:**

| # | Check | File | Lines |
|---|-------|------|-------|
| A | `db.admin().command(...)` used — NOT `db.command(...)` | `src/compact-operations.ts` | 843–852 |
| B | `runOnce: true` is present in the autoCompact command object | `src/compact-operations.ts` | 845–850 |
| C | autoCompact is invoked once per NODE (primary + each distinct secondary), NOT once per collection | `src/compact-operations.ts` | 339–357 |
| D | `finally` block calls `db.admin().command({ autoCompact: false })` to disable | `src/compact-operations.ts` | 870–879 |
| E | `currentOp` polling (not `collStats.size`) used to monitor completion | `src/compact-operations.ts` | 855–867 |
| F | Any storage metric comparisons use `storageSize`, not `size` | `src/compact-operations.ts` | search for `collStats` |

If `enableAndMonitorAutoCompact(db, collectionName, ...)` exists anywhere: delete it and replace all call sites with `runAutoCompactOnNode`.

**Filter-aware prompt (verify):**
- `safeRun` mode: prompt `"Filters provided but autoCompact is node-wide. Use manual compact instead? [y/n]"`
- Non-interactive: log warning and default to manual compact.

**`--force-manual-compact` flag:** Verify it is wired from `src/cli.ts` → `CompactConfig.forceManualCompact` → `src/compact-operations.ts`.

---

### Bug 2 — Abort flow continues after user says 'n' (`src/collection-processor.ts`) **HIGH**

**Exact location:** `src/collection-processor.ts` lines 116–140

**Fix:** Add `return { status: 'skipped', log: collectionLog };` immediately after abort notification in the `'n'` branch so no `createIndex`/`dropIndex` calls execute.

---

### Bug 3 — `scripts/run-cluster-tests.sh`: `CLI_EXIT` used before assignment **HIGH**

**Exact location:** lines 67–71 and line 101

**Fix:** Replace the `if` block with:
```bash
chmod +x scripts/test-cli-mode.sh
./scripts/test-cli-mode.sh "$URI" "$DB" 2>&1 | tee -a "$RESULTS_FILE"
CLI_EXIT=${PIPESTATUS[0]}
if [ $CLI_EXIT -eq 0 ]; then
  success "CLI mode tests passed"
else
  error "CLI mode tests failed (exit code: $CLI_EXIT)"
fi