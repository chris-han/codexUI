#!/bin/bash

export KIMI_API_KEY="${KIMI_API_KEY:-sk-kimi-AucIhM3j6Ggv63XEKr63JZunCU7Ye65wg7GAWsanQnwqp4dDzoj0SPbqQXdhBYRv}"

echo "Starting proxy..."
bun server/kimiProxy.ts &
PROXY_PID=$!
sleep 3

echo "Testing proxy..."
curl -s -X POST http://localhost:3456/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"kimi-for-coding","input":"Hello"}' | head -c 300

echo ""
kill $PROXY_PID 2>/dev/null || true
