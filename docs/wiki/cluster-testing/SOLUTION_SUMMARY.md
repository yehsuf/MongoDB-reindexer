# Solution: QA Agent Cluster Testing

## Your Question
> How can I actually have qa agent run both options (cli/npm) on my actual test cluster?

## The Answer

You can now run **both CLI and NPM modes** against your test cluster using automated test scripts that the QA agent can execute.

---

## What You Got

### 1. Test Scripts
- **`./scripts/run-cluster-tests.sh`** - Master runner (both modes)
- **`./scripts/test-cli-mode.sh`** - CLI mode only

### 2. Documentation
- **`CLUSTER_TESTING_QUICKSTART.md`** - 5-minute setup
- **`docs/wiki/cluster-testing/CLUSTER_TESTING_GUIDE.md`** - Complete guide
- **`CLUSTER_TESTING_IMPLEMENTATION.md`** - Implementation details
- **`QA_CLUSTER_TESTING_REFERENCE.md`** - QA agent reference card
- **README.md updated** - Testing section with cluster testing info

### 3. Updated Agent Instructions
- **`.github/agents/qa-lead.agent.md`** - New "CLUSTER TESTING" section with procedures

---

## Quick Start (5 minutes)

### 1. Start Test MongoDB

```bash
docker run -d -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=testuser \
  -e MONGO_INITDB_ROOT_PASSWORD=testpass \
  mongo:latest
```

### 2. Initialize Test Data

```bash
mongosh mongodb://testuser:testpass@localhost:27017 << 'EOF'
use reindex_test
db.users.insertMany([{name: "Alice", email: "alice@example.com", age: 30}])
db.users.createIndex({email: 1})
EOF
```

### 3. Build and Run Tests

```bash
npm run build
chmod +x scripts/run-cluster-tests.sh scripts/test-cli-mode.sh

# Run both modes
./scripts/run-cluster-tests.sh "mongodb://testuser:testpass@localhost:27017" "reindex_test"
```

---

## How It Works

### Full Test Suite (Both Modes)

```bash
export MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017"
./scripts/run-cluster-tests.sh "$MONGODB_TEST_URI" "reindex_test"
```

**Executes:**
1. CLI mode direct tests (list, rebuild, verify)
2. NPM mode unit/integration tests
3. Saves results to `.agent_memory/test_results_{timestamp}.md`

### CLI Mode Only

```bash
./scripts/test-cli-mode.sh "$MONGODB_TEST_URI" "reindex_test"
```

**Tests:**
- List indexes before rebuild
- Rebuild users collection
- Verify rebuild succeeded
- Rebuild products collection
- List all indexes

### NPM Mode Only

```bash
MONGODB_TEST_URI="$MONGODB_TEST_URI" npm test
```

**Runs:**
- All unit tests
- All integration tests (with cluster URI)

---

## Integration with Your Workflow

### In DEV_FLOW.md (Step 8: Run Tests)

**For QA Agent:**

```markdown
### Step 8: QA_Lead - Run Tests

**For simple changes:**
\`\`\`bash
npm test
\`\`\`

**For MongoDB operation changes (use cluster tests):**
\`\`\`bash
export MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017"
./scripts/run-cluster-tests.sh "$MONGODB_TEST_URI" "reindex_test"
\`\`\`

**Log results to qa_log.md:**
- Which tests ran
- Pass/fail status
- Results file location
```

---

## Test Results

All results are saved to `.agent_memory/`:

```
.agent_memory/
├── test_results_20260203_143000.md  ← Full test output
├── test_results_20260203_150030.md  ← Another run
└── qa_log.md                         ← Ticket summary
```

### Example Results File

```markdown
# Cluster Test Results
**Timestamp**: 20260203_143000
**URI**: mongodb://testuser:testpass@localhost:27017
**Database**: reindex_test

## CLI Mode Tests
✓ Initial list succeeded
✓ Users rebuild succeeded
✓ Products rebuild succeeded

**Status**: ✅ PASS

## NPM Mode Tests
✓ index.test.ts (5 tests)
✓ mongodb-utils.test.ts (8 tests)
✓ cli.test.ts (12 tests)

**Status**: ✅ PASS

## Summary
- CLI Mode: ✅ PASS
- NPM Mode: ✅ PASS
- Overall: ✅ SUCCESS
```

---

## Files Created

```
Project Root
├── CLUSTER_TESTING_QUICKSTART.md        ← 5-min setup
├── CLUSTER_TESTING_IMPLEMENTATION.md    ← Implementation details
├── QA_CLUSTER_TESTING_REFERENCE.md      ← QA reference card
├── scripts/
│   ├── run-cluster-tests.sh             ← Master test runner
│   └── test-cli-mode.sh                 ← CLI mode tests
├── docs/
│   └── CLUSTER_TESTING_GUIDE.md         ← Complete guide
└── .github/
    └── agents/
        └── qa-lead.agent.md             ← Updated with cluster testing
```

---

## Key Features

✅ **Both modes tested** - CLI and NPM simultaneously
✅ **Real cluster** - Tests against actual MongoDB instance
✅ **Automated** - Single command runs full suite
✅ **Results saved** - Timestamped files in .agent_memory/
✅ **QA agent ready** - Procedures built into agent instructions
✅ **DEV_FLOW compatible** - Integrates with existing workflow
✅ **Documented** - Multiple guides for different skill levels

---

## Next Steps

1. **Follow CLUSTER_TESTING_QUICKSTART.md** (5 minutes)
2. **Run test suite** to verify setup works
3. **Read QA_CLUSTER_TESTING_REFERENCE.md** for quick reference
4. **Integrate into DEV_FLOW.md** Step 8
5. **Have Manager delegate** cluster tests to QA agent in workflows

---

## Need Help?

- **Quick start**: `CLUSTER_TESTING_QUICKSTART.md`
- **Full details**: `docs/wiki/cluster-testing/CLUSTER_TESTING_GUIDE.md`
- **QA agent**: `QA_CLUSTER_TESTING_REFERENCE.md`
- **Implementation**: `CLUSTER_TESTING_IMPLEMENTATION.md`
- **Agent instructions**: `.github/agents/qa-lead.agent.md` (CLUSTER TESTING section)

---

**You're all set!** The QA agent can now run both CLI and NPM tests against your test cluster. 🎉
