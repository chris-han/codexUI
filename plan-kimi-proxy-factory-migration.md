# Kimi Proxy Factory Migration Plan

## Executive Summary

**Current State:** Kimi Proxy runs as a standalone service on port 3456. Codex CLI makes HTTP calls to this proxy.

**Target State:** LLM Provider Factory runs **in-process inside Codex CLI**. No HTTP proxy, no separate service - direct API calls from CLI to Kimi/Azure.

**Scope:** 
- Modify Codex CLI (`codex/codex-rs/`) to add LLM Provider Factory trait
- Minimal, non-breaking changes to upstream code
- Feature-flagged so upstream updates are easy to merge

---

## 1. Current Architecture (Problem)

```
┌─────────────────────────────────────────────────────────────┐
│                    Current Flow (3 Processes)                │
│                                                              │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐  │
│  │   Frontend   │─────▶│   Express    │─────▶│ Kimi Proxy│  │
│  │   (Browser)  │◀─────│   Server     │◀─────│  :3456    │  │
│  └──────────────┘      │   :3457      │      └─────┬─────┘  │
│                        └──────────────┘            │        │
│                              │                     │        │
│                              │ stdio/JSON-RPC      │ HTTP   │
│                              ▼                     ▼        │
│                        ┌───────────┐         ┌───────────┐  │
│                        │ Codex CLI │         │ Kimi/Azure│  │
│                        │           │         │   API     │  │
│                        └───────────┘         └───────────┘  │
│                           │                                  │
│                           │ HTTP to :3456                    │
│                           └────────────────────────────────► │
└─────────────────────────────────────────────────────────────┘

Problems:
- Port 3456 management complexity
- Extra HTTP hop (CLI → Proxy → Kimi)
- Process lifecycle management overhead
- Not truly in-process
```

### 1.1 How Codex CLI Communicates with LLM (Current)

1. **Codex CLI reads environment variables** at startup:
   ```rust
   // Inside codex-cli
   let base_url = std::env::var("OPENAI_BASE_URL")
       .unwrap_or("https://api.openai.com/v1".to_string());
   ```

2. **Codex CLI makes direct HTTP calls** to the proxy:
   ```rust
   // Inside codex-cli (Rust code)
   let client = reqwest::Client::new();
   let response = client
       .post("http://localhost:3456/v1/chat/completions")
       .json(&request_body)
       .send()
       .await?;
   ```

3. **Kimi Proxy translates** OpenAI API format ↔ Kimi/Azure format

---

## 2. Target Architecture (True In-Process)

```
┌─────────────────────────────────────────────────────────────┐
│                    Target Flow (2 Processes)                 │
│                                                              │
│  ┌──────────────┐      ┌─────────────────────────────────┐  │
│  │   Frontend   │─────▶│         Express Server          │  │
│  │   (Browser)  │◀─────│            :3457                │  │
│  └──────────────┘      └──────────────┬────────────────────┘  │
│                                       │                      │
│                                       │ stdio/JSON-RPC       │
│                                       ▼                      │
│                        ┌───────────────────────────────┐    │
│                        │         Codex CLI             │    │
│                        │  ┌─────────────────────────┐  │    │
│                        │  │   LLM Provider Factory  │  │    │
│                        │  │  ┌───────────────────┐  │  │    │
│                        │  │  │ trait LLMProvider │  │  │    │
│                        │  │  │ - chat()          │  │  │    │
│                        │  │  │ - chat_stream()   │  │  │    │
│                        │  │  └───────────────────┘  │  │    │
│                        │  └─────────────────────────┘  │    │
│                        │              │                │    │
│                        │    ┌─────────┴─────────┐      │    │
│                        │    ▼                   ▼      │    │
│                        │ ┌────────┐         ┌────────┐ │    │
│                        │ │  Kimi  │         │ Azure  │ │    │
│                        │ │Provider│         │Provider│ │    │
│                        │ └───┬────┘         └───┬────┘ │    │
│                        │     │                  │      │    │
│                        └─────┼──────────────────┼──────┘    │
│                              │                  │            │
│                              ▼                  ▼            │
│                        ┌───────────┐    ┌───────────┐       │
│                        │ Kimi API  │    │ Azure API │       │
│                        └───────────┘    └───────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 How Codex CLI Communicates with LLM (Target - True In-Process)

**Key Change:** The **LLM Provider Factory runs inside Codex CLI**. No HTTP proxy, no Express involvement in LLM calls.

1. **Codex CLI initializes provider factory at startup**:
   ```rust
   // Inside codex-cli (modified)
   let provider_factory = create_provider_factory();
   // Selects provider based on model: KimiProvider or AzureProvider
   ```

2. **Codex CLI calls provider directly (in-process)**:
   ```rust
   // Inside codex-cli (modified)
   let provider = provider_factory.route_by_model(&request.model);
   let response = provider.chat(request).await?;  // Direct HTTP to Kimi/Azure
   ```

3. **Express Server only manages**:
   - Spawning the Codex CLI process
   - JSON-RPC communication via stdio
   - Forwarding notifications to frontend via WebSocket

| Aspect | Current | Target |
|--------|---------|--------|
| **LLM calls location** | Codex CLI → HTTP to proxy | **Inside Codex CLI** |
| **Express is media for LLM?** | ❌ No | ❌ No (truly in-process) |
| **Separate proxy process?** | ✅ Yes (port 3456) | ❌ No |
| **HTTP hops** | 2 (CLI→Proxy→Kimi) | **1 (CLI→Kimi)** |
| **Process count** | 3 (Express, Proxy, CLI) | **2 (Express, CLI)** |

---

## 3. Codex CLI Modification Plan (Minimal Disruption)

### 3.1 Design Principles

1. **Feature-flagged**: New code only runs when `USE_IN_PROCESS_LLM=1`
2. **Trait-based abstraction**: Easy to swap providers without changing core logic
3. **Minimal upstream changes**: Add files, don't modify existing logic paths
4. **Backward compatible**: Without flag, behavior is unchanged

### 3.2 File Structure (New Files Only)

```
codex/codex-rs/
├── codex-cli/src/
│   ├── main.rs              # Add 5 lines to initialize factory if flag set
│   ├── lib.rs               # Add provider module export
│   └── providers/           # NEW DIRECTORY
│       ├── mod.rs           # Module exports, feature flag logic
│       ├── factory.rs       # ProviderFactory trait + implementation
│       ├── types.rs         # Request/response types
│       ├── kimi/            # Kimi provider
│       │   ├── mod.rs
│       │   ├── provider.rs
│       │   └── translator.rs
│       └── azure/           # Azure provider
│           ├── mod.rs
│           ├── provider.rs
│           └── translator.rs
```

### 3.3 Core Abstractions

```rust
// codex-cli/src/providers/types.rs
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// LLM Provider trait - abstracts Kimi, Azure, OpenAI, etc.
#[async_trait]
pub trait LLMProvider: Send + Sync {
    fn name(&self) -> &'static str;
    fn supported_models(&self) -> &[&'static str];
    
    async fn chat(&self, request: ChatRequest) -> anyhow::Result<ChatResponse>;
    
    async fn chat_stream(
        &self, 
        request: ChatRequest
    ) -> anyhow::Result<BoxStream<'static, anyhow::Result<ChatResponseChunk>>>;
}

/// Request/response types (OpenAI-compatible)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub tools: Option<Vec<Tool>>,
    pub stream: Option<bool>,
    // ... other fields
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub id: String,
    pub choices: Vec<Choice>,
    // ... other fields
}
```

### 3.4 Factory Implementation

```rust
// codex-cli/src/providers/factory.rs
use std::sync::Arc;

/// Factory for creating LLM providers
pub struct ProviderFactory {
    kimi: Option<Arc<KimiProvider>>,  // LLM provider for Kimi
    azure: Option<Arc<AzureProvider>>, // LLM provider for Azure
}

impl ProviderFactory {
    pub fn from_env() -> anyhow::Result<Self> {
        let kimi = if std::env::var("KIMI_API_KEY").is_ok() {
            Some(Arc::new(KimiProvider::from_env()?))
        } else {
            None
        };
        
        let azure = if std::env::var("AZURE_OPENAI_ENDPOINT").is_ok() {
            Some(Arc::new(AzureProvider::from_env()?))
        } else {
            None
        };
        
        Ok(Self { kimi, azure })
    }
    
    /// Route to provider based on model name
    pub fn route_by_model(&self, model: &str) -> anyhow::Result<Arc<dyn LLMProvider>> {
        if model.starts_with("gpt-") {
            self.azure.clone()
                .ok_or_else(|| anyhow::anyhow!("Azure provider not configured"))
        } else {
            // Default to Kimi for kimi-* models and unknown models
            self.kimi.clone()
                .ok_or_else(|| anyhow::anyhow!("Kimi provider not configured"))
        }
    }
}
```

### 3.5 LLM Provider Implementation (Kimi)

```rust
// codex-cli/src/providers/kimi/provider.rs
use async_trait::async_trait;
use reqwest::Client;

pub struct KimiProvider {
    client: Client,
    api_key: String,
    base_url: String,
}

impl KimiProvider {
    pub fn from_env() -> anyhow::Result<Self> {
        let api_key = std::env::var("KIMI_API_KEY")?;
        let base_url = std::env::var("KIMI_BASE_URL")
            .unwrap_or("https://api.kimi.com/coding/v1".to_string());
        
        Ok(Self {
            client: Client::new(),
            api_key,
            base_url,
        })
    }
}

#[async_trait]
impl LLMProvider for KimiProvider {
    fn name(&self) -> &'static str {
        "kimi"
    }
    
    fn supported_models(&self) -> &[&'static str] {
        &["kimi-k2.5", "kimi-for-coding", "kimi-k2", "kimi-k2-thinking"]
    }
    
    async fn chat(&self, request: ChatRequest) -> anyhow::Result<ChatResponse> {
        // Translate OpenAI format to Kimi format
        let kimi_request = translate_request_to_kimi(request);
        
        let response = self.client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&kimi_request)
            .send()
            .await?;
        
        let kimi_response: KimiResponse = response.json().await?;
        
        // Translate Kimi format back to OpenAI format
        Ok(translate_response_from_kimi(kimi_response))
    }
    
    async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> anyhow::Result<BoxStream<'static, anyhow::Result<ChatResponseChunk>>> {
        // SSE streaming implementation
        // ...
    }
}
```

### 3.6 Integration Point (Minimal Change)

```rust
// codex-cli/src/main.rs - Add at startup

fn main() -> anyhow::Result<()> {
    // ... existing code ...
    
    // NEW: Initialize in-process LLM provider factory if flag is set
    let provider_factory = if std::env::var("USE_IN_PROCESS_LLM").is_ok() {
        Some(providers::ProviderFactory::from_env()?)
    } else {
        None
    };
    
    // Pass to app-server initialization
    run_app_server(provider_factory).await?;
}

// codex-cli/src/lib.rs - Add module

#[cfg(feature = "in-process-llm")]
pub mod providers;
```

### 3.7 Patching OpenAI Client (The Hook)

We need to intercept where Codex CLI calls OpenAI API. This is typically in a client module:

```rust
// codex-cli/src/openai_client.rs (existing file, minimal modification)

pub struct OpenAIClient {
    // ... existing fields ...
    
    // NEW: Optional in-process provider
    in_process_provider: Option<Arc<dyn LLMProvider>>,
}

impl OpenAIClient {
    pub async fn chat(&self, request: ChatRequest) -> anyhow::Result<ChatResponse> {
        // NEW: If in-process provider is configured, use it
        if let Some(provider) = &self.in_process_provider {
            return provider.chat(request).await;
        }
        
        // EXISTING: Fall back to HTTP API call
        self.http_chat(request).await
    }
}
```

---

## 4. TypeScript/Express Changes (Minimal)

Since Codex CLI now handles LLM calls internally, Express just needs to:

1. **Pass environment variables to CLI**:
   ```typescript
   // server/standalone.ts - CodexBridge
   const env = {
     ...process.env,
     USE_IN_PROCESS_LLM: '1',  // Enable in-process factory
     KIMI_API_KEY: process.env.KIMI_API_KEY,
     AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
     AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
   };
   
   this.process = spawn('codex', ['app-server'], { env });
   ```

2. **Remove proxy dependency**:
   ```typescript
   // Remove health checks for localhost:3456
   // Remove OPENAI_BASE_URL pointing to proxy
   ```

---

## 5. Migration Timeline

| Phase | Duration | Task | Files Modified |
|-------|----------|------|----------------|
| 1 | 1 day | Create provider abstractions | `providers/types.rs`, `providers/factory.rs` |
| 2 | 1 day | Implement Kimi provider | `providers/kimi/*.rs` |
| 3 | 1 day | Implement Azure provider | `providers/azure/*.rs` |
| 4 | 1 day | Integration hook | `main.rs`, `openai_client.rs` (5 lines each) |
| 5 | 1 day | Express cleanup | `standalone.ts` (remove proxy) |
| | | **Total: 5 days** | |

---

## 6. Upstream Update Strategy

### 6.1 Directory Structure for Easy Merging

```
codex/codex-rs/
├── codex-cli/src/
│   ├── main.rs                    # 5-line addition at top
│   ├── lib.rs                     # 1-line addition
│   ├── openai_client.rs           # 10-line addition for hook
│   └── providers/                 # NEW - all our code here
│       └── (entirely new directory)
```

### 6.2 Feature Flag Usage

```rust
// In code paths we modify
#[cfg(feature = "in-process-llm")]
{
    // Our new code
}

#[cfg(not(feature = "in-process-llm"))]
{
    // Original upstream code
}
```

### 6.3 Git Strategy

```bash
# Our modifications on a branch
git checkout -b our-fork/in-process-llm

# When upstream updates:
git fetch upstream
git merge upstream/main  # Should merge cleanly - we mostly added files
```

---

## 7. Testing Strategy

### 7.1 Unit Tests (Rust)

```rust
// codex-cli/src/providers/kimi/tests.rs
#[tokio::test]
async fn test_kimi_provider_chat() {
    let provider = KimiProvider::with_mock_client(mock_server.url());
    let request = ChatRequest {
        model: "kimi-for-coding".to_string(),
        messages: vec![Message::user("Hello")],
    };
    
    let response = provider.chat(request).await.unwrap();
    assert!(!response.choices.is_empty());
}
```

### 7.2 Integration Tests

```bash
# Test with in-process factory
USE_IN_PROCESS_LLM=1 KIMI_API_KEY=xxx cargo run -p codex-cli app-server

# Test without (backward compatibility)
cargo run -p codex-cli app-server  # Uses original HTTP path
```

---

## 8. Configuration Changes

| Before | After |
|--------|-------|
| `OPENAI_BASE_URL=http://localhost:3456/v1` | `USE_IN_PROCESS_LLM=1` |
| `KIMI_API_KEY` (read by proxy) | `KIMI_API_KEY` (read by CLI) |
| `AZURE_OPENAI_ENDPOINT` (read by proxy) | `AZURE_OPENAI_ENDPOINT` (read by CLI) |

---

## 9. Summary

| Aspect | Before | After (True In-Process) |
|--------|--------|------------------------|
| **LLM provider location** | Separate proxy process | **Inside Codex CLI** |
| **Communication** | HTTP localhost:3456 | **Direct function calls** |
| **HTTP hops to Kimi** | 2 (CLI→Proxy→Kimi) | **1 (CLI→Kimi)** |
| **Processes** | 3 | **2** |
| **Latency** | Higher (extra hop) | **Lower** |
| **Upstream changes** | None | **Minimal (~20 lines)** |

---

## Review Checklist

- [ ] Is the trait abstraction sufficient for future providers (OpenAI, Anthropic)?
- [ ] Should we support provider fallback chains?
- [ ] Is the feature flag approach acceptable for upstream updates?
- [ ] Any concerns about the 5-day timeline?

Once approved, I'll start with Phase 1 (provider abstractions).