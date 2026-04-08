import type { IMAdapter, IMMessage, IMBridgeConfig } from './types.js';
import { IMStore } from './store.js';
import { join } from 'path';

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
  private pendingTurnWarnings = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly codexBridge: BridgeCaller,
    private readonly config: IMBridgeConfig,
    codexHome?: string,
  ) {
    if (codexHome) {
      this.store = new IMStore(codexHome);
    }
  }

  private getThreadCwd(channelType: string): string {
    const basePath = this.config.userThreadsPath || process.cwd();
    return join(basePath, channelType);
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
    this.clearAllTurnWarnings();
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
        const threadCwd = this.getThreadCwd(msg.channelType);
        const result = asRecord(await this.codexBridge.call('thread/start', {
          cwd: threadCwd,
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
        await this.notifyChatError(msg.channelType, msg.chatId, 'AI 后端当前不可用，请稍后重试。');
        return;
      }
    }

    try {
      await this.codexBridge.call('turn/start', {
        threadId: session.threadId,
        input: this.buildInput(msg),
        approvalPolicy: this.config.autoApprove ? 'never' : undefined,
      });
      this.armTurnWarning(session.threadId, msg.channelType, msg.chatId);
    } catch (err) {
      console.error('[IMBridge] Failed to start turn:', err instanceof Error ? err.message : err);
      this.clearTurnWarning(session.threadId);
      await this.notifyChatError(msg.channelType, msg.chatId, 'AI 后端当前不可用，请检查模型代理或账号状态后重试。');
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

      if (method === 'error') {
        this.handleProtocolError(params);
      }

      if (method === 'backend/disconnected') {
        this.handleBackendDisconnected(params);
      }
    });
  }

  private handleAgentMessage(params: Record<string, unknown>): void {
    const threadId = params['threadId'] as string | undefined;
    const item = asRecord(params['item']);
    if (!threadId) return;

    const sessionEntry = Array.from(this.sessions.entries()).find(([, s]) => s.threadId === threadId);
    if (!sessionEntry) return;

    const [sessionKey, session] = sessionEntry;
    const adapter = this.adapters.get(session.channelType);
    if (!adapter) return;

    const chatId = sessionKey.split(':').slice(1).join(':');

    if (item) {
      if (item['type'] === 'agentMessage' && item['text']) {
        this.clearTurnWarning(threadId);
        adapter.sendMessage(chatId, { text: String(item['text']) });
        return;
      }

      if (item['type'] === 'commandExecution') {
        this.clearTurnWarning(threadId);
        const command = String(item['command'] ?? '');
        const output = String(item['aggregatedOutput'] ?? item['aggregated_output'] ?? '');
        adapter.sendMessage(chatId, {
          text: `\`${command}\`\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\``,
          parseMode: 'markdown',
        });
        return;
      }

      if (item['type'] === 'error') {
        this.clearTurnWarning(threadId);
        const errorMessage = this.extractErrorMessage(item);
        if (errorMessage) {
          adapter.sendMessage(chatId, { text: `⚠️ ${errorMessage}` });
        }
        return;
      }
    }

    const turn = asRecord(params['turn']);
    const turnError = this.extractErrorMessage(turn?.['error']);
    const turnStatus = typeof turn?.['status'] === 'string' ? turn['status'] : undefined;
    if (turnError && turnStatus === 'failed') {
      this.clearTurnWarning(threadId);
      adapter.sendMessage(chatId, { text: `⚠️ ${turnError}` });
      return;
    }

    if (turnStatus === 'completed') {
      this.clearTurnWarning(threadId);
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

  private async notifyChatError(channelType: string, chatId: string, message: string): Promise<void> {
    const adapter = this.adapters.get(channelType);
    await adapter?.sendMessage(chatId, { text: `⚠️ ${message}` });
  }

  private armTurnWarning(threadId: string, channelType: string, chatId: string): void {
    this.clearTurnWarning(threadId);
    const timer = setTimeout(() => {
      this.pendingTurnWarnings.delete(threadId);
      void this.notifyChatError(channelType, chatId, 'AI 后端本轮响应超时，请检查模型代理或账号状态后重试。');
    }, 45000);
    this.pendingTurnWarnings.set(threadId, timer);
  }

  private clearTurnWarning(threadId: string | undefined): void {
    if (!threadId) return;
    const timer = this.pendingTurnWarnings.get(threadId);
    if (timer) {
      clearTimeout(timer);
      this.pendingTurnWarnings.delete(threadId);
    }
  }

  private clearAllTurnWarnings(): void {
    for (const timer of this.pendingTurnWarnings.values()) {
      clearTimeout(timer);
    }
    this.pendingTurnWarnings.clear();
  }

  private extractErrorMessage(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    const record = asRecord(value);
    if (!record) return null;

    const directMessage = record['message'];
    if (typeof directMessage === 'string' && directMessage.trim()) {
      return directMessage.trim();
    }

    const nestedError = asRecord(record['error']);
    const nestedMessage = nestedError?.['message'];
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage.trim();
    }

    return null;
  }

  private handleProtocolError(params: Record<string, unknown>): void {
    const message = this.extractErrorMessage(params);
    if (!message) return;

    const threadId = typeof params['threadId'] === 'string' ? params['threadId'] : undefined;
    this.clearTurnWarning(threadId);
    if (threadId) {
      const sessionEntry = Array.from(this.sessions.entries()).find(([, s]) => s.threadId === threadId);
      if (sessionEntry) {
        const [sessionKey, session] = sessionEntry;
        const adapter = this.adapters.get(session.channelType);
        if (adapter) {
          const chatId = sessionKey.split(':').slice(1).join(':');
          void adapter.sendMessage(chatId, { text: `⚠️ ${message}` });
          return;
        }
      }
    }

    for (const [sessionKey, session] of this.sessions.entries()) {
      const adapter = this.adapters.get(session.channelType);
      if (!adapter) continue;

      const chatId = sessionKey.split(':').slice(1).join(':');
      void adapter.sendMessage(chatId, { text: `⚠️ ${message}` });
    }
  }

  private handleBackendDisconnected(params: Record<string, unknown>): void {
    this.clearAllTurnWarnings();
    const message = String(params['message'] ?? 'AI backend disconnected unexpectedly');

    for (const [sessionKey, session] of this.sessions.entries()) {
      const adapter = this.adapters.get(session.channelType);
      if (!adapter) continue;

      const chatId = sessionKey.split(':').slice(1).join(':');
      void adapter.sendMessage(chatId, {
        text: `⚠️ AI 后端连接已中断：${message}。请检查模型代理或账号状态后重试。`,
      });
    }
  }
}
