#!/bin/bash
cd /home/chris/repo/codexUI/codex-ui-react

# Kill any existing servers
pkill -f "codex app-server" 2>/dev/null || true
pkill -f "bun server/standalone" 2>/dev/null || true
sleep 2

# Start the server
PORT=3000 bun server/standalone.ts > /tmp/server_final.log 2>&1 &
SERVER_PID=$!
echo "Server started with PID: $SERVER_PID"

sleep 10

echo "=== Testing meta/methods ==="
curl -s http://localhost:3000/codex-api/meta/methods
echo ""

echo "=== Testing thread/list ==="
curl -s -X POST http://localhost:3000/codex-api/rpc \
  -H "Content-Type: application/json" \
  -d '{"method":"thread/list","params":{"includeArchived":false}}' | head -c 150
echo ""

echo "=== Server log ==="
tail -15 /tmp/server_final.log
