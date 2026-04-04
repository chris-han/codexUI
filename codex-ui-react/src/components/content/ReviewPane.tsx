import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyGitReviewAction,
  getReviewSnapshot,
  getThreadReviewResult,
  initializeReviewGit,
  startThreadReview,
} from '../../api/codexGateway';
import type {
  UiReviewAction,
  UiReviewActionLevel,
  UiReviewFile,
  UiReviewResult,
  UiReviewScope,
  UiReviewSnapshot,
  UiReviewTab,
  UiReviewWorkspaceView,
} from '../../types/codex';
import { IconTablerX } from '../icons';

type ReviewPaneProps = {
  threadId: string;
  cwd: string;
  isThreadInProgress: boolean;
  onClose: () => void;
};

function buttonClass(active = false): string {
  return active
    ? 'px-3 py-1.5 text-sm rounded-lg bg-primary text-white'
    : 'px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200';
}

function actionButtonClass(kind: 'primary' | 'neutral' | 'danger' = 'neutral'): string {
  if (kind === 'primary') {
    return 'px-3 py-1.5 text-sm rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-50';
  }
  if (kind === 'danger') {
    return 'px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50';
  }
  return 'px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50';
}

function formatOperation(operation: UiReviewFile['operation']): string {
  switch (operation) {
    case 'add':
      return 'A';
    case 'delete':
      return 'D';
    case 'rename':
      return 'R';
    default:
      return 'M';
  }
}

function operationTone(operation: UiReviewFile['operation']): string {
  switch (operation) {
    case 'add':
      return 'text-green-700 bg-green-50';
    case 'delete':
      return 'text-red-700 bg-red-50';
    case 'rename':
      return 'text-blue-700 bg-blue-50';
    default:
      return 'text-amber-700 bg-amber-50';
  }
}

function trimPath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/gu, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length <= 2) return normalized;
  return segments.slice(-2).join('/');
}

function ReviewPane({ threadId, cwd, isThreadInProgress, onClose }: ReviewPaneProps) {
  const [activeTab, setActiveTab] = useState<UiReviewTab>('changes');
  const [scope, setScope] = useState<UiReviewScope>('workspace');
  const [workspaceView, setWorkspaceView] = useState<UiReviewWorkspaceView>('unstaged');
  const [selectedBaseBranch, setSelectedBaseBranch] = useState('');
  const [snapshot, setSnapshot] = useState<UiReviewSnapshot | null>(null);
  const [selectedFileId, setSelectedFileId] = useState('');
  const [selectedHunkId, setSelectedHunkId] = useState('');
  const [reviewResult, setReviewResult] = useState<UiReviewResult | null>(null);
  const [enteredReviewLabel, setEnteredReviewLabel] = useState<string | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [isApplyingAction, setIsApplyingAction] = useState(false);
  const [isRunningReview, setIsRunningReview] = useState(false);
  const [isInitializingGit, setIsInitializingGit] = useState(false);
  const [awaitingReviewResult, setAwaitingReviewResult] = useState(false);
  const [bannerText, setBannerText] = useState('');
  const [bannerTone, setBannerTone] = useState<'error' | 'info'>('info');
  const previousInProgressRef = useRef(isThreadInProgress);

  const selectedFile = useMemo(
    () => snapshot?.files.find((file) => file.id === selectedFileId) ?? snapshot?.files[0] ?? null,
    [selectedFileId, snapshot],
  );

  const selectedHunk = useMemo(
    () => selectedFile?.hunks.find((hunk) => hunk.id === selectedHunkId) ?? selectedFile?.hunks[0] ?? null,
    [selectedFile, selectedHunkId],
  );

  const loadSnapshot = async () => {
    setIsLoadingSnapshot(true);
    try {
      const nextSnapshot = await getReviewSnapshot(cwd, scope, workspaceView, selectedBaseBranch || undefined);
      setSnapshot(nextSnapshot);
      setBannerText('');
      if (!selectedBaseBranch && nextSnapshot.baseBranch) {
        setSelectedBaseBranch(nextSnapshot.baseBranch);
      }
      if (nextSnapshot.files.length === 0) {
        setSelectedFileId('');
        setSelectedHunkId('');
      } else {
        const nextFile = nextSnapshot.files.find((file) => file.id === selectedFileId) ?? nextSnapshot.files[0];
        setSelectedFileId(nextFile.id);
        setSelectedHunkId(nextFile.hunks[0]?.id ?? '');
      }
    } catch (error) {
      setBannerTone('error');
      setBannerText(error instanceof Error ? error.message : 'Failed to load review snapshot');
    } finally {
      setIsLoadingSnapshot(false);
    }
  };

  const loadReviewResult = async () => {
    try {
      const next = await getThreadReviewResult(threadId);
      setEnteredReviewLabel(next.enteredReviewLabel);
      setReviewResult(next.result);
    } catch {
      // Keep the pane usable even if the thread has never entered review mode.
    }
  };

  useEffect(() => {
    void loadSnapshot();
  }, [cwd, scope, workspaceView, selectedBaseBranch]);

  useEffect(() => {
    void loadReviewResult();
  }, [threadId]);

  useEffect(() => {
    const wasInProgress = previousInProgressRef.current;
    previousInProgressRef.current = isThreadInProgress;

    if (awaitingReviewResult && wasInProgress && !isThreadInProgress) {
      setIsRunningReview(false);
      setAwaitingReviewResult(false);
      setActiveTab('findings');
      void loadReviewResult();
      void loadSnapshot();
    }
  }, [awaitingReviewResult, isThreadInProgress]);

  const applyAction = async (
    action: UiReviewAction,
    level: UiReviewActionLevel,
    patch?: string,
  ) => {
    setIsApplyingAction(true);
    try {
      const nextSnapshot = await applyGitReviewAction({
        cwd,
        scope,
        workspaceView,
        action,
        level,
        patch,
      });
      setSnapshot(nextSnapshot);
      const nextFile = nextSnapshot.files.find((file) => file.id === selectedFile?.id) ?? nextSnapshot.files[0];
      setSelectedFileId(nextFile?.id ?? '');
      setSelectedHunkId(nextFile?.hunks[0]?.id ?? '');
      setBannerText('');
    } catch (error) {
      setBannerTone('error');
      setBannerText(error instanceof Error ? error.message : 'Failed to apply review action');
    } finally {
      setIsApplyingAction(false);
    }
  };

  const handleInitializeGit = async () => {
    setIsInitializingGit(true);
    try {
      await initializeReviewGit(cwd);
      setBannerTone('info');
      setBannerText('Initialized Git repository.');
      await loadSnapshot();
    } catch (error) {
      setBannerTone('error');
      setBannerText(error instanceof Error ? error.message : 'Failed to initialize Git');
    } finally {
      setIsInitializingGit(false);
    }
  };

  const handleRunReview = async () => {
    setIsRunningReview(true);
    setAwaitingReviewResult(true);
    setBannerTone('info');
    setBannerText('Review started. Findings will appear in the thread when the turn completes.');
    try {
      await startThreadReview(threadId, scope, workspaceView, selectedBaseBranch || undefined);
    } catch (error) {
      setIsRunningReview(false);
      setAwaitingReviewResult(false);
      setBannerTone('error');
      setBannerText(error instanceof Error ? error.message : 'Failed to start review');
    }
  };

  const canRunReview = snapshot?.isGitRepo === true && (scope !== 'baseBranch' || Boolean(snapshot.baseBranch));

  return (
    <section className="flex h-full flex-col bg-white">
      <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Review</p>
          <p className="text-lg font-semibold text-gray-900">
            {enteredReviewLabel || trimPath(cwd)}
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close review pane"
          onClick={onClose}
        >
          <IconTablerX className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3">
        <button type="button" className={buttonClass(activeTab === 'changes')} onClick={() => setActiveTab('changes')}>
          Changes
        </button>
        <button type="button" className={buttonClass(activeTab === 'findings')} onClick={() => setActiveTab('findings')}>
          Findings
        </button>

        <div className="mx-2 h-6 w-px bg-gray-200" />

        <button type="button" className={buttonClass(scope === 'workspace')} onClick={() => setScope('workspace')}>
          Workspace
        </button>
        <button
          type="button"
          className={buttonClass(scope === 'baseBranch')}
          onClick={() => setScope('baseBranch')}
          disabled={!snapshot?.baseBranch}
        >
          Base Branch
        </button>

        {scope === 'workspace' && (
          <>
            <button
              type="button"
              className={buttonClass(workspaceView === 'unstaged')}
              onClick={() => setWorkspaceView('unstaged')}
            >
              Unstaged
            </button>
            <button
              type="button"
              className={buttonClass(workspaceView === 'staged')}
              onClick={() => setWorkspaceView('staged')}
            >
              Staged
            </button>
          </>
        )}

        {scope === 'baseBranch' && snapshot?.baseBranchOptions.length ? (
          <select
            value={selectedBaseBranch}
            onChange={(event) => setSelectedBaseBranch(event.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            {snapshot.baseBranchOptions.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className={actionButtonClass('primary')}
            disabled={!canRunReview || isRunningReview}
            onClick={handleRunReview}
          >
            {isRunningReview ? 'Reviewing…' : 'Run review'}
          </button>
          <button type="button" className={actionButtonClass()} disabled={isLoadingSnapshot} onClick={() => void loadSnapshot()}>
            Refresh
          </button>
        </div>
      </div>

      {bannerText ? (
        <div className={`mx-4 mt-3 rounded-xl px-3 py-2 text-sm ${bannerTone === 'error' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
          {bannerText}
        </div>
      ) : null}

      {snapshot ? (
        <div className="flex items-center gap-3 px-4 py-3 text-sm text-gray-500">
          <span>{snapshot.summary.fileCount} files</span>
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700">+{snapshot.summary.addedLineCount}</span>
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">-{snapshot.summary.removedLineCount}</span>
          {snapshot.headBranch ? <span>{snapshot.headBranch}</span> : null}
          {scope === 'baseBranch' && snapshot.baseBranch ? <span>vs {snapshot.baseBranch}</span> : null}
        </div>
      ) : null}

      {activeTab === 'findings' ? (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {isThreadInProgress || awaitingReviewResult ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-5 text-sm text-blue-700">
              Waiting for the review turn to finish.
            </div>
          ) : !reviewResult ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
              No review findings are available for this thread yet.
            </div>
          ) : (
            <div className="space-y-4">
              <section className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                <h3 className="text-sm font-semibold text-gray-900">Summary</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                  {reviewResult.summary || reviewResult.reviewText}
                </p>
              </section>

              <section className="space-y-3">
                {reviewResult.findings.length === 0 ? (
                  <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm text-gray-500">
                    The review completed without structured findings.
                  </div>
                ) : (
                  reviewResult.findings.map((finding) => (
                    <article key={finding.id} className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-gray-900">{finding.title}</h4>
                        {finding.path ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            {finding.path}
                            {finding.startLine ? `:${finding.startLine}` : ''}
                            {finding.endLine && finding.endLine !== finding.startLine ? `-${finding.endLine}` : ''}
                          </span>
                        ) : null}
                      </div>
                      {finding.body ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{finding.body}</p>
                      ) : (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{finding.rawText}</p>
                      )}
                    </article>
                  ))
                )}
              </section>
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          {!snapshot ? (
            <div className="px-4 py-6 text-sm text-gray-500">{isLoadingSnapshot ? 'Loading review state…' : 'Loading review state.'}</div>
          ) : !snapshot.isGitRepo ? (
            <div className="px-4 py-6">
              <div className="max-w-md rounded-2xl border border-gray-200 bg-gray-50 px-4 py-5">
                <h3 className="text-base font-semibold text-gray-900">This folder is not a Git repository</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Initialize Git to inspect local changes and run Codex review.
                </p>
                <button
                  type="button"
                  className={`mt-4 ${actionButtonClass('primary')}`}
                  disabled={isInitializingGit}
                  onClick={handleInitializeGit}
                >
                  {isInitializingGit ? 'Initializing…' : 'Initialize Git'}
                </button>
              </div>
            </div>
          ) : scope === 'baseBranch' && !snapshot.baseBranch ? (
            <div className="px-4 py-6 text-sm text-gray-500">
              Base branch is unavailable for this repository.
            </div>
          ) : snapshot.files.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-500">
              No changes in this scope.
            </div>
          ) : (
            <>
              <aside className="w-full shrink-0 overflow-y-auto border-b border-gray-200 md:w-80 md:border-b-0 md:border-r">
                {scope === 'workspace' ? (
                  <div className="flex flex-wrap gap-2 border-b border-gray-200 px-3 py-3">
                    {workspaceView === 'unstaged' ? (
                      <>
                        <button
                          type="button"
                          className={actionButtonClass()}
                          disabled={isApplyingAction}
                          onClick={() => void applyAction('stage', 'all')}
                        >
                          Stage all
                        </button>
                        <button
                          type="button"
                          className={actionButtonClass('danger')}
                          disabled={isApplyingAction}
                          onClick={() => void applyAction('revert', 'all')}
                        >
                          Revert all
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={actionButtonClass()}
                        disabled={isApplyingAction}
                        onClick={() => void applyAction('unstage', 'all')}
                      >
                        Unstage all
                      </button>
                    )}
                  </div>
                ) : null}

                <div className="p-2">
                  {snapshot.files.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => {
                        setSelectedFileId(file.id);
                        setSelectedHunkId(file.hunks[0]?.id ?? '');
                      }}
                      className={`mb-2 w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                        selectedFile?.id === file.id
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${operationTone(file.operation)}`}>
                          {formatOperation(file.operation)}
                        </span>
                        <span className="text-xs text-gray-400">
                          +{file.addedLineCount} / -{file.removedLineCount}
                        </span>
                      </div>
                      <p className="mt-2 break-all text-sm font-medium text-gray-800">{file.path}</p>
                      {file.previousPath ? (
                        <p className="mt-1 break-all text-xs text-gray-500">from {file.previousPath}</p>
                      ) : null}
                    </button>
                  ))}
                </div>
              </aside>

              <section className="min-h-0 flex-1 overflow-y-auto p-4">
                {selectedFile ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="break-all text-sm font-semibold text-gray-900">{selectedFile.path}</h3>
                          <p className="mt-1 text-xs text-gray-500">
                            {selectedFile.operation} · +{selectedFile.addedLineCount} / -{selectedFile.removedLineCount}
                          </p>
                        </div>
                        {scope === 'workspace' ? (
                          <div className="flex flex-wrap gap-2">
                            {workspaceView === 'unstaged' ? (
                              <>
                                <button
                                  type="button"
                                  className={actionButtonClass()}
                                  disabled={isApplyingAction}
                                  onClick={() => void applyAction('stage', 'file', selectedFile.diff)}
                                >
                                  Stage file
                                </button>
                                <button
                                  type="button"
                                  className={actionButtonClass('danger')}
                                  disabled={isApplyingAction}
                                  onClick={() => void applyAction('revert', 'file', selectedFile.diff)}
                                >
                                  Revert file
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className={actionButtonClass()}
                                disabled={isApplyingAction}
                                onClick={() => void applyAction('unstage', 'file', selectedFile.diff)}
                              >
                                Unstage file
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {selectedFile.hunks.length === 0 ? (
                      <pre className="overflow-x-auto rounded-2xl border border-gray-200 bg-gray-950 px-4 py-4 text-xs text-gray-100">
                        {selectedFile.diff || 'No unified diff available.'}
                      </pre>
                    ) : (
                      selectedFile.hunks.map((hunk) => (
                        <article
                          key={hunk.id}
                          className={`rounded-2xl border px-4 py-4 ${
                            selectedHunk?.id === hunk.id ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'
                          }`}
                          onClick={() => setSelectedHunkId(hunk.id)}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-mono text-xs text-gray-600">{hunk.header}</p>
                              <p className="mt-1 text-xs text-gray-500">+{hunk.addedLineCount} / -{hunk.removedLineCount}</p>
                            </div>
                            {scope === 'workspace' ? (
                              <div className="flex flex-wrap gap-2">
                                {workspaceView === 'unstaged' ? (
                                  <>
                                    <button
                                      type="button"
                                      className={actionButtonClass()}
                                      disabled={isApplyingAction}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void applyAction('stage', 'hunk', hunk.patch);
                                      }}
                                    >
                                      Stage hunk
                                    </button>
                                    <button
                                      type="button"
                                      className={actionButtonClass('danger')}
                                      disabled={isApplyingAction}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void applyAction('revert', 'hunk', hunk.patch);
                                      }}
                                    >
                                      Revert hunk
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className={actionButtonClass()}
                                    disabled={isApplyingAction}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void applyAction('unstage', 'hunk', hunk.patch);
                                    }}
                                  >
                                    Unstage hunk
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-3 overflow-x-auto rounded-xl bg-gray-950">
                            <div className="min-w-[680px]">
                              {hunk.lines.map((line) => (
                                <div
                                  key={line.key}
                                  className={`grid grid-cols-[3rem_3rem_1.5rem_minmax(0,1fr)] gap-2 px-3 py-1 font-mono text-xs ${
                                    line.kind === 'add'
                                      ? 'bg-green-950/60 text-green-100'
                                      : line.kind === 'remove'
                                      ? 'bg-red-950/60 text-red-100'
                                      : line.kind === 'hunk'
                                      ? 'bg-blue-950/60 text-blue-100'
                                      : line.kind === 'meta'
                                      ? 'bg-gray-900 text-gray-400'
                                      : 'text-gray-200'
                                  }`}
                                >
                                  <span className="text-gray-500">{line.oldLine ?? ''}</span>
                                  <span className="text-gray-500">{line.newLine ?? ''}</span>
                                  <span>
                                    {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : line.kind === 'hunk' ? '@' : ' '}
                                  </span>
                                  <span className="whitespace-pre-wrap break-all">{line.text || ' '}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                ) : null}
              </section>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default ReviewPane;
