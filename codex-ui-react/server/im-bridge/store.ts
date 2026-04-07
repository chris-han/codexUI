import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface IMSession {
  threadId: string;
  channelType: string;
}

export class IMStore {
  private filePath: string;

  constructor(codexHome: string) {
    this.filePath = join(codexHome, 'im-sessions.json');
  }

  async load(): Promise<Map<string, IMSession>> {
    try {
      const data = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(data) as Record<string, IMSession>;
      return new Map(Object.entries(parsed));
    } catch {
      return new Map();
    }
  }

  async save(sessions: Map<string, IMSession>): Promise<void> {
    const data = Object.fromEntries(sessions);
    await writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}
