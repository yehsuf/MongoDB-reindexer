# QA Cluster Testing Manual

Complete guide for using the QA cluster testing scripts to validate MongoDB Reindexer functionality against live MongoDB clusters.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Pre-Approval Workflow](#pre-approval-workflow)
4. [Cluster Test Execution](#cluster-test-execution)
5. [Understanding Test Results](#understanding-test-results)
6. [Command Reference](#command-reference)
7. [Troubleshooting](#troubleshooting)

---

## Overview

The QA cluster testing suite consists of two complementary scripts:

### qa-cluster-validation.sh
**Purpose**: Pre-test validation and approval gate

- Verifies project build
- Shows CLI command help (rebuild & cleanup)
- Tests cluster connectivity
- Generates pre-approval checklist
- Documents sample test commands

**Output**: Timestamped validation report in `.agent_memory/qa_validation_*.md`

### qa-cluster-test.sh
**Purpose**: Execute comprehensive cluster tests

- Verifies build artifacts
- Runs CLI mode tests
- Executes NPM test suite
- Generates detailed results report
- Provides execution summary

**Output**: Timestamped test results in `.agent_memory/qa_test_results_*.md`

---

## Quick Start

### Prerequisites
- MongoDB test cluster running and accessible
- MongoDB connection URI (with credentials)
- Test database initialized with sample data
- Project built: `npm run build`
- mongosh installed (for connectivity checks)

### Basic Usage

```bash
# Set MongoDB credentials
export MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017"

# Step 1: Run pre-approval validation
./qa-cluster-validation.sh "$MONGODB_TEST_URI" "reindex_test"

# Step 2: Review validation report
cat .agent_memory/qa_validation_*.md

# Step 3: Run cluster tests
./qa-cluster-test.sh "$MONGODB_TEST_URI" "reindex_test"

# Step 4: Review test results
cat .agent_memory/qa_test_results_*.md
```

---

## Pre-Approval Workflow

### Purpose
Validates cluster setup before running destructive tests. Ensures safety and readiness.

### Workflow Steps

#### 1. Run Validation Script

```bash
./qa-cluster-validation.sh "mongodb://user:pass@localhost:27017" "reindex_test"
```

**What it checks:**
- Project build status
- CLI command availability
- MongoDB cluster connectivity
- Test infrastructure files
- Environment configuration

#### 2. Review Validation Report

```bash
cat .agent_memory/qa_validation_*.md
```

**Report includes:**
- Build verification result
- Rebuild command help
- Cleanup command help
- Cluster connectivity status
- Sample test commands
- Pre-approval checklist

#### 3. Complete Pre-Test Checklist

Validate the following before proceeding:

**System Checks:**
- [ ] Build compiled successfully
- [ ] CLI commands show proper help
- [ ] MongoDB cluster is reachable

**Pre-Test Requirements:**
- [ ] Cluster is configured and running
- [ ] Test database name is correct
- [ ] URI is properly formatted
- [ ] Backup exists (if required)
- [ ] No production data in test database
- [ ] Test data has been seeded
- [ ] Sufficient disk space available

**Network & Security:**
- [ ] Network connectivity verified
- [ ] Database credentials valid
- [ ] Firewall rules allow connection
- [ ] SSL/TLS certificates valid (if required)

#### 4. Approve Workflow

Once all checklist items are complete, you're ready for cluster testing.

---

## Cluster Test Execution

### Purpose
Execute both CLI and NPM tests against the live MongoDB cluster.

### Running Tests

```bash
./qa-cluster-test.sh "mongodb://user:pass@localhost:27017" "reindex_test"
```

**Parameters:**
- **First argument** (required): MongoDction URI
- **Second argument** (required): Database name to test

### What Gets Tested

#### CLI Mode Tests (Test 2)
1. **Rebuild Command Help** - Verifies CLI is functional
2. **Cleanup Command Help** - Verifies cleanup command works
3. **Connection Test** - Validates connection to MongoDB

#### NPM Package Tests (Test 3)
1. **Full Test Suite** - Runs all unit tests
2. **Environment Configuration** - Uses MONGODB_TEST_URI and MONGODB_TEST_DATABASE
3. **Integration Tests** - Validates package functionality

### Test Execution Example

```bash
# Standard usage with typical MongoDB setup
./qa-cluster-test.sh "mongodb://testuser:testpass@localhost:27017" "reindex_test"

# With environment variable preset
export MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017"
./qa-cluster-test.sh "$MONGODB_TEST_URI" "reindex_test"

# With custom database name
./qa-cluster-test.sh "mongodb://user:pass@mongodb.example.com:27017" "qa_tests_db"
```

### Expected Output

```
╔════════════════════════════════════════════════════════════╗
║           QA Cluster Testing - Execution Phase             ║
╚════════════════════════════════════════════════════════════╝

ℹ Step 1/4: Verifying build...
✓ Build exists

ℹ Step 2/4: Running CLI mode tests...
✓ Rebuild help captured
✓ Cleanup help captured
✓ Connection test passed
✓ CLI mode tests completed

ℹ Step 3/4: Running NPM package tests...
✓ NPM tests passed

ℹ Step 4/4: Generating test summary...

╔════════════════════════════════════════════════════════════╗
║              QA Testing Complete                           ║
╚════════════════════════════════════════════════════════════╝

✓ Test results saved to: .agent_memory/qa_test_results_20260203_140000.md

📊 Test Execution Summary:
─────────────────────────────────────────────────────────────
Build Status:           ✓ PASS
CLI Mode Tests:         ✓ PASS
NPM Package Tests:      ✓ PASS
Overall Status:         ✅ SUCCESS
```

---

## Understanding Test Results

### Result File Location

Results are saved to: `.agent_memory/qa_test_results_YYYYMMDD_HHMMSS.md`

### Result File Structure

```markdown
# QA Cluster Test Results
**Execution Time**: 20260203_140000
**URI**: mongodb://testuser:testpass@localhost:27017
**Database**: reindex_test

---

## Test Execution Summary

### Step 1: Build Verification
Status: ✓ BUILD PRESENT

## Step 2: CLI Mode Tests

### Test 2a: Rebuild Command Help
[Help output...]

### Test 2b: Cleanup Command Help
[Help output...]

### Test 2c: Connection Test (Read-Only)
Status: ✓ PASS

## Step 3: NPM Package Tests

### Test 3a: Full Test Suite
[Test output...]
Status: ✓ PASS

---

## Test Execution Summary

| Component | Status |
|-----------|--------|
| Build | ✓ PASS |
| CLI Help | ✓ PASS |
| NPM Tests | ✓ PASS |
```

### Interpreting Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| ✓ PASS | Test passed successfully | None - continue to next step |
| ✗ FAIL | Test failed | Review output and troubleshoot |
| ⚠ REVIEW | Test ran with warnings | Check output for details |
| ⓘ SKIPPED | Test skipped (expected) | None - expected behavior |

### Common Result Scenarios

#### All Tests Pass ✅

```
Overall Status: ✅ SUCCESS
```

**Indicates:**
- Build is valid
- CLI commands functional
- NPM tests pass
- Ready for production

**Next Steps:**
1. Review test output for any warnings
2. Verify all test assertions passed
3. Proceed with confidence to deployment

#### CLI Tests Pass, NPM Tests Warn ⚠

```
CLI Mode Tests: ✓ PASS
NPM Package Tests: ⚠ REVIEW
```

**Indicates:**
- Build and CLI are functional
- Some npm tests may have issues

**Next Steps:**
1. Review npm test output in detail
2. Check MONGODB_TEST_URI configuration
3. Verify test data is properly seeded
4. Run individual tests for debugging

#### Build or CLI Tests Fail ✗

```
Build Status: ✗ FAIL
```

**Indicates:**
- Build process has errors
- CLI cannot be executed

**Next Steps:**
1. Run `npm run build` manually
2. Review build error messages
3. Fix compilation issues
4. Re-run validation script

---

## Command Reference

### CLI Rebuild Command

```bash
./dist/cli.js rebuild [options]
```

**Key Options:**
- `-u, --uri <uri>` - MongoDB connection URI (required)
- `-d, --database <name>` - Database to rebuild (required)
- `--collection <name>` - Specific collection (optional)
- `--no-safe-run` - Skip interactive prompts
- `--verbose` - Enable verbose logging
- `--help` - Show help

**Examples:**

```bash
# Interactive mode (prompts for confirmation)
./dist/cli.js rebuild -u "mongodb://user:pass@localhost:27017" -d "mydb"

# Non-interactive mode (automatic)
./dist/cli.js rebuild -u "mongodb://user:pass@localhost:27017" -d "mydb" --no-safe-run

# Specific collection only
./dist/cli.js rebuild -u "mongodb://user:pass@localhost:27017" -d "mydb" --collection users --no-safe-run

# With verbose logging
./dist/cli.js rebuild -u "mongodb://user:pass@localhost:27017" -d "mydb" --no-safe-run --verbose
```

### CLI Cleanup Command

```bash
./dist/cli.js cleanup [options]
```

**Key Options:**
- `-u, --uri <uri>` - MongoDB connection URI (required)
- `-d, --database <name>` - Database to cleanup (required)
- `--cover-suffix <suffix>` - Suffix for covering indexes
- `--help` - Show help

**Examples:**

```bash
# Cleanup orphaned indexes
./dist/cli.js cleanup -u "mongodb://user:pass@localhost:27017" -d "mydb"

# Cleanup with custom suffix
./dist/cli.js cleanup -u "mongodb://user:pass@localhost:27017" -d "mydb" --cover-suffix "_temp"
```

### NPM Test Command

```bash
MONGODB_TEST_URI="<uri>" MONGODB_TEST_DATABASE="<db>" npm test
```

**Environment Variables:**
- `MONGODB_TEST_URI` - Test cluster connection URI
- `MONGODB_TEST_DATABASE` - Test database name

**Examples:**

```bash
# Basic test run
npm test

# With MongoDB cluster URI
MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017" npm test

# With both variables set
MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017" \
MONGODB_TEST_DATABASE="reindex_test" \
npm test

# Specific test file
MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017" \
npm test -- test/cluster.test.ts
```

---

## Troubleshooting

### MongoDB Connection Issues

**Symptom**: "Could not reach cluster" or "Connection refused"

**Solutions:**
1. Verify MongoDB is running
   ```bash
   mongosh "mongodb://user:pass@localhost:27017" --eval "db.adminCommand('ping')"
   ```

2. Check connection URI format
   - Correct: `mongodb://user:pass@host:port/`
   - Wrong: `mongodb://host:port` (missing credentials)

3. Verify credentials
   ```bash
   mongosh "mongodb://user:pass@host:port" --authenticationDatabase admin
   ```

4. Check firewall/network
   ```bash
   # Test port connectivity
   nc -zv localhost 27017
   ```

### Build Failures

**Symptom**: "dist/cli.js not found" or build error

**Solutions:**
1. Clean and rebuild
   ```bash
   npm run clean
   npm run build
   ```

2. Check TypeScript errors
   ```bash
   npm run typecheck
   ```

3. Verify Node.js version (18.0.0+)
   ```bash
   node --version
   ```

4. Clear dependencies and reinstall
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npm run build
   ```

### Test Failures

**Symptom**: NPM tests fail or show errors

**Solutions:**
1. Run tests with verbose output
   ```bash
   npm test -- --verbose
   ```

2. Ensure test database is initialized
   ```bash
   mongosh "mongodb://user:pass@localhost:27017/reindex_test" << 'EOF'
   db.users.insertOne({ name: "Test User" })
   db.products.insertOne({ name: "Test Product" })
   EOF
   ```

3. Check MONGODB_TEST_URI is set correctly
   ```bash
   echo $MONGODB_TEST_URI
   ```

4. Run individual tests
   ```bash
   npm test -- test/cli.test.ts
   npm test -- test/mongodb-utils.test.ts
   ```

### Validation Script Issues

**Symptom**: "mongosh not found" warning

**Solutions:**
1. Install mongosh
   ```bash
   # macOS
   brew install mongosh
   
   # Linux
   sudo apt-get install mongosh
   
   # Or Docker
   docker run -it --rm mongodb/mongodb-community-server mongosh
   ```

2. Or use mongo client instead
   ```bash
   mongo "mongodb://user:pass@localhost:27017" --eval "db.adminCommand('ping')"
   ```

### Permission Issues

**Symptom**: "Permission denied" when running scripts

**Solutions:**
1. Make scripts executable
   ```bash
   chmod +x qa-cluster-validation.sh
   chmod +x qa-cluster-test.sh
   chmod +x test-cli-mode.sh
   chmod +x run-cluster-tests.sh
   ```

2. Verify file permissions
   ```bash
   ls -la qa-cluster-*.sh
   ```

### Cleanup Required

**After each test run:**
1. Check `.agent_memory/` for test reports
2. Review results in `.agent_memory/qa_test_results_*.md`
3. Clean up old test data if needed
   ```bash
   # Delete old test database (if safe to do)
   mongosh "mongodb://user:pass@localhost:27017" << 'EOF'
   db.dropDatabase()
   EOF
   ```

---

## Best Practices

### Pre-Test
- [ ] Always run validation script first
- [ ] Review validation report completely
- [ ] Verify all checklist items before testing
- [ ] Ensure test database is isolated from production
- [ ] Create backup of test data (if required)

### During Testing
- [ ] Monitor test execution for unexpected behavior
- [ ] Keep terminal output visible for error checking
- [ ] Don't interrupt tests mid-execution
- [ ] Document any warnings or unusual behavior

### Post-Test
- [ ] Review complete test report
- [ ] Check for any failed assertions
- [ ] Verify test database state is correct
- [ ] Archive test results if needed
- [ ] Run cleanup command if indexes were modified

### Debugging
- [ ] Use `--verbose` flag for detailed output
- [ ] Enable DEBUG environment variable
   ```bash
   DEBUG=true ./dist/cli.js rebuild --help
   ```
- [ ] Run specific tests individually
- [ ] Check MongoDB logs for any errors
- [ ] Use MongoDB CLI tools for manual verification

---

## Advanced Usage

### Custom Database Names

```bash
# Test with different database
./qa-cluster-validation.sh "mongodb://user:pass@localhost:27017" "custom_db"
./qa-cluster-test.sh "mongodb://user:pass@localhost:27017" "custom_db"
```

### Remote Clusters

```bash
# Test against remote MongoDB Atlas
./qa-cluster-validation.sh "mongodb+srv://user:pass@cluster.mongodb.net/test" "remote_test_db"
./qa-cluster-test.sh "mongodb+srv://user:pass@cluster.mongodb.net/test" "remote_test_db"
```

### CI/CD Integration

```bash
#!/bin/bash
# In CI/CD pipeline
set -e

export MONGODB_TEST_URI="$CI_MONGODB_URI"
export MONGODB_TEST_DATABASE="ci_test_db"

# Run validation (non-interactive)
./qa-cluster-validation.sh "$MONGODB_TEST_URI" "$MONGODB_TEST_DATABASE" || exit 1

# Run tests
./qa-cluster-test.sh "$MONGODB_TEST_URI" "$MONGODB_TEST_DATABASE" || exit 1

# Archive results
mkdir -p test-reports
cp .agent_memory/qa_test_results_*.md test-reports/
```

### Parallel Testing

```bash
# Run multiple test instances (with different databases)
./qa-cluster-test.sh "mongodb://user:pass@localhost:27017" "test_db_1" &
./qa-cluster-test.sh "mongodb://user:pass@localhost:27017" "test_db_2" &
./qa-cluster-test.sh "mongodb://user:pass@localhost:27017" "test_db_3" &

wait
echo "All tests completed"
```

---

## Support & Documentation

For more information:
- **Project README**: See `[README.md](../../README.md)`
- **CLI Usage**: Run `./dist/cli.js --help`
- **Test Coverage**: See `test/` directory
- **Cluster Testing Guide**: See `[CLUSTER_TESTING_GUIDE.md](./CLUSTER_TESTING_GUIDE.md)`

---

**Last Updated**: February 3, 2026  
**Version**: 1.0.0  
**Maintained By**: QA Lead Agent
