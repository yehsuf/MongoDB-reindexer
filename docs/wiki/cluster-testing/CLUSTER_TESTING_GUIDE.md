# Cluster Testing Guide

This guide explains how to run MongoDB Reindexer tests against a real test cluster using both CLI and npm modes.

---

## Table of Contents

1. [Test Cluster Setup](#test-cluster-setup)
2. [Environment Configuration](#environment-configuration)
3. [Running CLI Mode Tests](#running-cli-mode-tests)
4. [Running NPM Mode Tests](#running-npm-mode-tests)
5. [Automated Test Execution](#automated-test-execution)
6. [Test Results](#test-results)

---

## Test Cluster Setup

### Prerequisites

- Docker or local MongoDB instance
- Node.js 18.0.0+
- Project built (`npm run build`)

### Quick Cluster Setup

```bash
# Create isolated test cluster in Docker
docker run -d \
  --name mongodb-test-cluster \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=testuser \
  -e MONGO_INITDB_ROOT_PASSWORD=testpass \
  mongo:latest

# Verify connection
mongosh mongodb://testuser:testpass@localhost:27017 --eval "db.adminCommand('ping')"
```

### Initialize Test Database

```bash
# Create test database with sample collections
mongosh mongodb://testuser:testpass@localhost:27017 << 'EOF'
use reindex_test

// Create sample collections
db.users.insertMany([
  { name: "Alice", email: "alice@example.com", age: 30 },
  { name: "Bob", email: "bob@example.com", age: 25 },
  { name: "Charlie", email: "charlie@example.com", age: 35 }
])

db.products.insertMany([
  { sku: "SKU001", price: 99.99, inventory: 100 },
  { sku: "SKU002", price: 149.99, inventory: 50 },
  { sku: "SKU003", price: 199.99, inventory: 25 }
])

// Create indexes
db.users.createIndex({ email: 1 }, { name: "email_idx" })
db.users.createIndex({ age: 1 }, { name: "age_idx" })
db.users.createIndex({ email: 1, age: 1 }, { name: "email_age_idx" })

db.products.createIndex({ sku: 1 }, { name: "sku_idx", unique: true })
db.products.createIndex({ price: 1 }, { name: "price_idx" })

print("✓ Test database initialized")
EOF
```

---

## Environment Configuration

### Set Connection URI

```bash
# For local test cluster
export MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017"

# For remote test cluster
export MONGODB_TEST_URI="mongodb+srv://testuser:testpass@cluster0.mongodb.net"
```

### Create .env.test (Optional)

```bash
cat > .env.test << 'EOF'
MONGODB_TEST_URI=mongodb://testuser:testpass@localhost:27017
MONGODB_TEST_DATABASE=reindex_test
TEST_TIMEOUT=30000
SAFE_RUN=false
ENABLE_LOGGING=true
EOF
```

---

## Running CLI Mode Tests

### Direct CLI Execution

```bash
# Rebuild specific collection using CLI
./dist/cli.js rebuild \
  --uri "mongodb://testuser:testpass@localhost:27017" \
  --database reindex_test \
  --collection users \
  --no-safe-run \
  --verbose

# List indexes before rebuild
./dist/cli.js list \
  --uri "mongodb://testuser:testpass@localhost:27017" \
  --database reindex_test \
  --collection users

# Verify indexes after rebuild
./dist/cli.js list \
  --uri "mongodb://testuser:testpass@localhost:27017" \
  --database reindex_test \
  --collection users
```

### Scripted CLI Test Sequence

```bash
#!/bin/bash
# test-cli-mode.sh

URI="mongodb://testuser:testpass@localhost:27017"
DB="reindex_test"

echo "🔄 Starting CLI Mode Test Sequence..."

# Step 1: List indexes before
echo "📋 Initial indexes:"
./dist/cli.js list --uri "$URI" --database "$DB" --collection users

# Step 2: Rebuild users collection
echo "⚡ Rebuilding users collection..."
./dist/cli.js rebuild \
  --uri "$URI" \
  --database "$DB" \
  --collection users \
  --no-safe-run \
  --verbose

# Step 3: Verify rebuild
echo "✓ Verifying rebuild:"
./dist/cli.js list --uri "$URI" --database "$DB" --collection users

# Step 4: Rebuild products collection
echo "⚡ Rebuilding products collection..."
./dist/cli.js rebuild \
  --uri "$URI" \
  --database "$DB" \
  --collection products \
  --no-safe-run

# Step 5: Verify all collections
echo "✓ Final verification:"
./dist/cli.js list --uri "$URI" --database "$DB"

echo "✅ CLI Mode Test Complete"
```

---

## Running NPM Mode Tests

### Unit Tests Against Cluster

```bash
# Run all tests with cluster URI
MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017" npm test

# Run specific test file
MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017" npm test -- test/integration.test.ts

# Run with grep filter
MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017" npm test -- --grep "rebuild"
```

### Integration Test Pattern

Create `test/cluster.test.ts`:

```typescript
import { test } from 'node:test';
import * as assert from 'node:assert';
import { spawn } from 'node:child_process';

const MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017';
const DB_NAME = 'reindex_test';

test('CLI Mode: Rebuild users collection', async () => {
  const result = await runCLI([
    'rebuild',
    '--uri', MONGODB_URI,
    '--database', DB_NAME,
    '--collection', 'users',
    '--no-safe-run'
  ]);

  assert.strictEqual(result.exitCode, 0, `CLI failed: ${result.stderr}`);
  assert.match(result.stdout, /Rebuild completed/, 'Expected completion message');
});

test('NPM Mode: List indexes', async () => {
  const result = await runCLI([
    'list',
    '--uri', MONGODB_URI,
    '--database', DB_NAME
  ]);

  assert.strictEqual(result.exitCode, 0, `List failed: ${result.stderr}`);
  assert.match(result.stdout, /email_idx/, 'Expected email_idx in output');
});

function runCLI(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', ['dist/cli.js', ...args], {
      env: { ...process.env, MONGODB_URI }
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode || 0,
        stdout,
        stderr
      });
    });
  });
}
```

---

## Automated Test Execution

### QA Agent Test Script

The QA agent can execute both modes using a combined test runner:

```bash
# test-both-modes.sh
#!/bin/bash

URI="${MONGODB_TEST_URI:-mongodb://testuser:testpass@localhost:27017}"
DB="reindex_test"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_FILE=".agent_memory/test_results_${TIMESTAMP}.md"

echo "# Cluster Test Results: $TIMESTAMP" > "$RESULTS_FILE"

# CLI Mode Tests
echo "## CLI Mode Tests" >> "$RESULTS_FILE"
./scripts/test-cli-mode.sh >> "$RESULTS_FILE" 2>&1
CLI_EXIT=$?
echo "- **Exit Code**: $CLI_EXIT" >> "$RESULTS_FILE"

# NPM Mode Tests
echo "" >> "$RESULTS_FILE"
echo "## NPM Mode Tests" >> "$RESULTS_FILE"
MONGODB_TEST_URI="$URI" npm test >> "$RESULTS_FILE" 2>&1
NPM_EXIT=$?
echo "- **Exit Code**: $NPM_EXIT" >> "$RESULTS_FILE"

# Summary
echo "" >> "$RESULTS_FILE"
echo "## Summary" >> "$RESULTS_FILE"
echo "- CLI Mode: $([ $CLI_EXIT -eq 0 ] && echo '✅ PASS' || echo '❌ FAIL')" >> "$RESULTS_FILE"
echo "- NPM Mode: $([ $NPM_EXIT -eq 0 ] && echo '✅ PASS' || echo '❌ FAIL')" >> "$RESULTS_FILE"

cat "$RESULTS_FILE"
```

---

## Test Results

### Result Format

Test results are logged to:
- `.agent_memory/test_results_{timestamp}.md` - Full output
- `.agent_memory/qa_log.md` - QA agent summary (in ticket)

### Example Results

```markdown
# Cluster Test Results: 20260203_143000

## CLI Mode Tests
📋 Initial indexes:
- email_idx (background: false)
- age_idx (background: false)
- email_age_idx (background: false)

⚡ Rebuilding users collection...
✓ Rebuild completed in 245ms

✓ Verifying rebuild:
- email_idx (background: false)
- age_idx (background: false)
- email_age_idx (background: false)

✅ CLI Mode: PASS

## NPM Mode Tests
✓ index.test.ts (5 tests)
✓ mongodb-utils.test.ts (8 tests)
✓ cluster.test.ts (12 tests)

✅ NPM Mode: PASS

## Summary
- CLI Mode: ✅ PASS
- NPM Mode: ✅ PASS
```

---

## Troubleshooting

### Connection Issues

```bash
# Test connection
mongosh "$MONGODB_TEST_URI" --eval "db.adminCommand('ping')"

# Check server info
mongosh "$MONGODB_TEST_URI" --eval "db.version()"
```

### Permission Denied on dist/cli.js

```bash
# Make executable
chmod +x dist/cli.js
```

### Tests Timeout

```bash
# Increase timeout
MONGODB_TEST_URI="..." npm test -- --timeout 60000
```

### Database Already Exists

```bash
# Drop test database (careful!)
mongosh "$MONGODB_TEST_URI" --eval "db.dropDatabase()" reindex_test
```

---

## Best Practices

1. **Use separate test database** (reindex_test) - Never test against production
2. **Clean up after tests** - Reset indexes before each test run
3. **Log all operations** - Enable verbose mode for debugging
4. **Test both modes** - Always verify CLI and NPM modes work
5. **Document cluster state** - Record indexes before/after rebuild
