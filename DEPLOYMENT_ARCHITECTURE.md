# Codex UI Deployment Architecture

## Overview

Codex UI is a full-stack React application that provides a web interface for OpenAI's Codex CLI. It consists of:

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: Express.js server with WebSocket support
- **AI Bridge**: Proxies requests to AI providers (Kimi/Azure OpenAI)
- **IM Integration**: Optional Feishu/Lark bot integration

Codex Bridge ──stdio/JSON-RPC──► codex app-server ──HTTP──► Kimi Proxy ──HTTP──► Kimi/Azure API

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User Browser  │────▶│  React Frontend │────▶│  Express API    │
│                 │◄────│   (Vite Build)  │◄────│  (standalone.ts)│
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         │ JSON-RPC
                                                         │ (stdio)
                                                         ▼
                                               ┌─────────────────┐
                                               │  Codex Bridge   │
                                               │ (spawns codex   │
                                               │  app-server)    │
                                               └────────┬────────┘
                                                        │
                                                        │ HTTP
                                              ┌─────────┴─────────┐
                                              │                   │
                                              ▼                   ▼
                                    ┌─────────────────┐  ┌─────────────────┐
                                    │  Kimi Proxy     │  │  Feishu/Lark    │
                                    │  (kimiProxy.ts) │  │  (IM Bridge)    │
                                    │  :3456          │  │                 │
                                    └────────┬────────┘  └─────────────────┘
                                             │
                              ┌──────────────┴──────────────┐
                              │                             │
                              ▼                             ▼
                    ┌─────────────────┐       ┌─────────────────┐
                    │  Kimi API       │       │ Azure OpenAI    │
                    │  (OpenAI-compat)│       │ (Optional)      │
                    │  api.kimi.com   │       │                 │
                    └─────────────────┘       └─────────────────┘
```

## Project Structure

```
codexUI/
├── codex-ui-react/              # Main application
│   ├── src/                     # React frontend source
│   │   ├── components/          # UI components
│   │   ├── hooks/               # Custom React hooks
│   │   ├── lib/                 # Utility functions
│   │   └── store/               # Zustand state management
│   ├── server/                  # Backend server
│   │   ├── standalone.ts        # Main Express server
│   │   ├── kimiProxy.ts         # Kimi API proxy
│   │   └── im-bridge/           # IM integration (Feishu)
│   ├── dist/                    # Production build output
│   ├── package.json             # Dependencies & scripts
│   └── vite.config.ts           # Vite configuration
├── render.yaml                  # Render.com Blueprint
└── DEPLOYMENT_ARCHITECTURE.md   # This file
```

## Architecture Components

### 1. Frontend (React + Vite)

**Build Output**: Static files in `dist/` directory

**Key Features**:
- CodeMirror editor for code viewing/editing
- Markdown rendering with syntax highlighting
- File browser with workspace management
- Real-time updates via WebSocket
- Skills marketplace integration

**Build Process**:
```bash
bun install
bun run build  # Outputs to dist/
```

### 2. Backend (Express.js)

**Entry Point**: `server/standalone.ts`

**Responsibilities**:
- Serve static frontend files
- Proxy API requests to Codex CLI
- Manage workspace roots and user files
- Handle file uploads and downloads
- WebSocket server for real-time events
- IM bridge for external integrations

**API Endpoints**:
| Endpoint | Description |
|----------|-------------|
| `POST /codex-api/rpc` | Main RPC interface for Codex |
| `GET /codex-api/events` | Server-sent events stream |
| `GET /codex-api/ws` | WebSocket for real-time updates |
| `GET /codex-api/settings` | User settings management |
| `POST /codex-api/upload-file` | File upload handler |
| `GET /codex-api/skills-hub` | Skills marketplace |

### 3. Codex Bridge

The bridge spawns the Codex CLI `app-server` and communicates via JSON-RPC over stdin/stdout.

**Key Configuration**:
- Sets `OPENAI_BASE_URL: 'http://localhost:3456/v1'` to route AI requests through the local proxy
- Sets `OPENAI_API_KEY` from `KIMI_API_KEY` or `AZURE_OPENAI_API_KEY`
- The Codex CLI thinks it's talking to OpenAI, but the proxy translates to Kimi/Azure format

### 4. Kimi Proxy (kimiProxy.ts)

A separate Express server running on port 3456 that translates between OpenAI Responses API and Kimi/Azure Chat Completions API.

**Key Responsibilities**:
- Converts OpenAI Responses API format → Kimi/Azure Chat Completions format
- Handles streaming responses (SSE and WebSocket)
- Routes to Kimi or Azure based on model name (`gpt-4o` → Azure, others → Kimi)
- Manages tool call name sanitization (Kimi has stricter naming rules)
- Stores conversation context for multi-turn responses

**Endpoints**:
| Endpoint | Description |
|----------|-------------|
| `GET /v1/models` | Returns available models |
| `POST /v1/responses` | Main chat endpoint (OpenAI-compatible) |
| `WS /v1/responses` | WebSocket for realtime responses |
| `GET /health` | Health check |

**Why a Proxy?**
The Codex CLI expects OpenAI's Responses API format, but Kimi and Azure use Chat Completions format. The proxy sits between them to translate requests and responses.

### 5. IM Bridge (Optional)

Enables bot interactions via Feishu/Lark:
- Receives webhook events from Feishu
- Creates Codex sessions per user
- Sends formatted card replies

## Deployment Options

### Option 1: Render.com (Recommended)

**Prerequisites**:
- Render account with payment method
- Git repository pushed to GitHub/GitLab

**Deployment Steps**:

1. **Using Blueprint** (`render.yaml`):
   ```yaml
   # Already created in repo root
   render blueprints apply
   ```

2. **Using CLI**:
   ```bash
   render services create \
     --name codex-ui-react \
     --type web_service \
     --runtime node \
     --plan starter \
     --repo https://github.com/chris-han/codexUI.git \
     --branch react \
     --root-directory codex-ui-react \
     --build-command 'curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install && bun run build' \
     --start-command 'export PATH="$HOME/.bun/bin:$PATH" && bun run server' \
     --env-var "NODE_ENV=production" \
     --env-var "PORT=10000"
   ```

3. **Configure Environment Variables**:
   - `KIMI_API_KEY` (required)
   - `AZURE_OPENAI_API_KEY` (optional)
   - `AZURE_OPENAI_ENDPOINT` (optional)
   - `IM_FEISHU_APP_ID` / `IM_FEISHU_APP_SECRET` (optional)

### Option 2: Docker Deployment

**Dockerfile**:
```dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "server"]
```

**Build & Run**:
```bash
docker build -t codex-ui .
docker run -p 3000:3000 \
  -e KIMI_API_KEY=your-key \
  -v codex-data:/var/render \
  codex-ui
```

### Option 3: Self-Hosted (VPS/VM)

**Requirements**:
- Node.js 18+ or Bun runtime
- 1GB+ RAM
- Persistent storage for user data

**Setup**:
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Clone and build
git clone https://github.com/chris-han/codexUI.git
cd codexUI/codex-ui-react
bun install
bun run build

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start with process manager (PM2)
bun run server
```

## Environment Variables

### Required
| Variable | Description | Example |
|----------|-------------|---------|
| `KIMI_API_KEY` | Kimi API key from platform.moonshot.cn | `sk-kimi-...` |
| `PORT` | Server port | `10000` |

### Optional - Azure OpenAI
| Variable | Description |
|----------|-------------|
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_ENDPOINT` | Azure endpoint URL |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Deployment name |
| `AZURE_OPENAI_CHAT_DEPLOYMENT_NAME` | Chat deployment name |
| `AZURE_OPENAI_API_VERSION` | API version |

### Optional - Feishu/Lark Integration
| Variable | Description | Default |
|----------|-------------|---------|
| `IM_ENABLED_CHANNELS` | Comma-separated list | `feishu` |
| `IM_FEISHU_ENABLED` | Enable Feishu bot | `false` |
| `IM_FEISHU_APP_ID` | Feishu app ID | - |
| `IM_FEISHU_APP_SECRET` | Feishu app secret | - |
| `IM_FEISHU_DOMAIN` | Feishu domain | - |
| `IM_DEFAULT_MODEL` | Default AI model | `kimi-for-coding` |

### Optional - Paths
| Variable | Description | Default |
|----------|-------------|---------|
| `CODEXUI_CODEX_HOME` | Codex home directory | `/var/render/codex` |
| `CODEXUI_USER_FILES_PATH` | User files directory | `/var/render/user_files` |
| `CODEXUI_USER_THREADS_PATH` | User threads directory | `/var/render/user_threads` |

## Data Persistence

### Persistent Directories

The application stores user data in these locations:

```
/var/render/                    # Mount point (Render disk)
├── codex/
│   ├── skills/                 # Installed skills
│   ├── memories/               # User memories
│   ├── sessions/               # Active sessions
│   └── archived_sessions/      # Archived sessions
├── user_files/                 # User-created files
└── user_threads/               # Thread metadata
```

**Important**: These directories must be on a persistent volume. On Render, use the disk configuration in `render.yaml`.

## Security Considerations

### API Keys
- Never commit API keys to git
- Use Render's environment variable encryption
- Rotate keys regularly

### Network Security
- Enable HTTPS (Render provides this automatically)
- Use IP allowlists if needed (`--ip-allow-list`)
- Consider adding authentication middleware for public deployments

### Sandbox Modes
The Codex CLI supports two sandbox modes:

1. **`workspace-write`** (default): Restricts writes to configured directories
2. **`danger-full-access`**: Full filesystem access (not recommended for multi-user)

## Monitoring & Logs

### Render Dashboard
View logs at: https://dashboard.render.com/web/{service-id}/logs

### CLI
```bash
render logs --service codex-ui-react --follow
```

### Health Check
The server responds to requests at the root path (`/`).

## Troubleshooting

### Build Failures
```bash
# Clean and rebuild
rm -rf node_modules dist bun.lock
bun install
bun run build
```

### Port Already in Use
```bash
# Find and kill process
lsof -ti:3457 | xargs kill -9
```

### Missing API Key
If you see "Proxy health check failed", verify:
- `KIMI_API_KEY` is set in environment
- Key is valid at https://platform.moonshot.cn/

### Codex CLI Not Found
The server tries to find Codex CLI in this order:
1. `CODEXUI_CODEX_COMMAND` environment variable
2. Local build in `../codex` directory
3. Global `codex` command
4. `bunx @openai/codex`

## Scaling Considerations

### Vertical Scaling
- Increase Render plan (Starter → Standard → Pro)
- More RAM allows larger AI model contexts

### Horizontal Scaling
**Note**: Codex UI is currently designed for single-instance deployment due to:
- Local filesystem state (sessions, skills)
- Single Codex CLI process

For multi-user deployments, consider:
- Session affinity/sticky sessions
- Shared storage (NFS/S3 for user files)
- Separate Codex CLI per user session

## Cost Estimates (Render.com)

| Plan | Instance | Disk | Monthly Cost |
|------|----------|------|--------------|
| Starter | 512MB RAM | N/A | ~$7 |
| Standard | 2GB RAM | 5GB | ~$25 |
| Pro | 4GB RAM | 10GB | ~$85 |

**Note**: Starter plan does not support persistent disks. Use Standard+ for production.
