# MongoDB Reindexer

Zero-downtime MongoDB index rebuilding using the **Cover-Swap-Cleanup** strategy.

## Features

- ✅ **Zero Downtime**: Rebuild indexes without affecting application availability
- 🔄 **Cover-Swap-Cleanup Strategy**: Safe three-phase approach to index rebuilding
- 🛡️ **Resilient Verification Loops**: Automatic retry mechanism for index verification
- 📁 **Cluster-Aware State Files**: Resume operations after failures across cluster nodes
- 🧹 **Orphan Cleanup**: Automatically clean up indexes from failed operations
- 📊 **Verbose Diagnostic Logging**: Detailed logging for troubleshooting
- 🔒 **Strict TypeScript**: Full type safety and robust error handling
- 📦 **Dual Mode**: Use as CLI tool or library in your application
- 🌐 **Native MongoDB Driver**: Uses the official MongoDB Node.js driver

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

#### Rebuild an Index

```bash
mongodb-reindex rebuild \
  --uri "mongodb://localhost:27017" \
  --database mydb \
  --collection users \
  --index '{"email": 1}' \
  --options '{"unique": true}' \
  --verbose
```

#### Cleanup Orphan Indexes

```bash
mongodb-reindex cleanup \
  --uri "mongodb://localhost:27017" \
  --database mydb \
  --collection users \
  --verbose
```

#### CLI Options

**rebuild command:**
- `-u, --uri <uri>` - MongoDB connection URI (required)
- `-d, --database <name>` - Database name (required)
- `-c, --collection <name>` - Collection name (required)
- `-i, --index <spec>` - Index specification as JSON (required)
- `-o, --options <options>` - Index options as JSON (optional)
- `-s, --state-file <path>` - Custom state file path (optional)
- `-v, --verbose` - Enable verbose logging (optional)
- `--max-retries <number>` - Maximum verification retries (default: 10)
- `--retry-delay <ms>` - Verification retry delay (default: 2000ms)

**cleanup command:**
- `-u, --uri <uri>` - MongoDB connection URI (required)
- `-d, --database <name>` - Database name (required)
- `-c, --collection <name>` - Collection name (required)
- `-v, --verbose` - Enable verbose logging (optional)

### As a Library

```typescript
import { MongoDBReindexer } from 'mongodb-reindexer';

async function rebuildIndex() {
  const reindexer = new MongoDBReindexer({
    uri: 'mongodb://localhost:27017',
    database: 'mydb',
    collection: 'users',
    indexSpec: { email: 1 },
    indexOptions: { unique: true },
    verbose: true,
    maxVerificationRetries: 10,
    verificationRetryDelayMs: 2000
  });

  const result = await reindexer.reindex();
  
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