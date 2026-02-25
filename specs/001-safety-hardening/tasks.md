# Tasks: MongoDB-Reindexer Safety, Correctness, and Quality Hardening

**Spec**: `specs/001-safety-hardening/spec.md`
**Plan**: `specs/001-safety-hardening/plan.md`
**Branch**: `001-safety-hardening`
**Created**: 2026-02-24
**Status**: Ready for implementation

---

## Quick Checklist

### Phase 1 — Setup
- [ ] T-001 Checkout branch `001-safety-hardening` and verify clean build

### Phase 2 — US1: Abort Decision is Honoured (P1, Area 1)
- [ ] T-002 [P] Fix abort return in `src/collection-processor.ts`
- [ ] T-003 [P] Detect `status === 'aborted'` and break loop in `src/index.ts`
- [ ] T-002-test Write abort-flow unit tests in `test/collection-processor-abort.test.ts`

### Phase 3 — US2: State Files Are Scoped to Database (P1, Area 2)
- [ ] T-004 [P] Add DB-scoped state file path in `src/index.ts`
- [ ] T-005 [P] Add `STATE_FILE_TEMPLATE` constant in `src/constants.ts`
- [ ] T-004-test Write state-file scoping tests in `test/state-file-scoping.test.ts`

### Phase 4 — US3: No Credentials in Repository (P1, Area 3)
- [ ] T-006 [P] Remove MONGODB_URI echo from `scripts/load-env.sh`
- [ ] T-007 [P] Create `.env.example` with placeholder values
- [ ] T-006-test Write credential scan tests in `test/security-scan.test.ts`

### Phase 5 — US4: Shell Scripts Are Injection-Safe (P2, Area 4)
- [ ] T-008 [P] Replace `source "$ENV_FILE"` with safe while-loop parser in `scripts/load-env.sh`
- [ ] T-009 [P] Replace `xargs export` with safe while-loop parser in `scripts/test-with-env.sh`
- [ ] T-010 [P] Initialize `CLI_EXIT`/`NPM_EXIT` and capture exit codes in `scripts/run-cluster-tests.sh`
- [ ] T-011 [P] Fix `$CONNECTIVITY_STATUS` typo in `scripts/qa-cluster-validation.sh`

### Phase 6 — US5: CLI Contract is Stable (P2, Area 5) ← depends on Phase 5
- [ ] T-012 Rewrite `scripts/test-cli-mode.sh` to use only `rebuild`, `cleanup`, `compact`
- [ ] T-012-test Write CLI contract tests in `test/cli-contract.test.ts`

### Phase 7 — US6: Orphan Cleanup Requires Confirmation (P2, Area 6)
- [ ] T-013 [P] Add dry-run log label in `src/orphan-cleanup.ts`
- [ ] T-014 [P] Add no-state confirmation gate in `src/orphan-cleanup.ts`
- [ ] T-013-test Write orphan-cleanup safety gate tests in `test/orphan-cleanup.test.ts`

### Phase 8 — US7: Compact Command is Safe by Default (P3, Area 7)
- [ ] T-015 [P] Add `--no-safe-run` option to compact in `src/cli.ts`
- [ ] T-016 [P] Change compact `safeRun` default to `true` in `src/cli.ts`
- [ ] T-015-test Update compact safeRun tests in `test/cli.test.ts`

### Phase 9 — US8: autoCompact State Always Restored + storageSize Fix (P3, Area 8+10)
- [ ] T-017 [P] Wrap autoCompact post-enable code in `try/finally` in `src/compact-operations.ts`
- [ ] T-018 [P] Fix `getCollectionSize` to use `storageSize ?? 0` exclusively in `src/compact-operations.ts`
- [ ] T-017-test Write autoCompact lifecycle and storageSize tests in `test/compact-operations.test.ts`

### Phase 10 — Docs Version Alignment (Area 9, independent, last)
- [ ] T-019 [P] Update `>=3.6` references to `>=4.4` in `README.md`
- [ ] T-020 [P] Update `>=3.6` references to `>=4.4` in `docs/wiki/**/*.md`
- [ ] T-019-test Write docs version scan test in `test/docs-version.test.ts`

### Final Phase — Polish
- [ ] T-021 Run `npm run build` and confirm zero TypeScript errors
- [ ] T-022 Run `npm test` and confirm all SC-001 through SC-010 pass

---

## Task Details

### T-001 — Branch Setup and Build Gate
| | |
|-|-|
| **FRs** | — |
| **Files** | — (git + build) |
| **Dependencies** | none |
| **Owner** | Developer |
| **Acceptance** | Branch checked out; `npm run build` exits 0; baseline test count recorded |
| **Complexity** | S |

### T-002 — Fix abort return in `src/collection-processor.ts`
| | |
|-|-|
| **Area** | 1 — Abort-Flow Fix |
| **FRs** | FR-001, FR-002 |
| **Files** | `src/collection-processor.ts` (~line 119) |
| **Dependencies** | T-001 |
| **Owner** | Developer |
| **Acceptance** | SC-001: `responseChar === 'n'` returns `{ status: 'aborted', log: collectionLog }` and no createIndex/dropIndex follows |
| **Complexity** | S |
| **Change** | Add `return { status: 'aborted', log: collectionLog };` after `notifyCoordinator` call in the 'n' branch |

### T-003 — Detect abort status and break loop in `src/index.ts`
| | |
|-|-|
| **Area** | 1 — Abort-Flow Fix |
| **FRs** | FR-001, FR-002 |
| **Files** | `src/index.ts` (collection loop, after `rebuildCollectionIndexes` call) |
| **Dependencies** | T-002 |
| **Owner** | Developer |
| **Acceptance** | SC-001: outer loop breaks on first abort; `dbLog.error = 'Aborted by user.'`; exit code 1 |
| **Complexity** | S |
| **Change** | `if (result.status === 'aborted') { getLogger().warn('...'); dbLog.error = 'Aborted by user.'; break; }` |

### T-002-test — Abort-flow unit tests
| | |
|-|-|
| **Area** | 1 |
| **FRs** | FR-001, FR-002 |
| **Files** | `test/collection-processor-abort.test.ts` (new) |
| **Dependencies** | T-002, T-003 |
| **Owner** | QA_Lead |
| **Acceptance** | SC-001: (1) single abort — zero createIndex/dropIndex calls, return `{status:'aborted'}`; (2) multi-collection — second collection never entered; (3) exit code 1 |
| **Complexity** | M |

### T-004 — Add DB-scoped state file path in `src/index.ts`
| | |
|-|-|
| **Area** | 2 — State File Scoping |
| **FRs** | FR-003, FR-004 |
| **Files** | `src/index.ts` (~line 113) |
| **Dependencies** | T-001 |
| **Owner** | Developer |
| **Acceptance** | SC-002: state filename contains sanitized `dbName`; `${clusterName}_state.json` pattern replaced |
| **Complexity** | S |
| **Change** | `const safeDbName = fullConfig.dbName.replace(/[^a-zA-Z0-9_-]/g, '_'); stateFile: \`${fullConfig.runtimeDir}/${clusterName}_${safeDbName}_state.json\`` |

### T-005 — Add `STATE_FILE_TEMPLATE` constant in `src/constants.ts`
| | |
|-|-|
| **Area** | 2 |
| **FRs** | FR-003 |
| **Files** | `src/constants.ts` |
| **Dependencies** | T-001 |
| **Owner** | Developer |
| **Acceptance** | `FILE_CONSTANTS.STATE_FILE_TEMPLATE` equals `'{clusterName}_{dbName}_state.json'` |
| **Complexity** | S |

### T-004-test — State-file scoping tests
| | |
|-|-|
| **Area** | 2 |
| **FRs** | FR-003, FR-004 |
| **Files** | `test/state-file-scoping.test.ts` (new) |
| **Dependencies** | T-004, T-005 |
| **Owner** | QA_Lead |
| **Acceptance** | SC-002: two configs same cluster different DBs → distinct paths; special char DB name → sanitized filename |
| **Complexity** | M |

### T-006 — Remove MONGODB_URI echo from `scripts/load-env.sh`
| | |
|-|-|
| **Area** | 3 — Credential Removal |
| **FRs** | FR-005, FR-007 |
| **Files** | `scripts/load-env.sh` (line 13) |
| **Dependencies** | T-001 |
| **Owner** | Developer |
| **Acceptance** | SC-003: no line prints any MONGODB_URI substring; replaced with `echo "   - MONGODB_URI: [set]"` |
| **Complexity** | S |

### T-007 — Create `.env.example` at repository root
| | |
|-|-|
| **Area** | 3 |
| **FRs** | FR-006 |
| **Files** | `.env.example` (new) |
| **Dependencies** | T-001 |
| **Owner** | Developer |
| **Acceptance** | SC-003: file exists with only placeholder values; `.gitignore` already excludes `.env` (confirmed compliant) |
| **Complexity** | S |
| **Content** | `MONGODB_URI=mongodb://user:password@localhost:27017/admin?replicaSet=rs0` etc. |

### T-006-test — Credential scan tests
| | |
|-|-|
| **Area** | 3 |
| **FRs** | FR-005, FR-006, FR-007, FR-008 |
| **Files** | `test/security-scan.test.ts` (new) |
| **Dependencies** | T-006, T-007 |
| **Owner** | QA_Lead |
| **Acceptance** | SC-003: git-tracked files contain no real URI `/mongodb(\+srv)?:\/\/[^:]+:[^@]+@(?!localhost)/i`; `.env.example` placeholders only |
| **Complexity** | M |

### T-008 — Safe env parsing in `scripts/load-env.sh`
| | |
|-|-|
| **Area** | 4 — Shell Script Safety |
| **FRs** | FR-009 |
| **Files** | `scripts/load-env.sh` (~line 9) |
| **Dependencies** | T-006 |
| **Owner** | Developer |
| **Acceptance** | SC-004: `$(whoami)` in value exported literally; `source` removed entirely |
| **Complexity** | M |
| **Change** | Replace `set -a; source "$ENV_FILE"; set +a` with safe `while IFS= read -r line` parser |

### T-009 — Safe env parsing in `scripts/test-with-env.sh`
| | |
|-|-|
| **Area** | 4 |
| **FRs** | FR-010 |
| **Files** | `scripts/test-with-env.sh` (~line 6) |
| **Dependencies** | T-001 |
| **Owner** | Developer |
| **Acceptance** | SC-004: `xargs` pipeline removed; metacharacters in values not executed |
| **Complexity** | M |

### T-010 — Initialize `CLI_EXIT`/`NPM_EXIT` in `scripts/run-cluster-tests.sh`
| | |
|-|-|
| **Area** | 4 |
| **FRs** | FR-011 |
| **Files** | `scripts/run-cluster-tests.sh` |
| **Dependencies** | T-001 |
| **Owner** | Developer |
| **Acceptance** | SC-004: `CLI_EXIT=0` set at top; captured with `set +e ... ; CLI_EXIT=$?; set -e`; final `exit $((CLI_EXIT || NPM_EXIT))` |
| **Complexity** | S |

### T-011 — Fix `$CONNECTIVITY_STATUS` typo in `scripts/qa-cluster-validation.sh`
| | |
|-|-|
| **Area** | 4 |
| **FRs** | FR-012 |
| **Files** | `scripts/qa-cluster-validation.sh` (~line 181) |
| **Dependencies** | T-001 |
| **Owner** | Developer |
| **Acceptance** | SC-004: `elif [ "$CONNECTIVITY_STATUS" = "SKIPPED" ]` — correct variable reference; no `"CTIVITY_STATUS"` bare string anywhere |
| **Complexity** | S |

### T-012 — Rewrite `scripts/test-cli-mode.sh`
| | |
|-|-|
| **Area** | 5 — CLI Contract |
| **FRs** | FR-013, FR-014, FR-015 |
| **Files** | `scripts/test-cli-mode.sh` |
| **Dependencies** | T-010, T-011 |
| **Owner** | Developer |
| **Acceptance** | SC-005: no `list` command; no `--collection`; no `--verbose`; `--specified-collections` used; end-to-end run exits 0 |
| **Complexity** | M |

### T-012-test — CLI contract tests
| | |
|-|-|
| **Area** | 5 |
| **FRs** | FR-013, FR-014, FR-015 |
| **Files** | `test/cli-contract.test.ts` (new) |
| **Dependencies** | T-012 |
| **Owner** | QA_Lead |
| **Acceptance** | SC-005: `rebuild`, `cleanup`, `compact` registered; no `list`; `--specified-collections` exists; no `--collection` |
| **Complexity** | M |

### T-013 — Add dry-run log label in `src/orphan-cleanup.ts`
| | |
|-|-|
| **Area** | 6 — Orphan Cleanup Safety |
| **FRs** | FR-016, FR-017 |
| **Files** | `src/orphan-cleanup.ts` (~line 65) |
| **Dependencies** | T-001 |
| **Owner** | Developer |
| **Acceptance** | SC-006: `⚠️  DRY RUN` log emitted before any candidate listing on every code path |
| **Complexity** | S |

### T-014 — Add no-state confirmation gate in `src/orphan-cleanup.ts`
| | |
|-|-|
| **Area** | 6 |
| **FRs** | FR-016, FR-017, FR-018 |
| **Files** | `src/orphan-cleanup.ts` (~line 65) |
| **Dependencies** | T-013 |
| **Owner** | Developer |
| **Acceptance** | SC-006: `!state` → confirmation always fires even if `safeRun: false`; "n" → zero drops; state present → only state-confirmed orphans dropped |
| **Complexity** | S |
| **Change** | `if (!state \|\| config.safeRun) { const [responseChar] = await promptUser(...); if (responseChar === 'n') { return; } }` |

### T-013-test — Orphan cleanup safety gate tests
| | |
|-|-|
| **Area** | 6 |
| **FRs** | FR-016, FR-017, FR-018 |
| **Files** | `test/orphan-cleanup.test.ts` (new) |
| **Dependencies** | T-013, T-014 |
| **Owner** | QA_Lead |
| **Acceptance** | SC-006: 5 cases — no-state+confirm/cancel/safeRun:false; with-state+in/not-in-completed |
| **Complexity** | L |

### T-015 — Add `--no-safe-run` to compact in `src/cli.ts`
| | |
|-|-|
| **Area** | 7 — Compact safeRun |
| **FRs** | FR-020 |
| **Files** | `src/cli.ts` |
| **Dependencies** | T-001 |
| **Owner** | Developer |
| **Acceptance** | SC-007: `--no-safe-run` appears in `compact --help`; sets `options.safeRun = false` |
| **Complexity** | S |

### T-016 — Change compact `safeRun` default to `true` in `src/cli.ts`
| | |
|-|-|
| **Area** | 7 |
| **FRs** | FR-019 |
| **Files** | `src/cli.ts` |
| **Dependencies** | T-015 |
| **Owner** | Developer |
| **Acceptance** | SC-007: `compact` no flags → `safeRun: true`; `compact --no-safe-run` → `safeRun: false` |
| **Complexity** | S |
| **Change** | `safeRun: options.safeRun !== undefined ? options.safeRun : true` |

### T-015-test — Compact safeRun default tests
| | |
|-|-|
| **Area** | 7 |
| **FRs** | FR-019, FR-020 |
| **Files** | `test/cli.test.ts` (update) |
| **Dependencies** | T-015, T-016 |
| **Owner** | QA_Lead |
| **Acceptance** | SC-007: no-flags → `safeRun: true`; with `--no-safe-run` → `safeRun: false` |
| **Complexity** | S |

### T-017 — Wrap autoCompact code in `try/finally` in `src/compact-operations.ts`
| | |
|-|-|
| **Area** | 8+10 — autoCompact + storageSize |
| **FRs** | FR-021 |
| **Files** | `src/compact-operations.ts` (~line 800) |
| **Dependencies** | T-001 |
| **Owner** | Developer |
| **Acceptance** | SC-008: simulated polling error → `autoCompact: false` still sent; `finally` contains only the disable call |
| **Complexity** | M |

### T-018 — Fix `getCollectionSize` to use `storageSize` exclusively
| | |
|-|-|
| **Area** | 8+10 |
| **FRs** | FR-023 |
| **Files** | `src/compact-operations.ts` |
| **Dependencies** | T-017 (co-located) |
| **Owner** | Developer |
| **Acceptance** | SC-010: no `stats.size` in compact validation; `stats.storageSize ?? 0` at every measurement point |
| **Complexity** | S |
| **Change** | `const sizeBytes = stats.storageSize ?? 0;` (remove `\|\| stats.size` fallback) |

### T-017-test — autoCompact lifecycle and storageSize tests
| | |
|-|-|
| **Area** | 8+10 |
| **FRs** | FR-021, FR-023 |
| **Files** | `test/compact-operations.test.ts` (new/update) |
| **Dependencies** | T-017, T-018 |
| **Owner** | QA_Lead |
| **Acceptance** | SC-008+SC-010: (1) polling throws → `autoCompact:false` still sent; (2) `storageSize` 1000→900 → reduced=true; (3) `storageSize:undefined` → returns 0 with warning |
| **Complexity** | M |

### T-019 — Update MongoDB version in `README.md`
| | |
|-|-|
| **Area** | 9 — Docs |
| **FRs** | FR-022 |
| **Files** | `README.md` |
| **Dependencies** | none |
| **Owner** | Technical_Writer |
| **Acceptance** | SC-009: zero matches for `/>=\s*3\.6\|MongoDB\s*3\.6\|v3\.6/i` |
| **Complexity** | S |

### T-020 — Update MongoDB version in `docs/wiki/**/*.md`
| | |
|-|-|
| **Area** | 9 |
| **FRs** | FR-022 |
| **Files** | `docs/wiki/**/*.md` |
| **Dependencies** | none |
| **Owner** | Technical_Writer |
| **Acceptance** | SC-009: zero `3.6` version references in all wiki docs |
| **Complexity** | S |

### T-019-test — Docs version scan test
| | |
|-|-|
| **Area** | 9 |
| **FRs** | FR-022 |
| **Files** | `test/docs-version.test.ts` (new) |
| **Dependencies** | T-019, T-020 |
| **Owner** | QA_Lead |
| **Acceptance** | SC-009: reads all `.md` files; asserts zero `/MongoDB.*3\.6\|>=\s*3\.6\|v3\.6/i` matches |
| **Complexity** | S |

### T-021 — Build verification
| | |
|-|-|
| **FRs** | all |
| **Dependencies** | T-002 through T-020 |
| **Owner** | Developer |
| **Acceptance** | `npm run build` exits 0; `dist/cli.js` present |
| **Complexity** | S |

### T-022 — Full test suite verification
| | |
|-|-|
| **FRs** | all |
| **Dependencies** | T-021 |
| **Owner** | QA_Lead |
| **Acceptance** | `npm test` exits 0; all SC-001 through SC-010 green |
| **Complexity** | S |

---

## Dependency Graph

```
T-001
  ├── T-002 → T-003 → T-002-test         [US1 Abort]
  ├── T-004 + T-005 → T-004-test         [US2 State scoping]
  ├── T-006 → T-008, T-006-test          [US3 Credentials → Script safety]
  │        T-007 (independent)
  ├── T-009                               [Script safety, standalone]
  ├── T-010 → T-012 → T-012-test         [Script safety → CLI contract]
  ├── T-011                               [Typo fix, standalone]
  ├── T-013 → T-014 → T-013-test         [US6 Orphan]
  ├── T-015 → T-016 → T-015-test         [US7 Compact]
  ├── T-017 + T-018 → T-017-test         [US8 autoCompact+storageSize]
  ├── T-019 + T-020 → T-019-test         [Docs]
  └── All → T-021 → T-022
```

**Parallelizable groups after T-001**:
- Group A (P1): T-002/T-003, T-004/T-005, T-006/T-007
- Group B (P2): T-008/T-009/T-010/T-011, T-013/T-014, T-015/T-016, T-017/T-018
- Group C (blocked): T-012 waits on T-010
- Group D (anytime): T-019/T-020

---

## Coverage Map

| SC | Tasks |
|----|-------|
| SC-001 — Abort tests 100% | T-002, T-003, T-002-test |
| SC-002 — Distinct state files per DB | T-004, T-005, T-004-test |
| SC-003 — Clean credential scan | T-006, T-007, T-006-test |
| SC-004 — Scripts accurate exit codes | T-008, T-009, T-010, T-011 |
| SC-005 — test-cli-mode.sh runs clean | T-012, T-012-test |
| SC-006 — No drop without confirm | T-013, T-014, T-013-test |
| SC-007 — compact defaults safeRun:true | T-015, T-016, T-015-test |
| SC-008 — autoCompact disabled on error | T-017, T-017-test |
| SC-009 — Zero >=3.6 in docs | T-019, T-020, T-019-test |
| SC-010 — storageSize exclusively | T-018, T-017-test |

---

## Task Count Summary

| Category | Count |
|----------|-------|
| Setup | 1 |
| Implementation tasks | 19 |
| Test tasks | 10 |
| Polish/verification | 2 |
| **Total** | **32** |
