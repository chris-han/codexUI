import type { IMAdapter, IMMessage, IMBridgeConfig } from './types.js';
import { IMStore } from './store.js';

interface BridgeCaller {
  call(method: string, params?: unknown): Promise<unknown>;
  resolveServerRequest(id: number | string, result?: unknown, error?: { code?: number; message: string }): void;
  onNotification(listener: (notification: unknown) => void): () => void;
}

interface IMSession {
  threadId: string;
  channelType: string;
}

function asRecord(v: unknown): Record<string, unknown> {
  return (v != null && typeof v === 'object' ? v : {}) as Record<string, unknown>;
}

export class IMBridge {
  private adapters: Map<string, IMAdapter> = new Map();
  private sessions: Map<string, IMSession> = new Map();
  private store: IMStore | null = null;
  private unsubscribeNotifications?: () => void;

  constructor(
    private readonly codexBridge: BridgeCaller,
    private readonly config: IMBridgeConfig,
    codexHome?: string,
  ) {
    if (codexHome) {
      this.store = new IMStore(codexHome);
    }
  }

  async start(): Promise<void> {
    // Restore persisted sessions
    if (this.store) {
      this.sessions = await this.store.load();
    }

    // Setup notification forwarding before starting adapters
    this.setupNotificationForwarding();

    // Initialise enabled adapters
    if (this.config.feishu?.enabled && this.config.feishu.appId) {
      const { FeishuAdapter } = await import('./adapters/feishu.js');
      await this.registerAdapter(new FeishuAdapter(this.config.feishu));
    }

    console.log('[IMBridge] Started with adapters:', Array.from(this.adapters.keys()));
  }

  async stop(): Promise<void> {
    this.unsubscribeNotifications?.();
    for (const adapter of this.adapters.values()) {
      await adapter.stop();
    }
    this.adapters.clear();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async registerAdapter(adapter: IMAdapter): Promise<void> {
    adapter.onMessage((msg) => this.handleMessage(msg));
    adapter.onButtonClick((chatId, buttonId, data) => this.handleButtonClick(chatId, buttonId, data));
    await adapter.start();
    this.adapters.set(adapter.channelType, adapter);
  }

  private async handleMessage(msg: IMMessage): Promise<void> {
    const sessionKey = `${msg.channelType}:${msg.chatId}`;
    let session = this.sessions.get(sessionKey);

    if (!session) {
      try {
        const result = asRecord(await this.codexBridge.call('thread/start', {
          cwd: process.cwd(),
          model: this.config.defaultModel,
        }));
        const threadId = (asRecord(result['thread'])['id'] ?? result['id']) as string | undefined;
        if (!threadId) {
          console.error('[IMBridge] thread/start returned no threadId');
          return;
        }
        session = { threadId, channelType: msg.channelType };
        this.sessions.set(sessionKey, session);
        await this.store?.save(this.sessions);
      } catch (err) {
        console.error('[IMBridge] Failed to start thread:', err instanceof Error ? err.message : err);
        return;
      }
    }

    try {
      await this.codexBridge.call('turn/start', {
        threadId: session.threadId,
        input: this.buildInput(msg),
        approvalPolicy: this.config.autoApprove ? 'never' : undefined,
      });
    } catch (err) {
      console.error('[IMBridge] Failed to start turn:', err instanceof Error ? err.message : err);
    }
  }

  private buildInput(msg: IMMessage): Array<Record<string, unknown>> {
    const input: Array<Record<string, unknown>> = [
      { type: 'text', text: msg.text, text_elements: [] },
    ];

    for (const file of msg.files ?? []) {
      if (file.type.startsWith('image/')) {
        input.push({
          type: 'image',
          source: { type: 'base64', media_type: file.type, data: file.data },
        });
      }
    }

    return input;
  }

  private setupNotificationForwarding(): void {
    this.unsubscribeNotifications = this.codexBridge.onNotification((notification) => {
      const n = asRecord(notification);
      const method = n['method'] as string | undefined;
      const params = asRecord(n['params']);

      if (method === 'item/added' || method === 'item/completed' || method === 'turn/updated') {
        this.handleAgentMessage(params);
      }

      if (method === 'server/request') {
        this.handlePermissionRequest(params);
      }
    });
  }

  private handleAgentMessage(params: Record<string, unknown>): void {
    const threadId = params['threadId'] as string | undefined;
    const item = asRecord(params['item']);
    if (!threadId || !item) return;

    const sessionEntry = Array.from(this.sessions.entries()).find(([, s]) => s.threadId === threadId);
    if (!sessionEntry) return;

    const [sessionKey, session] = sessionEntry;
    const adapter = this.adapters.get(session.channelType);
    if (!adapter) return;

    const chatId = sessionKey.split(':').slice(1).join(':');

    if (item['type'] === 'agentMessage' && item['text']) {
      adapter.sendMessage(chatId, { text: String(item['text']) });
    }

    if (item['type'] === 'commandExecution') {
      const command = String(item['command'] ?? '');
      const output = String(item['aggregatedOutput'] ?? item['aggregated_output'] ?? '');
      adapter.sendMessage(chatId, {
        text: `\`${command}\`\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\``,
        parseMode: 'markdown',
      });
    }
  }

  private handlePermissionRequest(params: Record<string, unknown>): void {
    const method = String(params['method'] ?? '');
    if (method !== 'shellCommand') return;

    const requestId = String(params['id'] ?? '');
    const threadId = String(params['threadId'] ?? '');
    const command = String(params['command'] ?? '');

    const sessionEntry = Array.from(this.sessions.entries()).find(([, s]) => s.threadId === threadId);
    if (!sessionEntry) return;

    const [sessionKey, session] = sessionEntry;
    const adapter = this.adapters.get(session.channelType);
    if (!adapter) return;

    const chatId = sessionKey.split(':').slice(1).join(':');

    adapter.sendMessage(chatId, {
      text: `🔧 **Permission Request**\nExecute:\n\`\`\`\n${command}\n\`\`\``,
      parseMode: 'markdown',
      buttons: [
        { id: 'allow', text: '✅ Allow', action: 'allow', data: { requestId } },
        { id: 'deny', text: '❌ Deny', action: 'deny', data: { requestId } },
      ],
    });
  }

  private async handleButtonClick(chatId: string, buttonId: string, data: unknown): Promise<void> {
    const d = asRecord(data);
    const requestId = d['requestId'] as string | undefined;
    if (!requestId) return;

    try {
      this.codexBridge.resolveServerRequest(requestId, {
        decision: buttonId === 'allow' ? 'allow' : 'deny',
      });
    } catch (err) {
      console.error('[IMBridge] Failed to resolve request:', err instanceof Error ? err.message : err);
    }

    // Send confirmation back to the user
    const sessionEntry = Array.from(this.sessions.entries()).find(([k]) => k.endsWith(`:${chatId}`));
    if (sessionEntry) {
      const adapter = this.adapters.get(sessionEntry[1].channelType);
      await adapter?.sendMessage(chatId, {
        text: buttonId === 'allow' ? '✅ Command approved' : '❌ Command denied',
      });
    }
  }
}
