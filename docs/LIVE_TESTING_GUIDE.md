# Live Testing Guide

A practical guide for testing MongoDB Reindexer in real-world scenarios with live MongoDB instances.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Test Scenarios](#test-scenarios)
4. [Validation Procedures](#validation-procedures)
5. [Troubleshooting](#troubleshooting)
6. [Cleanup](#cleanup)

---

## Prerequisites

### Required Software

- **MongoDB Server**: 3.0 or higher (tested with 3.0, 4.0, 5.0, 6.0, 7.0+)
- **Node.js**: 18.0.0 or higher
- **mongosh**: Latest version recommended
- **Docker** (optional): For quick MongoDB instance setup

### Environment Setup

```bash
# Clone the repository
git clone https://github.com/yehsuf/MongoDB-reindexer.git
cd MongoDB-reindexer

# Install dependencies
npm install

# Build the project
npm run build
```

### MongoDB Connection URI

Set your MongoDB connection URI as an environment variable:

```bash
export MONGODB_URI="mongodb://localhost:27017"
```

Or use the `--uri` flag with each command.

---

## Quick Start

### 1. Start Local MongoDB Instance

**Using Docker:**

```bash
docker run -d -p 27017:27017 --name mongo-test mongo:latest
```

**Using Local Installation:**

```bash
# macOS with Homebrew
brew services start mongodb-community

# Linux systemd
sudo systemctl start mongod
```

### 2. Create Test Database and Collections

```bash
mongosh mongodb://localhost:27017 << 'EOF'
use reindex_test
db.users.insertMany([
  { name: "Alice", email: "alice@example.com", age: 30, status: "active" },
  { name: "Bob", email: "bob@example.com", age: 25, status: "active" },
  { name: "Charlie", email: "charlie@example.com", age: 35, status: "inactive" },
  { name: "Diana", email: "diana@example.com", age: 28, status: "active" }
])

db.users.createIndex({ email: 1 }, { name: "email_1" })
db.users.createIndex({ age: 1 }, { name: "age_1" })
db.users.createIndex({ status: 1 }, { name: "status_1" })

print("✓ Test data created")
db.users.getIndexes()
EOF
```

### 3. Run Your First Rebuild

```bash
./dist/cli.js rebuild \
  --uri "mongodb://localhost:27017" \
  --database reindex_test \
  --no-safe-run
```

### 4. Verify Results

```bash
mongosh mongodb://localhost:27017/reindex_test --eval "db.users.getIndexes()"
```

**Expected Output:**
- All original indexes present
- `_id_` index intact
- No covering indexes (`*_cover_temp`)
- Performance logs in `rebuild_logs/` directory

---

## Test Scenarios

### Scenario 1: Basic Index Rebuild

**Purpose:** Verify basic rebuild functionality on a simple collection.

**Steps:**

1. **Setup:**
   ```bash
   mongosh mongodb://localhost:27017 << 'EOF'
   use test_basic
   db.simple.drop()
   db.simple.insertMany([
     { id: 1, name: "Item1", value: 100 },
     { id: 2, name: "Item2", value: 200 }
   ])
   db.simple.createIndex({ name: 1 })
   db.simple.createIndex({ value: 1 })
   EOF
   ```

2. **Execute Rebuild:**
   ```bash
   ./dist/cli.js rebuild -u "mongodb://localhost:27017" -d test_basic --no-safe-run
   ```

3. **Verify:**
   ```bash
   mongosh mongodb://localhost:27017/test_basic --eval "
   const indexes = db.simple.getIndexes();
   print('Index count:', indexes.length);
   indexes.forEach(idx => print('  -', idx.name));
   "
   ```

**Expected Result:**
- 3 indexes total (_id_, name_1, value_1)
- No errors in console output
- Performance log created

---

### Scenario 2: Collection Filtering

**Purpose:** Test rebuilding specific collections only.

**Steps:**

1. **Setup:**
   ```bash
   mongosh mongodb://localhost:27017 << 'EOF'
   use test_filtering
   db.users.drop()
   db.orders.drop()
   db.products.drop()
   
   db.users.insertOne({ name: "Test User" })
   db.orders.insertOne({ order_id: 1 })
   db.products.insertOne({ sku: "ABC123" })
   
   db.users.createIndex({ name: 1 })
   db.orders.createIndex({ order_id: 1 })
   db.products.createIndex({ sku: 1 })
   EOF
   ```

2. **Execute Rebuild (users only):**
   ```bash
   ./dist/cli.js rebuild \
     -u "mongodb://localhost:27017" \
     -d test_filtering \
     --specified-collections "users" \
     --no-safe-run
   ```

3. **Verify:**
   ```bash
   mongosh mongodb://localhost:27017/test_filtering << 'EOF'
   print("\n=== Users Collection ===");
   db.users.getIndexes().forEach(idx => print("  -", idx.name));
   
   print("\n=== Orders Collection ===");
   db.orders.getIndexes().forEach(idx => print("  -", idx.name));
   
   print("\n=== Products Collection ===");
   db.products.getIndexes().forEach(idx => print("  -", idx.name));
   EOF
   ```

**Expected Result:**
- `users` collection: indexes rebuilt (check logs)
- `orders` and `products`: indexes unchanged

---

### Scenario 3: Wildcard Pattern Ignoring

**Purpose:** Test wildcard patterns for ignoring collections and indexes.

**Steps:**

1. **Setup:**
   ```bash
   mongosh mongodb://localhost:27017 << 'EOF'
   use test_wildcards
   db.data_main.drop()
   db.temp_cache.drop()
   db.temp_session.drop()
   
   db.data_main.insertOne({ value: 1 })
   db.temp_cache.insertOne({ cached: true })
   db.temp_session.insertOne({ session: "abc" })
   
   db.data_main.createIndex({ value: 1 })
   db.temp_cache.createIndex({ cached: 1 })
   db.temp_session.createIndex({ session: 1 })
   EOF
   ```

2. **Execute Rebuild (ignore temp_* collections):**
   ```bash
   ./dist/cli.js rebuild \
     -u "mongodb://localhost:27017" \
     -d test_wildcards \
     --ignored-collections "temp_*" \
     --no-safe-run
   ```

3. **Verify:**
   Check performance logs to confirm only `data_main` was processed.

**Expected Result:**
- `data_main`: indexes rebuilt
- `temp_cache` and `temp_session`: ignored

---

### Scenario 4: Interactive Mode (Safe Run)

**Purpose:** Test interactive prompting functionality.

**Steps:**

1. **Setup:**
   ```bash
   mongosh mongodb://localhost:27017 << 'EOF'
   use test_interactive
   db.coll1.drop()
   db.coll2.drop()
   
   db.coll1.insertOne({ data: "test1" })
   db.coll2.insertOne({ data: "test2" })
   
   db.coll1.createIndex({ data: 1 })
   db.coll2.createIndex({ data: 1 })
   EOF
   ```

2. **Execute Rebuild (interactive mode):**
   ```bash
   ./dist/cli.js rebuild \
     -u "mongodb://localhost:27017" \
     -d test_interactive
   # Note: No --no-safe-run flag
   ```

3. **Interact with Prompts:**
   - When prompted for collections, enter: `coll1`
   - When prompted for indexes, press Enter to accept all

**Expected Result:**
- Prompts appear for user input
- Only selected collection(s) processed
- User has control over execution

---

### Scenario 5: Orphan Cleanup

**Purpose:** Test cleanup of orphaned covering indexes from failed rebuilds.

**Steps:**

1. **Setup - Create Orphaned Index:**
   ```bash
   mongosh mongodb://localhost:27017 << 'EOF'
   use test_cleanup
   db.orphaned.drop()
   db.orphaned.insertOne({ field: "value" })
   db.orphaned.createIndex({ field: 1 })
   // Manually create a covering index to simulate failed rebuild
   db.orphaned.createIndex({ field: 1, _rebuild_cover_field_: 1 }, { name: "field_1_cover_temp" })
   print("\n=== Indexes (with orphan) ===");
   db.orphaned.getIndexes().forEach(idx => print("  -", idx.name));
   EOF
   ```

2. **Execute Cleanup:**
   ```bash
   ./dist/cli.js cleanup \
     -u "mongodb://localhost:27017" \
     -d test_cleanup
   ```

3. **Verify:**
   ```bash
   mongosh mongodb://localhost:27017/test_cleanup --eval "
   print('\n=== Indexes (after cleanup) ===');
   db.orphaned.getIndexes().forEach(idx => print('  -', idx.name));
   "
   ```

**Expected Result:**
- Orphaned index (`field_1_cover_temp`) removed
- Original indexes intact
- Console shows cleanup summary

---

### Scenario 6: Large Dataset Performance

**Purpose:** Test rebuild performance with a larger dataset.

**Steps:**

1. **Setup:**
   ```bash
   mongosh mongodb://localhost:27017 << 'EOF'
   use test_performance
   db.large_collection.drop()
   
   // Insert 100,000 documents
   const bulkOps = [];
   for (let i = 0; i < 100000; i++) {
     bulkOps.push({
       insertOne: {
         document: {
           index: i,
           email: `user${i}@example.com`,
           age: 20 + (i % 50),
           status: i % 2 === 0 ? "active" : "inactive",
           createdAt: new Date()
         }
       }
     });
   }
   db.large_collection.bulkWrite(bulkOps);
   
   db.large_collection.createIndex({ email: 1 })
   db.large_collection.createIndex({ age: 1 })
   db.large_collection.createIndex({ status: 1, createdAt: 1 })
   
   print("✓ 100,000 documents inserted with 3 indexes");
   EOF
   ```

2. **Execute Rebuild:**
   ```bash
   time ./dist/cli.js rebuild \
     -u "mongodb://localhost:27017" \
     -d test_performance \
     --no-safe-run
   ```

3. **Analyze:**
   - Check execution time (from `time` command)
   - Review performance log in `rebuild_logs/`
   - Check space reclaimed metrics

**Expected Result:**
- Rebuild completes successfully
- Performance metrics logged
- Space reclaimed reported
- Collection remains queryable

---

### Scenario 7: TTL Index Preservation

**Purpose:** Verify TTL (Time To Live) indexes are rebuilt correctly.

**Steps:**

1. **Setup:**
   ```bash
   mongosh mongodb://localhost:27017 << 'EOF'
   use test_ttl
   db.sessions.drop()
   
   db.sessions.insertMany([
     { sessionId: "abc123", createdAt: new Date(), data: "session1" },
     { sessionId: "def456", createdAt: new Date(), data: "session2" }
   ])
   
   // Create TTL index (expire after 1 hour)
   db.sessions.createIndex(
     { createdAt: 1 },
     { name: "ttl_created", expireAfterSeconds: 3600 }
   )
   
   print("\n=== TTL Index Before Rebuild ===");
   db.sessions.getIndexes().forEach(idx => {
     if (idx.expireAfterSeconds !== undefined) {
       print(`${idx.name}: expires after ${idx.expireAfterSeconds}s`);
     }
   });
   EOF
   ```

2. **Execute Rebuild:**
   ```bash
   ./dist/cli.js rebuild \
     -u "mongodb://localhost:27017" \
     -d test_ttl \
     --no-safe-run
   ```

3. **Verify:**
   ```bash
   mongosh mongodb://localhost:27017/test_ttl --eval "
   print('\n=== TTL Index After Rebuild ===');
   db.sessions.getIndexes().forEach(idx => {
     if (idx.expireAfterSeconds !== undefined) {
       print(idx.name + ': expires after ' + idx.expireAfterSeconds + 's');
     }
   });
   "
   ```

**Expected Result:**
- TTL index present after rebuild
- `expireAfterSeconds` value preserved (3600)
- TTL functionality continues working

---

### Scenario 8: Hinted Queries During Rebuild

**Purpose:** Understand behavior of hinted queries during index rebuild.

**Setup and execution detailed in [TESTING.md](../TESTING.md#test-scenario-hinted-query-during-index-rebuild).**

**Key Points:**
- Queries with `.hint()` may fail during rebuild window
- Non-hinted queries continue working
- Implement retry logic or schedule rebuilds during low-traffic periods

---

## Validation Procedures

### Post-Rebuild Checklist

After each rebuild, verify the following:

#### 1. Index Integrity

```bash
mongosh mongodb://localhost:27017/<database> << 'EOF'
db.getCollectionNames().forEach(collName => {
  const indexes = db[collName].getIndexes();
  print(`\n${collName}: ${indexes.length} indexes`);
  indexes.forEach(idx => {
    print(`  - ${idx.name}`);
    if (idx.name.includes('_cover_temp')) {
      print(`    ⚠️  WARNING: Orphaned covering index detected!`);
    }
  });
});
EOF
```

**Expected:** No indexes with `_cover_temp` suffix remain.

#### 2. Performance Logs

```bash
ls -lh rebuild_logs/
cat rebuild_logs/rebuild_performance_*.log | tail -20
```

**Expected:** 
- Log file created
- Summary shows space reclaimed
- No errors reported

#### 3. Application Queries

Run sample queries to verify indexes work:

```bash
mongosh mongodb://localhost:27017/<database> << 'EOF'
// Test query performance
db.users.find({ email: "test@example.com" }).explain("executionStats");

// Verify index is used
const stats = db.users.find({ email: "test@example.com" }).explain("executionStats");
print("\nIndex used:", stats.executionStats.executionStages.indexName || "NONE");
EOF
```

**Expected:** Queries use appropriate indexes.

#### 4. Data Integrity

```bash
mongosh mongodb://localhost:27017/<database> --eval "
const count = db.users.countDocuments();
print('Document count:', count);
"
```

**Expected:** Document count unchanged from before rebuild.

---

## Troubleshooting

### Issue: "MongoServerError: Index not found"

**Cause:** Query with `.hint()` executed during rebuild window.

**Solutions:**
1. Remove index hints from queries
2. Implement retry logic with exponential backoff
3. Schedule rebuilds during low-traffic periods

**Reference:** [README.md - Hinted Queries](../README.md#hinted-queries)

---

### Issue: Orphaned Covering Indexes Remain

**Symptoms:**
```
db.collection.getIndexes()
// Shows: "field_1_cover_temp"
```

**Cause:** Previous rebuild interrupted or failed during cleanup phase.

**Solution:**
```bash
./dist/cli.js cleanup -u "mongodb://localhost:27017" -d <database>
```

---

### Issue: "Error: Unable to connect to MongoDB"

**Cause:** MongoDB connection issues.

**Diagnostics:**
```bash
# Test connection
mongosh mongodb://localhost:27017 --eval "db.adminCommand({ ping: 1 })"

# Check MongoDB is running
# macOS:
brew services list | grep mongodb

# Linux:
sudo systemctl status mongod

# Docker:
docker ps | grep mongo
```

**Solutions:**
- Start MongoDB service
- Check URI format
- Verify network connectivity
- Check firewall rules

---

### Issue: TTL Index Stops Working After Rebuild

**Symptoms:** Documents not expiring as expected.

**Diagnostics:**
```bash
mongosh mongodb://localhost:27017/<database> --eval "
db.collection.getIndexes().forEach(idx => {
  if (idx.expireAfterSeconds !== undefined) {
    print('TTL Index:', idx.name);
    print('  Expires after:', idx.expireAfterSeconds, 'seconds');
  } else {
    print('Index:', idx.name, '(no TTL)');
  }
});
"
```

**Cause:** TTL field may contain non-Date values.

**Solution:** Ensure indexed field contains valid Date objects:
```javascript
db.collection.find({ createdAt: { $type: "date" } }).count()
```

---

### Issue: High Memory Usage During Rebuild

**Symptoms:** System memory exhausted during large collection rebuild.

**Solutions:**
1. **Schedule during off-peak hours**
2. **Increase available memory**
3. **Process collections individually:**
   ```bash
   ./dist/cli.js rebuild \
     -u "mongodb://localhost:27017" \
     -d <database> \
     --specified-collections "collection1"
   ```
4. **Monitor MongoDB memory usage:**
   ```bash
   mongosh --eval "db.serverStatus().mem"
   ```

---

### Issue: Performance Logs Not Created

**Symptoms:** No logs in `rebuild_logs/` directory.

**Cause:** Performance logging disabled or directory not writable.

**Solutions:**
1. **Enable performance logging:**
   ```bash
   ./dist/cli.js rebuild \
     -u "mongodb://localhost:27017" \
     -d <database>
   # Performance logging is enabled by default
   ```

2. **Check directory permissions:**
   ```bash
   ls -ld rebuild_logs/
   chmod 755 rebuild_logs/
   ```

3. **Specify custom log directory:**
   ```bash
   ./dist/cli.js rebuild \
     --log-dir ./custom_logs \
     -u "mongodb://localhost:27017" \
     -d <database>
   ```

---

## Cleanup

### Remove Test Databases

```bash
mongosh mongodb://localhost:27017 << 'EOF'
db.getSiblingDB('test_basic').dropDatabase()
db.getSiblingDB('test_filtering').dropDatabase()
db.getSiblingDB('test_wildcards').dropDatabase()
db.getSiblingDB('test_interactive').dropDatabase()
db.getSiblingDB('test_cleanup').dropDatabase()
db.getSiblingDB('test_performance').dropDatabase()
db.getSiblingDB('test_ttl').dropDatabase()
db.getSiblingDB('reindex_test').dropDatabase()
print("✓ All test databases dropped")
EOF
```

### Stop MongoDB Instance

**Docker:**
```bash
docker stop mongo-test
docker rm mongo-test
```

**Local Installation (macOS):**
```bash
brew services stop mongodb-community
```

**Local Installation (Linux):**
```bash
sudo systemctl stop mongod
```

### Remove Logs and Runtime Files

```bash
rm -rf rebuild_logs/
rm -rf .rebuild_runtime/
```

---

## Additional Resources

- **Main Documentation:** [README.md](../README.md)
- **Testing Scenarios:** [TESTING.md](../TESTING.md)
- **Contributing Guidelines:** [CONTRIBUTING.md](../CONTRIBUTING.md)
- **Project Conventions:** [CONVENTIONS.md](../CONVENTIONS.md)

---

## Support

For issues and questions:
- Open an issue on [GitHub](https://github.com/yehsuf/MongoDB-reindexer/issues)
- Review existing documentation
- Check troubleshooting section above

---

**Last Updated:** February 1, 2026  
**Version:** 1.0.0
