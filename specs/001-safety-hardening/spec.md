# Feature Specification: MongoDB-Reindexer Safety, Correctness, and Quality Hardening

**Feature Branch**: `001-safety-hardening`
**Created**: 2026-02-24
**Status**: Draft
**Input**: "MongoDB-reindexer safety, correctness, and quality hardening — fix all critical and high severity issues found during the full review and test cycle, including MongoDB command correctness, abort-flow safety, state management, script reliability, security, and CLI contract alignment."

---

## User Scenarios & Testing

### User Story 1 — Abort Decision is Honoured (Priority: P1)

An operator running a reindex job answers "no" when prompted whether to continue. They expect all further index operations to stop immediately.

**Acceptance Scenarios**:
1. **Given** a collection-processor run is in progress and the prompt is shown, **When** the user answers "no", **Then** processing halts immediately and no index create/drop operations are executed.
2. **Given** a multi-collection job where the abort is triggered mid-run, **When** the user answers "no", **Then** the partially processed collection does not proceed.
3. **Given** the abort path is taken, **When** the run exits, **Then** exit code is non-zero and a "aborted by user" message is logged.

---

### User Story 2 — State Files Are Scoped to Database (Priority: P1)

An administrator runs reindex jobs against two different MongoDB databases on the same cluster. They expect each job to maintain independent, isolated state.

**Acceptance Scenarios**:
1. **Given** two jobs run against databases `db_alpha` and `db_beta` on the same cluster, **When** both run, **Then** two separate state files exist with no shared records.
2. **Given** a state file for `db_alpha` exists, **When** a new run starts for `db_beta`, **Then** it does not read, overwrite, or corrupt the `db_alpha` state file.
3. **Given** a state filename, **When** inspected, **Then** the database name is embedded in a way that makes collisions impossible.

---

### User Story 3 — No Credentials Stored or Exposed in the Repository (Priority: P1)

**Acceptance Scenarios**:
1. **Given** the repository is cloned fresh, **When** tracked files are scanned for MongoDB URIs, **Then** no real credentials are found.
2. **Given** `.env.example` exists, **When** read, **Then** it contains only placeholder values.
3. **Given** `scripts/load-env.sh` runs, **When** it logs, **Then** no URI content is emitted.
4. **Given** the `.gitignore`, **When** inspected, **Then** `.env`, `.env.*`, and `test-reports/` are excluded.

---

### User Story 4 — Shell Scripts Are Injection-Safe and Report Correct Exit Codes (Priority: P2)

**Acceptance Scenarios**:
1. **Given** `scripts/load-env.sh` processes an `.env` with shell metacharacters in a value, **When** it runs, **Then** no embedded command is executed.
2. **Given** `scripts/run-cluster-tests.sh` runs and the test suite fails, **When** the script exits, **Then** its exit code is non-zero.
3. **Given** `scripts/qa-cluster-validation.sh` chectivity, **When** it runs, **Then** the `$CONNECTIVITY_STATUS` branch executes correctly.

---

### User Story 5 — CLI Contract is Stable and Scripts Match It (Priority: P2)

**Acceptance Scenarios**:
1. **Given** `scripts/test-cli-mode.sh`, **When** run, **Then** every CLI invocation uses only `rebuild`, `cleanup`, `compact` and supported flags.
2. **Given** collections are specified via CLI, **When** the flag is used, **Then** `--specified-collections` is the correct flag used.

---

### User Story 6 — Orphan Cleanup Requires Explicit Confirmation (Priority: P2)

**Acceptance Scenarios**:
1. **Given** orphan cleanup with no state file, **When** matching indexes are found, **Then** a dry-run and confirmation prompt runs before any drop.
2. **Given** the prompt is answered "no", **Then** zero indexes are dropped.

---

### User Story 7 — Compact Command is Safe by Default (Priority: P3)

**Acceptance Scenarios**:
1. **Given** `compact` with no flags, **When** config is resolved, **Then** `safeRun` defaults to `true`.
2. **Given** `--no-safe-run` is passed to `compact`, **When** config resolves, **Then** `safeRun` is `false`.

---

### User Story 8 — autoCompact State is Always Restored on Error (Priority: P3)

**Acceptance Scenarios**:
1. **Given** `autoCompact` was enabled, **When** an error is thrown during compact, **Then** `autoCompact` is disabled before the error propagates.

---

### Edge Cases

- What happens when state file is unreadable (permissions, corrupt JSON)?
- How does abort interact with a job that has already partially modified an index (in-flight)?
- What if MONGODB_URI is unset when a script that requires it runs?
- What if compact is interrupted before the `autoCompact: false` command completes?

---

## Requirements

### Functional Requirements

**Abort Flow**
- **FR-001**: Collection-processor MUST stop all index operations immediately when user answers "no" to any continuation prompt.
- **FR-002**: Abort path MUST produce a non-zero exit code and a user-readable "aborted" message.

**State File Scoping**
- **FR-003**: State filenames MUST incorporate the target database name as a disambiguating component.
- **FR-004**: A job MUST NOT read or modify a state file belonging to a different database.

**Credential Security**
- **FR-005**: No real MongoDB URIs, passwords, or connection strings MUST exist in any tracked repository file.
- **FR-006**: An `.env.example` MUST exist at the repository root with only placeholder values.
- **FR-007**: `scripts/load-env.sh` MUST NOT emit any URI content to stdout/stderr/logs.
- **FR-008**: `.gitignore` MUST exclude `.env`, `.env.*` (except `.env.example`), and `test-reports/`.

**Shell Script Safety**
- **FR-009**: `scripts/load-env.sh` MUST parse `.env` using a method that treats values as literal strings.
- **FR-010**: `scripts/test-with-env.sh` MUST export env vars without evaluating values as shell expressions.
- **FR-011**: `scripts/run-cluster-tests.sh` MUST initialize `CLI_EXIT` before use and capture every test exit code.
- **FR-012**: `scripts/qa-cluster-validation.sh` MUST correctly referCTIVITY_STATUS` (typo fix).

**CLI Contract Alignment**
- **FR-013**: `scripts/test-cli-mode.sh` MUST use only documented CLI commands: `rebuild`, `cleanup`, `compact`.
- **FR-014**: All references to `list`, `--collection`, and `--verbose` MUST be replaced with correct equivalents.
- **FR-015**: The correct flag for target collections MUST be `--specified-collections`.

**Orphan Cleanup Safety**
- **FR-016**: Orphan cleanup MUST perform only a dry-run and present a confirmation prompt when no state file is present.
- **FR-017**: Orphan cleanup MUST NOT drop any index without explicit operator confirmation.
- **FR-018**: When a state file is present, orphan cleanup MUST restrict drops to state-confirmed orphans.

**Compact Safety Defaults**
- **FR-019**: `compact` CLI command MUST default `safeRun` to `true`.
- **FR-020**: `--no-safe-run` flag MUST be available for `compact`.

**autoCompact Lifecycle**
- **FR-021**: All code enabling `autoCompact` MUST use `try/finally` to guarantee `autoCompact` is disabled on any exit path.

**Documentation Alignment**
- **FR-022**: All documentation MUST state minimum MongoDB version as `>=4.4`, replacing any `>=3.6` references.

**Metrics Consistency**
- **FR-023**: Compact operation MUST use `storageSize` exclusively for pre/post validation; no mixed `collStats.size` usage.

---

## Success Criteria

- **SC-001**: Abort path unit tests pass 100%: zero index ops after "no" answer.
- **SC-002**: Two concurrent/sequential jobs targeting different databases produce distinct state files.
- **SC-003**: Fresh clone scan by credential-detection tool reports zero real credential findings.
- **SC-004**: All scripts in `scripts/` exit with code that accurately reflects success or failure.
- **SC-005**: `scripts/test-cli-mode.sh` runs end-to-end without "unknown command" or "unknown flag" errors.
- **SC-006**: Orphan cleanup with no state file never drops without explicit confirmation.
- **SC-007**: `compact` with no flags resolves `safeRun: true`.
- **SC-008**: Simulated compact failure with `autoCompact` always results in `autoCompact` disabled before exit.
- **SC-009**: Zero references to MongoDB >=3.6 in docs after change.
- **SC-010**: Compact size validation uses `storageSize` exclusively.

---

## Assumptions

- `.env` and `.env.test` credentials will be rotated as part of this work.
- Safe run semantics for `compact` are same as `rebuild`.
- State file naming change may require a migration note (out of scope for this spec).
- `autoCompact` fix is purely TypeScript `try/finally`.

## Out of Scope

- New reindexing strategies or new MongoDB version support.
- UI, dashboard, or monitoring changes.
- Credential rotation infrastructure/secret-scanning pipeline setup.
- Performance optimisations not directly tied to identified issues.
