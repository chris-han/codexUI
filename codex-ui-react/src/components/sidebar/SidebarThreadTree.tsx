import { useEffect, useState } from 'react';
import { FolderOpen, Folder } from 'lucide-react';
import type { UiProjectGroup, UiThread } from '../../types/codex';
import {
  IconTablerDots,
} from '../icons';

const PROJECT_LABELS_STORAGE_KEY = 'codex-ui-react.project-labels.v1';
const HIDDEN_PROJECTS_STORAGE_KEY = 'codex-ui-react.hidden-projects.v1';

function loadProjectLabels(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PROJECT_LABELS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
  } catch {
    return {};
  }
}

function saveProjectLabels(labels: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROJECT_LABELS_STORAGE_KEY, JSON.stringify(labels));
}

function loadHiddenProjects(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HIDDEN_PROJECTS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function saveHiddenProjects(projects: string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HIDDEN_PROJECTS_STORAGE_KEY, JSON.stringify(projects));
}

interface SidebarThreadTreeProps {
  groups: UiProjectGroup[];
  selectedThreadId: string | null;
  isLoading: boolean;
  searchQuery: string;
  onSelectThread: (threadId: string) => void;
}

function SidebarThreadTree({
  groups,
  selectedThreadId,
  isLoading,
  searchQuery,
  onSelectThread,
}: SidebarThreadTreeProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    groups.forEach((g) => initial.add(g.projectName));
    return initial;
  });
  const [projectLabels, setProjectLabels] = useState<Record<string, string>>(() => loadProjectLabels());
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(() => new Set(loadHiddenProjects()));
  const [openProjectMenu, setOpenProjectMenu] = useState<string | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-project-menu-root="true"]')) {
        return;
      }
      setOpenProjectMenu(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const toggleGroup = (projectName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(projectName)) {
        next.delete(projectName);
      } else {
        next.add(projectName);
      }
      return next;
    });
  };

  const getProjectLabel = (projectName: string) => {
    const custom = projectLabels[projectName]?.trim();
    return custom || projectName;
  };

  const handleRenameProject = (projectName: string) => {
    const nextName = window.prompt('Rename folder', getProjectLabel(projectName));
    setOpenProjectMenu(null);
    if (nextName === null) return;

    const normalized = nextName.trim();
    setProjectLabels((current) => {
      const next = { ...current };
      if (!normalized || normalized === projectName) {
        delete next[projectName];
      } else {
        next[projectName] = normalized;
      }
      saveProjectLabels(next);
      return next;
    });
  };

  const handleDeleteProject = (projectName: string) => {
    const confirmed = window.confirm(`Hide folder "${getProjectLabel(projectName)}" from the sidebar?`);
    setOpenProjectMenu(null);
    if (!confirmed) return;

    setHiddenProjects((current) => {
      const next = new Set(current);
      next.add(projectName);
      saveHiddenProjects(Array.from(next));
      return next;
    });
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

  if (groups.length === 0) {
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
      {groups.map((group) => {
        if (hiddenProjects.has(group.projectName)) return null;

        const filteredThreads = filterThreads(group.threads);
        if (searchQuery && filteredThreads.length === 0) return null;

        const isExpanded = expandedGroups.has(group.projectName);
        const projectLabel = getProjectLabel(group.projectName);

        return (
          <div key={group.projectName} className="px-1">
            <div data-project-menu-root="true" className="group relative flex items-center gap-1 rounded-md pr-1 hover:bg-gray-100">
              <button
                onClick={() => toggleGroup(group.projectName)}
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
                  setOpenProjectMenu((current) => (current === group.projectName ? null : group.projectName));
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition hover:bg-white hover:text-gray-700 ${
                  openProjectMenu === group.projectName ? 'bg-white text-gray-700 shadow-sm' : 'opacity-0 group-hover:opacity-100'
                }`}
                aria-label={`Open folder menu for ${projectLabel}`}
                title="Folder actions"
              >
                <IconTablerDots className="h-4 w-4" />
              </button>
              {openProjectMenu === group.projectName ? (
                <div
                  className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[140px] overflow-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => handleRenameProject(group.projectName)}
                    className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(group.projectName)}
                    className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>

            {isExpanded && (
              <div className="ml-6 space-y-0.5 mt-1">
                {filteredThreads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => onSelectThread(thread.id)}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors truncate ${
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
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default SidebarThreadTree;
