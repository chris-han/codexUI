#!/bin/bash

# Make sure KIMI_API_KEY is set before running:
# export KIMI_API_KEY=sk-your-key

if [ -z "$KIMI_API_KEY" ]; then
    echo "Error: KIMI_API_KEY not set"
    echo "Run: export KIMI_API_KEY=sk-your-key"
    exit 1
fi

echo "Starting proxy with Roo Code headers..."
bun server/kimiProxy.ts &
PROXY_PID=$!
sleep 3

echo "Testing proxy..."
curl -s -X POST http://localhost:3456/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"kimi-for-coding","input":"Hello","temperature":0.0}' | head -c 500

echo ""
kill $PROXY_PID 2>/dev/null || true
