#!/bin/bash
pkill -f "codex app-server" 2>/dev/null
pkill -f "bun server" 2>/dev/null
sleep 2

export KIMI_API_KEY="sk-kimi-AucIhM3j6Ggv63XEKr63JZunCU7Ye65wg7GAWsanQnwqp4dDzoj0SPbqQXdhBYRv"

bun server/kimiProxy.ts > /tmp/proxy.log 2>&1 &
sleep 2

PORT=3000 bun server/standalone.ts > /tmp/bridge.log 2>&1 &
sleep 5

curl -s -X POST http://localhost:3000/codex-api/rpc \
  -H "Content-Type: application/json" \
  -d '{"method":"thread/start","params":{"cwd":"/home/chris/repo/codexUI/user_threads/proxy-test"}}' > /dev/null

echo "=== PROXY LOG ==="
cat /tmp/proxy.log | tail -20

echo ""
echo "=== BRIDGE LOG ==="
cat /tmp/bridge.log | tail -20

pkill -f "bun server" 2>/dev/null || true
