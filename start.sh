#!/bin/bash

# Set environment variables if needed
# export CLAUDE_CLI_NAME="/custom/path/to/claude"
export MCP_CLAUDE_DEBUG="false" # Disable debug logging for default

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

# Run the compiled JavaScript file for npm packages OR TypeScript for local development
if [ -f "dist/server.js" ]; then
    node dist/server.js
elif [ -f "src/server.ts" ] && command -v tsx >/dev/null 2>&1; then
    npx tsx src/server.ts
else
    echo "Error: Neither dist/server.js nor src/server.ts found"
    exit 1
fi