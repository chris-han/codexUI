import { useEffect, useMemo, useRef, useState } from 'react';
import { SquareLibrary } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getHomeDirectory, getWorkspaceRootsState, openProjectRoot, setWorkspaceRootsState, type WorkspaceRootsState } from '../../api/codexGateway';
import { useSidebarChrome } from '../../hooks/useSidebarChrome';
import { useCodexStore } from '../../stores';
import type { ThreadComposerSubmitPayload, UiProjectGroup } from '../../types/codex';
import ThreadComposer from './ThreadComposer';
import ContentHeader from './ContentHeader';
import { TextInputDialog } from '../dialogs/Modal';
import SidebarThreadControls, { SidebarToolbarAction } from '../sidebar/SidebarThreadControls';
import { IconTablerChevronDown, IconTablerSearch } from '../icons';

type ProjectOption = {
  label: string;
  cwd: string;
};

function normalizePathSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function getBaseName(value: string): string {
  const normalized = normalizePathSlashes(value.trim());
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function joinPath(basePath: string, child: string): string {
  const normalizedBase = normalizePathSlashes(basePath).replace(/\/+$/, '');
  const normalizedChild = normalizePathSlashes(child).replace(/^\/+/, '');
  if (!normalizedBase) return `/${normalizedChild}`;
  return `${normalizedBase}/${normalizedChild}`;
}

function deriveProjectLabel(cwd: string, labels: Record<string, string>): string {
  const customLabel = labels[cwd]?.trim();
  if (customLabel) return customLabel;
  const base = getBaseName(cwd);
  return base || cwd.trim() || 'Project';
}

function buildProjectOptions(
  rootsState: WorkspaceRootsState,
  projectGroups: UiProjectGroup[]
): ProjectOption[] {
  const optionByCwd = new Map<string, ProjectOption>();

  for (const cwd of rootsState.order) {
    const normalizedCwd = cwd.trim();
    if (!normalizedCwd) continue;
    optionByCwd.set(normalizedCwd, {
      cwd: normalizedCwd,
      label: deriveProjectLabel(normalizedCwd, rootsState.labels),
    });
  }

  for (const group of projectGroups) {
    const cwd = group.threads[0]?.cwd?.trim() ?? '';
    if (!cwd || optionByCwd.has(cwd)) continue;
    optionByCwd.set(cwd, {
      cwd,
      label: group.projectName || deriveProjectLabel(cwd, rootsState.labels),
    });
  }

  return Array.from(optionByCwd.values());
}

function HomeScreen() {
  const navigate = useNavigate();
  const { isSidebarCollapsed, showHeaderControls, toggleSidebar, openSidebarSearch } = useSidebarChrome();
  const { projectGroups, startNewThread, isSendingMessage } = useCodexStore();
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [workspaceRootsState, setLocalWorkspaceRootsState] = useState<WorkspaceRootsState>({
    order: [],
    labels: {},
    active: [],
  });
  const [homeDirectory, setHomeDirectory] = useState('');
  const [selectedCwd, setSelectedCwd] = useState('');
  const [isCreateFolderDialogOpen, setIsCreateFolderDialogOpen] = useState(false);
  const [createFolderDraft, setCreateFolderDraft] = useState('');
  const [createFolderError, setCreateFolderError] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);

  const projectOptions = useMemo(
    () => buildProjectOptions(workspaceRootsState, projectGroups),
    [projectGroups, workspaceRootsState]
  );

  useEffect(() => {
    let cancelled = false;

    const loadRoots = async () => {
      try {
        const [rootsState, nextHomeDirectory] = await Promise.all([
          getWorkspaceRootsState(),
          getHomeDirectory(),
        ]);
        if (cancelled) return;
        setLocalWorkspaceRootsState(rootsState);
        setHomeDirectory(nextHomeDirectory);
      } catch {
        if (cancelled) return;
        setLocalWorkspaceRootsState({ order: [], labels: {}, active: [] });
        setHomeDirectory('');
      }
    };

    void loadRoots();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCwd && projectOptions.length > 0) {
      setSelectedCwd(projectOptions[0].cwd);
    }
  }, [projectOptions, selectedCwd]);

  useEffect(() => {
    if (!selectedCwd) return;
    if (projectOptions.some((option) => option.cwd === selectedCwd)) return;
    setSelectedCwd(projectOptions[0]?.cwd ?? '');
  }, [projectOptions, selectedCwd]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const root = projectMenuRef.current;
      if (!root) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (root.contains(target)) return;
      setIsProjectMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const selectedProject = projectOptions.find((option) => option.cwd === selectedCwd) || null;

  const handleCreateFolder = async () => {
    const trimmed = createFolderDraft.trim();
    if (!trimmed) return;

    const nextPath = isAbsolutePath(trimmed)
      ? trimmed
      : joinPath(homeDirectory || '/', trimmed);
    const nextLabel = getBaseName(nextPath.trim()) || trimmed;

    try {
      setIsCreatingFolder(true);
      setCreateFolderError('');
      const createdPath = await openProjectRoot(nextPath, {
        createIfMissing: true,
        label: nextLabel,
      });
      const nextState = await getWorkspaceRootsState();
      setLocalWorkspaceRootsState(nextState);
      setSelectedCwd(createdPath);
      setIsProjectMenuOpen(false);
      setIsCreateFolderDialogOpen(false);
      setCreateFolderDraft('');
    } catch (error) {
      setCreateFolderError(error instanceof Error ? error.message : 'Failed to create folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleSend = async (payload: ThreadComposerSubmitPayload) => {
    if (!selectedCwd) return;

    if (!workspaceRootsState.order.includes(selectedCwd)) {
      const nextState: WorkspaceRootsState = {
        order: [selectedCwd, ...workspaceRootsState.order.filter((item) => item !== selectedCwd)],
        labels: workspaceRootsState.labels,
        active: [selectedCwd, ...workspaceRootsState.active.filter((item) => item !== selectedCwd)],
      };

      try {
        await setWorkspaceRootsState(nextState);
        setLocalWorkspaceRootsState(nextState);
      } catch {
        // Keep new-thread flow usable even if roots-state persistence fails.
      }
    }

    const threadId = await startNewThread(selectedCwd, payload);
    if (threadId) {
      navigate(`/thread/${threadId}`);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <ContentHeader
        title="New thread"
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
      />

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8">
        <div className="w-full max-w-3xl">
          <div className="mb-8 text-center">
            <p className="text-5xl font-light tracking-tight text-gray-900">
              Let&apos;s build
            </p>
            <div ref={projectMenuRef} className="relative mt-2 inline-block text-left">
              <button
                type="button"
                onClick={() => setIsProjectMenuOpen((open) => !open)}
                className="inline-flex items-center gap-2 text-4xl font-semibold text-gray-500 outline-none transition hover:text-gray-700"
                aria-haspopup="listbox"
                aria-expanded={isProjectMenuOpen}
              >
                <span>{selectedProject?.label || 'Choose project'}</span>
                <IconTablerChevronDown className="mt-1 h-6 w-6" />
              </button>

              {isProjectMenuOpen ? (
                <div className="absolute left-1/2 top-[calc(100%+12px)] z-20 w-80 -translate-x-1/2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                  <div className="max-h-80 overflow-auto py-2" role="listbox" aria-label="Project folders">
                    {projectOptions.map((option) => (
                      <button
                        key={option.cwd}
                        type="button"
                        onClick={() => {
                          setSelectedCwd(option.cwd);
                          setIsProjectMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition ${
                          option.cwd === selectedCwd
                            ? 'bg-gray-50 text-gray-900'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <span className="truncate">{option.label}</span>
                        {option.cwd === selectedCwd ? (
                          <span className="ml-3 text-xs font-medium text-gray-400">Selected</span>
                        ) : null}
                      </button>
                    ))}
                    <div className="mx-2 my-2 h-px bg-gray-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setCreateFolderError('');
                        setCreateFolderDraft('');
                        setIsCreateFolderDialogOpen(true);
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                    >
                      <span>Create new folder</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mx-auto mt-20 max-w-2xl">
            <ThreadComposer
              onSend={handleSend}
              onInterrupt={() => {}}
              isInProgress={false}
              disabled={!selectedCwd || isSendingMessage}
              cwd={selectedCwd}
            />
          </div>
        </div>
      </div>
      <TextInputDialog
        isOpen={isCreateFolderDialogOpen}
        title="Create new folder"
        label="Folder name or absolute path"
        value={createFolderDraft}
        onChange={(value) => {
          setCreateFolderDraft(value);
          if (createFolderError) {
            setCreateFolderError('');
          }
        }}
        onSubmit={() => {
          void handleCreateFolder();
        }}
        onClose={() => {
          if (isCreatingFolder) return;
          setIsCreateFolderDialogOpen(false);
          setCreateFolderDraft('');
          setCreateFolderError('');
        }}
        confirmLabel="Create"
        placeholder="my-project or /absolute/path"
        helperText={
          createFolderDraft.trim()
            ? `Will be created at: ${
                isAbsolutePath(createFolderDraft.trim())
                  ? createFolderDraft.trim()
                  : joinPath(homeDirectory || '/', createFolderDraft.trim())
              }`
            : undefined
        }
        error={createFolderError}
        isSubmitting={isCreatingFolder}
      />
    </div>
  );
}

export default HomeScreen;
