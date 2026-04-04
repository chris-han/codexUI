#!/bin/bash
cd /home/chris/repo/codexUI/codex-ui-react

# Check if KIMI_API_KEY is set
if [ -z "$KIMI_API_KEY" ]; then
    echo "Error: KIMI_API_KEY environment variable not set"
    echo "Run: export KIMI_API_KEY=sk-your-kimi-key"
    exit 1
fi

echo "Stopping existing servers..."
pkill -f "bun server/standalone" 2>/dev/null || true
pkill -f "bun server/kimiProxy" 2>/dev/null || true
pkill -f "codex app-server" 2>/dev/null || true
sleep 2

echo "Setting up Kimi proxy..."

echo "Starting Kimi proxy on port 3456..."
bun server/kimiProxy.ts &
PROXY_PID=$!
sleep 2

echo "Starting bridge server..."
PORT=3000 bun server/standalone.ts &
SERVER_PID=$!
sleep 5

echo ""
echo "Testing proxy..."
curl -s http://localhost:3456/health && echo "Proxy is ready!"

echo ""
echo "Testing bridge server..."
curl -s http://localhost:3000/codex-api/meta/methods && echo "Bridge is ready!"

echo ""
echo "=== All services running ==="
echo "Kimi Proxy:    http://localhost:3456"
echo "Bridge Server: http://localhost:3000"
echo ""
echo "Start React app with: bun run dev:frontend"
echo ""

# Cleanup on exit
trap "kill $PROXY_PID $SERVER_PID 2>/dev/null || true; pkill -f 'codex app-server' 2>/dev/null || true" EXIT

wait
