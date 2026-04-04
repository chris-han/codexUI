import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCodexStore } from '../../stores';
import type { ThreadComposerSubmitPayload } from '../../types/codex';
import ThreadComposer from './ThreadComposer';
import MessageContent from './MessageContent';
import {
  IconTablerArchive,
  IconTablerArrowBackUp,
  IconTablerChevronDown,
  IconTablerChevronRight,
  IconTablerCopy,
  IconTablerGitFork,
  IconTablerX,
} from '../icons';

const ReviewPane = lazy(() => import('./ReviewPane'));

type ReasoningPanelProps = {
  messageId: string;
  text: string;
  defaultCollapsed?: boolean;
  isLive?: boolean;
  label?: string;
};

function ReasoningPanel({
  messageId,
  text,
  defaultCollapsed = true,
  isLive = false,
  label = 'Thinking',
}: ReasoningPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    setIsCollapsed(defaultCollapsed);
  }, [defaultCollapsed, messageId]);

  if (!text.trim()) {
    return null;
  }

  return (
    <div className="mb-3 rounded-2xl border border-blue-100 bg-blue-50">
      <button
        type="button"
        onClick={() => setIsCollapsed((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={!isCollapsed}
      >
        <div className="flex items-center gap-2 text-xs font-medium text-blue-600">
          {isCollapsed ? (
            <IconTablerChevronRight className="h-3.5 w-3.5" />
          ) : (
            <IconTablerChevronDown className="h-3.5 w-3.5" />
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full bg-blue-400 ${isLive ? 'animate-pulse' : ''}`} />
            {label}
          </span>
        </div>
        <span className="text-[11px] text-blue-500">
          {isCollapsed ? 'Show' : 'Hide'}
        </span>
      </button>
      {!isCollapsed && (
        <div className="border-t border-blue-100 px-4 py-3">
          <MessageContent text={text} />
        </div>
      )}
    </div>
  );
}

type LiveProgressPanelProps = {
  label: string;
  events: string[];
};

function LiveProgressPanel({ label, events }: LiveProgressPanelProps) {
  if (!label && events.length === 0) {
    return null;
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[90%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-700">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          {label || 'Working...'}
        </div>
        {events.length > 0 ? (
          <div className="space-y-1">
            {events.map((event, index) => (
              <div
                key={`${event}-${index}`}
                className="flex items-start gap-2 text-xs text-slate-600"
              >
                <span className={`mt-1 h-1.5 w-1.5 rounded-full ${index === events.length - 1 ? 'bg-primary' : 'bg-slate-300'}`} />
                <span>{event}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ThreadConversation() {
  const { threadId } = useParams<{ threadId: string }>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);

  const selectedThread = useCodexStore(useCallback((state) => {
    if (!threadId) return null;
    for (const group of state.projectGroups) {
      const thread = group.threads.find((candidate) => candidate.id === threadId);
      if (thread) return thread;
    }
    return state.threadShellsById.get(threadId) || null;
  }, [threadId]));
  const messages = useCodexStore(useCallback((state) => {
    if (!threadId) return [];
    return state.messagesByThreadId.get(threadId) || [];
  }, [threadId]));
  const pendingTurnRequest = useCodexStore(useCallback((state) => {
    if (!threadId) return null;
    return state.pendingTurnRequestsByThreadId.get(threadId) || null;
  }, [threadId]));
  const liveMessage = useCodexStore(useCallback((state) => {
    if (!threadId) return '';
    return state.liveMessagesByThreadId.get(threadId) || '';
  }, [threadId]));
  const liveReasoning = useCodexStore(useCallback((state) => {
    if (!threadId) return '';
    return state.liveReasoningByThreadId.get(threadId) || '';
  }, [threadId]));
  const liveActivityLabel = useCodexStore(useCallback((state) => {
    if (!threadId) return '';
    return state.liveActivityLabelByThreadId.get(threadId) || '';
  }, [threadId]));
  const liveActivityEvents = useCodexStore(useCallback((state) => {
    if (!threadId) return [];
    return state.liveActivityEventsByThreadId.get(threadId) || [];
  }, [threadId]));
  const liveCommandOutput = useCodexStore(useCallback((state) => {
    if (!threadId) return '';
    return state.liveCommandOutputByThreadId.get(threadId) || '';
  }, [threadId]));
  const isInProgress = useCodexStore(useCallback((state) => {
    if (!threadId) return false;
    return state.inProgressByThreadId.get(threadId) || false;
  }, [threadId]));
  const pendingRequests = useCodexStore(useCallback((state) => {
    if (!threadId) return [];
    return state.pendingServerRequestsByThreadId.get(threadId) || [];
  }, [threadId]));

  const selectThread = useCodexStore((state) => state.selectThread);
  const sendMessage = useCodexStore((state) => state.sendMessage);
  const interruptSelectedThreadTurn = useCodexStore((state) => state.interruptSelectedThreadTurn);
  const archiveThreadById = useCodexStore((state) => state.archiveThreadById);
  const forkThreadById = useCodexStore((state) => state.forkThreadById);
  const rollbackThreadToTurn = useCodexStore((state) => state.rollbackThreadToTurn);
  const respondToServerRequest = useCodexStore((state) => state.respondToServerRequest);

  // Load thread when ID changes
  useEffect(() => {
    if (threadId) {
      selectThread(threadId);
    }
  }, [threadId, selectThread]);

  useEffect(() => {
    setIsReviewOpen(false);
  }, [threadId]);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingTurnRequest, liveMessage, liveReasoning, scrollToBottom]);

  const handleSendMessage = async (payload: ThreadComposerSubmitPayload) => {
    await sendMessage(payload);
  };

  const handleInterrupt = async () => {
    await interruptSelectedThreadTurn();
  };

  const handleArchive = async () => {
    await archiveThreadById(threadView.id);
  };

  const handleFork = async () => {
    await forkThreadById(threadView.id);
  };

  const handleCopyMessage = useCallback(async (messageId: string, text: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current));
      }, 1500);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  }, []);

  const handleRollbackMessage = async (messageTurnId?: string) => {
    if (!threadId || !messageTurnId) return;
    await rollbackThreadToTurn(threadId, messageTurnId);
  };

  if (!threadId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Thread not found
      </div>
    );
  }

  const threadView = selectedThread || {
    id: threadId,
    title: 'Loading thread...',
    projectName: 'Thread',
    cwd: '',
    hasWorktree: false,
    createdAtIso: '',
    updatedAtIso: '',
    preview: '',
    unread: false,
    inProgress: isInProgress,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-gray-800 truncate max-w-md">
            {threadView.title}
          </h1>
          {isInProgress && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              {liveActivityLabel || 'Working...'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsReviewOpen((value) => !value)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              isReviewOpen
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title="Toggle review pane"
          >
            Review
          </button>
          <button
            onClick={handleFork}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            title="Fork thread"
          >
            <IconTablerGitFork className="w-4 h-4" />
          </button>
          <button
            onClick={handleArchive}
            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
            title="Archive thread"
          >
            <IconTablerArchive className="w-4 h-4" />
          </button>
        </div>
      </header>

      {isReviewOpen ? (
        <Suspense fallback={<div className="flex-1 p-4 text-sm text-gray-500">Loading review pane…</div>}>
          <ReviewPane
            threadId={threadView.id}
            cwd={threadView.cwd}
            isThreadInProgress={isInProgress}
            onClose={() => setIsReviewOpen(false)}
          />
        </Suspense>
      ) : (
        <>
          {/* Messages */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            {messages.length === 0 && !pendingTurnRequest && !liveMessage && !liveReasoning && (
              <div className="text-center text-gray-400 py-12">
                No messages yet. Start the conversation!
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-white rounded-br-md'
                      : 'bg-white border border-gray-200 rounded-bl-md'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="text-xs font-medium text-gray-400 mb-1">
                      Assistant
                    </div>
                  )}
                  {message.role === 'assistant' && message.reasoningText ? (
                    <ReasoningPanel
                      messageId={message.id}
                      text={message.reasoningText}
                      defaultCollapsed={Boolean(message.text.trim())}
                    />
                  ) : null}
                  {message.images && message.images.length > 0 && (
                    <div className="mb-3 grid gap-2 sm:grid-cols-2">
                      {message.images.map((imageUrl) => (
                        <button
                          key={imageUrl}
                          type="button"
                          onClick={() => setModalImageUrl(imageUrl)}
                          className="block text-left"
                        >
                          <img
                            className="max-h-64 w-full rounded-xl border border-slate-200 object-cover"
                            src={imageUrl}
                            alt="Message image preview"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                  <MessageContent text={message.text} />
                  {message.fileChanges && message.fileChanges.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {message.fileChanges.map((change) => (
                        <div
                          key={change.path}
                          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 flex items-center gap-2"
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              change.operation === 'add'
                                ? 'bg-green-500'
                                : change.operation === 'delete'
                                ? 'bg-red-500'
                                : 'bg-yellow-500'
                            }`}
                          />
                          {change.path}
                        </div>
                      ))}
                    </div>
                  )}
                  {message.role === 'assistant' && message.text.trim() && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                      {message.turnId ? (
                        <button
                          type="button"
                          onClick={() => handleRollbackMessage(message.turnId)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 hover:bg-gray-50"
                          title="Rollback to this response"
                        >
                          <IconTablerArrowBackUp className="h-3.5 w-3.5" />
                          Rollback
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(message.id, message.text)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 hover:bg-gray-50"
                        title={copiedMessageId === message.id ? 'Copied' : 'Copy response'}
                      >
                        <IconTablerCopy className="h-3.5 w-3.5" />
                        {copiedMessageId === message.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {pendingTurnRequest && (
              <div
                key={`${threadId}-pending-turn`}
                className="flex justify-end"
              >
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-white opacity-90">
                  {pendingTurnRequest.imageUrls.length > 0 && (
                    <div className="mb-3 grid gap-2 sm:grid-cols-2">
                      {pendingTurnRequest.imageUrls.map((imageUrl) => (
                        <button
                          key={imageUrl}
                          type="button"
                          onClick={() => setModalImageUrl(imageUrl)}
                          className="block text-left"
                        >
                          <img
                            className="max-h-64 w-full rounded-xl border border-white/20 object-cover"
                            src={imageUrl}
                            alt="Message image preview"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                  <MessageContent text={pendingTurnRequest.text} />
                  {(pendingTurnRequest.fileAttachments.length > 0 || pendingTurnRequest.skills.length > 0) && (
                    <div className="mt-2 space-y-1">
                      {pendingTurnRequest.fileAttachments.map((attachment) => (
                        <div
                          key={`pending-file-${attachment.path}`}
                          className="rounded bg-white/10 px-2 py-1 text-xs text-white/90"
                        >
                          {attachment.label}
                        </div>
                      ))}
                      {pendingTurnRequest.skills.map((skill) => (
                        <div
                          key={`pending-skill-${skill.path}`}
                          className="rounded bg-white/10 px-2 py-1 text-xs text-white/90"
                        >
                          @{skill.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {(isInProgress || liveActivityEvents.length > 0 || liveActivityLabel) && (
              <LiveProgressPanel
                label={liveActivityLabel || 'Working...'}
                events={liveActivityEvents}
              />
            )}

            {/* Live reasoning */}
            {liveReasoning && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-bl-md">
                  <ReasoningPanel
                    messageId={`${threadId}-live-reasoning`}
                    text={liveReasoning}
                    defaultCollapsed={Boolean(liveMessage.trim())}
                    isLive
                    label={liveActivityLabel || 'Thinking'}
                  />
                </div>
              </div>
            )}

            {/* Live streaming message */}
            {liveMessage && (
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="text-xs font-medium text-gray-400 mb-1">
                    Assistant
                  </div>
                  <MessageContent text={liveMessage} />
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    <span className="text-xs text-gray-400">Typing...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Live command output */}
            {liveCommandOutput && (
              <div className="flex justify-start">
                <div className="w-full max-w-[90%] bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
                  <div className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    Terminal output
                  </div>
                  <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{liveCommandOutput}</pre>
                </div>
              </div>
            )}

            {/* Pending server requests */}
            {pendingRequests.map((request) => (
              <div key={request.id} className="flex justify-center my-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 max-w-lg">
                  <div className="text-sm font-medium text-yellow-800 mb-2">
                    Action Required: {request.method}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => respondToServerRequest(request.id, true, 'session')}
                      className="px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary-hover"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respondToServerRequest(request.id, true, 'always')}
                      className="px-3 py-1.5 bg-white text-gray-700 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      Always
                    </button>
                    <button
                      onClick={() => respondToServerRequest(request.id, false, 'session')}
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="border-t border-gray-200 bg-white p-4">
            <div className="mx-auto w-full max-w-2xl">
              <ThreadComposer
                onSend={handleSendMessage}
                onInterrupt={handleInterrupt}
                isInProgress={isInProgress}
                cwd={threadView.cwd}
              />
            </div>
          </div>
        </>
      )}

      {modalImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6"
          onClick={() => setModalImageUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setModalImageUrl(null)}
            aria-label="Close image preview"
          >
            <IconTablerX className="h-5 w-5" />
          </button>
          <img
            src={modalImageUrl}
            alt="Expanded preview"
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default ThreadConversation;
