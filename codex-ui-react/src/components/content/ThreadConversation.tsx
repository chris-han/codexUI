import { useCallback, useEffect, useRef, useState } from 'react';
import { SquareLibrary } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSidebarChrome } from '../../hooks/useSidebarChrome';
import { useCodexStore } from '../../stores';
import type { ThreadComposerSubmitPayload } from '../../types/codex';
import ContentHeader from './ContentHeader';
import ThreadComposer from './ThreadComposer';
import MessageContent from './MessageContent';
import { MessageFeedback } from './MessageFeedback';
import { ApprovalCard } from './ApprovalCard';
import SidebarThreadControls, { SidebarToolbarAction } from '../sidebar/SidebarThreadControls';
import {
  IconTablerArrowBackUp,
  IconTablerChevronDown,
  IconTablerChevronRight,
  IconTablerCopy,
  IconTablerSearch,
  IconTablerX,
} from '../icons';

const DEFAULT_FOOTER_HEIGHT = 140;
const MIN_FOOTER_HEIGHT = 140;
const MAX_FOOTER_HEIGHT = 300;
const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 48;

type ReasoningPanelProps = {
  messageId: string;
  text: string;
  defaultCollapsed?: boolean;
  isLive?: boolean;
};

function ReasoningPanel({ messageId, text, defaultCollapsed = true, isLive = false }: ReasoningPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    setIsCollapsed(defaultCollapsed);
  }, [defaultCollapsed, messageId]);

  if (!text.trim()) {
    return null;
  }

  return (
    <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50">
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
            Thinking
          </span>
        </div>
        <span className="text-[11px] text-blue-500">
          {isCollapsed ? 'Expand' : 'Fold'}
        </span>
      </button>
      <div className="border-t border-blue-100 px-4 py-3">
        <div className={isCollapsed ? 'relative max-h-40 overflow-hidden' : ''}>
          <MessageContent text={text} />
          {isCollapsed ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-blue-50"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ApprovalCard is now a standalone component in ./ApprovalCard.tsx

function ThreadConversation() {
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId: string }>();
  const { isSidebarCollapsed, showHeaderControls, toggleSidebar, openSidebarSearch } = useSidebarChrome();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState(DEFAULT_FOOTER_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const resizeStartY = useRef<number>(0);
  const resizeStartHeight = useRef<number>(DEFAULT_FOOTER_HEIGHT);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = footerHeight;
  }, [footerHeight]);

  const stopResize = useCallback(() => {
    setIsResizing(false);
  }, []);

  const doResize = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const deltaY = resizeStartY.current - e.clientY;
    const newHeight = Math.max(MIN_FOOTER_HEIGHT, Math.min(MAX_FOOTER_HEIGHT, resizeStartHeight.current + deltaY));
    setFooterHeight(newHeight);
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', doResize);
      window.addEventListener('mouseup', stopResize);
      return () => {
        window.removeEventListener('mousemove', doResize);
        window.removeEventListener('mouseup', stopResize);
      };
    }
  }, [isResizing, doResize, stopResize]);

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
  const liveCommandOutput = useCodexStore(useCallback((state) => {
    if (!threadId) return '';
    return state.liveCommandOutputByThreadId.get(threadId) || '';
  }, [threadId]));
  const liveCommandLabel = useCodexStore(useCallback((state) => {
    if (!threadId) return '';
    return state.liveCommandLabelByThreadId.get(threadId) || '';
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
  const rollbackThreadToTurn = useCodexStore((state) => state.rollbackThreadToTurn);
  const respondToServerRequest = useCodexStore((state) => state.respondToServerRequest);

  // Load thread when ID changes
  useEffect(() => {
    if (threadId) {
      selectThread(threadId);
    }
  }, [threadId, selectThread]);

  useEffect(() => {
    setShouldAutoScroll(true);
  }, [threadId]);

  const isScrolledNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceToBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!shouldAutoScroll) return;
    scrollToBottom();
  }, [messages, pendingTurnRequest, liveMessage, liveReasoning, scrollToBottom, shouldAutoScroll]);

  const handleScroll = useCallback(() => {
    setShouldAutoScroll(isScrolledNearBottom());
  }, [isScrolledNearBottom]);

  const handleSendMessage = async (payload: ThreadComposerSubmitPayload) => {
    await sendMessage(payload);
  };

  const handleInterrupt = async () => {
    await interruptSelectedThreadTurn();
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
      <ContentHeader
        title={threadView.title}
        leading={showHeaderControls ? (
          <SidebarThreadControls
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={toggleSidebar}
            onNewThread={() => navigate('/')}
          >
            <SidebarToolbarAction label="Skills Hub" onClick={() => navigate('/skills')}>
              <SquareLibrary className="h-4 w-4" strokeWidth={1.8} />
            </SidebarToolbarAction>
            <SidebarToolbarAction label="Search threads" onClick={openSidebarSearch}>
              <IconTablerSearch className="h-4 w-4" />
            </SidebarToolbarAction>
          </SidebarThreadControls>
        ) : null}
        actions={isInProgress ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {liveActivityLabel || 'Working...'}
            </span>
          </div>
        ) : null}
      />

      <>
        {/* Messages */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
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
                  {message.role === 'assistant' && message.reasoningText && !liveReasoning ? (
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
                  {message.commandExecution && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-950">
                      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] uppercase tracking-[0.16em] text-gray-400">Terminal</span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                            message.commandExecution.status === 'inProgress'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : message.commandExecution.status === 'completed'
                              ? 'bg-green-500/20 text-green-400'
                              : message.commandExecution.status === 'failed'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {message.commandExecution.status === 'inProgress' && <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />}
                            {message.commandExecution.status}
                          </span>
                        </div>
                        {message.commandExecution.exitCode !== null && (
                          <span className="text-[10px] text-gray-500">Exit: {message.commandExecution.exitCode}</span>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="mb-2 font-mono text-xs text-green-400">
                          <span className="text-gray-500">$</span> {message.commandExecution.command}
                        </div>
                        {message.commandExecution.aggregatedOutput && (
                          <pre className="max-h-48 overflow-auto font-mono text-xs text-gray-300 whitespace-pre-wrap">
                            {message.commandExecution.aggregatedOutput}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
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
                    <div className="mt-3 flex flex-col gap-2 text-xs text-gray-500">
                      <div className="flex items-center gap-2">
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
                      <MessageFeedback messageId={message.id} />
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

            {/* Live reasoning */}
            {liveReasoning && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-bl-md">
                  <ReasoningPanel
                    messageId={`${threadId}-live-reasoning`}
                    text={liveReasoning}
                    defaultCollapsed={Boolean(liveMessage.trim())}
                    isLive
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
                    <span className="w-2 h-2 bg-primary rounded-full" />
                    <span className="text-xs text-gray-400">
                      {'Generating...'.split('').map((char, index) => (
                        <span
                          key={index}
                          className="animate-highlight"
                          style={{ animationDelay: `${index * 100}ms` }}
                        >
                          {char}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Live command output */}
            {(liveCommandLabel || liveCommandOutput) && (
              <div className="flex justify-start">
                <div className="w-full max-w-[90%] bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
                  <div className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    Terminal
                  </div>
                  {liveCommandLabel && (
                    <div className="mb-2 font-mono text-xs text-green-400">
                      <span className="text-gray-500">$</span> {liveCommandLabel}
                    </div>
                  )}
                  {liveCommandOutput && (
                    <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{liveCommandOutput}</pre>
                  )}
                </div>
              </div>
            )}

            {/* Pending server requests */}
            {pendingRequests.map((request) => (
              <ApprovalCard
                key={request.id}
                request={request}
                onRespond={respondToServerRequest}
                onSendMessage={handleSendMessage}
              />
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="relative">
            {/* Resize handle */}
            <div
              onMouseDown={startResize}
              className="absolute top-0 left-0 right-0 h-[1px] cursor-ns-resize bg-gray-300 hover:bg-gray-400"
              title="Drag to resize"
            >
              {/* Visible drag handle */}
              <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-colors ${isResizing ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}>
                <svg width="24" height="12" viewBox="0 0 24 12" fill="currentColor">
                  <rect x="4" y="4" width="16" height="1" rx="0.5" />
                  <rect x="4" y="7" width="16" height="1" rx="0.5" />
                </svg>
              </div>
            </div>
            <div
              className="border-t border-gray-200 bg-white p-4"
              style={{ height: footerHeight }}
            >
              <div className="mx-auto w-full max-w-2xl h-full">
                <ThreadComposer
                  onSend={handleSendMessage}
                  onInterrupt={handleInterrupt}
                  isInProgress={isInProgress}
                  cwd={threadView.cwd}
                />
              </div>
            </div>
          </div>
      </>

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
