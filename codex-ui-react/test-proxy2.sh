#!/bin/bash

export KIMI_API_KEY="${KIMI_API_KEY:-sk-kimi-AucIhM3j6Ggv63XEKr63JZunCU7Ye65wg7GAWsanQnwqp4dDzoj0SPbqQXdhBYRv}"

echo "Testing proxy with moonshot-v1-32k..."
curl -s -X POST http://localhost:3456/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"moonshot-v1-32k","input":"Hello, how are you?","temperature":0.0}' | head -c 500

echo ""
