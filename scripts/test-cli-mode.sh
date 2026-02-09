#!/bin/bash
# Test CLI mode against test cluster
# Usage: ./test-cli-mode.sh [URI] [DATABASE]

# Ensure we are in the project root
cd "$(dirname "$0")/.."

# Parse arguments
URI="${1:?Please provide MongoDB URI}"
DB="${2:-reindex_test}"

echo "🔄 Starting CLI Mode Test Sequence..."
echo "📍 Target: $(echo "$URI" | sed -E 's|://[^@]+@|://****@|') / $DB"
echo ""

# Verify CLI exists
if [ ! -f "dist/cli.js" ]; then
  echo "❌ Error: dist/cli.js not found. Run 'npm run build' first."
  exit 1
fi

# Make executable
chmod +x dist/cli.js

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

success() { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${BLUE}ℹ${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

# Test 1: List indexes before
info "Listing indexes before rebuild (users collection)..."
if ./dist/cli.js list --uri "$URI" --database "$DB" --collection users --no-safe-run > /tmp/indexes_before.txt 2>&1; then
  success "Initial list succeeded"
  head -20 /tmp/indexes_before.txt
else
  error "Initial list failed"
  cat /tmp/indexes_before.txt
  exit 1
fi

echo ""

# Test 2: Rebuild users collection
info "Rebuilding users collection..."
if ./dist/cli.js rebuild \
  --uri "$URI" \
  --database "$DB" \
  --collection users \
  --no-safe-run \
  --verbose > /tmp/rebuild_users.txt 2>&1; then
  success "Users rebuild succeeded"
  tail -10 /tmp/rebuild_users.txt
else
  error "Users rebuild failed"
  cat /tmp/rebuild_users.txt
  exit 1
fi

echo ""

# Test 3: List indexes after rebuild (users)
info "Listing indexes after rebuild (users collection)..."
if ./dist/cli.js list --uri "$URI" --database "$DB" --collection users --no-safe-run > /tmp/indexes_after_users.txt 2>&1; then
  success "Users list after rebuild succeeded"
  head -20 /tmp/indexes_after_users.txt
else
  error "Users list after rebuild failed"
  cat /tmp/indexes_after_users.txt
  exit 1
fi

echo ""

# Test 4: Rebuild products collection
info "Rebuilding products collection..."
if ./dist/cli.js rebuild \
  --uri "$URI" \
  --database "$DB" \
  --collection products \
  --no-safe-run > /tmp/rebuild_products.txt 2>&1; then
  success "Products rebuild succeeded"
  tail -10 /tmp/rebuild_products.txt
else
  error "Products rebuild failed"
  cat /tmp/rebuild_products.txt
  exit 1
fi

echo ""

# Test 5: List all collections
info "Listing all collections and indexes..."
if ./dist/cli.js list --uri "$URI" --database "$DB" --no-safe-run > /tmp/indexes_all.txt 2>&1; then
  success "Full list succeeded"
  cat /tmp/indexes_all.txt
else
  error "Full list failed"
  cat /tmp/indexes_all.txt
  exit 1
fi

echo ""
echo "✅ CLI Mode Test Complete - All tests passed!"
exit 0
