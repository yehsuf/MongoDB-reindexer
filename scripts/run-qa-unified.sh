#!/bin/bash
# scripts/run-qa-unified.sh
# Unified QA execution script for MongoDB Reindexer
# Handles both CLI and NPM test modes

set -e

# Ensure we are in the project root
cd "$(dirname "$0")/.."

# Default values
MODE=""
REPORT_DIR="test-reports/cluster"

# Function to display help
show_help() {
  echo "Usage: $0 --mode <cli|npm> [options]"
  echo ""
  echo "Options:"
  echo "  --mode <cli|npm>    Specify test mode:"
  echo "                      cli: Runs CLI-based test suite (scripts/qa-cluster-test.sh)"
  echo "                      npm: Runs NPM-based usage tests (scripts/qa-cluster-validation.sh)"
  echo "  --help              Show this help message"
  echo ""
  echo "Environment:"
  echo "  Uses .env.test for configuration if available."
  echo "  Reports are saved to test-reports/cluster/"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --help)
      show_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      show_help
      exit 1
      ;;
  esac
done

# Validate mode
if [[ -z "$MODE" ]]; then
  echo "Error: --mode is required."
  show_help
  exit 1
fi

if [[ "$MODE" != "cli" && "$MODE" != "npm" ]]; then
  echo "Error: Invalid mode '$MODE'. Must be 'cli' or 'npm'."
  show_help
  exit 1
fi

# Load environment variables
if [ -f .env.test ]; then
  echo "Loading environment from .env.test"
  # Export variables from .env.test
  set -o allexport
  source .env.test
  set +o allexport
else
  echo "Warning: .env.test not found. Expecting variables in environment."
fi

# Validate environment variables
if [[ -z "$MONGODB_URI" ]]; then
  echo "Error: MONGODB_URI is not set."
  exit 1
fi

if [[ -z "$MONGODB_DATABASE" ]]; then
  echo "Error: MONGODB_DATABASE is not set."
  exit 1
fi

# Setup report directory
# Ensure absolute path for REPORT_DIR if desirable, or relative to root
# Since we cd to root at start, relative path is fine.
mkdir -p "$REPORT_DIR"
export REPORT_DIR="$PWD/$REPORT_DIR"

# Mask URI for display
MASKED_URI=$(echo "$MONGODB_URI" | sed -E 's|://[^@]+@|://****@|')

echo "Running QA Unified in '$MODE' mode..."
echo "  Report Directory: $REPORT_DIR"
echo "  Target Cluster:   $MASKED_URI"
echo "  Target Database:  $MONGODB_DATABASE"
echo ""

# Execute based on mode
if [[ "$MODE" == "cli" ]]; then
  echo ">> Invoking CLI tests (scripts/qa-cluster-test.sh)..."
  if [ -f "scripts/qa-cluster-test.sh" ]; then
    ./scripts/qa-cluster-test.sh "$MONGODB_URI" "$MONGODB_DATABASE"
  else
    echo "Error: scripts/qa-cluster-test.sh not found."
    exit 1
  fi
elif [[ "$MODE" == "npm" ]]; then
  echo ">> Invoking Library/NPM validation (scripts/qa-cluster-validation.sh)..."
  if [ -f "scripts/qa-cluster-validation.sh" ]; then
    ./scripts/qa-cluster-validation.sh "$MONGODB_URI" "$MONGODB_DATABASE"
  else
    echo "Error: scripts/qa-cluster-validation.sh not found."
    exit 1
  fi
fi

echo ""
echo "Unified QA execution complete."
