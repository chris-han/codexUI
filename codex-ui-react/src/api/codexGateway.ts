import type {
  CollaborationModeOption,
  ReasoningEffort,
  RpcNotification,
  SkillInfo,
  SpeedMode,
  ThreadReadResult,
  ThreadSummary,
  UiAccountEntry,
  UiMessage,
  UiProjectGroup,
  UiRateLimitSnapshot,
  UiServerRequest,
  UiThread,
} from '../types/codex';
import {
  CodexApiError,
  fetchPendingServerRequests,
  respondServerRequest,
  rpcCall,
  subscribeRpcNotifications,
} from './codexRpcClient';

export { CodexApiError };
export type { RpcNotification };

// Types for API responses
type ThreadListResponse = {
  data: ThreadSummary[];
};

type ProviderModelsResponse = {
  data?: unknown;
};

type WorkspaceRootsState = {
  order: string[];
  labels: Record<string, string>;
  active: string[];
};

const PROVIDER_MODELS_FETCH_TIMEOUT_MS = 5_000;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

function isThreadNotLoadedError(error: unknown): boolean {
  return getErrorMessage(error).includes('thread not loaded');
}

function isThreadNotFoundError(error: unknown): boolean {
  return getErrorMessage(error).includes('thread not found');
}

function isMissingRolloutError(error: unknown): boolean {
  return getErrorMessage(error).includes('no rollout found for thread id');
}

// Thread management
export async function getThreadGroups(): Promise<UiProjectGroup[]> {
  const response = await rpcCall<ThreadListResponse>('thread/list', { includeArchived: false });
  const threads = response.data || [];
  return normalizeThreadsToProjectGroups(threads);
}

export async function getThreadDetail(threadId: string): Promise<{
  messages: UiMessage[];
  thread: UiThread | null;
}> {
  try {
    const result = await rpcCall<ThreadReadResult>('thread/read', {
      threadId,
      includeTurns: true,
    });
    return normalizeThreadDetail(result);
  } catch (error: unknown) {
    // If thread is not loaded, try to resume it first
    if (isThreadNotLoadedError(error)) {
      console.log('Thread not loaded, attempting to resume:', threadId);
      try {
        await resumeThread(threadId);
        // Retry read after resume
        const result = await rpcCall<ThreadReadResult>('thread/read', {
          threadId,
          includeTurns: true,
        });
        return normalizeThreadDetail(result);
      } catch (resumeError: unknown) {
        if (isMissingRolloutError(resumeError)) {
          console.warn('Thread has no resumable rollout, clearing selection:', threadId);
          return { messages: [], thread: null };
        }
        console.error('Failed to resume thread:', resumeError);
      }
    }
    console.error('Failed to load thread detail:', error);
    return { messages: [], thread: null };
  }
}

export async function startThread(params: {
  cwd: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
}): Promise<{ threadId: string }> {
  const result = await rpcCall<{ thread?: { id: string }; id?: string }>('thread/start', {
    cwd: params.cwd,
    model: params.model,
    reasoning_effort: params.reasoningEffort,
  });
  // Handle both formats: { thread: { id } } and { id }
  const threadId = result.thread?.id ?? result.id;
  if (!threadId) {
    throw new Error('Thread ID not found in response');
  }
  return { threadId };
}

export async function resumeThread(threadId: string): Promise<void> {
  await rpcCall('thread/resume', { threadId });
}

export async function archiveThread(threadId: string): Promise<void> {
  await rpcCall('thread/archive', { threadId });
}

export async function renameThread(threadId: string, name: string): Promise<void> {
  await rpcCall('thread/name/set', { threadId, name });
}

export async function forkThread(
  threadId: string,
  options?: {
    cwd?: string;
    model?: string;
  }
): Promise<{ threadId: string }> {
  const result = await rpcCall<{ id: string }>('thread/fork', {
    threadId,
    cwd: options?.cwd,
    model: options?.model,
  });
  return { threadId: result.id };
}

// Turn management
export async function startThreadTurn(
  threadId: string,
  message: string,
  options?: {
    collaborationMode?: string;
    reasoningEffort?: ReasoningEffort;
  }
): Promise<void> {
  const request = {
    threadId,
    input: [{ type: 'text', text: message }],
    collaboration_mode: options?.collaborationMode,
    reasoning_effort: options?.reasoningEffort,
  };

  try {
    await rpcCall('turn/start', request);
  } catch (error: unknown) {
    if (isThreadNotLoadedError(error) || isThreadNotFoundError(error)) {
      try {
        await resumeThread(threadId);
        await rpcCall('turn/start', request);
        return;
      } catch (resumeError: unknown) {
        if (isMissingRolloutError(resumeError)) {
          throw new Error(`Thread has no resumable rollout: ${threadId}`);
        }
        throw resumeError;
      }
    }
    throw error;
  }
}

export async function interruptThreadTurn(threadId: string): Promise<void> {
  await rpcCall('turn/interrupt', { threadId });
}

// Model and configuration
export async function getAvailableModelIds(): Promise<string[]> {
  try {
    const result = await rpcCall<{ data?: Array<string | { id?: string; model?: string }> }>('model/list');
    const ids = (result.data || [])
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        return entry.id || entry.model || '';
      })
      .filter(Boolean);

    try {
      const response = await fetch('/codex-api/provider-models', {
        signal: AbortSignal.timeout(PROVIDER_MODELS_FETCH_TIMEOUT_MS),
      });

      let providerPayload: ProviderModelsResponse | null = null;
      try {
        providerPayload = await response.json() as ProviderModelsResponse;
      } catch {
        providerPayload = null;
      }

      if (response.ok && Array.isArray(providerPayload?.data)) {
        for (const candidate of providerPayload.data) {
          if (typeof candidate !== 'string') continue;
          const normalized = candidate.trim();
          if (!normalized || ids.includes(normalized)) continue;
          ids.push(normalized);
        }
      }
    } catch {
      // Keep the model picker usable when provider discovery is unavailable.
    }

    return ids;
  } catch {
    return [];
  }
}

export async function getCurrentModelConfig(): Promise<{
  model: string;
  reasoningEffort: ReasoningEffort;
}> {
  try {
    const result = await rpcCall<{
      model?: string;
      reasoning_effort?: ReasoningEffort;
      config?: {
        model?: string;
        model_reasoning_effort?: ReasoningEffort;
      };
    }>('config/read', {});
    return {
      model: result.config?.model || result.model || 'kimi-for-coding',
      reasoningEffort:
        result.config?.model_reasoning_effort || result.reasoning_effort || 'medium',
    };
  } catch {
    return { model: 'kimi-for-coding', reasoningEffort: 'medium' };
  }
}

export async function setDefaultModel(model: string): Promise<void> {
  await rpcCall('config/value/write', { key: 'model', value: model });
}

export async function setCodexSpeedMode(speedMode: SpeedMode): Promise<void> {
  await rpcCall('config/value/write', { key: 'speed_mode', value: speedMode });
}

// Skills
export async function getSkillsList(): Promise<SkillInfo[]> {
  try {
    const result = await rpcCall<{ data: SkillInfo[] }>('skills/list', {});
    return result.data || [];
  } catch {
    return [];
  }
}

// Accounts
export async function getAvailableCollaborationModes(): Promise<
  CollaborationModeOption[]
> {
  try {
    const result = await rpcCall<{ data: CollaborationModeOption[] }>(
      'collaborationMode/list'
    );
    return result.data || [];
  } catch {
    return [
      { value: 'default', label: 'Default' },
      { value: 'plan', label: 'Plan Mode' },
    ];
  }
}

export async function getAccountRateLimits(): Promise<{
  accounts: UiAccountEntry[];
}> {
  try {
    const result = await rpcCall<{
      accounts: UiAccountEntry[];
    }>('account/rateLimits/read');
    return result;
  } catch {
    return { accounts: [] };
  }
}

export async function pickCodexRateLimitSnapshot(): Promise<UiRateLimitSnapshot | null> {
  try {
    const { accounts } = await getAccountRateLimits();
    const activeAccount = accounts.find((a) => a.isActive);
    return activeAccount?.quotaSnapshot || null;
  } catch {
    return null;
  }
}

// Server requests
export async function getPendingServerRequests(): Promise<UiServerRequest[]> {
  const requests = await fetchPendingServerRequests();
  return requests.map(normalizeServerRequest).filter(Boolean) as UiServerRequest[];
}

export async function replyToServerRequest(
  requestId: number,
  approved: boolean,
  options?: { duration?: 'always' | 'workingSet' | 'session' }
): Promise<void> {
  await respondServerRequest({
    id: requestId,
    result: {
      approved,
      duration: options?.duration || 'session',
    },
  });
}

// Workspace roots
export async function getWorkspaceRootsState(): Promise<WorkspaceRootsState> {
  try {
    const result = await rpcCall<WorkspaceRootsState>('workspaceRootsState/read');
    return result;
  } catch {
    return { order: [], labels: {}, active: [] };
  }
}

export async function setWorkspaceRootsState(
  state: WorkspaceRootsState
): Promise<void> {
  await rpcCall('workspaceRootsState/write', state);
}

// Notifications
export function subscribeCodexNotifications(
  onNotification: (notification: RpcNotification) => void
): () => void {
  return subscribeRpcNotifications(onNotification);
}

// Title management
const titleCache = new Map<string, string>();

export function getThreadTitleCache(threadId: string): string | undefined {
  return titleCache.get(threadId);
}

export function persistThreadTitle(threadId: string, title: string): void {
  titleCache.set(threadId, title);
}

export async function generateThreadTitle(
  threadId: string
): Promise<string | null> {
  try {
    const result = await rpcCall<{ title: string }>('thread/generateTitle', {
      threadId,
    });
    if (result.title) {
      persistThreadTitle(threadId, result.title);
    }
    return result.title || null;
  } catch {
    return null;
  }
}

// Thread rollback
export async function rollbackThread(
  threadId: string,
  turnId: string
): Promise<void> {
  await rpcCall('thread/rollback', { threadId, turnId });
}

export async function rollbackWorktreeToMessage(
  _threadId: string,
  _messageId: string
): Promise<void> {
  // Implementation depends on specific requirements
  console.warn('rollbackWorktreeToMessage not fully implemented');
}

// Auto-commit
export async function autoCommitWorktreeChanges(
  _threadId: string,
  _message: string
): Promise<void> {
  // Implementation depends on specific requirements
  console.warn('autoCommitWorktreeChanges not fully implemented');
}

// Normalization helpers
function normalizeThreadsToProjectGroups(threads: ThreadSummary[]): UiProjectGroup[] {
  const groups = new Map<string, UiThread[]>();

  for (const thread of threads) {
    const projectName = extractProjectName(thread.cwd);
    const uiThread: UiThread = {
      id: thread.id,
      title: thread.title || thread.name || thread.preview || 'Untitled',
      projectName,
      cwd: thread.cwd,
      hasWorktree: false, // Will be populated later
      createdAtIso: new Date(thread.createdAt * 1000).toISOString(),
      updatedAtIso: new Date(thread.updatedAt * 1000).toISOString(),
      preview: thread.preview || '',
      unread: false, // Will be computed based on read state
      inProgress: false, // Will be updated via notifications
    };

    if (!groups.has(projectName)) {
      groups.set(projectName, []);
    }
    groups.get(projectName)!.push(uiThread);
  }

  return Array.from(groups.entries()).map(([projectName, threads]) => ({
    projectName,
    threads: threads.sort(
      (a, b) =>
        new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime()
    ),
  }));
}

function normalizeThreadDetail(result: ThreadReadResult): {
  messages: UiMessage[];
  thread: UiThread | null;
} {
  if (!result?.thread) {
    return { messages: [], thread: null };
  }

  const thread = result.thread;
  const messages: UiMessage[] = [];

  // Convert turns to messages
  for (let turnIndex = 0; turnIndex < thread.turns.length; turnIndex++) {
    const turn = thread.turns[turnIndex];
    for (const item of turn.items) {
      const message = normalizeThreadItem(item, turn.id, turnIndex);
      if (message) {
        messages.push(message);
      }
    }
  }

  const projectName = extractProjectName(thread.cwd);
  const uiThread: UiThread = {
    id: thread.id,
    title: thread.preview || 'Untitled',
    projectName,
    cwd: thread.cwd,
    hasWorktree: false,
    createdAtIso: new Date(thread.createdAt * 1000).toISOString(),
    updatedAtIso: new Date(thread.updatedAt * 1000).toISOString(),
    preview: thread.preview || '',
    unread: false,
    inProgress: thread.turns.some((t) => t.status === 'in_progress'),
  };

  return { messages, thread: uiThread };
}

function normalizeThreadItem(
  item: { id: string; type: string; text?: string; content?: unknown },
  turnId: string,
  turnIndex: number
): UiMessage | null {
  const base = {
    id: item.id,
    turnId,
    turnIndex,
  };

  switch (item.type) {
    case 'userMessage':
      return {
        ...base,
        role: 'user' as const,
        text: extractMessageText(item),
      };
    case 'agentMessage':
      return {
        ...base,
        role: 'assistant' as const,
        text: extractMessageText(item),
      };
    case 'systemMessage':
      return {
        ...base,
        role: 'system' as const,
        text: extractMessageText(item),
      };
    default:
      // Handle other item types as needed
      if (item.text) {
        return {
          ...base,
          role: 'assistant' as const,
          text: item.text,
        };
      }
      return null;
  }
}

function extractMessageText(item: { text?: string; content?: unknown }): string {
  if (typeof item.text === 'string' && item.text.length > 0) {
    return item.text;
  }

  if (!Array.isArray(item.content)) {
    return '';
  }

  return item.content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const record = part as Record<string, unknown>;
      return typeof record.text === 'string' ? record.text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function normalizeServerRequest(request: unknown): UiServerRequest | null {
  if (!request || typeof request !== 'object') return null;
  const r = request as Record<string, unknown>;

  return {
    id: typeof r.id === 'number' ? r.id : 0,
    method: typeof r.method === 'string' ? r.method : '',
    threadId: typeof r.threadId === 'string' ? r.threadId : '',
    turnId: typeof r.turnId === 'string' ? r.turnId : '',
    itemId: typeof r.itemId === 'string' ? r.itemId : '',
    receivedAtIso: new Date().toISOString(),
    params: r.params,
  };
}

function extractProjectName(cwd: string): string {
  const parts = cwd.split('/');
  return parts[parts.length - 1] || cwd;
}
