import { useEffect, useState } from 'react';
import { FolderOpen, Folder } from 'lucide-react';
import type { UiThread } from '../../types/codex';
import { ConfirmDialog, TextInputDialog } from '../dialogs/Modal';
import type { ProjectEntry } from '../../utils/projectEntries';
import {
  IconTablerDots,
} from '../icons';

interface SidebarThreadTreeProps {
  projectEntries: ProjectEntry[];
  selectedThreadId: string | null;
  isLoading: boolean;
  searchQuery: string;
  onSelectThread: (threadId: string) => void;
  onRenameProject: (cwd: string, nextLabel: string) => void;
  onDeleteProject: (cwd: string) => void;
  onRenameThread: (threadId: string, nextTitle: string) => void;
  onForkThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
}

function SidebarThreadTree({
  projectEntries,
  selectedThreadId,
  isLoading,
  searchQuery,
  onSelectThread,
  onRenameProject,
  onDeleteProject,
  onRenameThread,
  onForkThread,
  onArchiveThread,
}: SidebarThreadTreeProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    projectEntries.forEach((entry) => initial.add(entry.key));
    return initial;
  });
  const [openProjectMenu, setOpenProjectMenu] = useState<string | null>(null);
  const [openThreadMenu, setOpenThreadMenu] = useState<string | null>(null);
  const [projectRenameTarget, setProjectRenameTarget] = useState<ProjectEntry | null>(null);
  const [projectRenameDraft, setProjectRenameDraft] = useState('');
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<ProjectEntry | null>(null);
  const [threadRenameTarget, setThreadRenameTarget] = useState<UiThread | null>(null);
  const [threadRenameDraft, setThreadRenameDraft] = useState('');
  const [threadDeleteTarget, setThreadDeleteTarget] = useState<UiThread | null>(null);

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      projectEntries.forEach((entry) => next.add(entry.key));
      return next;
    });
  }, [projectEntries]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-menu-root="true"]')) {
        return;
      }
      setOpenProjectMenu(null);
      setOpenThreadMenu(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const toggleGroup = (projectKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(projectKey)) {
        next.delete(projectKey);
      } else {
        next.add(projectKey);
      }
      return next;
    });
  };

  const handleRenameProject = (entry: ProjectEntry) => {
    setOpenProjectMenu(null);
    setProjectRenameTarget(entry);
    setProjectRenameDraft(entry.label);
  };

  const submitRenameProject = () => {
    if (!projectRenameTarget) return;
    onRenameProject(projectRenameTarget.cwd, projectRenameDraft);
    setProjectRenameTarget(null);
    setProjectRenameDraft('');
  };

  const handleDeleteProject = (entry: ProjectEntry) => {
    setOpenProjectMenu(null);
    setProjectDeleteTarget(entry);
  };

  const submitDeleteProject = () => {
    if (!projectDeleteTarget) return;
    onDeleteProject(projectDeleteTarget.cwd);
    setProjectDeleteTarget(null);
  };

  const handleRenameThread = (thread: UiThread) => {
    setOpenThreadMenu(null);
    setThreadRenameTarget(thread);
    setThreadRenameDraft(thread.title);
  };

  const submitRenameThread = () => {
    if (!threadRenameTarget) return;
    const normalized = threadRenameDraft.trim();
    if (!normalized || normalized === threadRenameTarget.title) {
      setThreadRenameTarget(null);
      setThreadRenameDraft('');
      return;
    }
    onRenameThread(threadRenameTarget.id, normalized);
    setThreadRenameTarget(null);
    setThreadRenameDraft('');
  };

  const handleForkThread = (threadId: string) => {
    setOpenThreadMenu(null);
    onForkThread(threadId);
  };

  const handleArchiveThread = (thread: UiThread) => {
    setOpenThreadMenu(null);
    setThreadDeleteTarget(thread);
  };

  const submitArchiveThread = () => {
    if (!threadDeleteTarget) return;
    onArchiveThread(threadDeleteTarget.id);
    setThreadDeleteTarget(null);
  };

  const filterThreads = (threads: UiThread[]): UiThread[] => {
    if (!searchQuery.trim()) return threads;
    const query = searchQuery.toLowerCase();
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.preview.toLowerCase().includes(query)
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-400">
        <div className="animate-pulse">Loading threads...</div>
      </div>
    );
  }

  if (projectEntries.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400 text-sm">
        No threads yet.
        <br />
        Start a new thread to begin.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {projectEntries.map((entry) => {
        const filteredThreads = filterThreads(entry.threads);
        const shouldHideForSearch = searchQuery.trim() && filteredThreads.length === 0 && entry.threads.length > 0;
        if (shouldHideForSearch) return null;

        const isExpanded = expandedGroups.has(entry.key);
        const projectLabel = entry.label;

        return (
          <div key={entry.key} className="px-1">
            <div data-menu-root="true" className="group relative flex items-center gap-1 rounded-md pr-1 hover:bg-gray-100">
              <button
                onClick={() => toggleGroup(entry.key)}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm font-medium text-gray-700 transition-colors"
                title={projectLabel}
              >
                {isExpanded ? (
                  <FolderOpen className="h-4 w-4 text-gray-400" strokeWidth={1.8} />
                ) : (
                  <Folder className="w-4 h-4 text-gray-400" />
                )}
                <span className="truncate flex-1 text-left">
                  {projectLabel}
                </span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenProjectMenu((current) => (current === entry.key ? null : entry.key));
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition hover:bg-white hover:text-gray-700 ${
                  openProjectMenu === entry.key ? 'bg-white text-gray-700 shadow-sm' : 'opacity-0 group-hover:opacity-100'
                }`}
                aria-label={`Open folder menu for ${projectLabel}`}
                title="Folder actions"
              >
                <IconTablerDots className="h-4 w-4" />
              </button>
              {openProjectMenu === entry.key ? (
                <div
                  className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[140px] overflow-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => handleRenameProject(entry)}
                    className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(entry)}
                    className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>

            {isExpanded && (
              <div className="ml-6 space-y-0.5 mt-1">
                {filteredThreads.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-gray-400">
                    No threads
                  </div>
                ) : null}
                {filteredThreads.map((thread) => (
                  <div key={thread.id} data-menu-root="true" className="group/thread relative flex items-center gap-1 rounded-md pr-1 hover:bg-gray-100">
                    <button
                      onClick={() => onSelectThread(thread.id)}
                      className={`min-w-0 flex-1 text-left px-2 py-1.5 text-sm rounded-md transition-colors truncate ${
                        selectedThreadId === thread.id
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-gray-600 hover:bg-gray-100'
                      } ${thread.inProgress ? 'italic' : ''}`}
                      title={thread.title}
                    >
                      {thread.inProgress && (
                        <span className="inline-block w-1.5 h-1.5 bg-primary rounded-full mr-1.5 animate-pulse" />
                      )}
                      {thread.title}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenProjectMenu(null);
                        setOpenThreadMenu((current) => (current === thread.id ? null : thread.id));
                      }}
                      className={`flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition hover:bg-white hover:text-gray-700 ${
                        openThreadMenu === thread.id ? 'bg-white text-gray-700 shadow-sm' : 'opacity-0 group-hover/thread:opacity-100'
                      }`}
                      aria-label={`Open thread menu for ${thread.title}`}
                      title="Thread actions"
                    >
                      <IconTablerDots className="h-4 w-4" />
                    </button>
                    {openThreadMenu === thread.id ? (
                      <div
                        className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[160px] overflow-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleForkThread(thread.id)}
                          className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                        >
                          Create chat fork
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRenameThread(thread)}
                          className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                        >
                          Rename thread
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchiveThread(thread)}
                          className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                        >
                          Delete thread
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <TextInputDialog
        isOpen={projectRenameTarget !== null}
        title="Rename folder"
        label="Folder name"
        value={projectRenameDraft}
        onChange={setProjectRenameDraft}
        onSubmit={submitRenameProject}
        onClose={() => {
          setProjectRenameTarget(null);
          setProjectRenameDraft('');
        }}
        confirmLabel="Save"
      />
      <ConfirmDialog
        isOpen={projectDeleteTarget !== null}
        title="Delete folder"
        message={`Delete folder "${projectDeleteTarget?.label ?? ''}" and all its contents? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={submitDeleteProject}
        onClose={() => setProjectDeleteTarget(null)}
        tone="danger"
      />
      <TextInputDialog
        isOpen={threadRenameTarget !== null}
        title="Rename thread"
        label="Thread title"
        value={threadRenameDraft}
        onChange={setThreadRenameDraft}
        onSubmit={submitRenameThread}
        onClose={() => {
          setThreadRenameTarget(null);
          setThreadRenameDraft('');
        }}
        confirmLabel="Save"
      />
      <ConfirmDialog
        isOpen={threadDeleteTarget !== null}
        title="Archive thread"
        message={`Archive thread "${threadDeleteTarget?.title ?? ''}"?`}
        confirmLabel="Archive"
        onConfirm={submitArchiveThread}
        onClose={() => setThreadDeleteTarget(null)}
        tone="danger"
      />
    </div>
  );
}

export default SidebarThreadTree;
