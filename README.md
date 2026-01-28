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

async function cleanupOrphans() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('mydb');
  
  // Find and drop orphaned indexes
  const collections = await db.listCollections().toArray();
  for (const collInfo of collections) {
    const collection = db.collection(collInfo.name);
    const indexes = await collection.indexes();
    const orphans = indexes.filter(idx => 
      idx.name && idx.name.endsWith('_cover_temp')
    );
    
    for (const orphan of orphans) {
      if (orphan.name) {
        await collection.dropIndex(orphan.name);
        console.log(`Dropped orphan: ${orphan.name}`);
      }
    }
  }
  
  await client.close();
}
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

## Requirements

- Node.js >= 18.0.0
- MongoDB server >= 3.6 (any version supported by mongodb driver 6.x)
- Network access to MongoDB cluster

## Development

### Build

```bash
npm install
npm run build
```

### Development Mode

```bash
npm run dev rebuild --database mydb  # Uses ts-node
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

## License

MIT

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Support

For issues and questions, please open an issue on GitHub.
  
  if (result.success) {
    console.log('Index rebuilt successfully!');
  } else {
    console.error('Failed to rebuild index:', result.error);
  }
}

rebuildIndex().catch(console.error);
```

#### Cleanup Orphans

```typescript
import { MongoDBReindexer } from 'mongodb-reindexer';

async function cleanupOrphans() {
  const reindexer = new MongoDBReindexer({
    uri: 'mongodb://localhost:27017',
    database: 'mydb',
    collection: 'users',
    indexSpec: {} // Not used for cleanup
  });

  const orphans = await reindexer.cleanupOrphans();
  console.log(`Cleaned up ${orphans.length} orphan indexes`);
}

cleanupOrphans().catch(console.error);
```

## How It Works

### Cover-Swap-Cleanup Strategy

The reindexer uses a three-phase strategy to ensure zero downtime:

1. **COVER Phase**: Create a new index with a temporary name
   - Builds the index in the background
   - Does not interfere with existing indexes
   - Resilient verification ensures the index is ready

2. **SWAP Phase**: Replace the old index
   - Drops the old index if it exists
   - The covering index immediately takes over
   - Minimal downtime window (milliseconds)

3. **CLEANUP Phase**: Finalize and verify
   - Verifies the new index is operational
   - Cleans up any orphan indexes from previous failures
   - Removes state files on success

### State Management

The reindexer maintains a state file that allows operations to be resumed after failures:

- State files are cluster-aware (include hostname)
- Automatic detection of stale operations
- Safe to run across multiple cluster nodes
- State file is automatically cleaned up on success

### Resilient Verification

Index verification uses a retry mechanism with configurable parameters:

- Retries up to `maxVerificationRetries` times
- Waits `verificationRetryDelayMs` between retries with fixed delay
- Handles transient network issues
- Provides detailed diagnostic logging

## Configuration

### ReindexerConfig Interface

```typescript
interface ReindexerConfig {
  // Required
  uri: string;                      // MongoDB connection URI
  database: string;                 // Database name
  collection: string;               // Collection name
  indexSpec: IndexSpecification;    // Index specification

  // Optional
  indexOptions?: Document;          // Index options (unique, sparse, etc.)
  stateFilePath?: string;           // Custom state file path
  verbose?: boolean;                // Enable verbose logging (default: false)
  maxVerificationRetries?: number;  // Max retries (default: 10)
  verificationRetryDelayMs?: number; // Retry delay (default: 2000ms)
  operationTimeoutMs?: number;      // Operation timeout (default: 300000ms)
}
```

## Error Handling

The reindexer includes comprehensive error handling:

- All errors are caught and logged with stack traces
- Failed operations save state for resumption
- Graceful cleanup on errors
- Non-zero exit codes for CLI failures

## Development

### Build

```bash
npm install
npm run build
```

### Watch Mode

```bash
npm run dev
```

### Linting

```bash
npm run lint
```

### Clean

```bash
npm run clean
```

## Requirements

- Node.js >= 16.0.0
- MongoDB server >= 3.6 (any version supported by mongodb driver 6.x)
- Network access to MongoDB cluster

## Security Considerations

- Always use authentication in production
- Use secure connection strings (mongodb+srv://)
- Limit connection permissions to necessary operations
- **Store credentials securely** using environment variables or secrets management
- **Avoid passing sensitive URIs via command-line arguments** as they may be logged in shell history
  - Recommended: Use environment variables (e.g., `export MONGODB_URI="mongodb://..."`)
  - The CLI accepts environment variables through shell expansion: `--uri "$MONGODB_URI"`

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## Support

For issues and questions, please open an issue on GitHub.