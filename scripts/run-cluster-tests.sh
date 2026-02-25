#!/bin/bash
# Combined test runner for both CLI and NPM modes against test cluster
# Usage: ./run-cluster-tests.sh [URI] [DATABASE]

set -e

# Ensure we are in the project root
cd "$(dirname "$0")/.."

# Parse arguments
URI="${1:?Please provide MongoDB URI as first argument}"
DB="${2:-reindex_test}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_FILE=".agent_memory/test_results_${TIMESTAMP}.md"

# Mask URI for reporting/logging
MASKED_URI=$(echo "$URI" | sed -E 's|://[^@]+@|://****@|')

# Ensure .agent_memory exists
mkdir -p .agent_memory

echo "🧪 Starting Cluster Test Suite"
echo "📍 Target: $MASKED_URI / $DB"
echo "📄 Results: $RESULTS_FILE"
echo ""

# Initialize results file
cat > "$RESULTS_FILE" << EOF
# Cluster Test Results
**Timestamp**: $TIMESTAMP
**URI**: $MASKED_URI
**Database**: $DB

---

## Test Execution

EOF

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

success() { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${BLUE}ℹ${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

# Step 1: Verify build
info "Verifying build..."
if [ ! -f "dist/cli.js" ]; then
  warn "Build not found, running npm run build..."
  npm run build
fi
success "Build verified"

# Step 2: CLI Mode Tests
echo ""
echo "## CLI Mode Tests" | tee -a "$RESULTS_FILE"
echo "### Execution Log" >> "$RESULTS_FILE"
echo '```' >> "$RESULTS_FILE"

info "Running CLI mode tests..."
chmod +x scripts/test-cli-mode.sh
./scripts/test-cli-mode.sh "$URI" "$DB" 2>&1 | tee -a "$RESULTS_FILE"
CLI_EXIT=${PIPESTATUS[0]}
if [ $CLI_EXIT -eq 0 ]; then
  success "CLI mode tests passed"
else
  error "CLI mode tests failed (exit code: $CLI_EXIT)"
fi

echo '```' >> "$RESULTS_FILE"

# Step 3: NPM Mode Tests
echo ""
echo "## NPM Mode Tests" | tee -a "$RESULTS_FILE"
echo "### Execution Log" >> "$RESULTS_FILE"
echo '```' >> "$RESULTS_FILE"

info "Running NPM mode tests..."
if MONGODB_TEST_URI="$URI" npm test 2>&1 | tee -a "$RESULTS_FILE"; then
  NPM_EXIT=0
  success "NPM tests passed"
  echo "" | tee -a "$RESULTS_FILE"
  echo "**Status**: ✅ PASS" >> "$RESULTS_FILE"
else
  NPM_EXIT=$?
  error "NPM tests failed (exit code: $NPM_EXIT)"
  echo "**Status**: ❌ FAIL (exit code: $NPM_EXIT)" >> "$RESULTS_FILE"
fi

echo '```' >> "$RESULTS_FILE"

# Step 4: Summary
echo "" | tee -a "$RESULTS_FILE"
echo "---" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"
echo "## Summary" | tee -a "$RESULTS_FILE"

CLI_STATUS=$([ $CLI_EXIT -eq 0 ] && echo "✅ PASS" || echo "❌ FAIL")
NPM_STATUS=$([ $NPM_EXIT -eq 0 ] && echo "✅ PASS" || echo "❌ FAIL")

echo "- **CLI Mode**: $CLI_STATUS" | tee -a "$RESULTS_FILE"
echo "- **NPM Mode**: $NPM_STATUS" | tee -a "$RESULTS_FILE"

OVERALL_EXIT=$((CLI_EXIT + NPM_EXIT))
if [ $OVERALL_EXIT -eq 0 ]; then
  echo "" | tee -a "$RESULTS_FILE"
  echo "## ✅ All Tests Passed!" | tee -a "$RESULTS_FILE"
  FINAL_STATUS="success"
else
  echo "" | tee -a "$RESULTS_FILE"
  echo "## ❌ Some Tests Failed" | tee -a "$RESULTS_FILE"
  FINAL_STATUS="failed"
fi

# Add summary to results
echo "" >> "$RESULTS_FILE"
echo "**Overall Status**: $([[ "$FINAL_STATUS" == "success" ]] && echo "✅ SUCCESS" || echo "❌ FAILED")" >> "$RESULTS_FILE"
echo "**CLI Exit Code**: $CLI_EXIT" >> "$RESULTS_FILE"
echo "**NPM Exit Code**: $NPM_EXIT" >> "$RESULTS_FILE"

echo ""
echo "📄 Full results saved to: $RESULTS_FILE"
cat "$RESULTS_FILE"

exit $OVERALL_EXIT
