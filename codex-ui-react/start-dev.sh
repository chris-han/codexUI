#!/bin/bash

# Start Codex UI React with Kimi proxy
# Usage: ./start-dev.sh [kimi-api-key]

cd "$(dirname "$0")"

# Load from .env file if it exists (ignoring comments)
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Check if API key provided as argument (overrides .env)
if [ -n "$1" ]; then
    export KIMI_API_KEY="$1"
fi

# Check if KIMI_API_KEY is set
if [ -z "$KIMI_API_KEY" ]; then
    echo "❌ Error: KIMI_API_KEY not set"
    echo ""
    echo "Options:"
    echo "  1. Add to .env file: KIMI_API_KEY=sk-your-key"
    echo "  2. Pass as argument: ./start-dev.sh sk-your-key"
    echo "  3. Set environment: export KIMI_API_KEY=sk-your-key"
    exit 1
fi

echo "✓ KIMI_API_KEY is set"
echo ""
echo "Starting Codex UI React with Kimi proxy..."
echo ""

# Kill any existing servers
pkill -f "bun server/kimiProxy" 2>/dev/null || true
pkill -f "bun server/standalone" 2>/dev/null || true
pkill -f "codex app-server" 2>/dev/null || true
sleep 1

# Start everything with bun run dev
bun run dev
