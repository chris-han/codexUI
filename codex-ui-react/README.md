# Codex UI - React

A React-based web interface for OpenAI Codex.

## Prerequisites

- Node.js 18+ or Bun
- `codex` CLI installed and in PATH
- Logged into codex (`codex login`)

## Development

Start both the bridge server and React dev server:

```bash
bun run dev
```

Or start them separately:

```bash
# Terminal 1 - Bridge server
bun run server

# Terminal 2 - React dev server
bun run dev:frontend
```

This starts:
- Bridge server on http://localhost:3000
- React dev server on http://localhost:5173

## Architecture

```
Browser (React) ←→ Vite Dev Server ←→ Bridge Server ←→ codex app-server
                (port 5173)         (port 3000)       (stdio)
```

The bridge server (`server/standalone.ts`) spawns `codex app-server` as a child process and proxies HTTP/WebSocket requests to it via JSON-RPC over stdio.

## Production Build

```bash
bun run build
```

Creates a static build in `dist/`. The bridge server can serve these static files.

## Features

- Thread management (list, create, archive, fork)
- Real-time message streaming via WebSocket/SSE
- Server request approvals
- Model and reasoning effort selection
- Skills hub
- Responsive sidebar layout
