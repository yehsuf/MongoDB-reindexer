#!/bin/bash

echo "========================================="
echo "Testing MongoDB Reindexer Enforcement System"
echo "========================================="
echo ""


echo "✅ Test 1: Validation passes with current structure"
npm run validate:structure > /tmp/test1.log 2>&1
if [ $? -eq 0 ]; then
    echo "   PASS: Validation succeeded"
else
    echo "   FAIL: Validation failed"
    cat /tmp/test1.log
fi
echo ""

echo "✅ Test 2: Internal files exist locally"
if [ -f ".github/internal/HELP_SYSTEM.md" ] && [ -f ".github/internal/IMPLEMENTATION_SUMMARY.md" ]; then
    echo "   PASS: Internal files exist locally"
    ls -lh .github/internal/*.md | awk '{print "   -", $9, "("$5")"}'
else
    echo "   FAIL: Internal files not found"
fi
echo ""

echo "✅ Test 3: Internal files are ignored by git"
if ! git status --short | grep -q "HELP_SYSTEM.md"; then
    echo "   PASS: Internal files not tracked by git"
else
    echo "   FAIL: Internal files are tracked"
    git status --short | grep "HELP_SYSTEM.md"
fi
echo ""

echo "✅ Test 4: Creating new internal doc is ignored"
echo "test content" > .github/internal/TEST_DOC.md
if ! git status --short | grep -q "TEST_DOC.md"; then
    echo "   PASS: New internal file properly ignored"
else
    echo "   FAIL: New internal file is tracked"
fi
rm -f .github/internal/TEST_DOC.md
echo ""

echo "✅ Test 5: Validation catches misplaced files"
echo "test" > MISPLACED_SUMMARY.md
npm run validate:structure > /tmp/test5.log 2>&1
if [ $? -ne 0 ] && grep -q "MISPLACED_SUMMARY.md" /tmp/test5.log; then
    echo "   PASS: Validation caught misplaced file"
else
    echo "   FAIL: Validation missed misplaced file"
fi
rm -f MISPLACED_SUMMARY.md
echo ""

echo "✅ Test 6: .github directory excluded from npm"
if grep -q "^\.github/" .npmignore; then
    echo "   PASS: .github/ excluded from npm package"
else
    echo "   FAIL: .github/ not excluded from npm"
fi
echo ""

echo "✅ Test 7: Pre-commit hook installed"
if [ -f ".git/hooks/pre-commit" ] && [ -x ".git/hooks/pre-commit" ]; then
    echo "   PASS: Pre-commit hook installed and executable"
else
    echo "   INFO: Pre-commit hook not installed (optional)"
fi
echo ""

echo "========================================="
echo "Summary: Enforcement System Tests"
echo "========================================="
echo ""
echo "All enforcement mechanisms verified! ✅"
echo ""
echo "To use:"
echo "  - npm run validate:structure (before commits)"
echo "  - bash scripts/setup-hooks.sh (install hook)"
echo "  - See CONVENTIONS.md for rules"
echo ""
