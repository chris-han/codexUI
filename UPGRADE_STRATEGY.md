# Codex Server Upgrade Strategy

## Overview

This document describes how to maintain compatibility with upstream OpenAI Codex while building our multi-tenant Rust server.

## Architecture Principles

### 1. Minimal Forking

We use the upstream `codex-rs` crates as dependencies, not forks:

```toml
# codex-server/Cargo.toml
codex-app-server-client = { path = "../app-server-client" }
codex-app-server-protocol = { path = "../app-server-protocol" }
codex-core = { path = "../core" }
```

**Never modify upstream crates.** If changes are needed, contribute upstream or wrap locally.

### 2. Clean Separation of Concerns

```
codex-server/
├── src/
│   ├── main.rs          # Server setup (ours)
│   ├── handlers.rs      # HTTP handlers (ours)
│   ├── models.rs        # Request/response types (ours)
│   ├── state.rs         # AppState with InProcessAppServerClient (ours)
│   └── websocket.rs     # WebSocket handling (ours)
└── Cargo.toml           # Dependencies on upstream crates
```

### 3. Interface Stability

Our server exposes the **same HTTP API** as the TypeScript Express server:

```
POST /codex-api/rpc          -> Routes to InProcessAppServerClient
GET  /codex-api/settings     -> Our state management
GET  /codex-api/ws           -> WebSocket for events
...
```

## Upgrade Process

### When Upstream Codex Updates

1. **Pull latest upstream:**
   ```bash
   cd /home/chris/repo/codexUI/codex
   git fetch origin
   git merge origin/main
   ```

2. **Check for breaking changes:**
   ```bash
   cd codex-rs
   cargo check --all
   ```

3. **Update our server if needed:**
   - If `InProcessAppServerClient` API changed → Update `src/state.rs`
   - If protocol types changed → Update `src/models.rs`
   - If new handlers needed → Add to `src/handlers.rs`

4. **Run regression tests:**
   ```bash
   cd /home/chris/repo/codexUI/codex-ui-react
   npm test -- tests/regression/
   ```

### Handling Breaking Changes

#### Scenario 1: New InProcessAppServerClient method

```rust
// Old
codex_app_server_client::InProcessAppServerClient::start(args).await

// New - upstream added new required field
ncodex_app_server_client::InProcessAppServerClient::start(args).await
```

**Action:** Update our `AppState::new()` to populate new fields.

#### Scenario 2: Changed protocol types

```rust
// Old
pub struct ThreadStartParams {
    pub cwd: String,
    pub instructions: String,
}

// New - upstream renamed field
pub struct ThreadStartParams {
    pub working_dir: String,  // was cwd
    pub instructions: String,
}
```

**Action:** Update our `models.rs` and translation layer in handlers.

#### Scenario 3: New codex features

Upstream adds new capabilities (e.g., new tool type).

**Action:**
1. Update `meta_methods_handler` to include new method
2. Add handler if we want to expose it
3. Ignore if not needed (upstream handles internally)

## Version Pinning Strategy

### Development

Use latest upstream:
```toml
codex-app-server-client = { path = "../app-server-client" }
```

### Production

Pin to a specific commit:
```toml
codex-app-server-client = { git = "https://github.com/openai/codex", rev = "abc123" }
```

## Testing Strategy

### Regression Tests

Our regression tests (`tests/regression/`) verify:
- API contract (endpoints, response format)
- WebSocket behavior
- User workflows

These must pass against:
1. TypeScript Express server (baseline)
2. Rust server (migration target)

### Integration Tests

Add integration tests in `codex-server/tests/`:

```rust
// tests/api_integration.rs
#[tokio::test]
async fn test_rpc_thread_start() {
    let app = create_test_app().await;
    // Test against our server
}
```

## Dependency Management

### What We Own

- HTTP routing (axum)
- State management (settings, user sessions)
- File operations (user files, uploads)
- WebSocket event broadcasting
- Multi-tenancy logic

### What Upstream Owns

- `InProcessAppServerClient`
- Codex protocol (JSON-RPC)
- LLM provider integration
- Tool execution
- Sandboxing

### What We Share

- Protocol types (from `codex-app-server-protocol`)
- Config structures (from `codex-core`)

## Migration Checklist

When upgrading upstream codex:

- [ ] Pull latest upstream changes
- [ ] Check `CHANGELOG.md` for breaking changes
- [ ] Run `cargo check` in `codex-server/`
- [ ] Update `Cargo.toml` if new dependencies
- [ ] Update `src/state.rs` if client API changed
- [ ] Update `src/models.rs` if protocol changed
- [ ] Update handlers if needed
- [ ] Run Rust tests: `cargo test`
- [ ] Run regression tests: `npm test`
- [ ] Deploy to staging
- [ ] Monitor for errors

## Rollback Plan

If upgrade breaks:

1. Revert to previous commit in `codex/` submodule
2. Rebuild: `cargo build --release`
3. Deploy previous version
4. TypeScript Express server remains as backup

## Future Considerations

### If Upstream Adds HttpTransport Trait

We could implement a custom `HttpTransport` that routes through our proxy logic:

```rust
impl HttpTransport for KimiAzureTransport {
    async fn execute(&self, req: Request) -> Result<Response, TransportError> {
        // Route to Kimi or Azure based on model
    }
}
```

### If Upstream Adds Server Mode

If codex-cli adds native server mode:
- Evaluate if we can simplify our architecture
- Keep our multi-tenancy layer
- Potentially drop InProcessAppServerClient wrapper

## Summary

1. **Never fork upstream** - use as dependency
2. **Own the HTTP layer** - this is our value add
3. **Match the API contract** - regression tests ensure compatibility
4. **Keep it simple** - minimal code, maximum reuse

The TypeScript Express server remains as a fallback during migration and for reference.
