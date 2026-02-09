# MongoDB Reindexer

Universal zero-downtime MongoDB index rebuilding using the **Cover-Swap-Cleanup** strategy. Ported from a production-grade mongosh script to TypeScript with full feature parity.

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

## Installation

```bash
npm install mongodb-reindexer
# or
yarn add mongodb-reindexer
# or (CLI)
npm install -g mongodb-reindexer
```

## Usage

### CLI Quick Start

```bash
mongodb-reindex rebuild \
  --uri "mongodb://localhost:27017" \
  --database mydb
```

```bash
mongodb-reindex cleanup \
  --uri "mongodb://localhost:27017" \
  --database mydb
```

### CLI Options

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

### Library Usage

```typescript
import { MongoClient } from 'mongodb';
import { rebuildIndexes, RebuildConfig } from 'mongodb-reindexer';

async function rebuildDatabaseIndexes() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();

  const db = client.db('mydb');

  const config: RebuildConfig = {
    dbName: 'mydb',
    safeRun: true,
    performanceLogging: {
      enabled: true
    }
  };

  await rebuildIndexes(db, config);
  await client.close();
}
```

## Documentation

Extended documentation and operational guides are available in the wiki:

- [Wiki Home](docs/wiki/README.md)
- [User Guide](docs/wiki/USER_GUIDE.md)
- [Cluster Testing](docs/wiki/cluster-testing/CLUSTER_TESTING_INDEX.md)
