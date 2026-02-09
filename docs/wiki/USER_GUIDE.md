# MongoDB Reindexer

Universal zero-downtime MongoDB index rebuilding using the **Cover-Swap-Cleanup** strategy. Ported from production-grade mongosh script to TypeScript with full feature parity.

## Features

- ✅ **Zero Downtime**: Rebuild indexes without affecting application availability
- 🔄 **Cover-Swap-Cleanup Strategy**: Safe three-phase approach with dual verification
- 🛡️ **Resilient Operations**: Automatic safety checks and verification loops
- 📁 **Cluster-Aware State Files**: Resume operations after failures across cluster nodes
- 🧹 **Orphan Cleanup**: Automatically detect and clean up indexes from failed operations
- 🎯 **Smart Filtering**: Process specific collections or use wildcard patterns to ignore
- 📊 **Performance Logging**: Detailed metrics with space reclaimed tracking
- 🎮 **Interactive Mode**: Safe run mode with prompts for user confirmation
- 📦 **Dual Mode**: Use as CLI tool or library in your application
- 🔒 **Strict TypeScript**: Full type safety and robust error handling
- 🌐 **Native MongoDB Driver**: Uses the official MongoDB Node.js driver 6.x
- 🌍 **Internationalization**: Multi-language support with locale system

## Installation

### Using npm

```bash
npm install mongodb-reindexer
```

### Using yarn

```bash
yarn add mongodb-reindexer
```

### Global CLI Installation

```bash
npm install -g mongodb-reindexer
```

## Usage

### As a CLI Tool

The CLI establishes its own MongoDB connection and processes entire databases.

#### Rebuild All Non-Unique Indexes in a Database

```bash
mongodb-reindex rebuild \
  --uri "mongodb://localhost:27017" \
  --database mydb
```

#### With Environment Variables

```bash
export MONGODB_URI="mongodb://localhost:27017"
mongodb-reindex rebuild --database mydb
```

#### Advanced Options

```bash
mongodb-reindex rebuild \
  --uri "mongodb://localhost:27017" \
  --database mydb \
  --log-dir ./logs \
  --runtime-dir ./.runtime \
  --specified-collections "users,orders" \
  --ignored-indexes "_id_,unique_*" \
  --no-safe-run  # Disable interactive prompts
```

#### CLI Options

**rebuild command:**
- `-u, --uri <uri>` - MongoDB connection URI (or use MONGODB_URI env var)
- `-d, --database <name>` - Database name (required)
- `--log-dir <dir>` - Directory for performance logs (default: `rebuild_logs`)
- `--runtime-dir <dir>` - Directory for runtime state files (default: `.rebuild_runtime`)
- `--cover-suffix <suffix>` - Suffix for covering indexes (default: `_cover_temp`)
- `--cheap-field <field>` - Field name for covering indexes (default: `_rebuild_cover_field_`)
- `--no-safe-run` - Disable interactive prompts (automatic mode)
- `--specified-collections <collections>` - Comma-separated list of collections to process
- `--ignored-collections <collections>` - Comma-separated list of collections to ignore (supports wildcards)
- `--ignored-indexes <indexes>` - Comma-separated list of indexes to ignore (supports wildcards)
- `--no-performance-logging` - Disable performance logging

**cleanup command:**
- `-u, --uri <uri>` - MongoDB connection URI (or use MONGODB_URI env var)
- `-d, --database <name>` - Database name (required)
- `--cover-suffix <suffix>` - Suffix for covering indexes (default: `_cover_temp`)

### As a Library

The library function accepts an existing `Db` instance, allowing you to use it within your application's existing MongoDB connection.

```typescript
import { MongoClient } from 'mongodb';
import { rebuildIndexes, RebuildConfig } from 'mongodb-reindexer';

async function rebuildDatabaseIndexes() {
  // Use your existing MongoDB connection
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  
  const db = client.db('mydb');
  
  const config: RebuildConfig = {
    dbName: 'mydb',
    logDir: './logs',
    runtimeDir: './.runtime',
    safeRun: true,  // Enable interactive prompts
    specifiedCollections: [],  // Empty = process all
    ignoredCollections: ['system.*', 'temp_*'],  // Wildcard support
    ignoredIndexes: ['_id_'],  // Always ignore _id index
    performanceLogging: {
      enabled: true
    }
  };
  
  try {
    const result = await rebuildIndexes(db, config);
    console.log(`Rebuild completed in ${result.totalTimeSeconds}s`);
    console.log(`Space reclaimed: ${result.totalReclaimedMb.toFixed(2)} MB`);
  } catch (error) {
    console.error('Rebuild failed:', error);
  } finally {
    await client.close();
  }
}

rebuildDatabaseIndexes().catch(console.error);
```

#### Programmatic Orphan Cleanup

```typescript
import { MongoClient } from 'mongodb';
import { cleanupOrphanedIndexes, RebuildConfig } from 'mongodb-reindexer';

async function cleanupOrphans() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('mydb');
  
  const config: RebuildConfig = {
    dbName: 'mydb',
    coverSuffix: '_cover_temp',
    safeRun: false  // Run without prompts
  };
  
  try {
    await cleanupOrphanedIndexes(db, config);
    console.log('Orphaned indexes cleaned up successfully');
  } finally {
    await client.close();
  }
}

cleanupOrphans().catch(console.error);
```

## How It Works

### Cover-Swap-Cleanup Strategy

The reindexer uses a three-phase strategy with dual verification to ensure zero downtime:

1. **COVER Phase**: Create a new index with a temporary name
   - Adds a cheap suffix field to the index
   - Builds in the background
   - Verifies the covering index is valid before proceeding

2. **SWAP Phase**: Replace the old index atomically
   - Drops the old index
   - Creates the final index with the correct name
   - Verifies the final index matches expected specification

3. **CLEANUP Phase**: Remove temporary resources
   - Drops the covering index
   - Cleans up orphaned indexes from previous failed runs
   - Removes state files on success

### State Management

The reindexer maintains cluster-aware state files for resumability:

- State files include hostname for cluster identification
- Tracks completed indexes per collection
- Automatically resumes from last successful point
- State file format: `.rebuild_runtime/<cluster-name>_state.json`

### Interactive Safety Mode

When `safeRun: true` (default), the tool prompts for confirmation:

- Before processing collections (can specify individual collections)
- Before processing indexes (can specify individual indexes)
- Before cleanup operations
- Supports answers: yes/no/specify/skip/end

**Built-in Help System:**

At any interactive prompt, type `help`, `h`, or `?` to see detailed information about each option:

```
Proceed with these collections? (yes/no/specify) [y/n/s]: ?

📖 Available options:
  yes (y) - Process all listed collections
    Automatically processes all non-unique indexes in each collection shown above
  no (n) - Abort the entire operation
    Exits the rebuild process completely. Progress up to this point is saved in state file.
  specify (s) - Interactively choose which collections to process
    Shows a prompt for each collection, allowing you to select which ones to rebuild
  help/? - Show this help message

Proceed with these collections? (yes/no/specify) [y/n/s]: 
```

Help text is loaded from JSON configuration files in `locales/{locale}/prompts/` for easy customization.

### Performance Logging

Detailed performance metrics are saved to log files:

```json
{
  "clusterName": "my-cluster",
  "dbName": "mydb",
  "startTime": "2026-01-28T12:00:00.000Z",
  "totalTimeSeconds": 3600.5,
  "totalInitialSizeMb": 1024.5,
  "totalFinalSizeMb": 856.2,
  "totalReclaimedMb": 168.3,
  "collections": {
    "users": {
      "startTime": "2026-01-28T12:00:00.000Z",
      "totalTimeSeconds": 1800.2,
      "initialSizeMb": 512.3,
      "finalSizeMb": 428.1,
      "reclaimedMb": 84.2,
      "indexes": {
        "email_1": {
          "startTime": "2026-01-28T12:00:00.000Z",
          "timeSeconds": 900.1,
          "initialSizeMb": 256.1,
          "finalSizeMb": 214.0
        }
      }
    }
  },
  "error": null
}
```

## Configuration

### RebuildConfig Interface

```typescript
interface RebuildConfig {
  // Required
  dbName: string;
  
  // Optional
  logDir?: string;                    // Default: 'rebuild_logs'
  runtimeDir?: string;                // Default: '.rebuild_runtime'
  coverSuffix?: string;               // Default: '_cover_temp'
  cheapSuffixField?: string;          // Default: '_rebuild_cover_field_'
  safeRun?: boolean;                  // Default: true
  specifiedCollections?: string[];    // Default: []
  ignoredCollections?: string[];      // Default: []
  ignoredIndexes?: string[];          // Default: []
  performanceLogging?: {
    enabled: boolean;                 // Default: true
  };
}
```

### Filtering Rules

**Collections and Indexes**:
- Exact match: `"users"` matches only "users" collection
- Wildcard: `"temp_*"` matches any collection starting with "temp_"
- `specifiedCollections` overrides `ignoredCollections` if both are set

**Automatic Exclusions**:
- `_id_` indexes are always skipped (cannot be rebuilt)
- Unique indexes are always skipped (requires special handling)
- Already completed indexes are skipped (from state file)

### Help System

The tool includes a comprehensive help system for interactive prompts. Help text is stored in JSON configuration files for easy maintenance and customization.

**Directory Structure:**
```
locales/
├── en/                    # English locale (default)
│   ├── messages.json      # Common UI text and messages
│   └── prompts/           # Help files for each prompt type
│       ├── cleanup.json
│       ├── collections.json
│       ├── collection-specify.json
│       ├── indexes.json
│       └── index-specify.json
```

**Using Help:**
- Type `help`, `h`, or `?` at any interactive prompt
- Help displays all available options with descriptions
- Shows extended details for complex choices
- Re-prompts automatically after showing help

**Customizing Help:**

Edit the JSON files in `locales/{locale}/prompts/` to customize help text. Each file follows this format:

```json
{
  "id": "unique-identifier",
  "question": "The prompt question",
  "options": [
    {
      "value": "option-name",
      "shortcut": "letter",
      "description": "Brief description",
      "details": "Extended explanation (optional)"
    }
  ],
  "context": "Additional context (optional)"
}
```


## Requirements

- Node.js >= 18.0.0
- MongoDB server >= 3.6 (any version supported by mongodb driver 6.x)
- Network access to MongoDB cluster

## Internationalization (i18n)

MongoDB Reindexer supports multiple languages through a localization system.

### Current Languages

- **English (en)** - Default locale

### Setting Locale

Use the `LOCALE` environment variable:

```bash
LOCALE=en mongodb-reindex rebuild --database mydb
```

### Adding New Languages

1. **Create locale directory:**
   ```bash
   mkdir -p locales/es/prompts
   ```

2. **Copy and translate files:**
   ```bash
   cp locales/en/messages.json locales/es/messages.json
   cp locales/en/prompts/*.json locales/es/prompts/
   ```

3. **Update configuration:**
   Edit `locales/config.json` to add your locale to `supportedLocales`

4. **Test:**
   ```bash
   LOCALE=es npm start rebuild --database mydb
   ```


## Development

### Build

```bash
npm install
npm run build
```

### Development Mode

```bash
npm run dev rebuild --database mydb  # Uses tsx
```

### Linting

```bash
npm run lint
```

### Clean

```bash
npm run clean
```

## Security Considerations

- Always use authentication in production
- Use secure connection strings (mongodb+srv://)
- Limit connection permissions to necessary operations
- **Store credentials securely** using environment variables or secrets management
- **Avoid passing sensitive URIs via command-line arguments** as they may be logged in shell history
  - Recommended: Use environment variables (e.g., `export MONGODB_URI="mongodb://..."`)
  - The CLI accepts environment variables through `MONGODB_URI`

## Best Practices

1. **Test on non-production first**: Always test the rebuild on a development/staging environment
2. **Use tmux or screen**: Run in a persistent session for long-running operations
3. **Monitor disk space**: Ensure adequate free space (2x largest index size recommended)
4. **Schedule during low-traffic**: While zero-downtime, rebuilds do consume resources
5. **Review performance logs**: Check space reclaimed and optimize frequently
6. **Keep state files**: Don't delete `.rebuild_runtime` directory during operations

## Troubleshooting

### Operation Failed Mid-Way

The tool automatically saves state and can resume:

```bash
# Simply run the same command again
mongodb-reindex rebuild --database mydb
# It will resume from the last completed index
```

### Orphaned Indexes

If indexes with `_cover_temp` suffix remain after failures:

```bash
mongodb-reindex cleanup --database mydb
```

### Interactive Prompts Not Working

If running in a non-interactive environment:

```bash
mongodb-reindex rebuild --database mydb --no-safe-run
```

## TTL Index Behavior During Rebuild

### Understanding TTL Indexes

TTL (Time-To-Live) indexes automatically delete documents after a specified period. When rebuilding TTL indexes, special considerations apply.

### How TTL Works During Rebuild

During the Cover-Swap-Cleanup rebuild process:

1. **COVER Phase**: A temporary covering index is created
   - The covering index does NOT have `expireAfterSeconds`
   - TTL deletion continues using the original index
   - Documents continue to expire normally

2. **SWAP Phase**: Original index is dropped, then recreated
   - ⚠️ **Brief window where no TTL index exists**
   - Duration depends on index size (typically seconds to minutes)
   - Documents that would have expired during this window are NOT deleted

3. **CLEANUP Phase**: Covering index is removed
   - TTL functionality fully restored
   - Background TTL thread resumes normal operation

### Important Behaviors

#### Documents May Live Slightly Longer

During the SWAP phase, documents scheduled for deletion may survive longer than expected:

```
Timeline:
├── TTL Index Active (documents expire normally)
├── SWAP: Index dropped ─┬─ Documents NOT expired during this window
│                        └─ Window duration = index rebuild time
└── TTL Index Recreated (normal expiration resumes)
```

**Impact**: If a document was scheduled to expire at 12:00:00 and the rebuild window is 12:00:00-12:00:30, the document expires after 12:00:30 when the TTL thread next runs.

#### TTL Thread Behavior

- MongoDB's TTL background thread runs every 60 seconds
- After index recreation, the next TTL thread pass will catch up
- No documents are permanently "saved" from deletion

### Best Practices

1. **Schedule Rebuilds During Low-Sensitivity Windows**
   - If precise TTL timing is critical, rebuild during off-peak hours
   - Consider application tolerance for delayed deletions

2. **Monitor TTL-Heavy Collections**
   - Large TTL collections may have longer rebuild windows
   - Use performance logging to track actual rebuild durations

3. **Avoid Extremely Short TTLs**
   - TTL indexes with very short `expireAfterSeconds` (< 60s) may be more affected by rebuild timing

4. **Document Expiration Is Eventual**
   - TTL is already "eventual" by design (60s thread interval)
   - Rebuild adds a small additional delay

### Configuration Examples

#### Standard TTL Index
```javascript
// Original index with 1-hour TTL
db.sessions.createIndex(
  { "createdAt": 1 },
  { expireAfterSeconds: 3600, name: "session_ttl" }
)

// During rebuild, expireAfterSeconds is preserved
// Index is recreated with identical TTL configuration
```

#### TTL with Partial Filter
```javascript
// TTL only for certain documents
db.logs.createIndex(
  { "timestamp": 1 },
  { 
    expireAfterSeconds: 86400,
    partialFilterExpression: { level: "debug" },
    name: "debug_log_ttl"
  }
)

// Both expireAfterSeconds AND partialFilterExpression are preserved
```

### Verifying TTL After Rebuild

```javascript
// Check TTL configuration post-rebuild
db.sessions.getIndexes().forEach(idx => {
  if (idx.expireAfterSeconds !== undefined) {
    print(`TTL Index: ${idx.name}`);
    print(`  Expires after: ${idx.expireAfterSeconds} seconds`);
  }
});
```

### Warning Signs

⚠️ **If TTL stops working after rebuild:**
1. Check index exists: `db.collection.getIndexes()`
2. Verify `expireAfterSeconds` is present
3. Check MongoDB logs for TTL thread errors
4. Ensure the indexed field contains valid Date values

### Additional Resources

- [MongoDB TTL Indexes Documentation](https://www.mongodb.com/docs/manual/core/index-ttl/)
- [TTL Index Limitations](https://www.mongodb.com/docs/manual/core/index-ttl/#restrictions)

## Hinted Queries

### Problem Statement
Queries that use `.hint()` with a specific index name may fail during the rebuild window. This is a known limitation when performing index rebuilds in MongoDB.

### Why It Happens
MongoDB does not support index name aliases. When you rebuild an index, it:
1. Creates a new index with the same specification
2. Deletes the old index
3. During this transition, the original index name no longer exists

If a query has a `.hint()` directive for the old index name, it fails because the index it's looking for is temporarily unavailable.

### Impact Duration
The failure window duration depends on:
- **Index size**: Larger indexes take longer to rebuild (could be seconds to minutes)
- **Collection size**: More data means slower index creation
- **System resources**: Available CPU, memory, and disk I/O

Typical failure window is measured in seconds to minutes, depending on the factors above.

### Workaround 1: Implement Retry Logic (Recommended)
Implement exponential backoff retry logic in your application:

```javascript
async function queryWithRetry(collection, query, options, maxRetries = 5) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      // Query WITHOUT hint - let optimizer choose the best index
      return await collection.find(query).toArray();
    } catch (error) {
      if (error.message.includes('index not found') && attempt < maxRetries - 1) {
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Index not found, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      } else {
        throw error;
      }
    }
  }
}
```

### Workaround 2: Schedule During Low-Traffic Windows
Plan index rebuilds during periods of minimal query traffic:
- Off-peak hours
- Scheduled maintenance windows
- When you can temporarily increase retry timeouts in your application

### Workaround 3: Remove Index Hints
Let MongoDB's query optimizer automatically select the best index:

```javascript
// Before
db.users.find({ email: 'test@example.com' }).hint('email_1')

// After - let optimizer choose
db.users.find({ email: 'test@example.com' })
```

Modern MongoDB query optimizers are highly effective and often select better indexes than manual hints.

---

## Testing & Documentation

### Testing Resources

- **[Live Testing Guide](docs/wiki/cluster-testing/LIVE_TESTING_GUIDE.md)** - Practical guide for testing with live MongoDB instances
  - Quick start guide
  - Test scenarios (basic rebuild, filtering, wildcards, TTL, performance testing)
  - Validation procedures
  - Troubleshooting common issues
  - Cleanup procedures

- **[Cluster Testing Guide](docs/wiki/cluster-testing/CLUSTER_TESTING_GUIDE.md)** - Test both CLI and NPM modes against MongoDB test cluster
  - Test cluster setup with sample data
  - CLI mode direct execution
  - NPM mode integration tests
  - Automated test execution for CI/CD
  - Result logging and verification

- **[Cluster Testing Quick Start](docs/wiki/cluster-testing/CLUSTER_TESTING_QUICKSTART.md)** - Get started in 5 minutes
  - Docker setup (recommended)
  - Local MongoDB setup
  - Environment configuration
  - Quick verification

### Running Tests

#### Unit and Integration Tests

```bash
npm test
```

Run all unit and integration tests using Node.js built-in test runner.

#### Cluster Tests (Both CLI and NPM Modes)

```bash
export MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017"
./scripts/run-cluster-tests.sh "$MONGODB_TEST_URI" "reindex_test"
```

This runs:
1. **CLI Mode Tests** - Direct command-line execution against test cluster
2. **NPM Mode Tests** - Unit/integration tests with cluster URI
3. **Results File** - Timestamped results saved to `.agent_memory/test_results_{timestamp}.md`

#### CLI Mode Only

```bash
./scripts/test-cli-mode.sh "mongodb://testuser:testpass@localhost:27017" "reindex_test"
```

Tests the CLI directly: list, rebuild, verify operations.

#### NPM Mode Only

```bash
MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017" npm test
```

Runs all unit and integration tests with cluster connection.

---

## License

MIT

## Contributing

Contributions are welcome! For bugs and feature requests, please open an issue on GitHub.

## Support

For issues and questions, please open an issue on GitHub.
