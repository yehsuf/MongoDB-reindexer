#!/bin/bash
# Branch Comparison Helper Script
# Usage: bash scripts/compare-branches.sh branch1 branch2

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get branch names from arguments or use defaults
BRANCH1=${1:-"copilot/add-zero-downtime-index-rebuilding"}
BRANCH2=${2:-"copilot/add-zero-downtime-index-rebuilding-v2"}

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}         MongoDB Reindexer - Branch Comparison          ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Comparing: ${GREEN}${BRANCH1}${NC} vs ${GREEN}${BRANCH2}${NC}"
echo ""

# Check if branches exist
echo -e "${YELLOW}Checking if branches exist...${NC}"
if ! git rev-parse --verify "$BRANCH1" >/dev/null 2>&1; then
    echo -e "${RED}✗ Branch '$BRANCH1' does not exist${NC}"
    exit 1
fi

if ! git rev-parse --verify "$BRANCH2" >/dev/null 2>&1; then
    echo -e "${RED}✗ Branch '$BRANCH2' does not exist${NC}"
    echo -e "${YELLOW}ℹ Available branches:${NC}"
    git branch -a
    exit 1
fi

echo -e "${GREEN}✓ Both branches exist${NC}"
echo ""

# Show current branch
echo -e "${YELLOW}Current branch:${NC}"
git branch --show-current
echo ""

# Commit information
echo -e "${BLUE}═══ Commit Information ═══${NC}"
echo ""
echo -e "${YELLOW}$BRANCH1:${NC}"
git log -1 --oneline "$BRANCH1"
echo ""
echo -e "${YELLOW}$BRANCH2:${NC}"
git log -1 --oneline "$BRANCH2"
echo ""

# File differences
echo -e "${BLUE}═══ File Changes ═══${NC}"
echo ""
echo -e "${YELLOW}Files changed between branches:${NC}"
git diff --name-status "$BRANCH1".."$BRANCH2"
echo ""

# Count changes
ADDED=$(git diff --name-status "$BRANCH1".."$BRANCH2" | grep -c "^A" || true)
MODIFIED=$(git diff --name-status "$BRANCH1".."$BRANCH2" | grep -c "^M" || true)
DELETED=$(git diff --name-status "$BRANCH1".."$BRANCH2" | grep -c "^D" || true)

echo -e "${GREEN}Added files: $ADDED${NC}"
echo -e "${YELLOW}Modified files: $MODIFIED${NC}"
echo -e "${RED}Deleted files: $DELETED${NC}"
echo ""

# Commit count difference
echo -e "${BLUE}═══ Commit Differences ═══${NC}"
echo ""
COMMITS=$(git rev-list --count "$BRANCH1".."$BRANCH2")
echo -e "${YELLOW}Commits in $BRANCH2 not in $BRANCH1:${NC} $COMMITS"
echo ""

if [ "$COMMITS" -gt 0 ]; then
    echo -e "${YELLOW}Recent commits:${NC}"
    git log --oneline "$BRANCH1".."$BRANCH2" | head -10
    echo ""
fi

# Statistics
echo -e "${BLUE}═══ Code Statistics ═══${NC}"
echo ""

echo -e "${YELLOW}Lines of code in $BRANCH1:${NC}"
git show "$BRANCH1":src/cli.ts "$BRANCH1":src/index.ts "$BRANCH1":src/types.ts "$BRANCH1":src/utils.ts 2>/dev/null | wc -l || echo "N/A"

echo -e "${YELLOW}Lines of code in $BRANCH2:${NC}"
git show "$BRANCH2":src/cli.ts "$BRANCH2":src/index.ts "$BRANCH2":src/types.ts "$BRANCH2":src/utils.ts 2>/dev/null | wc -l || echo "N/A"
echo ""

# Check package.json differences
echo -e "${BLUE}═══ Package.json Comparison ═══${NC}"
echo ""
if git diff --quiet "$BRANCH1".."$BRANCH2" -- package.json; then
    echo -e "${GREEN}✓ No changes in package.json${NC}"
else
    echo -e "${YELLOW}Changes detected in package.json:${NC}"
    git diff "$BRANCH1".."$BRANCH2" -- package.json | grep -E "^\+|^\-" | grep -v "^\+\+\+|^\-\-\-" | head -20
fi
echo ""

# Show detailed diff for key files
echo -e "${BLUE}═══ Generate Detailed Diff ═══${NC}"
echo ""
echo -e "${YELLOW}To see full diff, run:${NC}"
echo "  git diff $BRANCH1..$BRANCH2"
echo ""
echo -e "${YELLOW}To see diff for specific file:${NC}"
echo "  git diff $BRANCH1..$BRANCH2 -- src/index.ts"
echo ""
echo -e "${YELLOW}To compare specific files side by side:${NC}"
echo "  git difftool $BRANCH1..$BRANCH2 -- src/index.ts"
echo ""

# Create comparison report
echo -e "${BLUE}═══ Saving Comparison Report ═══${NC}"
echo ""

REPORT_FILE=".github/internal/COMPARISON_$(date +%Y%m%d_%H%M%S).md"
mkdir -p .github/internal

cat > "$REPORT_FILE" << EOF
# Branch Comparison Report

**Date**: $(date +%Y-%m-%d\ %H:%M:%S)  
**Comparison**: \`$BRANCH1\` vs \`$BRANCH2\`

## Branch Information

### $BRANCH1
\`\`\`
$(git log -1 --format="%h - %an, %ar : %s" "$BRANCH1")
\`\`\`

### $BRANCH2
\`\`\`
$(git log -1 --format="%h - %an, %ar : %s" "$BRANCH2")
\`\`\`

## File Changes

\`\`\`
$(git diff --name-status "$BRANCH1".."$BRANCH2")
\`\`\`

**Summary**:
- Added: $ADDED files
- Modified: $MODIFIED files
- Deleted: $DELETED files

## Commits

**Commits in $BRANCH2 not in $BRANCH1**: $COMMITS

\`\`\`
$(git log --oneline "$BRANCH1".."$BRANCH2" | head -20)
\`\`\`

## Key File Differences

### package.json
\`\`\`diff
$(git diff "$BRANCH1".."$BRANCH2" -- package.json 2>/dev/null || echo "No changes")
\`\`\`

### src/index.ts
\`\`\`diff
$(git diff --stat "$BRANCH1".."$BRANCH2" -- src/index.ts 2>/dev/null || echo "No changes")
\`\`\`

## Commands to Explore Further

\`\`\`bash
# View full diff
git diff $BRANCH1..$BRANCH2

# View specific file
git diff $BRANCH1..$BRANCH2 -- src/index.ts

# Interactive difftool
git difftool $BRANCH1..$BRANCH2

# Merge comparison
git merge-base $BRANCH1 $BRANCH2
\`\`\`

---
*Generated by scripts/compare-branches.sh*
EOF

echo -e "${GREEN}✓ Report saved to: $REPORT_FILE${NC}"
echo ""

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Comparison complete!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
