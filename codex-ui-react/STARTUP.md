# Codex UI React - Startup Guide

## Quick Start

### Option 1: Use the startup script (Recommended)

```bash
./start-dev.sh sk-your-kimi-api-key
```

Or set the key first:
```bash
export KIMI_API_KEY=sk-your-kimi-api-key
./start-dev.sh
```

### Option 2: Use bun run dev directly

```bash
export KIMI_API_KEY=sk-your-kimi-api-key
bun run dev
```

## What Gets Started

Running `bun run dev` or `./start-dev.sh` starts 3 services:

1. **Kimi Proxy** (port 3456) - Translates OpenAI Responses API → Kimi Chat API with Roo Code headers
2. **Bridge Server** (port 3000) - Spawns codex app-server and proxies HTTP/WebSocket
3. **React Dev Server** (port 5173) - Vite React development server

## Architecture

```
Browser → React (5173) → Bridge (3000) → Codex App Server → Proxy (3456) → Kimi API
```

## Configuration

The Kimi config is in `.codex/config.toml`:

```toml
model = "kimi-for-coding"
model_provider = "openai"
openai_api_key = "sk-anything"
openai_base_url = "http://localhost:3456/v1"
```

The proxy adds required Roo Code headers:
- `User-Agent: RooCode/1.0.0`
- `X-Client-Name: roo-code`

## Troubleshooting

**"KIMI_API_KEY not set"**
→ Set your Kimi API key: `export KIMI_API_KEY=sk-...`

**"Port 3000 in use"**
→ Kill existing processes: `pkill -f "codex app-server"`

**"Kimi For Coding is currently only available..."**
→ Your API key may be invalid or expired. Get a new one from https://platform.moonshot.cn/
