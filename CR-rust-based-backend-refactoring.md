# CR: Rust-Based Backend Refactoring

## Overview

This document describes the migration from the TypeScript/Express backend (`standalone.ts`) to the Rust-based backend (`codex-server`). It includes detailed code mappings showing how each TypeScript function is remapped to Rust.

## Architecture Comparison

### TypeScript/Express Architecture (Legacy)

```
┌─────────────────┐      ┌─────────────────────────────┐      ┌─────────────────────────┐
│  React Frontend │─────▶│  Express Server (standalone)│─────▶│  Codex Bridge           │
│  (Browser)      │◀─────│  :3457                      │◀─────│  (spawns codex-cli)     │
└─────────────────┘      └─────────────────────────────┘      └─────────────────────────┘
         │                            │                                    │
         │ HTTP/WebSocket             │ JSON-RPC                         │ stdio
         │                          ┌─┴──────────┐                    ┌──┴──────────┐
         │                          │  Express   │                    │  codex-cli  │
         │                          │  Routes    │                    │  app-server │
         │                          │  - rpc     │                    │             │
         │                          │  - events  │                    │             │
         │                          │  - upload  │                    │             │
         │                          └────────────┘                    └─────────────┘
```

### Rust Architecture (New)

```
┌─────────────────┐      ┌─────────────────────────────┐      ┌─────────────────────────┐
│  React Frontend │─────▶│  codex-server (axum)        │─────▶│  InProcessAppServerClient│
│  (Browser)      │◀─────│  :3458                      │◀─────│  (upstream codex)       │
└─────────────────┘      └─────────────────────────────┘      └─────────────────────────┘
         │                            │                                    │
         │ HTTP/WebSocket             │ JSON-RPC                         │ LLM API
         │                          ┌─┴──────────┐                    ┌──┴──────────┐
         │                          │  Axum      │                    │  codex-cli  │
         │                          │  Handlers  │                    │  core       │
         │                          │  - rpc     │                    │  sandbox    │
         │                          │  - ws      │                    │  tools      │
         │                          │  - upload  │                    │             │
         │                          └────────────┘                    └─────────────┘
```

---

## Key Differences

| Aspect | TypeScript/Express | Rust (axum) |
|--------|-------------------|-------------|
| **HTTP Framework** | Express.js | axum |
| **Process Model** | Spawns codex-cli as child process | In-process `InProcessAppServerClient` |
| **Communication** | stdio/JSON-RPC | Direct method calls |
| **State Management** | Module-level variables | `AppState` struct with RwLock |
| **Client Lifecycle** | One bridge instance | Per-user client instances |
| **Concurrency** | Node.js event loop | Tokio async runtime |

---

## Module Mapping

### 1. Server Initialization

#### TypeScript (standalone.ts)
```typescript
// Entry point - creates Express app
const app = express();
app.use(cors());
app.use(express.json());

// Bridge spawns codex-cli
class CodexBridge {
  private process: ChildProcessWithoutNullStreams | null = null;

  async start(): Promise<void> {
    const codexInvocation = resolveCodexInvocation();
    
    this.process = spawn(
      codexInvocation.command,
      [...codexInvocation.args, 'app-server'],
      { stdio: ['pipe', 'pipe', 'inherit'], env: proxyEnv }
    );

    // Communicate via stdio
    this.process.stdout.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });
  }

  async call(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.requestId;
    const request = { jsonrpc: '2.0', id, method, params };
    
    this.process?.stdin?.write(JSON.stringify(request) + '\n');
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
    });
  }
}
```

#### Rust (main.rs)
```rust
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing (like console.log)
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env()
            .or_else(|_| EnvFilter::try_new("info,codex_server=debug"))
            .unwrap())
        .init();

    // Load configuration
    let config = load_config().await?;

    // Create shared state (replaces module-level variables)
    let state = Arc::new(AppState::new(config).await?);

    // Create router
    let app = create_router(state);

    // Start server
    let port = std::env::var("PORT").unwrap_or_else(|_| "3457".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;

    axum::serve(listener, app).await?;
    Ok(())
}

fn create_router(state: Arc<AppState>) -> Router {
    let cors = tower_http::cors::CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    Router::new()
        .route("/health", get(health_handler))
        .route("/codex-api/rpc", post(rpc_handler))
        .route("/codex-api/events", get(events_handler))
        .route("/codex-api/ws", get(websocket::ws_handler))
        // ... other routes
        .layer(cors)
        .with_state(state)
}
```

---

### 2. State Management

#### TypeScript (Module-level variables)
```typescript
// Global mutable state
let currentCodexHome = resolveCodexHome();
let userFilesPath = resolveUserFilesPath();
let userThreadsPath = resolveUserThreadsPath();

// Bridge singleton
const bridge = new CodexBridge();

// Pending requests (in-memory)
let pendingServerRequests: unknown[] = [];

function resolveCodexHome(): string {
  const envHome = process.env.CODEXUI_CODEX_HOME?.trim();
  if (envHome) return envHome;
  const saved = readSettingsSync();
  if (saved.codexHome?.trim()) return saved.codexHome.trim();
  return DEFAULT_CODEX_HOME;
}
```

#### Rust (AppState struct)
```rust
// state.rs
pub struct AppState {
    pub config: ServerConfig,
    /// Per-user codex clients (user_id -> client)
    pub clients: RwLock<HashMap<String, Arc<RwLock<InProcessAppServerClient>>>>,
    /// Global settings with RwLock for thread-safe access
    pub settings: RwLock<Settings>,
}

#[derive(Debug, Clone)]
pub struct Settings {
    pub codex_home: String,
    pub user_files_path: String,
    pub user_threads_path: String,
    pub sandbox_mode: String,
    pub network_access: bool,
    pub markets: Vec<Market>,
}

impl AppState {
    pub async fn new(config: ServerConfig) -> anyhow::Result<Self> {
        let settings = Settings {
            codex_home: config.codex_home.clone(),
            user_files_path: config.user_files_path.clone(),
            user_threads_path: config.user_threads_path.clone(),
            ..Settings::default()
        };

        // Create directories
        tokio::fs::create_dir_all(&config.codex_home).await?;
        tokio::fs::create_dir_all(&config.user_files_path).await?;
        tokio::fs::create_dir_all(&config.user_threads_path).await?;

        Ok(Self {
            config,
            clients: RwLock::new(HashMap::new()),
            settings: RwLock::new(settings),
        })
    }

    /// Get or create client for user
    pub async fn get_client(
        &self,
        user_id: &str,
    ) -> anyhow::Result<Arc<RwLock<InProcessAppServerClient>>> {
        {
            let clients = self.clients.read().await;
            if let Some(client) = clients.get(user_id) {
                return Ok(client.clone());
            }
        }

        // Create new client
        let client = self.create_client(user_id).await?;
        let mut clients = self.clients.write().await;
        clients.insert(user_id.to_string(), client.clone());
        Ok(client)
    }

    async fn create_client(
        &self,
        user_id: &str,
    ) -> anyhow::Result<Arc<RwLock<InProcessAppServerClient>>> {
        // InProcessAppServerClient runs in same process
        let args = InProcessClientStartArgs {
            codex_home: self.config.codex_home.clone().into(),
            // ... other config
        };

        let client = InProcessAppServerClient::start(args).await?;
        Ok(Arc::new(RwLock::new(client)))
    }
}
```

---

### 3. RPC Handler

#### TypeScript (standalone.ts)
```typescript
app.post('/codex-api/rpc', async (req, res) => {
  try {
    const { method, params } = req.body;
    
    // Special handling for thread/start
    if (method === 'thread/start') {
      const cwd = params?.cwd;
      if (cwd) await mkdir(cwd, { recursive: true });
    }

    // Forward to bridge
    const result = await bridge.call(method, params);
    res.status(200).json({ result });
  } catch (error) {
    // Special error handling for thread/read
    if (method === 'thread/read' && isThreadNotLoadedError(error)) {
      try {
        await bridge.call('thread/resume', { threadId: params.threadId });
        const result = await bridge.call('thread/read', params);
        res.status(200).json({ result });
        return;
      } catch (resumeError) {
        res.status(500).json({ error: String(resumeError) });
        return;
      }
    }
    res.status(500).json({ error: String(error) });
  }
});
```

#### Rust (handlers.rs)
```rust
pub async fn rpc_handler(
    State(state): State<Arc<AppState>>,
    Json(request): Json<RpcRequest>,
) -> impl IntoResponse {
    let user_id = "default";

    // Get or create client for user
    let client = match state.get_client(user_id).await {
        Ok(client) => client,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<Value>::error(format!(
                    "Failed to initialize codex client: {}",
                    e
                ))),
            )
                .into_response();
        }
    };

    // Parse RPC request into ClientRequest enum
    let client_request = match parse_rpc_request(&request).await {
        Ok(req) => req,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<Value>::error(format!(
                    "Invalid request: {}",
                    e
                ))),
            )
                .into_response();
        }
    };

    // Call method directly (no stdio/serialization overhead)
    let client_guard = client.read().await;
    match client_guard.request(client_request).await {
        Ok(result) => {
            match result {
                Ok(json_result) => {
                    Json(RpcResponse { result: json_result }).into_response()
                }
                Err(e) => {
                    // Handle thread not loaded error (like TypeScript)
                    if e.to_string().contains("thread not loaded") {
                        drop(client_guard);
                        // Attempt resume and retry...
                    }
                    Json(ApiResponse::<Value>::error(e.to_string())).into_response()
                }
            }
        }
        Err(e) => {
            Json(ApiResponse::<Value>::error(format!(
                "RPC call failed: {}",
                e
            )))
            .into_response()
        }
    }
}

/// Parse JSON-RPC request into typed ClientRequest
async fn parse_rpc_request(request: &RpcRequest) -> anyhow::Result<ClientRequest> {
    let req = match request.method.as_str() {
        "thread/list" => {
            let params: ThreadListParams = serde_json::from_value(request.params.clone())?;
            ClientRequest::ThreadList { params }
        }
        "thread/start" => {
            let params: ThreadStartParams = serde_json::from_value(request.params.clone())?;
            ClientRequest::ThreadStart { params }
        }
        "thread/read" => {
            let params: ThreadReadParams = serde_json::from_value(request.params.clone())?;
            ClientRequest::ThreadRead { params }
        }
        "turn/start" => {
            let params: TurnStartParams = serde_json::from_value(request.params.clone())?;
            ClientRequest::TurnStart { params }
        }
        // ... other methods
        _ => anyhow::bail!("Unknown method: {}", request.method),
    };
    Ok(req)
}
```

---

### 4. Settings Management

#### TypeScript (standalone.ts)
```typescript
const SETTINGS_FILE = join(__dirname, '..', '.codex-ui-settings.json');

function readSettingsSync(): CodexUiSettings {
  try {
    const raw = readFileSync(SETTINGS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeSettingsAsync(next: CodexUiSettings): Promise<void> {
  const current = await readSettingsAsync();
  const merged = { ...current, ...next };
  await writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
}

// Routes
app.get('/codex-api/settings', async (_req, res) => {
  const settings = readSettingsSync();
  const codexHome = resolveCodexHome();
  
  res.json({
    data: {
      codexHome,
      savedCodexHome: settings.codexHome || null,
      defaultCodexHome: DEFAULT_CODEX_HOME,
      userFilesPath: resolveUserFilesPath(),
      userThreadsPath: resolveUserThreadsPath(),
      // ...
    }
  });
});

app.put('/codex-api/settings', async (req, res) => {
  const { codexHome, userFilesPath } = req.body;
  await writeSettingsAsync({ codexHome, userFilesPath });
  res.json({ ok: true });
});
```

#### Rust (handlers.rs + state.rs)
```rust
// models.rs
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsResponse {
    pub codex_home: String,
    pub saved_codex_home: Option<String>,
    pub default_codex_home: String,
    pub skills_dir: String,
    pub memories_dir: String,
    pub user_files_path: String,
    pub user_threads_path: String,
    pub sandbox_mode: String,
    pub markets: Vec<Market>,
}

#[derive(Debug, Deserialize)]
pub struct SettingsUpdate {
    pub codex_home: Option<String>,
    pub user_files_path: Option<String>,
    pub user_threads_path: Option<String>,
    pub sandbox_mode: Option<String>,
    pub markets: Option<Vec<Market>>,
}

// state.rs
impl AppState {
    pub async fn get_settings(&self) -> Settings {
        self.settings.read().await.clone()
    }

    pub async fn update_settings(&self, update: SettingsUpdate) -> anyhow::Result<()> {
        let mut settings = self.settings.write().await;
        
        if let Some(home) = update.codex_home {
            settings.codex_home = home;
            tokio::fs::create_dir_all(&settings.codex_home).await?;
        }
        if let Some(path) = update.user_files_path {
            settings.user_files_path = path;
            tokio::fs::create_dir_all(&settings.user_files_path).await?;
        }
        if let Some(path) = update.user_threads_path {
            settings.user_threads_path = path;
            tokio::fs::create_dir_all(&settings.user_threads_path).await?;
        }
        if let Some(mode) = update.sandbox_mode {
            settings.sandbox_mode = mode;
        }
        if let Some(markets) = update.markets {
            settings.markets = markets;
        }
        
        Ok(())
    }
}

// handlers.rs
pub async fn settings_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let settings = state.get_settings().await;
    
    Json(ApiResponse::success(SettingsResponse {
        codex_home: settings.codex_home.clone(),
        saved_codex_home: Some(settings.codex_home.clone()),
        default_codex_home: String::from("/tmp/codex"),
        skills_dir: format!("{}/skills", settings.codex_home),
        memories_dir: format!("{}/memories", settings.codex_home),
        user_files_path: settings.user_files_path,
        user_threads_path: settings.user_threads_path,
        sandbox_mode: settings.sandbox_mode,
        markets: settings.markets,
        // ...
    }))
}

pub async fn update_settings_handler(
    State(state): State<Arc<AppState>>,
    Json(update): Json<SettingsUpdate>,
) -> impl IntoResponse {
    match state.update_settings(update).await {
        Ok(()) => Json(ApiResponse::ok()),
        Err(e) => Json(ApiResponse::<()>::error(e.to_string())),
    }
}
```

---

### 5. File Upload Handler

#### TypeScript (standalone.ts)
```typescript
app.post('/codex-api/upload-file', async (req, res) => {
  try {
    const result = await handleFileUpload(req, res);
    // handleFileUpload processes multipart form data
    // Saves to userFilesPath
    // Returns { data: { path, label } }
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

async function handleFileUpload(req: express.Request, res: express.Response): Promise<void> {
  // Uses multer or manual buffer processing
  const contentType = req.headers['content-type'] || '';
  // ... multipart parsing logic
  const targetPath = join(userFilesPath, sanitizedFilename);
  await writeFile(targetPath, buffer);
  res.json({ data: { path: targetPath, label: filename } });
}
```

#### Rust (handlers.rs)
```rust
use axum::extract::Multipart;

pub async fn upload_file_handler(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let settings = state.get_settings().await;
    
    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap_or("unknown").to_string();
        let file_name = field.file_name().unwrap_or("unknown").to_string();
        
        let data = match field.bytes().await {
            Ok(data) => data,
            Err(e) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ApiResponse::<()>::error(format!(
                        "Failed to read file: {}",
                        e
                    ))),
                );
            }
        };

        // Sanitize and save
        let sanitized = sanitize_filename(&file_name);
        let target_path = format!("{}/{}", settings.user_files_path, sanitized);
        
        match tokio::fs::write(&target_path, &data).await {
            Ok(()) => {
                return (
                    StatusCode::OK,
                    Json(ApiResponse::success(json!({
                        "path": target_path,
                        "label": file_name,
                    }))),
                );
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiResponse::<()>::error(format!(
                        "Failed to save file: {}",
                        e
                    ))),
                );
            }
        }
    }

    (
        StatusCode::BAD_REQUEST,
        Json(ApiResponse::<()>::error("No file provided")),
    )
}
```

---

### 6. WebSocket Events

#### TypeScript (standalone.ts)
```typescript
app.get('/codex-api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendNotification = (notification: unknown) => {
    res.write(`data: ${JSON.stringify(notification)}\n\n`);
  };

  const unsubscribe = bridge.onNotification(sendNotification);

  req.on('close', () => {
    unsubscribe();
  });
});

// Also WebSocket endpoint
const wss = new WebSocketServer({ server, path: '/codex-api/ws' });
wss.on('connection', (ws) => {
  const unsubscribe = bridge.onNotification((notification) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(notification));
    }
  });
  ws.on('close', unsubscribe);
});
```

#### Rust (websocket.rs + handlers.rs)
```rust
// websocket.rs
use axum::extract::ws::{WebSocket, WebSocketUpgrade};
use futures::{SinkExt, StreamExt};

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    
    // Get client and subscribe to notifications
    let client = state.get_client("default").await.unwrap();
    let client_guard = client.read().await;
    
    // Create notification stream
    let mut notifications = client_guard.subscribe_notifications();
    drop(client_guard);

    // Forward notifications to WebSocket
    tokio::spawn(async move {
        while let Ok(notification) = notifications.recv().await {
            let msg = axum::extract::ws::Message::Text(
                serde_json::to_string(&notification).unwrap()
            );
            if sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages
    while let Some(Ok(msg)) = receiver.next().await {
        // Handle ping/pong or other client messages
    }
}

// SSE handler (alternative to WebSocket)
pub async fn events_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let client = state.get_client("default").await.unwrap();
    
    let stream = tokio_stream::wrappers::BroadcastStream::new(
        client.read().await.subscribe_notifications()
    );

    let sse_stream = stream.map(|result| {
        match result {
            Ok(notification) => {
                axum::response::sse::Event::default()
                    .data(serde_json::to_string(&notification).unwrap())
            }
            Err(_) => axum::response::sse::Event::default().data("{}"),
        }
    });

    axum::response::sse::Sse::new(sse_stream)
        .keep_alive(axum::response::sse::KeepAlive::new())
}
```

---

## Complete Route Mapping

| Endpoint | TypeScript Method | Rust Handler | File |
|----------|------------------|--------------|------|
| `GET /health` | N/A | `health_handler` | main.rs |
| `POST /codex-api/rpc` | `bridge.call()` | `rpc_handler` | handlers.rs |
| `GET /codex-api/events` | SSE stream | `events_handler` | handlers.rs |
| `GET /codex-api/ws` | WebSocketServer | `websocket::ws_handler` | websocket.rs |
| `GET /codex-api/settings` | `readSettingsSync()` | `settings_handler` | handlers.rs |
| `PUT /codex-api/settings` | `writeSettingsAsync()` | `update_settings_handler` | handlers.rs |
| `GET /codex-api/server-requests/pending` | Array lookup | `pending_requests_handler` | handlers.rs |
| `POST /codex-api/server-requests/respond` | `bridge.resolveServerRequest()` | `respond_request_handler` | handlers.rs |
| `GET /codex-api/meta/methods` | `bridge.call('meta/methods')` | `meta_methods_handler` | handlers.rs |
| `GET /codex-api/meta/notifications` | `bridge.call('meta/notifications')` | `meta_notifications_handler` | handlers.rs |
| `GET /codex-api/provider-models` | External fetch | `provider_models_handler` | handlers.rs |
| `GET /codex-api/home-directory` | `homedir()` | `home_directory_handler` | handlers.rs |
| `GET /codex-api/workspace-roots-state` | `readWorkspaceRootsState()` | `get_workspace_roots_handler` | handlers.rs |
| `PUT /codex-api/workspace-roots-state` | `writeWorkspaceRootsState()` | `put_workspace_roots_handler` | handlers.rs |
| `POST /codex-api/project-root` | `mkdir()` | `create_project_handler` | handlers.rs |
| `DELETE /codex-api/project` | `rm()` | `delete_project_handler` | handlers.rs |
| `GET /codex-api/browse-directory` | `browseDirectory()` | `browse_directory_handler` | handlers.rs |
| `POST /codex-api/upload-file` | `handleFileUpload()` | `upload_file_handler` | handlers.rs |

---

## Frontend Communication

### API Client (No Changes Required)

The frontend code in `codexGateway.ts` remains unchanged:

```typescript
// src/api/codexGateway.ts
export async function getThreadGroups(): Promise<UiProjectGroup[]> {
  const response = await rpcCall<ThreadListResponse>('thread/list', { 
    archived: false, 
    limit: 50 
  });
  const threads = response.data || [];
  return normalizeThreadsToProjectGroups(threads);
}

export async function startThread(params: {
  cwd: string;
  model?: string;
}): Promise<{ threadId: string }> {
  const result = await rpcCall<{ thread?: { id: string } }>('thread/start', {
    cwd: params.cwd,
    model: params.model,
  });
  return { threadId: result.thread?.id ?? result.id };
}
```

The only configuration change is the port:

```bash
# .env - TypeScript server
BRIDGE_PORT=3457

# .env - Rust server  
BRIDGE_PORT=3458
```

---

## Error Handling Comparison

### TypeScript
```typescript
try {
  const result = await bridge.call(method, params);
  res.status(200).json({ result });
} catch (error) {
  // Error could be from bridge (stdio closed) or codex
  res.status(500).json({ error: String(error) });
}
```

### Rust
```rust
match client_guard.request(client_request).await {
    Ok(Ok(result)) => Json(RpcResponse { result }).into_response(),
    Ok(Err(e)) => {
        // Codex returned an error
        Json(ApiResponse::<Value>::error(e.to_string())).into_response()
    }
    Err(e) => {
        // Transport/connection error
        Json(ApiResponse::<Value>::error(format!(
            "RPC call failed: {}", e
        ))).into_response()
    }
}
```

---

## Build & Run Commands

### TypeScript/Express
```bash
cd codex-ui-react
bun install
bun run server  # Port 3457
```

### Rust
```bash
cd codex/codex-rs

cargo build -p codex-server  # Debug build
cargo run -p codex-server    # Run on PORT=3458

cargo build --release -p codex-server  # Release build
```

---

## Testing

Both backends use the same regression tests:

```bash
cd codex-ui-react

# Test against TypeScript server
BRIDGE_PORT=3457 bun test tests/regression/

# Test against Rust server  
BRIDGE_PORT=3458 bun test tests/regression/
```

---

## Migration Checklist

- [x] All Express routes mapped to axum handlers
- [x] Bridge stdio communication replaced with `InProcessAppServerClient`
- [x] Module-level state replaced with `AppState` + `RwLock`
- [x] Settings persistence (JSON file)
- [x] File upload handling
- [x] WebSocket/SSE notifications
- [x] Error handling parity
- [ ] Skills Hub marketplace
- [ ] Git review endpoints
- [ ] IM Bridge integration
- [ ] Kimi Proxy integration (may remain separate)

---

## Supporting Services Architecture

### Overview

The TypeScript backend consists of three main components that need to be positioned in the new Rust architecture:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TypeScript Stack (Current)                       │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │  Kimi Proxy      │  │  Express Server  │  │  IM Bridge       │       │
│  │  (kimiProxy.ts)  │  │  (standalone.ts) │  │  (im-bridge/)    │       │
│  │  :3456           │  │  :3457           │  │  (embedded)      │       │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘       │
│           │                     │                     │                 │
│           │ OpenAI API          │ HTTP/WS             │ Feishu API      │
│           ▼                     ▼                     ▼                 │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │                    Codex Bridge                              │       │
│  │              (spawns codex-cli process)                      │       │
│  └─────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          Rust Stack (Target)                             │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │  Kimi Proxy      │  │  codex-server    │  │  IM Bridge       │       │
│  │  (kimiProxy.ts)  │  │  (Rust/axum)     │  │  (TBD - see      │       │
│  │  :3456           │  │  :3458           │  │   options below) │       │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘       │
│           │                     │                     │                 │
│           │ OpenAI API          │ In-process          │ Feishu API      │
│           ▼                     ▼                     ▼                 │
│  ┌──────────────────┐  ┌──────────────────┐                             │
│  │  Kimi/Azure API  │  │  InProcessApp    │                             │
│  │                  │  │  ServerClient    │                             │
│  └──────────────────┘  └──────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 1. Kimi Proxy (`kimiProxy.ts`)

#### Role
The Kimi Proxy is an **independent service** that translates between OpenAI's Responses API format and Kimi/Azure Chat Completions API. It runs on port 3456.

#### TypeScript Implementation
```typescript
// kimiProxy.ts - Express server
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const KIMI_BASE_URL = 'https://api.kimi.com/coding/v1';
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT?.trim() || '';

// Routes
app.get('/v1/models', (req, res) => { /* ... */ });
app.post('/v1/responses', async (req, res) => { /* ... */ });
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Starts on port 3456
app.listen(3456, () => console.log('Kimi Proxy on :3456'));
```

#### Position in Rust Architecture

**The Kimi Proxy remains unchanged** - it continues running as a separate Node.js service:

```rust
// codex-server configuration
pub struct ServerConfig {
    pub codex_home: String,
    pub user_files_path: String,
    pub user_threads_path: String,
    // Proxy configuration (passed to InProcessAppServerClient)
    pub kimi_api_key: Option<String>,
    pub azure_openai_endpoint: Option<String>,
    pub azure_openai_key: Option<String>,
}

// InProcessAppServerClient is configured to use the proxy
let client = InProcessAppServerClient::start(InProcessClientStartArgs {
    codex_home: config.codex_home.clone().into(),
    // Environment variables for the client
    env: vec![
        ("OPENAI_BASE_URL".to_string(), "http://localhost:3456/v1".to_string()),
        ("OPENAI_API_KEY".to_string(), config.kimi_api_key.clone().unwrap_or_default()),
    ],
}).await?;
```

#### Startup Sequence

**TypeScript Stack:**
```bash
# Terminal 1 - Proxy (required by both stacks)
cd codex-ui-react
bun run proxy  # Port 3456

# Terminal 2 - Express Server
bun run server  # Port 3457, connects to proxy at localhost:3456
```

**Rust Stack:**
```bash
# Terminal 1 - Proxy (same as above)
cd codex-ui-react
bun run proxy  # Port 3456

# Terminal 2 - Rust Server
cd codex/codex-rs
PORT=3458 cargo run -p codex-server  # Also connects to proxy at localhost:3456
```

#### Architecture Decision

| Aspect | Decision |
|--------|----------|
| **Status** | Keep as TypeScript service |
| **Reason** | Complex business logic for API translation; no performance bottleneck |
| **Integration** | Via `OPENAI_BASE_URL` env var passed to `InProcessAppServerClient` |
| **Future** | Could migrate to Rust if needed, but not a priority |

---

### 2. IM Bridge (`im-bridge/`)

#### Role
The IM Bridge enables Feishu/Lark bot integration. It:
- Receives webhook events from Feishu
- Creates/manages Codex sessions per user/channel
- Sends formatted card replies
- Currently **embedded in standalone.ts**

#### TypeScript Implementation
```typescript
// im-bridge/index.ts
export class IMBridge {
  private adapters: Map<string, IMAdapter> = new Map();
  private sessions: Map<string, IMSession> = new Map();
  private codexBridge: BridgeCaller;

  constructor(codexBridge: BridgeCaller, config: IMBridgeConfig) {
    this.codexBridge = codexBridge;
  }

  async start(): Promise<void> {
    // Initialize Feishu adapter
    if (this.config.feishu?.enabled) {
      const { FeishuAdapter } = await import('./adapters/feishu.js');
      await this.registerAdapter(new FeishuAdapter(this.config.feishu));
    }
  }

  private async handleMessage(msg: IMMessage): Promise<void> {
    // Get or create session
    let session = this.sessions.get(sessionKey);
    if (!session) {
      // Create thread via bridge
      const result = await this.codexBridge.call('thread/start', {
        cwd: threadCwd,
        model: this.config.defaultModel,
      });
      // Store session...
    }

    // Start turn
    await this.codexBridge.call('turn/start', {
      threadId: session.threadId,
      input: this.buildInput(msg),
    });
  }
}
```

#### Position in Rust Architecture - Three Options

##### Option 1: Keep as TypeScript Service (Recommended)

Run IM Bridge as a separate Node.js service that talks to the Rust backend via HTTP:

```typescript
// New: im-bridge-standalone.ts
import { IMBridge } from './im-bridge/index.js';

// HTTP client to Rust backend instead of direct bridge
class RustBackendClient {
  async call(method: string, params: unknown): Promise<unknown> {
    const response = await fetch('http://localhost:3458/codex-api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params }),
    });
    const data = await response.json();
    return data.result;
  }

  onNotification(callback: (n: unknown) => void): () => void {
    // Connect to Rust WebSocket
    const ws = new WebSocket('ws://localhost:3458/codex-api/ws');
    ws.onmessage = (event) => callback(JSON.parse(event.data));
    return () => ws.close();
  }
}

const bridge = new RustBackendClient();
const imBridge = new IMBridge(bridge, config);
await imBridge.start();
```

**Pros:**
- Minimal code changes
- IM Bridge logic remains in TypeScript
- Can run independently

**Cons:**
- Additional HTTP hop
- Requires separate process management

##### Option 2: Reimplement in Rust

Create a new `codex-im-bridge` crate in the Rust workspace:

```rust
// codex/codex-rs/im-bridge/src/lib.rs
pub struct ImBridge {
    client: Arc<RwLock<InProcessAppServerClient>>, // Shared with codex-server
    config: ImBridgeConfig,
    adapters: HashMap<String, Box<dyn IMAdapter>>,
}

impl ImBridge {
    pub async fn new(client: Arc<RwLock<InProcessAppServerClient>>) -> Self {
        Self { client, /* ... */ }
    }

    pub async fn start(&mut self) -> anyhow::Result<()> {
        // Initialize Feishu adapter
        if self.config.feishu.enabled {
            let adapter = FeishuAdapter::new(self.config.feishu.clone()).await?;
            self.adapters.insert("feishu".to_string(), Box::new(adapter));
        }
        Ok(())
    }

    async fn handle_message(&self, msg: ImMessage) -> anyhow::Result<()> {
        // Get or create session
        let client = self.client.read().await;
        let result = client.request(ClientRequest::ThreadStart {
            params: ThreadStartParams { cwd: thread_cwd, model },
        }).await?;
        // ...
    }
}
```

**Integration with codex-server:**
```rust
// codex-server/src/main.rs
async fn async_main() -> anyhow::Result<()> {
    let state = Arc::new(AppState::new(config).await?);
    
    // Start IM Bridge if enabled
    if env::var("IM_FEISHU_ENABLED").unwrap_or_default() == "true" {
        let im_bridge = ImBridge::new(state.get_client("default").await?);
        tokio::spawn(async move {
            im_bridge.start().await.unwrap();
        });
    }
    
    // Start HTTP server...
}
```

**Pros:**
- Single binary deployment
- Direct client access (no HTTP overhead)
- Type safety

**Cons:**
- Significant reimplementation effort
- Maintaining two codebases for IM logic

##### Option 3: Hybrid - Keep TypeScript, Add HTTP Bridge

Modify the existing IM Bridge to work with both backends:

```typescript
// im-bridge/index.ts - Modified to support both backends
interface BridgeCaller {
  call(method: string, params?: unknown): Promise<unknown>;
  onNotification(listener: (notification: unknown) => void): () => void;
  resolveServerRequest(id: number | string, result?: unknown, error?: { code?: number; message: string }): void;
}

// TypeScript bridge (original)
class CodexBridge implements BridgeCaller { /* ... */ }

// HTTP bridge for Rust backend
class RustHttpBridge implements BridgeCaller {
  private baseUrl: string;
  
  constructor(port: number = 3458) {
    this.baseUrl = `http://localhost:${port}`;
  }
  
  async call(method: string, params?: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/codex-api/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params }),
    });
    return (await response.json()).result;
  }
  
  onNotification(listener: (notification: unknown) => void): () => void {
    const ws = new WebSocket(`${this.baseUrl.replace('http', 'ws')}/codex-api/ws`);
    ws.onmessage = (event) => listener(JSON.parse(event.data));
    return () => ws.close();
  }
  
  resolveServerRequest(id: number | string, result?: unknown, error?: { code?: number; message: string }): void {
    fetch(`${this.baseUrl}/codex-api/server-requests/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, result, error }),
    }).catch(console.error);
  }
}

// Runtime selection
const bridge = process.env.BRIDGE_PORT === '3457' 
  ? new CodexBridge()           // TypeScript backend
  : new RustHttpBridge(3458);   // Rust backend

const imBridge = new IMBridge(bridge, config);
```

**Pros:**
- Single codebase for IM logic
- Works with both backends
- Clean abstraction

**Cons:**
- More complex testing
- HTTP overhead when using Rust backend

---

### Architecture Decision Summary

| Component | TypeScript | Rust | Decision |
|-----------|------------|------|----------|
| **Main API** | Express (`standalone.ts`) | axum (`codex-server`) | Migrate to Rust |
| **Kimi Proxy** | `kimiProxy.ts` | N/A | Keep TypeScript, shared service |
| **IM Bridge** | Embedded in `standalone.ts` | TBD | Option 1 (separate TS service) or Option 3 (hybrid) |

---

### Updated Startup Scripts

#### TypeScript Stack (`start-server.sh ts`)
```bash
# Starts: Proxy + Express + IM Bridge (embedded) + Frontend
tmux split-window -v
tmux send-keys -t 0 "bun run proxy"           # Port 3456
tmux send-keys -t 0 "bun run server"          # Port 3457 (includes IM Bridge)
tmux send-keys -t 1 "bunx vite"               # Port 5173
```

#### Rust Stack (`start-server.sh rust`)
```bash
# Starts: Proxy + Rust Server + IM Bridge (separate) + Frontend
tmux split-window -v
tmux send-keys -t 0 "bun run proxy"           # Port 3456 (shared)
tmux send-keys -t 0 "cargo run -p codex-server"  # Port 3458
tmux send-keys -t 1 "bun run im-bridge"       # Port 3459 (separate TS service)
tmux send-keys -t 1 "bunx vite"               # Port 5173
```

---

## Performance Benefits

1. **No stdio serialization**: Direct method calls instead of JSON over stdio
2. **True parallelism**: Tokio async runtime vs Node.js single-threaded
3. **Type safety**: Compile-time protocol validation
4. **Memory efficiency**: No separate codex-cli process per connection
5. **Faster startup**: In-process client initialization

---

## Notes

- The Rust server uses `InProcessAppServerClient` from `codex-app-server-client` crate
- This is an **upstream crate** - we do not modify it
- Our code only wraps it in the HTTP/axum layer
- See [UPGRADE_STRATEGY.md](./UPGRADE_STRATEGY.md) for maintenance guidelines
