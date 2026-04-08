export interface IMFileAttachment {
  id: string;
  name: string;
  type: string;
  data: string; // base64
}

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

export interface IMButton {
  id: string;
  text: string;
  action: 'allow' | 'deny' | 'custom';
  data?: unknown;
}

export interface IMResponse {
  text?: string;
  buttons?: IMButton[];
  parseMode?: 'markdown' | 'html';
}

export interface IMAdapter {
  readonly channelType: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(chatId: string, response: IMResponse): Promise<void>;
  onMessage(handler: (msg: IMMessage) => void): void;
  onButtonClick(handler: (chatId: string, buttonId: string, data: unknown) => void): void;
}

export interface FeishuConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  domain?: string;
  allowedUsers?: string[];
}

export interface IMBridgeConfig {
  feishu?: FeishuConfig;
  defaultModel?: string;
  autoApprove?: boolean;
  userThreadsPath?: string;
}
