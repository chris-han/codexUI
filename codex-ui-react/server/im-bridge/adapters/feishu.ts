import * as lark from '@larksuiteoapi/node-sdk';
import type { IMAdapter, IMMessage, IMResponse, IMFileAttachment, FeishuConfig } from '../types.js';

interface FeishuMessageEventData {
  sender: {
    sender_id?: {
      open_id?: string;
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
      id: { open_id?: string };
      name: string;
    }>;
  };
}

export class FeishuAdapter implements IMAdapter {
  readonly channelType = 'feishu';

  private wsClient: lark.WSClient | null = null;
  private restClient: lark.Client | null = null;
  private seenMessageIds = new Set<string>();
  private messageHandler?: (msg: IMMessage) => void;
  private buttonHandler?: (chatId: string, buttonId: string, data: unknown) => void;
  private botOpenId: string | null = null;

  constructor(private config: FeishuConfig) {}

  async start(): Promise<void> {
    const domain = this.config.domain === 'lark' ? lark.Domain.Lark : lark.Domain.Feishu;
    const { appId, appSecret } = this.config;

    this.restClient = new lark.Client({ appId, appSecret, domain });

    // Resolve bot identity for self-mention filtering
    await this.resolveBotIdentity();

    // Build event handlers map. card.action.trigger is cast to any because the SDK
    // typings don't list it by default — it's routed via the WSClient monkey-patch below.
    const handlerMap: Record<string, (data: unknown) => Promise<unknown>> = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'im.message.receive_v1': async (data) => {
        await this.handleIncomingMessage(data as FeishuMessageEventData);
      },
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'card.action.trigger': async (data: unknown) => {
        return await this.handleCardAction(data);
      },
    };
    const dispatcher = new lark.EventDispatcher({}).register(handlerMap as Parameters<lark.EventDispatcher['register']>[0]);

    this.wsClient = new lark.WSClient({ appId, appSecret, domain });

    // Monkey-patch to support card.action.trigger (type="card") events.
    // The SDK's WSClient only forwards type="event" messages; card callbacks
    // arrive as type="card" and are silently dropped without this patch.
    const wsAny = this.wsClient as unknown as Record<string, unknown>;
    if (typeof wsAny['handleEventData'] === 'function') {
      const orig = (wsAny['handleEventData'] as (...a: unknown[]) => unknown).bind(this.wsClient);
      wsAny['handleEventData'] = (data: unknown) => {
        const d = data as { headers?: Array<{ key: string; value: string }> };
        const msgType = d.headers?.find((h) => h.key === 'type')?.value;
        if (msgType === 'card') {
          const patched = {
            ...d,
            headers: (d.headers || []).map((h) =>
              h.key === 'type' ? { ...h, value: 'event' } : h,
            ),
          };
          return orig(patched);
        }
        return orig(data);
      };
    }

    this.wsClient.start({ eventDispatcher: dispatcher });
    console.log('[Feishu] Long Connection started (botOpenId:', this.botOpenId || 'unknown', ')');
  }

  async stop(): Promise<void> {
    if (this.wsClient) {
      try {
        (this.wsClient as unknown as { close: (o: unknown) => void }).close({ force: true });
      } catch {
        // ignore
      }
      this.wsClient = null;
    }
    this.restClient = null;
    this.seenMessageIds.clear();
    console.log('[Feishu] Stopped');
  }

  onMessage(handler: (msg: IMMessage) => void): void {
    this.messageHandler = handler;
  }

  onButtonClick(handler: (chatId: string, buttonId: string, data: unknown) => void): void {
    this.buttonHandler = handler;
  }

  async sendMessage(chatId: string, response: IMResponse): Promise<void> {
    if (!this.restClient) {
      console.error('[Feishu] restClient not initialised');
      return;
    }
    try {
      if (response.buttons?.length || response.text?.trim()) {
        await this.sendCardMessage(chatId, response);
      } else {
        await this.sendTextMessage(chatId, response.text ?? '');
      }
    } catch (err) {
      console.error('[Feishu] sendMessage error:', err instanceof Error ? err.message : err);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async resolveBotIdentity(): Promise<void> {
    if (!this.restClient) return;
    try {
      const res = await (this.restClient as unknown as {
        bot: { getInfo: (p: object) => Promise<{ data?: { bot?: { open_id?: string } } }> };
      }).bot.getInfo({});
      this.botOpenId = res?.data?.bot?.open_id ?? null;
    } catch {
      // Non-fatal; filtering by @mention won't work but messages still arrive
    }
  }

  private async handleIncomingMessage(data: FeishuMessageEventData): Promise<void> {
    const { sender, message } = data;
    if (!message) return;

    // Dedup
    if (this.seenMessageIds.has(message.message_id)) return;
    this.seenMessageIds.add(message.message_id);
    if (this.seenMessageIds.size > 1000) {
      const first = this.seenMessageIds.values().next().value;
      if (first !== undefined) this.seenMessageIds.delete(first);
    }

    // Only handle messages from real users
    if (sender.sender_type !== 'user') return;

    const userId = sender.sender_id?.open_id ?? '';

    // Check allowed users
    if (this.config.allowedUsers?.length && !this.config.allowedUsers.includes(userId)) {
      console.log('[Feishu] User not in allowedUsers:', userId);
      return;
    }

    let text = '';
    try {
      const content = JSON.parse(message.content) as Record<string, unknown>;
      if (typeof content['text'] === 'string') {
        text = content['text'];
        // Strip @bot mentions if present
        if (this.botOpenId) {
          text = text.replace(new RegExp(`@_user_\\d+\\s*`, 'g'), '').trim();
        }
      }
    } catch {
      text = message.content;
    }

    // Download image attachments
    const files: IMFileAttachment[] = [];
    if (message.message_type === 'image') {
      try {
        const content = JSON.parse(message.content) as { image_key?: string };
        if (content.image_key) {
          const imageData = await this.downloadResource(content.image_key, 'image');
          if (imageData) {
            files.push({ id: message.message_id, name: 'image.png', type: 'image/png', data: imageData });
          }
        }
      } catch (err) {
        console.error('[Feishu] Image download error:', err instanceof Error ? err.message : err);
      }
    }

    if (!text && files.length === 0) return;

    const imMsg: IMMessage = {
      id: message.message_id,
      channelType: 'feishu',
      chatId: message.chat_id,
      userId,
      username: userId,
      text,
      timestamp: Date.now(),
      files,
    };

    this.messageHandler?.(imMsg);
  }

  private async handleCardAction(data: unknown): Promise<unknown> {
    const FALLBACK = { toast: { type: 'info' as const, content: 'Received' } };
    try {
      const event = data as Record<string, unknown>;
      const value = (event['action'] as Record<string, unknown>)?.['value'] as Record<string, unknown> | undefined;
      if (!value) return FALLBACK;

      const chatId = (event['context'] as Record<string, unknown>)?.['open_chat_id'] as string | undefined
        ?? (value['chatId'] as string | undefined)
        ?? '';
      if (!chatId) return FALLBACK;

      const requestId = value['requestId'] as string | undefined;
      const action = value['action'] as string | undefined;

      if (requestId && action && this.buttonHandler) {
        this.buttonHandler(chatId, action, { requestId });
      }

      return { toast: { type: 'success' as const, content: action === 'allow' ? '✅ Approved' : '❌ Denied' } };
    } catch (err) {
      console.error('[Feishu] Card action error:', err instanceof Error ? err.message : err);
      return FALLBACK;
    }
  }

  private async sendTextMessage(chatId: string, text: string): Promise<void> {
    await this.restClient!.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    });
  }

  private formatCardMarkdown(text: string, parseMode?: IMResponse['parseMode']): string {
    let content = text.trim();

    if (parseMode === 'html') {
      content = content
        .replace(/<b>(.*?)<\/b>/gi, '**$1**')
        .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<i>(.*?)<\/i>/gi, '*$1*')
        .replace(/<em>(.*?)<\/em>/gi, '*$1*')
        .replace(/<code>(.*?)<\/code>/gi, '`$1`')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    return content.replace(/([^\n])```/g, '$1\n```') || '*No content provided.*';
  }

  private async sendCardMessage(chatId: string, response: IMResponse): Promise<void> {
    const text = this.formatCardMarkdown(response.text ?? '', response.parseMode);

    const buttonColumns = (response.buttons ?? []).map((b) => ({
      tag: 'column',
      width: 'auto',
      elements: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: b.text },
          type: b.action === 'allow' ? 'primary' : b.action === 'deny' ? 'danger' : 'default',
          size: 'medium',
          value: {
            action: b.action,
            requestId: (b.data as Record<string, unknown>)?.['requestId'] ?? '',
            chatId,
          },
        },
      ],
    }));

    const elements: Array<Record<string, unknown>> = [
      {
        tag: 'markdown',
        content: text,
      },
    ];

    if (buttonColumns.length > 0) {
      elements.push(
        { tag: 'hr' },
        {
          tag: 'column_set',
          flex_mode: 'none',
          horizontal_align: 'left',
          columns: buttonColumns,
        },
      );
    }

    const card = {
      schema: '2.0',
      config: {
        width_mode: 'fill',
        enable_forward: true,
        update_multi: true,
      },
      header: {
        title: { tag: 'plain_text', content: 'Codex' },
        template: 'blue',
      },
      body: {
        direction: 'vertical',
        vertical_spacing: '8px',
        padding: '12px 12px 12px 12px',
        elements,
      },
    };

    await this.restClient!.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    });
  }

  private async downloadResource(key: string, type: 'image' | 'file'): Promise<string | null> {
    if (!this.restClient) return null;
    try {
      const res = await this.restClient.im.image.get({ path: { image_key: key } });
      // SDK returns a Readable or Buffer depending on version
      const data = res as unknown as { rawBody?: Buffer; data?: Buffer };
      const buffer = data.rawBody ?? data.data;
      if (buffer) return Buffer.from(buffer).toString('base64');
      return null;
    } catch (err) {
      console.error('[Feishu] Resource download error:', err instanceof Error ? err.message : err);
      return null;
    }
  }
}
