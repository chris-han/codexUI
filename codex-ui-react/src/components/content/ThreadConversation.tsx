import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCodexStore } from '../../stores';
import ThreadComposer from './ThreadComposer';
import MessageContent from './MessageContent';
import { IconTablerArchive, IconTablerGitFork } from '../icons';

const ReviewPane = lazy(() => import('./ReviewPane'));

function ThreadConversation() {
  const { threadId } = useParams<{ threadId: string }>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

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
  }, [messages, liveMessage, scrollToBottom]);

  const handleSendMessage = async (message: string) => {
    await sendMessage(message);
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
            {messages.length === 0 && !liveMessage && (
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
                </div>
              </div>
            ))}

            {/* Live reasoning */}
            {liveReasoning && (
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-blue-50 border border-blue-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="text-xs font-medium text-blue-500 mb-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                    Thinking
                  </div>
                  <MessageContent text={liveReasoning} />
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
                      Approve
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
            <ThreadComposer
              onSend={handleSendMessage}
              onInterrupt={handleInterrupt}
              isInProgress={isInProgress}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default ThreadConversation;
