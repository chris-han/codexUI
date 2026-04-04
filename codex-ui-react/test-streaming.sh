#!/bin/bash
export KIMI_API_KEY="sk-kimi-AucIhM3j6Ggv63XEKr63JZunCU7Ye65wg7GAWsanQnwqp4dDzoj0SPbqQXdhBYRv"
pkill -f "bun server/kimiProxy" 2>/dev/null || true
sleep 1
bun server/kimiProxy.ts &
sleep 2
echo "=== Testing streaming ==="
curl -s -N http://localhost:3456/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"kimi-for-coding","input":"Hello","stream":true}' | head -c 500
echo ""
kill %1 2>/dev/null || true
