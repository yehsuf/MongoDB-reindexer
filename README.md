# MongoDB Reindexer

Universal zero-downtime MongoDB index rebuilding using the **Cover-Swap-Cleanup** strategy.

## Install

```bash
npm install mongodb-reindexer
# or
yarn add mongodb-reindexer
# or (CLI)
npm install -g mongodb-reindexer
```

## CLI Usage

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

## Library Usage

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

Extended documentation, operational guides, and testing details have moved to the wiki:

- [Wiki Home](docs/wiki/README.md)
- [Cluster Testing](docs/wiki/cluster-testing/CLUSTER_TESTING_INDEX.md)
