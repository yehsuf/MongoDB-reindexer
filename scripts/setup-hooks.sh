#!/bin/bash

#
# Setup Git Hooks Script
#
# Installs pre-commit hooks to validate project structure
#

HOOKS_DIR=".git/hooks"
HOOK_TEMPLATE=".github/hooks/pre-commit"

echo "🔧 Setting up Git hooks..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not a git repository"
    exit 1
fi

# Check if hook template exists
if [ ! -f "$HOOK_TEMPLATE" ]; then
    echo "❌ Error: Hook template not found at $HOOK_TEMPLATE"
    exit 1
fi

# Copy and enable pre-commit hook
echo "Installing pre-commit hook..."
cp "$HOOK_TEMPLATE" "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-commit"

echo "✅ Pre-commit hook installed successfully!"
echo ""
echo "The hook will now run before each commit to validate project structure."
echo ""
echo "To bypass the hook (not recommended):"
echo "  git commit --no-verify"
echo ""
echo "To uninstall the hook:"
echo "  rm .git/hooks/pre-commit"
echo ""
