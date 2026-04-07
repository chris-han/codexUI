# IM Integration Guide for codex-ui-react

This document describes how to integrate IM channels (Telegram, Discord, Feishu/Lark, QQ, WeChat) directly into the codex-ui-react server, leveraging the existing CodexBridge architecture.

## Architecture Overview

```
IM Platforms (Telegram/Discord/Feishu/QQ/WeChat)
    ↓ HTTP/WebSocket/API
IM Adapters (server/im-bridge/)
    ↓ JSON-RPC via stdin/stdout
CodexBridge (server/standalone.ts)
    ↓ JSON-RPC
Codex CLI (codex app-server)
    ↓ HTTP
Kimi/Azure OpenAI API
```

The integration reuses the existing `CodexBridge` class that spawns the Codex CLI and communicates via JSON-RPC. The IM bridge layer adds platform-specific adapters that translate between IM protocols and Codex's interface.

## Key Components

### 1. Existing Infrastructure

The codex-ui-react server already has:

- **`CodexBridge`** (`standalone.ts:1369`): Manages the Codex CLI subprocess, sends JSON-RPC requests, and handles notifications
- **HTTP API** (`/codex-api/*`): REST endpoints for the React frontend
- **WebSocket** (`/codex-api/ws`): Real-time notifications to the UI
- **Thread Management**: `thread/start`, `turn/start`, `server/request` handling

### 2. New IM Bridge Layer

New components to add:

```
server/im-bridge/
├── types.ts          # Shared interfaces
├── index.ts          # IMBridge orchestrator
├── store.ts          # Session persistence
├── adapters/
│   ├── telegram.ts   # Telegram Bot API
│   ├── discord.ts    # Discord.js or REST API
│   ├── feishu.ts     # Feishu/Lark Open API
│   ├── qq.ts         # QQ Bot OpenAPI
│   └── weixin.ts     # WeChat Web API
```

## Implementation

### Step 1: Define Types (`server/im-bridge/types.ts`)

```typescript
export interface IMMessage {
  id: string;
  channelType: 'telegram' | 'discord' | 'feishu' | 'qq' | 'weixin';
  chatId: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  files?: IMFileAttachment[];
}

export interface IMFileAttachment {
  id: string;
  name: string;
  type: string;
  data: string; // base64
}

export interface IMResponse {
  text?: string;
  buttons?: IMButton[];
  parseMode?: 'markdown' | 'html';
}

export interface IMButton {
  id: string;
  text: string;
  action: 'allow' | 'deny' | 'custom';
  data?: unknown;
}

export interface IMAdapter {
  readonly channelType: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(chatId: string, response: IMResponse): Promise<void>;
  onMessage(handler: (msg: IMMessage) => void): void;
  onButtonClick(handler: (chatId: string, buttonId: string, data: unknown) => void): void;
}

export interface IMBridgeConfig {
  telegram?: TelegramConfig;
  discord?: DiscordConfig;
  feishu?: FeishuConfig;
  qq?: QQConfig;
  weixin?: WeixinConfig;
  defaultModel?: string;
  autoApprove?: boolean;
}
```

### Step 2: Create IMBridge (`server/im-bridge/index.ts`)

```typescript
import type { CodexBridge } from '../standalone';
import type { IMAdapter, IMMessage, IMResponse, IMBridgeConfig } from './types';

export class IMBridge {
  private adapters: Map<string, IMAdapter> = new Map();
  private sessions: Map<string, { threadId: string; channelType: string }> = new Map();
  private pendingRequests: Map<string, { chatId: string; channelType: string }> = new Map();

  constructor(private codexBridge: CodexBridge, private config: IMBridgeConfig) {}

  async start(): Promise<void> {
    // Setup notification forwarding first
    this.setupNotificationForwarding();

    // Initialize adapters based on config
    if (this.config.feishu?.enabled) {
      const { FeishuAdapter } = await import('./adapters/feishu');
      await this.registerAdapter(new FeishuAdapter(this.config.feishu));
    }
    // Similar for Telegram, Discord, QQ, WeChat...

    console.log('[IMBridge] Started with adapters:', Array.from(this.adapters.keys()));
  }

  private async registerAdapter(adapter: IMAdapter): Promise<void> {
    adapter.onMessage((msg) => this.handleMessage(msg));
    adapter.onButtonClick((chatId, buttonId, data) => {
      this.handleButtonClick(chatId, buttonId, data);
    });
    await adapter.start();
    this.adapters.set(adapter.channelType, adapter);
  }

  private async handleMessage(msg: IMMessage): Promise<void> {
    const sessionKey = `${msg.channelType}:${msg.chatId}`;
    let session = this.sessions.get(sessionKey);

    // Create new thread if needed
    if (!session) {
      const result = (await this.codexBridge.call('thread/start', {
        cwd: process.cwd(),
        model: this.config.defaultModel,
      })) as { thread?: { id: string }; id?: string };

      const threadId = result.thread?.id ?? result.id;
      if (!threadId) {
        console.error('[IMBridge] Failed to create thread');
        return;
      }

      session = { threadId, channelType: msg.channelType };
      this.sessions.set(sessionKey, session);
    }

    // Build input
    const input = this.buildInput(msg);

    // Start turn
    await this.codexBridge.call('turn/start', {
      threadId: session.threadId,
      input,
      approvalPolicy: this.config.autoApprove ? 'never' : undefined,
    });
  }

  private buildInput(msg: IMMessage): Array<Record<string, unknown>> {
    const input: Array<Record<string, unknown>> = [
      { type: 'text', text: msg.text, text_elements: [] },
    ];

    for (const file of msg.files || []) {
      if (file.type.startsWith('image/')) {
        input.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: file.type,
            data: file.data,
          },
        });
      }
    }

    return input;
  }

  private setupNotificationForwarding(): void {
    this.codexBridge.onNotification((notification) => {
      const n = notification as { method?: string; params?: Record<string, unknown> };

      // Handle agent messages
      if (n.method === 'item/added' || n.method === 'turn/updated') {
        this.handleAgentMessage(n.params);
      }

      // Handle permission requests
      if (n.method === 'server/request') {
        this.handlePermissionRequest(n.params);
      }
    });
  }

  private handleAgentMessage(params?: Record<string, unknown>): void {
    const threadId = params?.threadId as string;
    const item = params?.item as Record<string, unknown> | undefined;

    if (!threadId || !item) return;

    // Find chat for this thread
    const sessionEntry = Array.from(this.sessions.entries()).find(
      ([_, s]) => s.threadId === threadId
    );
    if (!sessionEntry) return;

    const [sessionKey, session] = sessionEntry;
    const adapter = this.adapters.get(session.channelType);
    if (!adapter) return;

    const chatId = sessionKey.split(':')[1];

    // Handle different item types
    if (item.type === 'agentMessage' && item.text) {
      adapter.sendMessage(chatId, { text: String(item.text) });
    }

    if (item.type === 'commandExecution') {
      const command = String(item.command || '');
      const output = String(item.aggregatedOutput || item.aggregated_output || '');
      adapter.sendMessage(chatId, {
        text: `\`${command}\`\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\``, // Truncate for Telegram
        parseMode: 'markdown',
      });
    }
  }

  private handlePermissionRequest(params?: Record<string, unknown>): void {
    const method = String(params?.method || '');
    if (method !== 'shellCommand') return;

    const requestId = String(params?.id || '');
    const threadId = String(params?.threadId || '');
    const command = String(params?.command || '');

    // Find chat for this thread
    const sessionEntry = Array.from(this.sessions.entries()).find(
      ([_, s]) => s.threadId === threadId
    );
    if (!sessionEntry) return;

    const [sessionKey, session] = sessionEntry;
    const adapter = this.adapters.get(session.channelType);
    if (!adapter) return;

    const chatId = sessionKey.split(':')[1];

    // Store pending request
    this.pendingRequests.set(requestId, { chatId, channelType: session.channelType });

    // Send permission request with buttons
    adapter.sendMessage(chatId, {
      text: `🔧 **Permission Request**\n\nExecute:\n\`\`\`\n${command}\n\`\`\``, // Markdown
      parseMode: 'markdown',
      buttons: [
        { id: 'allow', text: '✅ Allow', action: 'allow', data: { requestId } },
        { id: 'deny', text: '❌ Deny', action: 'deny', data: { requestId } },
      ],
    });
  }

  private async handleButtonClick(
    chatId: string,
    buttonId: string,
    data: unknown
  ): Promise<void> {
    const { requestId, action } = data as { requestId: string; action: string };

    if (!requestId) return;

    // Resolve the server request
    await this.codexBridge.resolveServerRequest(requestId, {
      decision: buttonId === 'allow' ? 'allow' : 'deny',
    });

    this.pendingRequests.delete(requestId);

    // Send confirmation
    const sessionKey = `${chatId}`; // Need to reconstruct properly
    const session = Array.from(this.sessions.entries()).find(([k]) => k.endsWith(`:${chatId}`));
    if (session) {
      const adapter = this.adapters.get(session[1].channelType);
      await adapter?.sendMessage(chatId, {
        text: buttonId === 'allow' ? '✅ Command approved' : '❌ Command denied',
      });
    }
  }

  async stop(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.stop();
    }
    this.adapters.clear();
  }
}
```

### Step 3: Feishu Adapter (`server/im-bridge/adapters/feishu.ts`)

```typescript
import type { IMAdapter, IMMessage, IMResponse, IMFileAttachment } from '../types';

export interface FeishuConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  domain?: string;
  allowedUsers?: string[];
}

interface FeishuTokenResponse {
  tenant_access_token?: string;
  expire?: number;
}

interface FeishuMessageEvent {
  header: {
    event_id: string;
    token: string;
    create_time: string;
  };
  event: {
    sender: {
      sender_id: {
        open_id: string;
      };
      sender_type: string;
    };
    message: {
      message_id: string;
      chat_id: string;
      chat_type: string;
      message_type: string;
      content: string;
      mentions?: Array<{
        key: string;
        id: {
          open_id: string;
        };
        name: string;
      }>
    };
  };
}

export class FeishuAdapter implements IMAdapter {
  readonly channelType = 'feishu';
  private baseUrl: string;
  private tenantToken: string | null = null;
  private tokenExpireAt = 0;
  private longConnectionAbort?: AbortController;
  private messageHandler?: (msg: IMMessage) => void;
  private buttonHandler?: (chatId: string, buttonId: string, data: unknown) => void;

  constructor(private config: FeishuConfig) {
    this.baseUrl = config.domain || 'https://open.feishu.cn';
  }

  async start(): Promise<void> {
    // Get initial tenant token
    await this.refreshTenantToken();
    console.log('[Feishu] Adapter started');

    // Feishu runs in Long Connection mode. The bridge maintains the
    // WebSocket session and dispatches inbound events/callbacks here.
    this.startLongConnection();
  }

  async stop(): Promise<void> {
    if (this.longConnectionAbort) {
      this.longConnectionAbort.abort();
      this.longConnectionAbort = undefined;
    }
  }

  private async refreshTenantToken(): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        }),
      });
      const data = (await res.json()) as FeishuTokenResponse;
      if (data.tenant_access_token) {
        this.tenantToken = data.tenant_access_token;
        this.tokenExpireAt = Date.now() + (data.expire || 7200) * 1000;
      }
    } catch (err) {
      console.error('[Feishu] Token refresh error:', err);
    }
  }

  private async ensureToken(): Promise<string | null> {
    if (Date.now() > this.tokenExpireAt - 60000) {
      await this.refreshTenantToken();
    }
    return this.tenantToken;
  }

  private startLongConnection(): void {
    this.longConnectionAbort = new AbortController();

    // Pseudocode: establish Feishu Long Connection / WebSocket session.
    // The real implementation should subscribe to event frames for
    // `im.message.receive_v1` and callback frames for `card.action.trigger`.
    console.log('[Feishu] Long Connection mode enabled - waiting for Feishu events');
  }

  // Handle inbound message events delivered via Long Connection.
  async handleMessageEvent(payload: FeishuMessageEvent): Promise<void> {
    const event = payload.event;
    if (!event?.message) return;

    const sender = event.sender;
    const message = event.message;

    // Check allowed users
    const userId = sender.sender_id.open_id;
    if (this.config.allowedUsers?.length && !this.config.allowedUsers.includes(userId)) {
      console.log('[Feishu] User not allowed:', userId);
      return;
    }

    // Parse message content (Feishu sends JSON string)
    let text = '';
    try {
      const content = JSON.parse(message.content);
      text = content.text || '';
    } catch {
      text = message.content;
    }

    // Handle image messages
    const files: IMFileAttachment[] = [];
    if (message.message_type === 'image') {
      try {
        const content = JSON.parse(message.content);
        if (content.image_key) {
          const imageData = await this.downloadImage(content.image_key);
          if (imageData) {
            files.push({
              id: message.message_id,
              name: 'image.png',
              type: 'image/png',
              data: imageData,
            });
          }
        }
      } catch (err) {
        console.error('[Feishu] Image download error:', err);
      }
    }

    const imMessage: IMMessage = {
      id: message.message_id,
      channelType: 'feishu',
      chatId: message.chat_id,
      userId: userId,
      username: userId,
      text,
      timestamp: Date.now(),
      files,
    };

    this.messageHandler?.(imMessage);
  }

  private async downloadImage(imageKey: string): Promise<string | null> {
    const token = await this.ensureToken();
    if (!token) return null;

    try {
      const res = await fetch(
        `${this.baseUrl}/open-apis/im/v1/images/${imageKey}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const buffer = await res.arrayBuffer();
      return Buffer.from(buffer).toString('base64');
    } catch (err) {
      console.error('[Feishu] Image download error:', err);
      return null;
    }
  }

  async sendMessage(chatId: string, response: IMResponse): Promise<void> {
    const token = await this.ensureToken();
    if (!token) {
      console.error('[Feishu] No valid token');
      return;
    }

    // Build card message for buttons, plain text otherwise
    const body: Record<string, unknown> = response.buttons
      ? this.buildCardMessage(chatId, response)
      : {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text: response.text }),
        };

    await fetch(`${this.baseUrl}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  private buildCardMessage(chatId: string, response: IMResponse): Record<string, unknown> {
    const actions = (response.buttons || []).map((b) => ({
      tag: 'button',
      text: { tag: 'plain_text', content: b.text },
      type: 'primary',
      value: { action: b.action, ...b.data },
    }));

    return {
      receive_id: chatId,
      msg_type: 'interactive',
      content: JSON.stringify({
        config: { wide_screen_mode: true },
        header: {
          title: { tag: 'plain_text', content: 'Codex' },
          template: 'blue',
        },
        elements: [
          {
            tag: 'div',
            text: { tag: 'lark_md', content: response.text },
          },
          ...(actions.length > 0
            ? [{ tag: 'action', actions }]
            : []),
        ],
      }),
    };
  }

  // Handle card button callbacks
  async handleCardCallback(payload: {
    open_message_id: string;
    open_chat_id: string;
    action?: { value?: { action?: string; requestId?: string } };
  }): Promise<void> {
    const action = payload.action?.value;
    if (action?.action && action.requestId) {
      this.buttonHandler?.(
        payload.open_chat_id,
        action.action,
        { requestId: action.requestId }
      );
    }
  }

  onMessage(handler: (msg: IMMessage) => void): void {
    this.messageHandler = handler;
  }

  onButtonClick(handler: (chatId: string, buttonId: string, data: unknown) => void): void {
    this.buttonHandler = handler;
  }
}
```

### Step 4: Integrate into `standalone.ts`

Modify the `main()` function to start the IM bridge:

```typescript
// At imports
import { IMBridge } from './im-bridge';

// In main()
async function main() {
  const PORT = Number(process.env.PORT || process.env.BRIDGE_PORT || 3457);

  // ... existing setup ...

  await bridge.start();
  console.log('Bridge ready');

  // Start IM Bridge with Feishu as default
  const imBridge = new IMBridge(bridge, {
    feishu: {
      enabled: process.env.IM_FEISHU_ENABLED === 'true',
      appId: process.env.IM_FEISHU_APP_ID || '',
      appSecret: process.env.IM_FEISHU_APP_SECRET || '',
      domain: process.env.IM_FEISHU_DOMAIN,
      allowedUsers: process.env.IM_FEISHU_ALLOWED_USERS?.split(','),
    },
    defaultModel: process.env.IM_DEFAULT_MODEL,
    autoApprove: process.env.IM_AUTO_APPROVE === 'true',
  });

  await imBridge.start();
  console.log('IM Bridge ready');

  // ... server setup ...

  // Cleanup
  const shutdown = () => {
    console.log('Shutting down...');
    imBridge.stop();
    bridge.stop();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
```

## Environment Configuration

Create a `.env` file in the project root (`/home/chris/repo/codexUI/codex-ui-react/.env`):

```bash
# Enabled Channels
IM_ENABLED_CHANNELS=feishu

# Feishu (Lark) Configuration
IM_FEISHU_ENABLED=true
IM_FEISHU_APP_ID=cli_a95e5e0371211bd3
IM_FEISHU_APP_SECRET=j4sWTpFKIVrPafoh7mzCVnb1lrFXpylq
IM_FEISHU_DOMAIN=
IM_FEISHU_ALLOWED_USERS=

# Runtime Configuration
IM_RUNTIME=codex
IM_DEFAULT_WORKDIR=/home/chris/111
IM_DEFAULT_MODE=ask

# Default Model for IM sessions
IM_DEFAULT_MODEL=kimi-for-coding

# Auto-approve all tool calls (optional, for trusted environments)
IM_AUTO_APPROVE=false
```

### Loading the .env File

**Option 1: Node.js Native (Node.js 20.6+)**

Start the server with the `--env-file` flag:

```bash
node --env-file=.env server/standalone.ts
# or with bun
bun --env-file=.env run server/standalone.ts
```

**Option 2: Using dotenv Package**

Install `dotenv`:
```bash
npm install dotenv
# or
bun add dotenv
```

Add to the top of `server/standalone.ts`:
```typescript
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env file from project root
config({ path: resolve(__dirname, '../.env') });

// Now process.env contains your config
console.log('[Config] Loaded IM_FEISHU_ENABLED:', process.env.IM_FEISHU_ENABLED);
```

**Option 3: Custom Config Loader**

Create `server/config.ts`:
```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnvFile(path: string): void {
  try {
    const content = readFileSync(path, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    console.log('[Config] Loaded .env from:', path);
  } catch (err) {
    console.warn('[Config] Failed to load .env file:', err);
  }
}

// Auto-load on import
loadEnvFile(resolve(__dirname, '../.env'));
```

Then import at the top of `standalone.ts`:
```typescript
import './config'; // Loads .env before other imports
```

### Feishu App Setup

1. Go to [Feishu Open Platform](https://open.feishu.cn/app) and create a Custom App
2. Get the **App ID** and **App Secret** from the app credentials page
3. Enable Bot feature under "Add Features"
4. In **Permissions & Scopes**, add these required scopes:
   - `im:chat:readonly` - Read chat info
   - `im:message` - Send messages
   - `im:message.group` - Send group messages
   - `im:resource` - Access resources (for images)
5. In **Events & Callbacks**, select **"Long Connection"** as event dispatch method
6. Add `im.message.receive_v1` event to receive messages
7. Add `card.action.trigger` callback so Feishu can deliver card button interactions
8. Go to **Version Management & Release** → create version → submit for review → approve in Admin Console

## Session Persistence

For production, persist IM sessions to survive server restarts:

```typescript
// server/im-bridge/store.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class IMStore {
  private filePath: string;

  constructor(codexHome: string) {
    this.filePath = join(codexHome, 'im-sessions.json');
  }

  async load(): Promise<Map<string, { threadId: string; channelType: string }>> {
    try {
      const data = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(data);
      return new Map(Object.entries(parsed));
    } catch {
      return new Map();
    }
  }

  async save(sessions: Map<string, { threadId: string; channelType: string }>): Promise<void> {
    const data = Object.fromEntries(sessions);
    await writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}
```

## Security Considerations

1. **User Verification**: Always use `allowedUsers` to restrict who can interact with the bot
2. **Command Approval**: Set `autoApprove: false` in production to require explicit permission for shell commands
3. **Token Storage**: 
   - Store bot tokens in the `.env` file
   - Add `.env` to `.gitignore` to prevent accidental commits
   - Set file permissions: `chmod 600 .env`
4. **Rate Limiting**: Add rate limiting per user to prevent abuse

### .gitignore

Add to your `.gitignore`:
```gitignore
# Environment variables
.env
.env.local
.env.*.local

# IM session data
.codex/im-sessions.json
```

## Testing

1. Create the `.env` file with your Feishu configuration (see Environment Configuration section above).

2. Start the server (the .env file will be loaded automatically):
   ```bash
   # If using Node.js 20.6+ native --env-file
   node --env-file=.env server/standalone.ts

   # If using bun
   bun --env-file=.env run server/standalone.ts

   # Or if you added the dotenv import to standalone.ts, just run normally:
   bun run server/standalone.ts
   ```

   The server will load config from `.env` and output:
   ```
   [Config] Loaded IM_FEISHU_ENABLED: true
   Bridge ready
   IM Bridge ready
   ```

2. In Feishu Open Platform, switch **Events & Callbacks** to **Long Connection** and add:
  - `im.message.receive_v1`
  - `card.action.trigger`

3. If this is a fresh app, publish the updated version and approve it in Admin Console.

4. Restart the server after any config or permission changes so it re-establishes the Feishu connection.

5. Send a message to your Feishu bot in a chat

6. The bot should:
   - Create a new thread via Codex
   - Forward your message
   - Stream responses back to Feishu
   - Show Allow/Deny card buttons for shell commands

## Future Enhancements

1. **Telegram Adapter**: Add Telegram Bot API support
2. **Discord Adapter**: Use discord.js library for richer interactions
3. **WeChat Adapter**: Add WeChat Web API support
4. **Session Management**: Add `/new` command to start fresh conversations
5. **Image Generation**: Support for image output display
6. **File Uploads**: Allow users to upload documents for analysis

## References

- Codex CLI JSON-RPC API: See `CodexBridge.call()` methods in `standalone.ts`
- claude-to-im skill: Reference implementation at `.codex/skills/claude-to-im/`
- Feishu Open API: https://open.feishu.cn/document/home/index
- Telegram Bot API: https://core.telegram.org/bots/api
