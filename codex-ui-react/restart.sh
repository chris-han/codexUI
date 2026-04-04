#!/bin/bash
cd /home/chris/repo/codexUI/codex-ui-react

echo "Stopping existing servers..."
pkill -f "bun server/standalone" 2>/dev/null || true
pkill -f "codex app-server" 2>/dev/null || true
sleep 2

echo "Starting server with Kimi config from .codex/config.toml..."
PORT=3000 bun server/standalone.ts &
sleep 5

echo "Testing server..."
curl -s http://localhost:3000/codex-api/meta/methods && echo "Server is ready!"

echo ""
echo "Now start the React app with: bun run dev:frontend"
