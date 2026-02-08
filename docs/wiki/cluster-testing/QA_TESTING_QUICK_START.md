# 🧪 QA Cluster Testing - Quick Start

Your QA cluster testing workflow is now ready to use!

## What Was Created

✅ **qa-cluster-validation.sh** - Pre-approval validation  
✅ **qa-cluster-test.sh** - Test execution  
✅ **[QA_CLUSTER_TESTING_MANUAL.md](./QA_CLUSTER_TESTING_MANUAL.md)** - Full documentation  

## How to Use

### 1️⃣ Pre-Approval (QA Reviews Before Running Tests)

```bash
./qa-cluster-validation.sh \
  "mongodb+srv://user:pass@cluster.mongodb.net" \
  "reindex_test"
```

**What this does:**
- ✓ Verifies build
- ✓ Shows CLI help output (for dry-run verification)
- ✓ Tests cluster connectivity
- ✓ Generates validation report with checklist

**Output**: `.agent_memory/qa_validation_YYYYMMDD_HHMMSS.md`

---

### 2️⃣ Run Tests (After Approval)

```bash
./qa-cluster-test.sh \
  "mongodb+srv://user:pass@cluster.mongodb.net" \
  "reindex_test"
```

**What this does:**
- ✓ Runs CLI mode tests (help, connectivity)
- ✓ Runs NPM package test suite
- ✓ Generates detailed test report with status table
- ✓ Shows pass/fail/warning status

**Output**: `.agent_memory/qa_test_results_YYYYMMDD_HHMMSS.md`

---

## Example with Your Atlas Cluster

```bash
# Pre-approval validation
./qa-cluster-validation.sh \
  "mongodb+srv://<username>:<password>@<cluster-host>/<database>" \
  "firewall"

# Review the report
cat .agent_memory/qa_validation_*.md

# If approved, run tests
./qa-cluster-test.sh \
  "mongodb+srv://<username>:<password>@<cluster-host>/<database>" \
  "firewall"

# Review results
cat .agent_memory/qa_test_results_*.md
```

---

## Using with .env.test

Instead of hardcoding credentials, use `.env.test`:

```bash
# Set in .env.test
MONGODB_TEST_URI="mongodb+srv://user:pass@cluster.mongodb.net"
MONGODB_TEST_DATABASE="reindex_test"

# Then load and run
source .env.test
./qa-cluster-validation.sh "$MONGODB_TEST_URI" "$MONGODB_TEST_DATABASE"
./qa-cluster-test.sh "$MONGODB_TEST_URI" "$MONGODB_TEST_DATABASE"
```

Or use the wrapper script:

```bash
./test-with-env.sh
```

---

## What Each Script Does

### qa-cluster-validation.sh (Pre-Approval)

```
Step 1/6: Build verification
Step 2/6: Extract CLI help for rebuild command
Step 3/6: Extract CLI help for cleanup command  
Step 4/6: Test MongoDB connectivity
Step 5/6: Generate validation checklist
Step 6/6: Create pre-approval report
```

**Outputs**: Validation report with checklist items to review before approval

---

### qa-cluster-test.sh (Execution)

```
Step 1/4: Verify/build project
Step 2/4: Run CLI mode tests (help, connection tests)
Step 3/4: Run NPM package test suite
Step 4/4: Generate test results with status table
```

**Outputs**: Test results report with:
- Build status
- CLI test results
- NPM test results  
- Recommendations for next steps

---

## Test Reports Location

All reports are saved to `.agent_memory/`:

```
.agent_memory/
├── qa_validation_20260203_143022.md      # Pre-approval report
├── qa_test_results_20260203_143500.md    # Test results
└── qa_log.md                             # Execution log
```

---

## What Gets Tested

### CLI Mode Tests
- ✓ Rebuild command help output
- ✓ Cleanup command help output  
- ✓ Connection verification (read-only)

### NPM Package Tests
- ✓ All tests in `test/` directory
- ✓ Unit tests against live cluster
- ✓ API surface verification

---

## Key Flags

### Safe-Run (Interactive - Default)
```bash
./dist/cli.js rebuild -u "$URI" -d "$DB" --safe-run
```
**Use when**: You want confirmations before each step

### No-Safe-Run (Non-Interactive)
```bash
./dist/cli.js rebuild -u "$URI" -d "$DB" --no-safe-run
```
**Use when**: Automating tests (already in script)

---

## For Debugging

View just the failures:
```bash
grep -E "(Error|FAIL|✗)" .agent_memory/qa_test_results_*.md
```

View full output:
```bash
cat .agent_memory/qa_test_results_*.md | less
```

---

## Next: Delegate to QA Agent

When ready, have the QA agent run:

```bash
# QA Agent validates first
./qa-cluster-validation.sh "$MONGODB_TEST_URI" "$MONGODB_TEST_DATABASE"

# After approval, QA Agent executes
./qa-cluster-test.sh "$MONGODB_TEST_URI" "$MONGODB_TEST_DATABASE"
```

---

**See Also**: `[QA_CLUSTER_TESTING_MANUAL.md](./QA_CLUSTER_TESTING_MANUAL.md)` for comprehensive guide
