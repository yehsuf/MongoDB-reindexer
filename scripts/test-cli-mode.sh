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

# Test 1: Dry-run rebuild on users collection before
info "Checking users collection before rebuild..."
if ./dist/cli.js rebuild --uri "$URI" --database "$DB" --specified-collections users --no-safe-run > /tmp/indexes_before.txt 2>&1; then
  success "Initial rebuild (users) succeeded"
  head -20 /tmp/indexes_before.txt
else
  error "Initial rebuild (users) failed"
  cat /tmp/indexes_before.txt
  exit 1
fi

echo ""

# Test 2: Rebuild users collection
info "Rebuilding users collection..."
if ./dist/cli.js rebuild \
  --uri "$URI" \
  --database "$DB" \
  --specified-collections users \
  --no-safe-run > /tmp/rebuild_users.txt 2>&1; then
  success "Users rebuild succeeded"
  tail -10 /tmp/rebuild_users.txt
else
  error "Users rebuild failed"
  cat /tmp/rebuild_users.txt
  exit 1
fi

echo ""

# Test 3: Cleanup after rebuild (users)
info "Running cleanup after rebuild (users collection)..."
if ./dist/cli.js cleanup --uri "$URI" --database "$DB" --specified-collections users --no-safe-run > /tmp/indexes_after_users.txt 2>&1; then
  success "Users cleanup after rebuild succeeded"
  head -20 /tmp/indexes_after_users.txt
else
  error "Users cleanup after rebuild failed"
  cat /tmp/indexes_after_users.txt
  exit 1
fi

echo ""

# Test 4: Rebuild products collection
info "Rebuilding products collection..."
if ./dist/cli.js rebuild \
  --uri "$URI" \
  --database "$DB" \
  --specified-collections products \
  --no-safe-run > /tmp/rebuild_products.txt 2>&1; then
  success "Products rebuild succeeded"
  tail -10 /tmp/rebuild_products.txt
else
  error "Products rebuild failed"
  cat /tmp/rebuild_products.txt
  exit 1
fi

echo ""

# Test 5: Rebuild all collections
info "Rebuilding all collections..."
if ./dist/cli.js rebuild --uri "$URI" --database "$DB" --no-safe-run > /tmp/indexes_all.txt 2>&1; then
  success "Full rebuild succeeded"
  cat /tmp/indexes_all.txt
else
  error "Full rebuild failed"
  cat /tmp/indexes_all.txt
  exit 1
fi

echo ""
echo "✅ CLI Mode Test Complete - All tests passed!"
exit 0
