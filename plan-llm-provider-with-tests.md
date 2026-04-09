# LLM Provider Implementation Plan with Regression Tests

## Overview

This plan ensures LLM provider changes are fully tested by:
1. **Phase 1**: ~~Add regression tests~~ — **DONE** (`tests/regression/llm-provider.test.ts` exists)
2. **Phase 2**: Update tests to target `codex-server` (port 3458, `/v1/chat/completions`) 
3. **Phase 3**: Implement streaming in providers (non-streaming is done)
4. **Phase 4**: Hook providers into `codex-api` `ResponsesClient` (the real in-process path)
5. **Phase 5**: Express cleanup — remove proxy dependency

---

## Current State (as of 2026-04-09)

### What Is Already Implemented

| Component | Status | Location |
|-----------|--------|----------|
| `LlmProvider` + `LlmProviderFactory` traits | ✅ Done | `codex-client/src/llm_config.rs` |
| `ProviderFactory::from_env()` | ✅ Done | `codex-server/src/providers/factory.rs` |
| Kimi `chat()` non-streaming | ✅ Done | `codex-server/src/providers/kimi/provider.rs` |
| Azure `chat()` non-streaming | ✅ Done | `codex-server/src/providers/azure/provider.rs` |
| `GET /v1/models` endpoint | ✅ Done | `codex-server/src/handlers/llm.rs` |
| `POST /v1/chat/completions` endpoint | ✅ Done | `codex-server/src/handlers/llm.rs` |
| SSE event streaming (`/codex-api/events`) | ✅ Done | `codex-server/src/handlers.rs` |
| Regression test file | ✅ Done | `codex-ui-react/tests/regression/llm-provider.test.ts` |

### What Is Still Stubbed / Missing

| Component | Status | Notes |
|-----------|--------|-------|
| Kimi `chat_stream()` | ❌ `todo!()` | Streaming not implemented |
| Azure `chat_stream()` | ❌ `todo!()` | Streaming not implemented |
| Hook into `codex-api` `ResponsesClient` | ❌ Not done | The real bottleneck — this is how codex CLI talks to LLMs |
| Tests targeting port 3458 | ❌ Wrong port | Tests default to `localhost:3456` (proxy), should be `3458` |
| Tests using `/v1/chat/completions` | ✅ Correct format | codex-server uses Chat Completions, not Responses API |

### Architecture Reality

The existing `llm-provider.test.ts` was written for the **Kimi Proxy** on port 3456 and uses **OpenAI Responses API format** (`POST /v1/responses`). The `codex-server` on port 3458 uses **Chat Completions API format** (`POST /v1/chat/completions`). These are different wire formats.

```
Current proxy path (still active):
  codex-cli → POST http://localhost:3456/v1/responses → Kimi Proxy → Kimi API

Target in-process path (to implement):
  codex-server initializes ProviderFactory
    → calls set_llm_provider_factory() in codex-client/llm_config.rs  [missing hook]
    → codex-api ResponsesClient checks get_llm_provider_factory()     [missing hook]
    → calls provider.chat() directly                                   [implemented]
```

---

## Phase 2: Fix Tests to Target codex-server

### 2.1 Update `tests/regression/llm-provider.test.ts`

Change default port and update endpoint calls:

```typescript
// Change this:
const API_BASE = process.env.API_URL || 'http://localhost:3456';

// To this:
const API_BASE = process.env.API_URL || 'http://localhost:3458';
```

Replace `/v1/responses` calls with `/v1/chat/completions`:

```typescript
// Non-streaming test
const response = await fetch(`${API_BASE}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'kimi-for-coding',
    messages: [{ role: 'user', content: 'Say "test" and nothing else' }],
    temperature: 0,
    max_tokens: 20,
  }),
});

expect(response.status).toBe(200);
const body = await response.json();
// OpenAI Chat Completions format
expect(body).toHaveProperty('id');
expect(body).toHaveProperty('object', 'chat.completion');
expect(body).toHaveProperty('choices');
expect(body.choices[0].message).toHaveProperty('content');
```

### 2.2 Run Tests Against codex-server

```bash
# Start codex-server
cd codex/codex-rs
export $(grep -v '^#' ../../codex-ui-react/.env | xargs)
PORT=3458 cargo run -p codex-server

# Run tests
cd codex-ui-react
API_URL=http://localhost:3458 bun test tests/regression/llm-provider.test.ts
```

---

## Phase 3: Implement Streaming in Providers

Both `chat_stream()` implementations return `todo!()`. Fix in:
- `codex-server/src/providers/kimi/provider.rs` line 150
- `codex-server/src/providers/azure/provider.rs` line 113

```rust
// kimi/provider.rs
async fn chat_stream(
    &self,
    request: ChatRequest,
) -> anyhow::Result<BoxStream<'static, anyhow::Result<ChatResponseChunk>>> {
    let response = self.client
        .post(format!("{}/chat/completions", self.base_url))
        .header("Authorization", format!("Bearer {}", self.api_key))
        .json(&serde_json::json!({
            "model": request.model,
            "messages": request.messages,
            "stream": true,
            "max_tokens": request.max_tokens,
        }))
        .send()
        .await?;

    let stream = response
        .bytes_stream()
        .map_err(|e| anyhow::anyhow!(e))
        .and_then(|chunk| async move {
            // Parse SSE chunk: "data: {...}\n\n"
            let text = String::from_utf8_lossy(&chunk);
            for line in text.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    if data == "[DONE]" { continue; }
                    if let Ok(chunk) = serde_json::from_str::<ChatResponseChunk>(data) {
                        return Ok(chunk);
                    }
                }
            }
            Err(anyhow::anyhow!("Failed to parse SSE chunk"))
        });

    Ok(Box::pin(stream))
}
```

---

## Phase 4: Hook Providers into codex-api ResponsesClient

**This is the critical step** that makes codex CLI use providers directly instead of HTTP proxy.

### 4.1 Where the Hook Lives

```
codex-client/src/llm_config.rs
  set_llm_provider_factory(factory)  ← call this at codex-server startup
  get_llm_provider_factory()         ← check this in ResponsesClient
```

### 4.2 Call set_llm_provider_factory at Startup

In `codex-server/src/main.rs`, after `AppState` initializes the `ProviderFactory`, register it globally:

```rust
// main.rs — after AppState::new()
use codex_client::llm_config::{set_llm_provider_factory, LlmProviderFactory};

if let Some(factory) = &state.provider_factory {
    // Wrap ProviderFactory to implement LlmProviderFactory
    set_llm_provider_factory(Arc::new(factory.clone()));
}
```

The `ProviderFactory` in `codex-server/src/providers/factory.rs` needs to implement `codex_client::llm_config::LlmProviderFactory`:

```rust
// codex-server/src/providers/factory.rs
use codex_client::llm_config::{LlmProviderFactory, ModelInfo};

impl LlmProviderFactory for ProviderFactory {
    fn route_request(&self, model: &str) -> Option<Arc<dyn codex_client::llm_config::LlmProvider>> {
        // Return provider for model, adapting our LLMProvider to codex_client's LlmProvider
        todo!()
    }
    
    fn list_models(&self) -> Vec<ModelInfo> {
        self.list_models() // reuse existing
            .into_iter()
            .map(|m| ModelInfo { id: m.id, ... })
            .collect()
    }
    
    fn as_any(&self) -> &dyn std::any::Any { self }
}
```

### 4.3 Intercept ResponsesClient in codex-api

In `codex-api/src/endpoint/responses.rs`, check global factory before making HTTP requests:

```rust
// responses.rs — in stream_request()
use codex_client::llm_config::get_llm_provider_factory;

// Before HTTP call:
if let Some(factory) = get_llm_provider_factory() {
    if let Some(provider) = factory.route_request(&request.model) {
        // Translate ResponsesApiRequest → ChatRequest, call provider.chat()
        // Translate ChatResponse → ResponseStream
        return in_process_response(provider, request).await;
    }
}
// Fall through to existing HTTP path
```

This is the minimal hook. The translation layer (ResponsesApiRequest ↔ ChatRequest) is the main implementation work.

---

## Phase 5: Express Cleanup

Once Phase 4 is working and tests pass:

```typescript
// codex-ui-react/server/standalone.ts
// Remove: OPENAI_BASE_URL pointing to localhost:3456
// Remove: proxy health check before spawn
// Add: USE_IN_PROCESS_LLM=1 to spawned process env (already in .env)
```

```bash
# Before (3 processes):
bun run proxy &     # Port 3456 — remove this
bun run server &    # Port 3457

# After (2 processes):
bun run server &    # Port 3457 (codex-server handles LLM in-process)
```

---

## Test Coverage Matrix

| Test | Phase 2 (codex-server /v1/chat/completions) | Phase 4 (in-process) |
|------|---------------------------------------------|----------------------|
| GET /v1/models | ✅ passes now | ✅ unchanged |
| POST /v1/chat/completions non-streaming | ✅ passes now | ✅ unchanged |
| POST /v1/chat/completions streaming | ❌ todo!() panics | ✅ after Phase 3 |
| Tool calls | ✅ passes now | ✅ unchanged |
| Provider routing (gpt-4o → Azure) | ✅ passes now | ✅ unchanged |
| codex thread → turn → LLM response | ❌ proxy still used | ✅ after Phase 4 |

---

## Rollback Plan

- `USE_IN_PROCESS_LLM` is checked at startup; set to `0` to fall back to proxy
- Phase 4 hook falls through to HTTP path if `get_llm_provider_factory()` returns `None`
- No changes required to codex upstream code for rollback

---

## Summary

| Phase | Duration | Output | Status |
|-------|----------|--------|--------|
| 1 | — | Regression test file | ✅ Done |
| 2 | 0.5 day | Tests targeting port 3458, `/v1/chat/completions` | ❌ Pending |
| 3 | 1 day | Streaming implemented in Kimi + Azure providers | ❌ Pending |
| 4 | 2 days | `ResponsesClient` hook wired to `ProviderFactory` | ❌ Pending (hardest) |
| 5 | 0.5 day | Express proxy removed | ❌ Pending |
| **Total** | **~4 days** | No proxy, in-process LLM, full test coverage | |
