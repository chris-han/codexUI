#!/bin/bash
# Start the Codex UI React app

cd /home/chris/repo/codexUI/codex-ui-react

# Kill any existing servers
pkill -f "codex app-server" 2>/dev/null || true
pkill -f "bun server/standalone" 2>/dev/null || true
sleep 2

# Start the bridge server
echo "Starting bridge server on port 3000..."
PORT=3000 bun server/standalone.ts &
SERVER_PID=$!

# Wait for server to be ready
sleep 8

# Check if server is running
if curl -s http://localhost:3000/codex-api/meta/methods > /dev/null; then
    echo "Bridge server is ready!"
else
    echo "Warning: Bridge server may not be ready yet"
fi

echo ""
echo "Starting React dev server on port 5173..."
bun run dev:frontend

# Cleanup on exit
trap "kill $SERVER_PID 2>/dev/null || true; pkill -f 'codex app-server' 2>/dev/null || true" EXIT
