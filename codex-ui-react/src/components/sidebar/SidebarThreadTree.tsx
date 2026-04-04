import { useState } from 'react';
import type { UiProjectGroup, UiThread } from '../../types/codex';
import { IconTablerChevronDown, IconTablerChevronRight, IconTablerFolder, IconTablerFolderOpen } from '../icons';

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
  // Track expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    groups.forEach((g) => initial.add(g.projectName));
    return initial;
  });

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

  // Filter threads based on search
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
        const filteredThreads = filterThreads(group.threads);
        if (searchQuery && filteredThreads.length === 0) return null;

        const isExpanded = expandedGroups.has(group.projectName);

        return (
          <div key={group.projectName} className="px-1">
            {/* Project Header */}
            <button
              onClick={() => toggleGroup(group.projectName)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              {isExpanded ? (
                <IconTablerChevronDown className="w-3.5 h-3.5 text-gray-400" />
              ) : (
                <IconTablerChevronRight className="w-3.5 h-3.5 text-gray-400" />
              )}
              {isExpanded ? (
                <IconTablerFolderOpen className="w-4 h-4 text-primary" />
              ) : (
                <IconTablerFolder className="w-4 h-4 text-gray-400" />
              )}
              <span className="truncate flex-1 text-left">
                {group.projectName}
              </span>
              <span className="text-xs text-gray-400">
                {filteredThreads.length}
              </span>
            </button>

            {/* Thread List */}
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
