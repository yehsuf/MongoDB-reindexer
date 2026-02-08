# QA Agent: Cluster Testing Reference Card

Quick reference for QA agent when running cluster tests in workflows.

---

## When to Use Cluster Tests

✅ Use cluster tests for:
- Index rebuilding operations
- Collection handling changes
- Database operation modifications
- Integration between CLI and NPM modes
- Real MongoDB server behavior validation

❌ Skip cluster tests for:
- Simple logic changes
- UI/formatting updates
- Documentation modifications
- Non-database operations

---

## Quick Commands

### Full Test Suite (Recommended)

```bash
export MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017"
./scripts/run-cluster-tests.sh "$MONGODB_TEST_URI" "reindex_test"
```

**What it does:**
1. Verifies build exists
2. Runs CLI mode tests
3. Runs NPM mode tests
4. Saves results to `.agent_memory/test_results_{timestamp}.md`
5. Returns combined exit code

**Output:**
- Test results file created
- Summary shown in console
- All commands logged to history.log

---

### CLI Mode Only

```bash
./scripts/test-cli-mode.sh "$MONGODB_TEST_URI" "reindex_test"
```

**Tests executed:**
- List indexes (before)
- Rebuild users collection
- Verify rebuild
- Rebuild products collection
- List all indexes (final)

---

### NPM Mode Only

```bash
MONGODB_TEST_URI="$MONGODB_TEST_URI" npm test
```

**Tests executed:**
- All unit tests in `test/**/*.test.ts`
- Skips cluster tests unless `MONGODB_TEST_URI` set

---

## Logging Results

### In qa_log.md (Ticket)

```markdown
### Cluster Test Execution: 2026-02-03 14:30:00

**Command**: 
\`\`\`bash
./scripts/run-cluster-tests.sh "mongodb://testuser:testpass@localhost:27017" "reindex_test"
\`\`\`

**Results File**: 
`.agent_memory/test_results_20260203_143000.md`

**Summary**:
- CLI Mode: ✅ PASS
- NPM Mode: ✅ PASS
- Overall: ✅ SUCCESS

**Details**:
- [Include key findings from results file]
- [Any issues or notable observations]

**Code Inspection**:
- [Verification that implementation matches plan]
- [Edge cases checked]
- [Any concerns noted]
```

### To history.log (Append)

```
[2026-02-03T14:30:00Z] [dev-42] [QA_Lead] [SUCCESS] ./scripts/run-cluster-tests.sh "mongodb://testuser:testpass@localhost:27017" "reindex_test"
```

---

## DEV_FLOW.md Integration

### Step 7: Create Tests
```bash
# Write unit tests normally
# (QA agent creates test files in test/ directory)
```

### Step 8: Run Tests
```bash
# For simple changes
npm test

# For MongoDB operation changes
export MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017"
./scripts/run-cluster-tests.sh "$MONGODB_TEST_URI" "reindex_test"
```

### Report to qa_log.md
```markdown
### Test Results

**Unit Tests**: ✅ PASS (N tests passed)

**Cluster Tests** (if run):
- CLI Mode: ✅ PASS
- NPM Mode: ✅ PASS

**Code Inspection**: 
[Findings from reviewing src/ implementation]
```

---

## Troubleshooting

### "ction refused"
```bash
# Verify MongoDB is running
mongosh "$MONGODB_TEST_URI" --eval "db.adminCommand('ping')"

# If fails, start Docker or MongoDB
docker run -d -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=testuser \
  -e MONGO_INITDB_ROOT_PASSWORD=testpass \
  mongo:latest
```

### "dist/cli.js not found"
```bash
# Build project
npm run build
```

### "Permission denied"
```bash
# Make scripts executable
chmod +x run-cluster-tests.sh test-cli-mode.sh
```

### Test timeout
```bash
# Increase timeout for large datasets
MONGODB_TEST_URI="$MONGODB_TEST_URI" npm test -- --timeout 60000
```

---

## File Locations

**Test Scripts:**
- `./scripts/run-cluster-tests.sh` - Master runner
- `./scripts/test-cli-mode.sh` - CLI mode only

**Results:**
- `.agent_memory/test_results_*.md` - Timestamped results
- `.agent_memory/qa_log.md` - Ticket summary

**Configuration:**
- `MONGODB_TEST_URI` env var - Cluster connection string
- `.env.test` - Optional config file (if created)

**Documentation:**
- `CLUSTER_TESTING_QUICKSTART.md` - 5-min setup
- `docs/wiki/cluster-testing/CLUSTER_TESTING_GUIDE.md` - Full guide
- `CLUSTER_TESTING_IMPLEMENTATION.md` - Details

---

## Verification Checklist

After running cluster tests:

- [ ] Both modes ran successfully
- [ ] Exit code was 0 (both modes)
- [ ] Results file created in `.agent_memory/`
- [ ] Commands logged to history.log
- [ ] Summary added to qa_log.md
- [ ] Code inspection findings documented
- [ ] No data loss reported
- [ ] All indexes verified

---

## Common Scenarios

### Scenario 1: New index rebuilding logic
```bash
# Create unit tests first
# Then run cluster tests to verify against real MongoDB

export MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017"
./scripts/run-cluster-tests.sh "$MONGODB_TEST_URI" "reindex_test"
```

### Scenario 2: CLI parameter changes
```bash
# CLI mode only
./scripts/test-cli-mode.sh "$MONGODB_TEST_URI" "reindex_test"

# Then verify NPM mode still works
npm test
```

### Scenario 3: Integration between CLI and NPM
```bash
# Full suite (both modes together)
./scripts/run-cluster-tests.sh "$MONGODB_TEST_URI" "reindex_test"
```

---

## Questions?

- Setup: See `CLUSTER_TESTING_QUICKSTART.md`
- Details: See `[CLUSTER_TESTING_GUIDE.md](./CLUSTER_TESTING_GUIDE.md)`
- Implementation: See `CLUSTER_TESTING_IMPLEMENTATION.md`
- Agent instructions: See `.github/agents/qa-lead.agent.md`

---

**Remember**: Always log results to `.agent_memory/` and document findings in `qa_log.md`
