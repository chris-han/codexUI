#!/bin/bash
pkill -f "codex app-server" 2>/dev/null
sleep 1
PORT=3000 bun server/standalone.ts > /tmp/bridge.log 2>&1 &
sleep 5
curl -s -X POST http://localhost:3000/codex-api/rpc -H "Content-Type: application/json" -d '{"method":"thread/start","params":{"cwd":"/home/chris/repo/codexUI/user_threads/log-test"}}' > /dev/null
sleep 2
cat /tmp/bridge.log | tail -30
pkill -f "bun server" 2>/dev/null || true
