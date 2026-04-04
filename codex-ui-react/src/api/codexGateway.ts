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
  UiReviewAction,
  UiReviewActionLevel,
  UiReviewResult,
  UiReviewScope,
  UiReviewSnapshot,
  UiReviewWorkspaceView,
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

type SkillsListResponseEntry = {
  cwd?: string;
  skills?: Array<{
    name?: string;
    description?: string;
    shortDescription?: string;
    path?: string;
    scope?: string;
    enabled?: boolean;
  }>;
  errors?: unknown[];
};

const PROVIDER_MODELS_FETCH_TIMEOUT_MS = 5_000;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

function getErrorMessageFromPayload(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload.message;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fallback;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error.trim()) {
    return record.error;
  }

  if (record.error && typeof record.error === 'object' && !Array.isArray(record.error)) {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === 'string' && nested.message.trim()) {
      return nested.message;
    }
  }

  return fallback;
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

function isThreadNotMaterializedYetError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return (
    message.includes('not materialized yet') ||
    message.includes('includeTurns is unavailable before first user message')
  );
}

// Thread management
export async function getThreadGroups(): Promise<UiProjectGroup[]> {
  const response = await rpcCall<ThreadListResponse>('thread/list', { includeArchived: false });
  const threads = response.data || [];
  return normalizeThreadsToProjectGroups(threads);
}

async function getEmptyThreadDetailFromList(threadId: string): Promise<{
  messages: UiMessage[];
  thread: UiThread | null;
}> {
  try {
    const response = await rpcCall<ThreadListResponse>('thread/list', { includeArchived: false });
    const summary = (response.data || []).find((thread) => thread.id === threadId);
    return {
      messages: [],
      thread: summary ? normalizeThreadSummaryToUiThread(summary) : null,
    };
  } catch {
    return { messages: [], thread: null };
  }
}

export async function getThreadDetail(threadId: string): Promise<{
  messages: UiMessage[];
  thread: UiThread | null;
}>;
export async function getThreadDetail(
  threadId: string,
  options: { resumeFirst?: boolean }
): Promise<{
  messages: UiMessage[];
  thread: UiThread | null;
}>;
export async function getThreadDetail(
  threadId: string,
  options: { resumeFirst?: boolean } = {}
): Promise<{
  messages: UiMessage[];
  thread: UiThread | null;
}> {
  if (options.resumeFirst) {
    try {
      await resumeThread(threadId);
    } catch (error: unknown) {
      if (isThreadNotMaterializedYetError(error)) {
        return await getEmptyThreadDetailFromList(threadId);
      }
      if (isMissingRolloutError(error) || isThreadNotFoundError(error)) {
        // Fall through to thread/read below — thread exists but has no rollout yet
      }
    }
  }

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
        if (isThreadNotMaterializedYetError(resumeError)) {
          return await getEmptyThreadDetailFromList(threadId);
        }
        if (isMissingRolloutError(resumeError)) {
          return await getEmptyThreadDetailFromList(threadId);
        }
        console.error('Failed to resume thread:', resumeError);
      }
    }
    if (isThreadNotMaterializedYetError(error)) {
      return await getEmptyThreadDetailFromList(threadId);
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
  await rpcCall('config/value/write', {
    keyPath: 'model',
    value: model,
    mergeStrategy: 'upsert',
    filePath: null,
    expectedVersion: null,
  });
}

export async function setCodexSpeedMode(speedMode: SpeedMode): Promise<void> {
  const normalizedMode: SpeedMode = speedMode === 'fast' ? 'fast' : 'standard';
  await rpcCall('config/batchWrite', {
    edits: [
      {
        keyPath: 'features.fast_mode',
        value: true,
        mergeStrategy: 'upsert',
      },
      {
        keyPath: 'service_tier',
        value: normalizedMode === 'fast' ? 'fast' : null,
        mergeStrategy: normalizedMode === 'fast' ? 'upsert' : 'replace',
      },
    ],
    filePath: null,
    expectedVersion: null,
  });
}

// Skills
export async function getSkillsList(): Promise<SkillInfo[]> {
  try {
    const result = await rpcCall<{ data?: unknown }>('skills/list', {});
    return normalizeSkillsList(result.data);
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

function parseReviewLocation(value: string): {
  absolutePath: string | null;
  startLine: number | null;
  endLine: number | null;
} {
  const trimmed = value.trim();
  if (!trimmed) {
    return { absolutePath: null, startLine: null, endLine: null };
  }

  const match = trimmed.match(/^(.*?):(\d+)-(\d+)$/u);
  if (!match) {
    return { absolutePath: trimmed || null, startLine: null, endLine: null };
  }

  return {
    absolutePath: match[1]?.trim() || null,
    startLine: Number(match[2]),
    endLine: Number(match[3]),
  };
}

function parseReviewText(reviewText: string): UiReviewResult {
  const normalized = reviewText.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { reviewText: '', summary: '', findings: [] };
  }

  const markerIndex = normalized.search(/\n(?:Full review comments|Review comment):\n/iu);
  const summary = markerIndex >= 0 ? normalized.slice(0, markerIndex).trim() : normalized;
  const findingsSection = markerIndex >= 0 ? normalized.slice(markerIndex).trim() : '';
  const findings = [];

  if (findingsSection) {
    const body = findingsSection
      .replace(/^(?:Full review comments|Review comment):\n*/iu, '')
      .trim();
    const matches = body.matchAll(/^- (.+?) — (.+)\n?((?:  .*(?:\n|$))*)/gmu);
    let index = 0;
    for (const match of matches) {
      const title = match[1]?.trim() ?? '';
      const location = parseReviewLocation(match[2] ?? '');
      const block = (match[0] ?? '').trim();
      const findingBody = (match[3] ?? '')
        .split('\n')
        .map((line) => line.replace(/^  /u, ''))
        .join('\n')
        .trim();

      findings.push({
        id: `finding:${index}`,
        title: title || `Finding ${index + 1}`,
        body: findingBody,
        path: location.absolutePath
          ? location.absolutePath.split('/').filter(Boolean).slice(-1)[0] ?? location.absolutePath
          : null,
        absolutePath: location.absolutePath,
        startLine: location.startLine,
        endLine: location.endLine,
        rawText: block,
      });
      index += 1;
    }
  }

  return {
    reviewText: normalized,
    summary,
    findings,
  };
}

function readLatestReviewItem(
  payload: ThreadReadResult,
  type: 'enteredReviewMode' | 'exitedReviewMode',
): string | null {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : [];
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex];
    const items = Array.isArray(turn?.items) ? turn.items : [];
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = items[itemIndex] as Record<string, unknown> | undefined;
      if (item?.type !== type) continue;
      const review = typeof item.review === 'string' ? item.review.trim() : '';
      if (review) return review;
    }
  }
  return null;
}

export async function getThreadReviewResult(threadId: string): Promise<{
  enteredReviewLabel: string | null;
  result: UiReviewResult | null;
}> {
  const payload = await rpcCall<ThreadReadResult>('thread/read', {
    threadId,
    includeTurns: true,
  });

  const exitedReview = readLatestReviewItem(payload, 'exitedReviewMode');
  return {
    enteredReviewLabel: readLatestReviewItem(payload, 'enteredReviewMode'),
    result: exitedReview ? parseReviewText(exitedReview) : null,
  };
}

export async function getReviewSnapshot(
  cwd: string,
  scope: UiReviewScope,
  workspaceView: UiReviewWorkspaceView,
  baseBranch?: string | null,
): Promise<UiReviewSnapshot> {
  const query = new URLSearchParams({ cwd, scope, workspaceView });
  if (baseBranch && baseBranch.trim()) {
    query.set('baseBranch', baseBranch.trim());
  }

  const response = await fetch(`/codex-api/review/snapshot?${query.toString()}`);
  const payload = (await response.json()) as { data?: UiReviewSnapshot; error?: string };
  if (!response.ok || !payload.data) {
    throw new Error(getErrorMessageFromPayload(payload, 'Failed to load review snapshot'));
  }
  return payload.data;
}

export async function applyGitReviewAction(payload: {
  cwd: string;
  scope: UiReviewScope;
  workspaceView: UiReviewWorkspaceView;
  action: UiReviewAction;
  level: UiReviewActionLevel;
  path?: string;
  previousPath?: string | null;
  patch?: string;
}): Promise<UiReviewSnapshot> {
  const response = await fetch('/codex-api/review/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as { data?: UiReviewSnapshot; error?: string };
  if (!response.ok || !data.data) {
    throw new Error(getErrorMessageFromPayload(data, 'Failed to apply review action'));
  }
  return data.data;
}

export async function initializeReviewGit(cwd: string): Promise<void> {
  const response = await fetch('/codex-api/review/git/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd }),
  });
  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(payload, 'Failed to initialize Git'));
  }
}

export async function startThreadReview(
  threadId: string,
  scope: UiReviewScope,
  workspaceView: UiReviewWorkspaceView,
  baseBranch?: string | null,
): Promise<void> {
  const target = scope === 'baseBranch'
    ? { type: 'baseBranch' as const, branch: (baseBranch ?? '').trim() }
    : { type: 'uncommittedChanges' as const };
  if (target.type === 'baseBranch' && !target.branch) {
    throw new Error('Base branch is unavailable');
  }

  await rpcCall('review/start', {
    threadId,
    target,
    delivery: 'inline',
    workspaceView,
  });
}

// Normalization helpers
function normalizeThreadsToProjectGroups(threads: ThreadSummary[]): UiProjectGroup[] {
  const groups = new Map<string, UiThread[]>();

  for (const thread of threads) {
    const uiThread = normalizeThreadSummaryToUiThread(thread);
    const projectName = uiThread.projectName;

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

function normalizeThreadSummaryToUiThread(thread: ThreadSummary): UiThread {
  const projectName = extractProjectName(thread.cwd);
  return {
    id: thread.id,
    title: thread.title || thread.name || thread.preview || 'Untitled',
    projectName,
    cwd: thread.cwd,
    hasWorktree: false,
    createdAtIso: new Date(thread.createdAt * 1000).toISOString(),
    updatedAtIso: new Date(thread.updatedAt * 1000).toISOString(),
    preview: thread.preview || '',
    unread: false,
    inProgress: false,
  };
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
  const turns = Array.isArray(thread.turns) ? thread.turns : [];

  // Convert turns to messages
  for (let turnIndex = 0; turnIndex < turns.length; turnIndex++) {
    const turn = turns[turnIndex];
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
    title: thread.preview || thread.name || projectName || 'Untitled',
    projectName,
    cwd: thread.cwd,
    hasWorktree: false,
    createdAtIso: new Date(thread.createdAt * 1000).toISOString(),
    updatedAtIso: new Date(thread.updatedAt * 1000).toISOString(),
    preview: thread.preview || '',
    unread: false,
    inProgress: turns.some((t) => t.status === 'in_progress'),
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

function normalizeSkillsList(data: unknown): SkillInfo[] {
  if (!Array.isArray(data)) return [];

  const flattened: SkillInfo[] = [];
  const seen = new Set<string>();

  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue;

    const grouped = entry as SkillsListResponseEntry;
    if (Array.isArray(grouped.skills)) {
      for (const skill of grouped.skills) {
        if (!skill || typeof skill !== 'object') continue;
        const name = typeof skill.name === 'string' ? skill.name.trim() : '';
        const path = typeof skill.path === 'string' ? skill.path.trim() : '';
        const id = path || name;
        if (!id || !name || seen.has(id)) continue;
        seen.add(id);
        flattened.push({
          id,
          name,
          description:
            (typeof skill.shortDescription === 'string' && skill.shortDescription.trim()) ||
            (typeof skill.description === 'string' && skill.description.trim()) ||
            '',
          isInstalled: true,
          path: path || undefined,
          scope: typeof skill.scope === 'string' ? skill.scope : undefined,
          enabled: typeof skill.enabled === 'boolean' ? skill.enabled : undefined,
        });
      }
      continue;
    }

    const record = entry as Record<string, unknown>;
    const id =
      (typeof record.id === 'string' && record.id.trim()) ||
      (typeof record.path === 'string' && record.path.trim()) ||
      (typeof record.name === 'string' && record.name.trim()) ||
      '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    flattened.push({
      id,
      name,
      description: typeof record.description === 'string' ? record.description.trim() : '',
      isInstalled:
        typeof record.isInstalled === 'boolean'
          ? record.isInstalled
          : true,
      path: typeof record.path === 'string' ? record.path : undefined,
      scope: typeof record.scope === 'string' ? record.scope : undefined,
      enabled: typeof record.enabled === 'boolean' ? record.enabled : undefined,
    });
  }

  return flattened;
}

function extractProjectName(cwd: string): string {
  const parts = cwd.split('/');
  return parts[parts.length - 1] || cwd;
}
