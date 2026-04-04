import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCodexStore } from '../../stores';
import type { ThreadComposerSubmitPayload } from '../../types/codex';
import ThreadComposer from './ThreadComposer';
import { IconTablerChevronDown } from '../icons';

function HomeScreen() {
  const navigate = useNavigate();
  const { projectGroups, startNewThread, isSendingMessage } = useCodexStore();
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);

  const projectOptions = useMemo(
    () =>
      projectGroups
        .map((group) => {
          const thread = group.threads[0];
          return thread
            ? {
                label: group.projectName,
                cwd: thread.cwd,
              }
            : null;
        })
        .filter((option): option is { label: string; cwd: string } => Boolean(option)),
    [projectGroups]
  );

  const [selectedCwd, setSelectedCwd] = useState('');

  useEffect(() => {
    if (!selectedCwd && projectOptions.length > 0) {
      setSelectedCwd(projectOptions[0].cwd);
    }
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

  const handleSend = async (payload: ThreadComposerSubmitPayload) => {
    if (!selectedCwd) return;
    const threadId = await startNewThread(selectedCwd, payload);
    if (threadId) {
      navigate(`/thread/${threadId}`);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="px-6 py-5 text-lg font-semibold text-gray-900">
        New thread
      </div>

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
                disabled={projectOptions.length === 0}
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
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mx-auto mt-20 max-w-2xl rounded-3xl border border-gray-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
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
    </div>
  );
}

export default HomeScreen;
