import { useCallback, useEffect } from 'react';
import { SquareLibrary, Settings } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCodexStore } from '../../stores';
import { useIsMobile } from '../../hooks/useIsMobile';
import SidebarThreadTree from '../sidebar/SidebarThreadTree';
import SidebarThreadControls, { SidebarToolbarAction } from '../sidebar/SidebarThreadControls';
import { IconTablerSearch, IconTablerX } from '../icons';
import { buildProjectEntries } from '../../utils/projectEntries';

function DesktopLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const {
    projectGroups,
    workspaceRootsState,
    selectedThreadId,
    isLoadingThreads,
    isSidebarCollapsed,
    isSidebarSearchVisible,
    sidebarSearchQuery,
    error,
    selectThread,
    setSidebarCollapsed,
    toggleSidebarSearch,
    setSidebarSearchQuery,
    clearError,
    renameThreadById,
    archiveThreadById,
    forkThreadById,
    updateWorkspaceRootsState,
  } = useCodexStore();

  const isSkillsRoute = location.pathname === '/skills';
  const isSettingsRoute = location.pathname === '/settings';
  const projectEntries = buildProjectEntries(workspaceRootsState, projectGroups);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
      event.preventDefault();
      setSidebarCollapsed(!isSidebarCollapsed);
    }
  }, [isSidebarCollapsed, setSidebarCollapsed]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  }, [isMobile, setSidebarCollapsed]);

  const handleSelectThread = async (threadId: string) => {
    await selectThread(threadId);
    if (isMobile) {
      setSidebarCollapsed(true);
    }
    navigate(`/thread/${threadId}`);
  };

  const handleRenameThread = async (threadId: string, nextTitle: string) => {
    await renameThreadById(threadId, nextTitle);
  };

  const handleArchiveThread = async (threadId: string) => {
    await archiveThreadById(threadId);
    if (isMobile) {
      setSidebarCollapsed(true);
    }
    if (location.pathname === `/thread/${threadId}`) {
      navigate('/');
    }
  };

  const handleForkThread = async (threadId: string) => {
    const nextThreadId = await forkThreadById(threadId);
    if (!nextThreadId) return;
    if (isMobile) {
      setSidebarCollapsed(true);
    }
    navigate(`/thread/${nextThreadId}`);
  };

  const handleRenameProject = async (cwd: string, nextLabel: string) => {
    const normalizedCwd = cwd.trim();
    if (!normalizedCwd) return;
    const normalizedLabel = nextLabel.trim();
    const nextState = {
      ...workspaceRootsState,
      labels: { ...workspaceRootsState.labels },
    };
    if (!normalizedLabel) {
      delete nextState.labels[normalizedCwd];
    } else {
      nextState.labels[normalizedCwd] = normalizedLabel;
    }
    await updateWorkspaceRootsState(nextState);
  };

  const handleHideProject = async (cwd: string) => {
    const normalizedCwd = cwd.trim();
    if (!normalizedCwd) return;
    const nextLabels = { ...workspaceRootsState.labels };
    delete nextLabels[normalizedCwd];
    await updateWorkspaceRootsState({
      order: workspaceRootsState.order.filter((item) => item !== normalizedCwd),
      active: workspaceRootsState.active.filter((item) => item !== normalizedCwd),
      labels: nextLabels,
    });
  };

  const handleNewThread = () => {
    if (isMobile) {
      setSidebarCollapsed(true);
    }
    navigate('/');
  };

  const handleToggleSidebarSearch = () => {
    if (isSidebarCollapsed || isMobile) {
      setSidebarCollapsed(false);
    }
    toggleSidebarSearch();
  };

  const handleNavigateSkills = () => {
    if (isMobile) {
      setSidebarCollapsed(true);
    }
    navigate('/skills');
  };

  const handleNavigateSettings = () => {
    if (isMobile) {
      setSidebarCollapsed(true);
    }
    navigate('/settings');
  };

  const sidebar = (
    <section className="flex h-full flex-col bg-gray-100">
      <div className="flex min-h-12 items-center px-2 pb-2 pt-3 sm:min-h-14 sm:px-3 sm:pt-4">
        <SidebarThreadControls
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!isSidebarCollapsed)}
          onNewThread={handleNewThread}
        >
          <SidebarToolbarAction label="Skills Hub" onClick={handleNavigateSkills} isActive={isSkillsRoute}>
            <SquareLibrary className="h-4 w-4" strokeWidth={1.8} />
          </SidebarToolbarAction>
          <SidebarToolbarAction label="Settings" onClick={handleNavigateSettings} isActive={isSettingsRoute}>
            <Settings className="h-4 w-4" strokeWidth={1.8} />
          </SidebarToolbarAction>
          <SidebarToolbarAction label="Search threads" onClick={handleToggleSidebarSearch}>
            <IconTablerSearch className="h-4 w-4" />
          </SidebarToolbarAction>
        </SidebarThreadControls>
      </div>

      {isSidebarSearchVisible ? (
        <div className="px-3 pb-2">
          <div className="relative">
            <IconTablerSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={sidebarSearchQuery}
              onChange={(event) => setSidebarSearchQuery(event.target.value)}
              placeholder="Filter threads..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-700 outline-none ring-0 transition focus:border-primary"
              autoFocus
            />
            {sidebarSearchQuery ? (
              <button
                type="button"
                onClick={() => setSidebarSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Clear search"
              >
                <IconTablerX className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarThreadTree
          projectEntries={projectEntries}
          selectedThreadId={selectedThreadId}
          isLoading={isLoadingThreads}
          searchQuery={sidebarSearchQuery}
          onSelectThread={handleSelectThread}
          onRenameProject={handleRenameProject}
          onHideProject={handleHideProject}
          onRenameThread={handleRenameThread}
          onArchiveThread={handleArchiveThread}
          onForkThread={handleForkThread}
        />
      </div>
    </section>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-100">
      {isMobile && !isSidebarCollapsed ? (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setSidebarCollapsed(true)}
        >
          <aside
            className="absolute inset-y-0 left-0 w-[85vw] max-w-80 overflow-hidden shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {sidebar}
          </aside>
        </div>
      ) : null}

      {!isMobile && !isSidebarCollapsed ? (
        <aside className="w-80 flex-shrink-0 border-r border-gray-200">
          {sidebar}
        </aside>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        {error ? (
          <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-4 py-3">
            <span className="text-sm text-red-700">{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="text-red-500 transition hover:text-red-700"
              aria-label="Dismiss error"
            >
              <IconTablerX className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default DesktopLayout;
