import { useEffect, useCallback, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useCodexStore } from '../../stores';
import SidebarThreadTree from '../sidebar/SidebarThreadTree';
import SidebarThreadControls from '../sidebar/SidebarThreadControls';
import NewThreadDialog from '../dialogs/NewThreadDialog';
import { IconTablerSearch, IconTablerX, IconTablerLayoutSidebar, IconTablerLayoutSidebarFilled } from '../icons';

function DesktopLayout() {
  const navigate = useNavigate();
  const [isNewThreadDialogOpen, setIsNewThreadDialogOpen] = useState(false);
  const {
    projectGroups,
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
  } = useCodexStore();

  // Keyboard shortcut for sidebar toggle (Cmd/Ctrl+B)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      setSidebarCollapsed(!isSidebarCollapsed);
    }
  }, [isSidebarCollapsed, setSidebarCollapsed]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSelectThread = async (threadId: string) => {
    await selectThread(threadId);
    navigate(`/thread/${threadId}`);
  };

  const handleNewThread = () => {
    setIsNewThreadDialogOpen(true);
  };

  return (
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex-shrink-0 bg-white border-r border-gray-200 transition-all duration-200 ease-in-out flex flex-col ${
          isSidebarCollapsed ? 'w-12' : 'w-64'
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200">
          {!isSidebarCollapsed && (
            <span className="font-semibold text-gray-800">Codex</span>
          )}
          <button
            onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? (
              <IconTablerLayoutSidebar className="w-5 h-5" />
            ) : (
              <IconTablerLayoutSidebarFilled className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Thread Controls */}
        {!isSidebarCollapsed && (
          <SidebarThreadControls onNewThread={handleNewThread} />
        )}

        {/* Search Bar */}
        {!isSidebarCollapsed && (
          <div className="px-3 pb-2">
            <div className="relative">
              <button
                onClick={toggleSidebarSearch}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <IconTablerSearch className="w-4 h-4" />
                <span className="flex-1 text-left">Search threads...</span>
              </button>
            </div>

            {isSidebarSearchVisible && (
              <div className="mt-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <IconTablerSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={sidebarSearchQuery}
                    onChange={(e) => setSidebarSearchQuery(e.target.value)}
                    placeholder="Filter threads..."
                    className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    autoFocus
                  />
                  {sidebarSearchQuery && (
                    <button
                      onClick={() => setSidebarSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <IconTablerX className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Skills Link */}
        {!isSidebarCollapsed && (
          <div className="px-3 pb-2">
            <button
              onClick={() => navigate('/skills')}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Skills Hub
            </button>
          </div>
        )}

        {/* Thread Tree */}
        <div className="flex-1 overflow-y-auto">
          {isSidebarCollapsed ? (
            <div className="flex flex-col items-center py-4 gap-3">
              {projectGroups.slice(0, 5).map((group) => (
                <div
                  key={group.projectName}
                  className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-medium"
                  title={group.projectName}
                >
                  {group.projectName.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          ) : (
            <SidebarThreadTree
              groups={projectGroups}
              selectedThreadId={selectedThreadId}
              isLoading={isLoadingThreads}
              searchQuery={sidebarSearchQuery}
              onSelectThread={handleSelectThread}
            />
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col bg-gray-50">
        {error && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center justify-between">
            <span className="text-red-700 text-sm">{error}</span>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700"
            >
              <IconTablerX className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>

      {/* New Thread Dialog */}
      <NewThreadDialog
        isOpen={isNewThreadDialogOpen}
        onClose={() => setIsNewThreadDialogOpen(false)}
        onCreated={(threadId) => navigate(`/thread/${threadId}`)}
      />
    </div>
  );
}

export default DesktopLayout;
