# Quick Setup: Cluster Testing

Get your test cluster running in 5 minutes.

## Prerequisites

- Docker (recommended) OR local MongoDB
- Node.js 18.0.0+
- This repository

## Option 1: Docker Setup (Recommended)

```bash
# Start test MongoDB container
docker run -d \
  --name mongodb-test-cluster \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=testuser \
  -e MONGO_INITDB_ROOT_PASSWORD=testpass \
  mongo:latest

# Wait for startup
sleep 3

# Initialize test database
mongosh mongodb://testuser:testpass@localhost:27017 << 'EOF'
use reindex_test

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

db.users.createIndex({ email: 1 }, { name: "email_idx" })
db.users.createIndex({ age: 1 }, { name: "age_idx" })
db.users.createIndex({ email: 1, age: 1 }, { name: "email_age_idx" })

db.products.createIndex({ sku: 1 }, { name: "sku_idx", unique: true })
db.products.createIndex({ price: 1 }, { name: "price_idx" })

print("✓ Test database initialized")
EOF
```

## Option 2: Local MongoDB

```bash
# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Initialize test database (same as above)
mongosh mongodb://testuser:testpass@localhost:27017 << 'EOF'
# ... (same script as Option 1)
EOF
```

## Set Environment Variable

```bash
export MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017"
```

Or add to `~/.bashrc` or `~/.zshrc`:

```bash
echo 'export MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017"' >> ~/.zshrc
source ~/.zshrc
```

## Build Project

```bash
npm run build
chmod +x scripts/run-cluster-tests.sh scripts/test-cli-mode.sh
```

## Run Tests

```bash
# Full suite (both CLI + NPM)
./scripts/run-cluster-tests.sh

# CLI only
./scripts/test-cli-mode.sh

# NPM only
npm test
```

## Verify Setup

```bash
# Check MongoDB connection
mongosh "$MONGODB_TEST_URI" --eval "db.adminCommand('ping')"

# Check test database
mongosh "$MONGODB_TEST_URI" --eval "use reindex_test; db.users.countDocuments()"
```

## Cleanup (Optional)

```bash
# Stop Docker container
docker stop mongodb-test-cluster
docker rm mongodb-test-cluster

# Or stop local MongoDB
brew services stop mongodb-community  # macOS
sudo systemctl stop mongod            # Linux
```

## Troubleshooting

**"Connection refused"**
- Verify MongoDB is running: `mongosh localhost:27017`
- Check URI matches your setup

**"Permission denied" on mongosh**
- Try without credentials first: `mongosh mongodb://localhost:27017`
- Or verify username/password are correct

**Scripts not executable**
- Run: `chmod +x scripts/run-cluster-tests.sh scripts/test-cli-mode.sh`

## What's Next?

See `[CLUSTER_TESTING_GUIDE.md](./CLUSTER_TESTING_GUIDE.md)` for:
- Detailed testing procedures
- Test scenarios and validation
- Troubleshooting and cleanup
- Best practices

---

**Questions?** Check `[CLUSTER_TESTING_GUIDE.md](./CLUSTER_TESTING_GUIDE.md)` or `[LIVE_TESTING_GUIDE.md](./LIVE_TESTING_GUIDE.md)`
