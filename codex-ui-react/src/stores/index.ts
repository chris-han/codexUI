import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';

// Enable Map/Set support in Immer
enableMapSet();
import type {
  CollaborationModeKind,
  ComposerFileAttachment,
  ComposerSkillSelection,
  ReasoningEffort,
  RpcNotification,
  SkillInfo,
  SpeedMode,
  ThreadComposerSubmitPayload,
  UiAccountEntry,
  UiMessage,
  UiProjectGroup,
  UiRateLimitSnapshot,
  UiServerRequest,
  UiThread,
} from '../types/codex';
import * as api from '../api/codexGateway';
import { subscribeRpcNotifications } from '../api/codexRpcClient';

// Storage keys (matching original)
// const READ_STATE_STORAGE_KEY = 'codex-web-local.thread-read-state.v1';
// const SCROLL_STATE_STORAGE_KEY = 'codex-web-local.thread-scroll-state.v1';
const SELECTED_THREAD_STORAGE_KEY = 'codex-web-local.selected-thread-id.v1';
// const PROJECT_ORDER_STORAGE_KEY = 'codex-web-local.project-order.v1';
// const PROJECT_DISPLAY_NAME_STORAGE_KEY = 'codex-web-local.project-display-name.v1';
// const COLLABORATION_MODE_STORAGE_KEY = 'codex-web-local.collaboration-mode-by-context.v1';

// Helper to load from localStorage
function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

// Helper to save to localStorage
function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore
  }
}

function removeFromStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

function deriveProjectName(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean);
  return parts[parts.length - 1] || cwd || 'Thread';
}

function createThreadShell(params: {
  threadId: string;
  cwd: string;
  title?: string;
  preview?: string;
  inProgress?: boolean;
}): UiThread {
  const nowIso = new Date().toISOString();
  const projectName = deriveProjectName(params.cwd);
  return {
    id: params.threadId,
    title: params.title?.trim() || projectName,
    projectName,
    cwd: params.cwd,
    hasWorktree: false,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    preview: params.preview || '',
    unread: false,
    inProgress: params.inProgress || false,
  };
}

// ==================== Store State ====================

export interface CodexState {
  // Project/Thread state
  projectGroups: UiProjectGroup[];
  threadShellsById: Map<string, UiThread>;
  selectedThreadId: string | null;
  isLoadingThreads: boolean;

  // Message state
  messagesByThreadId: Map<string, UiMessage[]>;
  pendingTurnRequestsByThreadId: Map<string, PendingTurnRequest>;
  hydratedThreadIds: Set<string>;
  liveMessagesByThreadId: Map<string, string>; // streaming content
  liveReasoningByThreadId: Map<string, string>;
  liveActivityLabelByThreadId: Map<string, string>;
  liveCommandOutputByThreadId: Map<string, string>;
  inProgressByThreadId: Map<string, boolean>;
  activeTurnIdByThreadId: Map<string, string>;
  isLoadingMessages: boolean;
  isSendingMessage: boolean;
  isInterruptingTurn: boolean;

  // UI state
  isSidebarCollapsed: boolean;
  isSidebarSearchVisible: boolean;
  sidebarSearchQuery: string;
  isSettingsOpen: boolean;

  // Model/Config state
  availableModelIds: string[];
  selectedModelId: string;
  selectedReasoningEffort: ReasoningEffort;
  selectedSpeedMode: SpeedMode;
  availableCollaborationModes: { value: CollaborationModeKind; label: string }[];
  selectedCollaborationMode: CollaborationModeKind;

  // Skills state
  installedSkills: SkillInfo[];

  // Account state
  accounts: UiAccountEntry[];
  codexQuota: UiRateLimitSnapshot | null;
  isRefreshingAccounts: boolean;

  // Server requests
  pendingServerRequestsByThreadId: Map<string, UiServerRequest[]>;

  // Error state
  error: string | null;

  // Polling
  isPolling: boolean;
}

export interface CodexActions {
  // Thread actions
  loadThreads: () => Promise<void>;
  selectThread: (threadId: string | null) => Promise<void>;
  loadMessages: (threadId: string) => Promise<void>;
  startNewThread: (
    cwd: string,
    payload?: string | ThreadComposerSubmitPayload
  ) => Promise<string | null>;
  archiveThreadById: (threadId: string) => Promise<void>;
  renameThreadById: (threadId: string, name: string) => Promise<void>;
  forkThreadById: (threadId: string) => Promise<string | null>;
  rollbackThreadToTurn: (threadId: string, turnId: string) => Promise<void>;
  interruptSelectedThreadTurn: () => Promise<void>;

  // Message actions
  sendMessage: (payload: string | ThreadComposerSubmitPayload) => Promise<void>;

  // UI actions
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarSearch: () => void;
  setSidebarSearchQuery: (query: string) => void;
  setSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;

  // Model/Config actions
  initializeModelConfig: () => Promise<void>;
  setSelectedModelId: (modelId: string) => Promise<void>;
  setSelectedReasoningEffort: (effort: ReasoningEffort) => void;
  setSelectedSpeedMode: (speed: SpeedMode) => Promise<void>;
  setSelectedCollaborationMode: (mode: CollaborationModeKind) => void;

  // Skills actions
  loadSkills: () => Promise<void>;

  // Account actions
  refreshAccounts: () => Promise<void>;

  // Server request actions
  respondToServerRequest: (
    requestId: number,
    approved: boolean,
    duration?: 'always' | 'workingSet' | 'session'
  ) => Promise<void>;

  // Sync/Polling
  startPolling: () => void;
  stopPolling: () => void;
  syncAll: () => Promise<void>;

  // Notification handling
  handleNotification: (notification: RpcNotification) => void;

  // Error handling
  clearError: () => void;
  setError: (error: string) => void;
}

// ==================== Initial State ====================

const getInitialState = (): CodexState => ({
  projectGroups: [],
  threadShellsById: new Map(),
  selectedThreadId: loadFromStorage<string | null>(SELECTED_THREAD_STORAGE_KEY, null),
  isLoadingThreads: false,

  messagesByThreadId: new Map(),
  pendingTurnRequestsByThreadId: new Map(),
  hydratedThreadIds: new Set(),
  liveMessagesByThreadId: new Map(),
  liveReasoningByThreadId: new Map(),
  liveActivityLabelByThreadId: new Map(),
  liveCommandOutputByThreadId: new Map(),
  inProgressByThreadId: new Map(),
  activeTurnIdByThreadId: new Map(),
  isLoadingMessages: false,
  isSendingMessage: false,
  isInterruptingTurn: false,

  isSidebarCollapsed: false,
  isSidebarSearchVisible: false,
  sidebarSearchQuery: '',
  isSettingsOpen: false,

  availableModelIds: [],
  selectedModelId: 'kimi-for-coding',
  selectedReasoningEffort: 'medium',
  selectedSpeedMode: 'standard',
  availableCollaborationModes: [
    { value: 'default', label: 'Default' },
    { value: 'plan', label: 'Plan Mode' },
  ],
  selectedCollaborationMode: 'default',

  installedSkills: [],

  accounts: [],
  codexQuota: null,
  isRefreshingAccounts: false,

  pendingServerRequestsByThreadId: new Map(),

  error: null,
  isPolling: false,
});

function clearSelectedThreadState(state: CodexState): void {
  state.selectedThreadId = null;
  removeFromStorage(SELECTED_THREAD_STORAGE_KEY);
}

function normalizeComposerPayload(
  payload?: string | ThreadComposerSubmitPayload
): ThreadComposerSubmitPayload {
  if (typeof payload === 'string') {
    return {
      text: payload,
      imageUrls: [],
      fileAttachments: [],
      skills: [],
    };
  }

  return {
    text: payload?.text ?? '',
    imageUrls: payload?.imageUrls ?? [],
    fileAttachments: payload?.fileAttachments ?? [],
    skills: payload?.skills ?? [],
  };
}

type PendingTurnRequest = {
  text: string;
  imageUrls: string[];
  fileAttachments: ComposerFileAttachment[];
  skills: ComposerSkillSelection[];
  modelId: string;
  reasoningEffort: ReasoningEffort;
  collaborationMode: CollaborationModeKind;
  submittedAtIso: string;
};

function createPendingTurnRequest(params: {
  text: string;
  imageUrls: string[];
  fileAttachments: ComposerFileAttachment[];
  skills: ComposerSkillSelection[];
  modelId: string;
  reasoningEffort: ReasoningEffort;
  collaborationMode: CollaborationModeKind;
}): PendingTurnRequest {
  return {
    text: params.text,
    imageUrls: params.imageUrls,
    fileAttachments: params.fileAttachments,
    skills: params.skills,
    modelId: params.modelId,
    reasoningEffort: params.reasoningEffort,
    collaborationMode: params.collaborationMode,
    submittedAtIso: new Date().toISOString(),
  };
}

function setPendingTurnRequest(
  state: CodexState,
  threadId: string,
  payload: ThreadComposerSubmitPayload,
  config: {
    modelId: string;
    reasoningEffort: ReasoningEffort;
    collaborationMode: CollaborationModeKind;
  }
): void {
  const hasVisibleContent =
    payload.text.trim().length > 0 ||
    payload.imageUrls.length > 0 ||
    payload.fileAttachments.length > 0 ||
    payload.skills.length > 0;

  if (!hasVisibleContent) return;

  state.pendingTurnRequestsByThreadId.set(threadId, createPendingTurnRequest({
    text: payload.text,
    imageUrls: payload.imageUrls,
    fileAttachments: payload.fileAttachments,
    skills: payload.skills,
    modelId: config.modelId,
    reasoningEffort: config.reasoningEffort,
    collaborationMode: config.collaborationMode,
  }));
}

function clearPendingTurnRequest(state: CodexState, threadId: string): void {
  state.pendingTurnRequestsByThreadId.delete(threadId);
}

function setActiveTurnId(state: CodexState, threadId: string, turnId?: string | null): void {
  const normalizedTurnId = turnId?.trim() || '';
  if (normalizedTurnId) {
    state.activeTurnIdByThreadId.set(threadId, normalizedTurnId);
  } else {
    state.activeTurnIdByThreadId.delete(threadId);
  }
}

function upsertThreadIntoGroups(state: CodexState, thread: UiThread): void {
  const existingGroup = state.projectGroups.find((group) => group.projectName === thread.projectName);
  if (!existingGroup) {
    state.projectGroups.unshift({
      projectName: thread.projectName,
      threads: [thread],
    });
    return;
  }

  const existingIndex = existingGroup.threads.findIndex((candidate) => candidate.id === thread.id);
  if (existingIndex >= 0) {
    existingGroup.threads[existingIndex] = {
      ...existingGroup.threads[existingIndex],
      ...thread,
    };
  } else {
    existingGroup.threads.unshift(thread);
  }

  existingGroup.threads.sort(
    (a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime()
  );
}

// ==================== Store Creation ====================

export const useCodexStore = create<CodexState & CodexActions>()(
  subscribeWithSelector(
    immer((set, get) => ({
      ...getInitialState(),

      // ==================== Thread Actions ====================

      loadThreads: async () => {
        set((state) => {
          state.isLoadingThreads = true;
        });
        try {
          const groups = await api.getThreadGroups();
          set((state) => {
            state.projectGroups = groups;
            // Update inProgress state from thread data
            groups.forEach((group) => {
              group.threads.forEach((thread) => {
                state.inProgressByThreadId.set(thread.id, thread.inProgress);
                state.threadShellsById.delete(thread.id);
              });
            });

            if (state.selectedThreadId) {
              const selectedThreadStillExists = groups.some((group) =>
                group.threads.some((thread) => thread.id === state.selectedThreadId)
              );
              const shouldPreserveSelectedThread =
                state.isLoadingMessages ||
                state.messagesByThreadId.has(state.selectedThreadId) ||
                state.threadShellsById.has(state.selectedThreadId);
              if (!selectedThreadStillExists && !shouldPreserveSelectedThread) {
                clearSelectedThreadState(state);
              }
            }
          });
        } catch (error) {
          console.error('Failed to load threads:', error);
          set((state) => {
            state.error = 'Failed to load threads';
          });
        } finally {
          set((state) => {
            state.isLoadingThreads = false;
          });
        }
      },

      selectThread: async (threadId) => {
        const currentState = get();
        if (
          threadId &&
          currentState.selectedThreadId === threadId &&
          (currentState.isLoadingMessages || currentState.messagesByThreadId.has(threadId))
        ) {
          return;
        }

        set((state) => {
          state.selectedThreadId = threadId;
          if (threadId) {
            const existsInGroups = state.projectGroups.some((group) =>
              group.threads.some((thread) => thread.id === threadId)
            );
            if (!existsInGroups && !state.threadShellsById.has(threadId)) {
              state.threadShellsById.set(
                threadId,
                createThreadShell({
                  threadId,
                  cwd: '',
                  title: 'Loading thread...',
                })
              );
            }
          }
        });
        if (threadId) {
          saveToStorage(SELECTED_THREAD_STORAGE_KEY, threadId);
          await get().loadMessages(threadId);
        } else {
          removeFromStorage(SELECTED_THREAD_STORAGE_KEY);
        }
      },

      loadMessages: async (threadId) => {
        set((state) => {
          state.isLoadingMessages = true;
        });
        try {
          const shouldResumeFirst = !get().hydratedThreadIds.has(threadId);
          const { messages, thread } = await api.getThreadDetail(threadId, {
            resumeFirst: shouldResumeFirst,
          });
          set((state) => {
            if (!thread) {
              const shell = state.threadShellsById.get(threadId);
              if (shell) {
                state.messagesByThreadId.set(threadId, state.messagesByThreadId.get(threadId) || []);
                upsertThreadIntoGroups(state, {
                  ...shell,
                  inProgress: state.inProgressByThreadId.get(threadId) || shell.inProgress,
                  updatedAtIso: new Date().toISOString(),
                });
                return;
              }
              state.messagesByThreadId.delete(threadId);
              state.pendingTurnRequestsByThreadId.delete(threadId);
              state.hydratedThreadIds.delete(threadId);
              state.liveMessagesByThreadId.delete(threadId);
              state.liveReasoningByThreadId.delete(threadId);
              state.activeTurnIdByThreadId.delete(threadId);
              state.inProgressByThreadId.delete(threadId);
              state.pendingServerRequestsByThreadId.delete(threadId);
              if (state.selectedThreadId === threadId) {
                clearSelectedThreadState(state);
              }
              return;
            }
            upsertThreadIntoGroups(state, thread);
            state.threadShellsById.delete(threadId);
            state.messagesByThreadId.set(threadId, messages);
            clearPendingTurnRequest(state, threadId);
            state.hydratedThreadIds.add(threadId);
          });
        } catch (error) {
          console.error('Failed to load messages:', error);
          set((state) => {
            state.hydratedThreadIds.delete(threadId);
          });
        } finally {
          set((state) => {
            state.isLoadingMessages = false;
          });
        }
      },

      startNewThread: async (cwd, payload) => {
        const submitPayload = normalizeComposerPayload(payload);
        set((state) => {
          state.isSendingMessage = true;
        });
        try {
          const { threadId } = await api.startThread({
            cwd,
            model: get().selectedModelId,
            reasoningEffort: get().selectedReasoningEffort,
          });

          set((state) => {
            const shell = createThreadShell({
              threadId,
              cwd,
              preview: submitPayload.text || '',
              inProgress: Boolean(submitPayload.text),
            });
            state.threadShellsById.set(threadId, shell);
            upsertThreadIntoGroups(state, shell);
            state.selectedThreadId = threadId;
          });
          saveToStorage(SELECTED_THREAD_STORAGE_KEY, threadId);

          // Refresh threads to get the new thread
          await get().loadThreads();

          // Select the new thread
          await get().selectThread(threadId);

          // Send initial message if provided
          if (submitPayload.text || submitPayload.skills.length > 0 || submitPayload.fileAttachments.length > 0 || submitPayload.imageUrls.length > 0) {
            set((state) => {
              setPendingTurnRequest(state, threadId, submitPayload, {
                modelId: get().selectedModelId,
                reasoningEffort: get().selectedReasoningEffort,
                collaborationMode: get().selectedCollaborationMode,
              });
              state.inProgressByThreadId.set(threadId, true);
            });
            const turnId = await api.startThreadTurn(threadId, submitPayload.text, {
              model: get().selectedModelId,
              reasoningEffort: get().selectedReasoningEffort,
              imageUrls: submitPayload.imageUrls,
              fileAttachments: submitPayload.fileAttachments,
              skills: submitPayload.skills,
              collaborationMode: get().selectedCollaborationMode,
            });
            set((state) => {
              setActiveTurnId(state, threadId, turnId);
            });
          }

          return threadId;
        } catch (error) {
          console.error('Failed to start thread:', error);
          const errorMsg = error instanceof Error ? error.message : 'Failed to start thread';
          set((state) => {
            state.error = errorMsg;
          });
          throw error;
        } finally {
          set((state) => {
            state.isSendingMessage = false;
          });
        }
      },

      archiveThreadById: async (threadId) => {
        try {
          await api.archiveThread(threadId);
          // Remove from local state
          set((state) => {
            state.hydratedThreadIds.delete(threadId);
            state.threadShellsById.delete(threadId);
            state.pendingTurnRequestsByThreadId.delete(threadId);
            state.activeTurnIdByThreadId.delete(threadId);
            state.projectGroups = state.projectGroups
              .map((group) => ({
                ...group,
                threads: group.threads.filter((t) => t.id !== threadId),
              }))
              .filter((group) => group.threads.length > 0);
          });
          // Clear selection if archived thread was selected
          if (get().selectedThreadId === threadId) {
            await get().selectThread(null);
          }
        } catch (error) {
          console.error('Failed to archive thread:', error);
        }
      },

      renameThreadById: async (threadId, name) => {
        try {
          await api.renameThread(threadId, name);
          // Update local state
          set((state) => {
            for (const group of state.projectGroups) {
              const thread = group.threads.find((t) => t.id === threadId);
              if (thread) {
                thread.title = name;
                break;
              }
            }
          });
        } catch (error) {
          console.error('Failed to rename thread:', error);
        }
      },

      forkThreadById: async (threadId) => {
        try {
          const { threadId: newThreadId } = await api.forkThread(threadId);
          await get().loadThreads();
          await get().selectThread(newThreadId);
          return newThreadId;
        } catch (error) {
          console.error('Failed to fork thread:', error);
          return null;
        }
      },

      rollbackThreadToTurn: async (threadId, turnId) => {
        try {
          await api.rollbackThread(threadId, turnId);
          await get().loadThreads();
          await get().loadMessages(threadId);
        } catch (error) {
          console.error('Failed to rollback thread:', error);
          set((state) => {
            state.error = 'Failed to rollback thread';
          });
        }
      },

      interruptSelectedThreadTurn: async () => {
        const threadId = get().selectedThreadId;
        if (!threadId) return;
        const activeTurnId = get().activeTurnIdByThreadId.get(threadId);
        set((state) => {
          state.isInterruptingTurn = true;
        });
        try {
          await api.interruptThreadTurn(threadId, activeTurnId);
          set((state) => {
            state.inProgressByThreadId.set(threadId, false);
          });
        } catch (error) {
          console.error('Failed to interrupt:', error);
        } finally {
          set((state) => {
            state.isInterruptingTurn = false;
          });
        }
      },

      // ==================== Message Actions ====================

      sendMessage: async (payload) => {
        const threadId = get().selectedThreadId;
        if (!threadId) return;
        const submitPayload = normalizeComposerPayload(payload);
        set((state) => {
          state.isSendingMessage = true;
        });
        try {
          if (!get().messagesByThreadId.has(threadId)) {
            await get().loadMessages(threadId);
          }

          const refreshedState = get();
          if (
            refreshedState.selectedThreadId !== threadId ||
            !refreshedState.messagesByThreadId.has(threadId)
          ) {
            throw new Error(`Thread is unavailable: ${threadId}`);
          }

          set((state) => {
            setPendingTurnRequest(state, threadId, submitPayload, {
              modelId: refreshedState.selectedModelId,
              reasoningEffort: refreshedState.selectedReasoningEffort,
              collaborationMode: refreshedState.selectedCollaborationMode,
            });
            state.inProgressByThreadId.set(threadId, true);
          });
          const turnId = await api.startThreadTurn(threadId, submitPayload.text, {
            model: refreshedState.selectedModelId,
            reasoningEffort: refreshedState.selectedReasoningEffort,
            imageUrls: submitPayload.imageUrls,
            fileAttachments: submitPayload.fileAttachments,
            skills: submitPayload.skills,
            collaborationMode: refreshedState.selectedCollaborationMode,
          });
          set((state) => {
            state.inProgressByThreadId.set(threadId, true);
            setActiveTurnId(state, threadId, turnId);
          });
        } catch (error) {
          console.error('Failed to send message:', error);
          set((state) => {
            clearPendingTurnRequest(state, threadId);
            setActiveTurnId(state, threadId, null);
            state.inProgressByThreadId.delete(threadId);
            state.error = 'Failed to send message';
          });
        } finally {
          set((state) => {
            state.isSendingMessage = false;
          });
        }
      },

      // ==================== UI Actions ====================

      setSidebarCollapsed: (collapsed) => {
        set((state) => {
          state.isSidebarCollapsed = collapsed;
        });
      },

      toggleSidebarSearch: () => {
        set((state) => {
          state.isSidebarSearchVisible = !state.isSidebarSearchVisible;
        });
      },

      setSidebarSearchQuery: (query) => {
        set((state) => {
          state.sidebarSearchQuery = query;
        });
      },

      setSettingsOpen: (open) => {
        set((state) => {
          state.isSettingsOpen = open;
        });
      },

      toggleSettings: () => {
        set((state) => {
          state.isSettingsOpen = !state.isSettingsOpen;
        });
      },

      // ==================== Model/Config Actions ====================

      initializeModelConfig: async () => {
        try {
          const [availableModelIds, currentModelConfig, collaborationModes] = await Promise.all([
            api.getAvailableModelIds(),
            api.getCurrentModelConfig(),
            api.getAvailableCollaborationModes(),
          ]);

          set((state) => {
            const configuredModel = currentModelConfig.model || state.selectedModelId || 'kimi-for-coding';
            state.selectedModelId = configuredModel;
            state.selectedReasoningEffort = currentModelConfig.reasoningEffort || state.selectedReasoningEffort;
            state.availableCollaborationModes = collaborationModes.length > 0
              ? collaborationModes
              : state.availableCollaborationModes;
            state.availableModelIds = availableModelIds.includes(configuredModel)
              ? availableModelIds
              : [configuredModel, ...availableModelIds];
          });
        } catch (error) {
          console.error('Failed to initialize model config:', error);
        }
      },

      setSelectedModelId: async (modelId) => {
        set((state) => {
          state.selectedModelId = modelId;
        });
        try {
          await api.setDefaultModel(modelId);
        } catch (error) {
          console.error('Failed to set model:', error);
        }
      },

      setSelectedReasoningEffort: (effort) => {
        set((state) => {
          state.selectedReasoningEffort = effort;
        });
      },

      setSelectedSpeedMode: async (speed) => {
        set((state) => {
          state.selectedSpeedMode = speed;
        });
        try {
          await api.setCodexSpeedMode(speed);
        } catch (error) {
          console.error('Failed to set speed mode:', error);
        }
      },

      setSelectedCollaborationMode: (mode) => {
        set((state) => {
          state.selectedCollaborationMode = mode;
        });
      },

      // ==================== Skills Actions ====================

      loadSkills: async () => {
        try {
          const skills = await api.getSkillsList();
          set((state) => {
            state.installedSkills = skills;
          });
        } catch (error) {
          console.error('Failed to load skills:', error);
        }
      },

      // ==================== Account Actions ====================

      refreshAccounts: async () => {
        set((state) => {
          state.isRefreshingAccounts = true;
        });
        try {
          const { accounts } = await api.getAccountRateLimits();
          set((state) => {
            state.accounts = accounts;
            // Update quota from active account
            const activeAccount = accounts.find((a) => a.isActive);
            if (activeAccount?.quotaSnapshot) {
              state.codexQuota = activeAccount.quotaSnapshot;
            }
          });
        } catch (error) {
          console.error('Failed to refresh accounts:', error);
        } finally {
          set((state) => {
            state.isRefreshingAccounts = false;
          });
        }
      },

      // ==================== Server Request Actions ====================

      respondToServerRequest: async (requestId, approved, duration) => {
        try {
          await api.replyToServerRequest(requestId, approved, { duration });
          // Remove from pending requests
          set((state) => {
            state.pendingServerRequestsByThreadId.forEach((requests, threadId) => {
              const filtered = requests.filter((r) => r.id !== requestId);
              if (filtered.length === 0) {
                state.pendingServerRequestsByThreadId.delete(threadId);
              } else {
                state.pendingServerRequestsByThreadId.set(threadId, filtered);
              }
            });
          });
        } catch (error) {
          console.error('Failed to respond to server request:', error);
        }
      },

      // ==================== Sync/Polling ====================

      startPolling: () => {
        set((state) => {
          state.isPolling = true;
        });
      },

      stopPolling: () => {
        set((state) => {
          state.isPolling = false;
        });
      },

      syncAll: async () => {
        await get().loadThreads();
        const { selectedThreadId } = get();
        if (selectedThreadId) {
          await get().loadMessages(selectedThreadId);
        }
      },

      // ==================== Notification Handling ====================

      handleNotification: (notification) => {
        const { method, params } = notification;

        switch (method) {
          case 'turn/started': {
            const { threadId } = (params as { threadId: string }) || {};
            if (threadId) {
              set((state) => {
                state.inProgressByThreadId = new Map(state.inProgressByThreadId).set(threadId, true);
                setActiveTurnId(state, threadId, (params as { threadId: string; turnId?: string }).turnId);
              });
              get().loadThreads();
            }
            break;
          }

          case 'turn/completed': {
            const { threadId } = (params as { threadId: string }) || {};
            if (threadId) {
              set((state) => {
                state.inProgressByThreadId = new Map(state.inProgressByThreadId).set(threadId, false);
                clearPendingTurnRequest(state, threadId);
                setActiveTurnId(state, threadId, null);
                // Clear live content
                const liveMessagesByThreadId = new Map(state.liveMessagesByThreadId);
                liveMessagesByThreadId.delete(threadId);
                state.liveMessagesByThreadId = liveMessagesByThreadId;
                const liveReasoningByThreadId = new Map(state.liveReasoningByThreadId);
                liveReasoningByThreadId.delete(threadId);
                state.liveReasoningByThreadId = liveReasoningByThreadId;
                const liveActivityLabelByThreadId = new Map(state.liveActivityLabelByThreadId);
                liveActivityLabelByThreadId.delete(threadId);
                state.liveActivityLabelByThreadId = liveActivityLabelByThreadId;
                const liveCommandOutputByThreadId = new Map(state.liveCommandOutputByThreadId);
                liveCommandOutputByThreadId.delete(threadId);
                state.liveCommandOutputByThreadId = liveCommandOutputByThreadId;
              });
              get().loadThreads();
              // Reload messages for this thread
              get().loadMessages(threadId);
            }
            break;
          }

          case 'item/agentMessage/delta': {
            const { threadId, delta } = (params as { threadId: string; delta: string }) || {};
            if (threadId && delta) {
              set((state) => {
                const current = state.liveMessagesByThreadId.get(threadId) || '';
                state.liveMessagesByThreadId = new Map(state.liveMessagesByThreadId).set(threadId, current + delta);
              });
            }
            break;
          }

          case 'item/reasoning/summaryTextDelta': {
            const { threadId, delta } = (params as { threadId: string; delta: string }) || {};
            if (threadId && delta) {
              set((state) => {
                const current = state.liveReasoningByThreadId.get(threadId) || '';
                state.liveReasoningByThreadId = new Map(state.liveReasoningByThreadId).set(threadId, current + delta);
                state.liveActivityLabelByThreadId = new Map(state.liveActivityLabelByThreadId).set(threadId, 'Thinking');
              });
            }
            break;
          }

          case 'item/reasoning/summaryPartAdded': {
            const { threadId } = (params as { threadId: string }) || {};
            if (threadId) {
              set((state) => {
                const current = state.liveReasoningByThreadId.get(threadId) || '';
                if (current) {
                  state.liveReasoningByThreadId = new Map(state.liveReasoningByThreadId).set(threadId, current + '\n\n');
                }
              });
            }
            break;
          }

          case 'item/started': {
            const p = (params as { threadId: string; item?: { type?: string; command?: string } }) || {};
            const { threadId, item } = p;
            if (threadId && item?.type) {
              const itemType = item.type.toLowerCase();
              let label = '';
              if (itemType === 'reasoning') label = 'Thinking';
              else if (itemType === 'agentmessage') label = 'Writing response';
              else if (itemType === 'commandexecution') label = item.command ? `Running: ${item.command}` : 'Running command';
              else if (itemType === 'filechange') label = 'Applying changes';
              else if (itemType === 'webSearch' || itemType === 'websearch') label = 'Searching';
              if (label) {
                set((state) => {
                  state.liveActivityLabelByThreadId = new Map(state.liveActivityLabelByThreadId).set(threadId, label);
                });
              }
            }
            break;
          }

          case 'item/completed': {
            const { threadId, item } = (params as { threadId: string; item?: { type?: string } }) || {};
            if (threadId && item?.type?.toLowerCase() === 'commandexecution') {
              set((state) => {
                const liveCommandOutputByThreadId = new Map(state.liveCommandOutputByThreadId);
                liveCommandOutputByThreadId.delete(threadId);
                state.liveCommandOutputByThreadId = liveCommandOutputByThreadId;
              });
            }
            break;
          }

          case 'item/commandExecution/outputDelta': {
            const { threadId, delta } = (params as { threadId: string; delta: string }) || {};
            if (threadId && delta) {
              set((state) => {
                const current = state.liveCommandOutputByThreadId.get(threadId) || '';
                // Keep last 4000 chars to avoid unbounded growth
                const next = current + delta;
                state.liveCommandOutputByThreadId = new Map(state.liveCommandOutputByThreadId).set(
                  threadId,
                  next.length > 4000 ? next.slice(-4000) : next
                );
                state.liveActivityLabelByThreadId = new Map(state.liveActivityLabelByThreadId).set(threadId, 'Running command');
              });
            }
            break;
          }

          case 'server/request': {
            const request = params as UiServerRequest;
            if (request?.threadId) {
              set((state) => {
                const existing = state.pendingServerRequestsByThreadId.get(request.threadId) || [];
                state.pendingServerRequestsByThreadId.set(request.threadId, [...existing, request]);
              });
            }
            break;
          }

          case 'server/request/resolved': {
            const { requestId, threadId } = (params as { requestId: number; threadId: string }) || {};
            if (threadId && requestId !== undefined) {
              set((state) => {
                const existing = state.pendingServerRequestsByThreadId.get(threadId) || [];
                state.pendingServerRequestsByThreadId.set(
                  threadId,
                  existing.filter((r) => r.id !== requestId)
                );
              });
            }
            break;
          }

          case 'thread/name/updated': {
            // Reload threads to get updated names
            get().loadThreads();
            break;
          }

          default:
            // Unknown notification - ignore or log
            break;
        }
      },

      // ==================== Error Handling ====================

      clearError: () => {
        set((state) => {
          state.error = null;
        });
      },

      setError: (error) => {
        set((state) => {
          state.error = error;
        });
      },
    }))
  )
);

// ==================== Selectors ====================

export const selectSelectedThread = (state: CodexState): UiThread | null => {
  if (!state.selectedThreadId) return null;
  for (const group of state.projectGroups) {
    const thread = group.threads.find((t) => t.id === state.selectedThreadId);
    if (thread) return thread;
  }
  return state.threadShellsById.get(state.selectedThreadId) || null;
};

export const selectMessagesForSelectedThread = (state: CodexState): UiMessage[] => {
  if (!state.selectedThreadId) return [];
  return state.messagesByThreadId.get(state.selectedThreadId) || [];
};

export const selectLiveMessageForSelectedThread = (state: CodexState): string => {
  if (!state.selectedThreadId) return '';
  return state.liveMessagesByThreadId.get(state.selectedThreadId) || '';
};

export const selectLiveReasoningForSelectedThread = (state: CodexState): string => {
  if (!state.selectedThreadId) return '';
  return state.liveReasoningByThreadId.get(state.selectedThreadId) || '';
};

export const selectLiveActivityLabelForSelectedThread = (state: CodexState): string => {
  if (!state.selectedThreadId) return '';
  return state.liveActivityLabelByThreadId.get(state.selectedThreadId) || '';
};

export const selectLiveCommandOutputForSelectedThread = (state: CodexState): string => {
  if (!state.selectedThreadId) return '';
  return state.liveCommandOutputByThreadId.get(state.selectedThreadId) || '';
};

export const selectIsInProgress = (state: CodexState): boolean => {
  if (!state.selectedThreadId) return false;
  return state.inProgressByThreadId.get(state.selectedThreadId) || false;
};

export const selectPendingRequestsForSelectedThread = (state: CodexState): UiServerRequest[] => {
  if (!state.selectedThreadId) return [];
  return state.pendingServerRequestsByThreadId.get(state.selectedThreadId) || [];
};

// Re-export subscription helper from API
export { subscribeRpcNotifications as subscribeCodexNotifications };
