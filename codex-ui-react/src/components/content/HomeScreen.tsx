import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCodexStore } from '../../stores';
import ThreadComposer from './ThreadComposer';

function HomeScreen() {
  const navigate = useNavigate();
  const { projectGroups, startNewThread, isSendingMessage } = useCodexStore();

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

  const selectedProject = projectOptions.find((option) => option.cwd === selectedCwd) || null;

  const handleSend = async (message: string) => {
    if (!selectedCwd) return;
    const threadId = await startNewThread(selectedCwd, message);
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
            <div className="mt-2 inline-flex items-center gap-2 text-4xl font-semibold text-gray-500">
              <span>{selectedProject?.label || 'Choose project'}</span>
              <span className="text-xl">⌄</span>
            </div>
          </div>

          <div className="mx-auto mb-6 max-w-md">
            <select
              value={selectedCwd}
              onChange={(event) => setSelectedCwd(event.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {projectOptions.length === 0 ? (
                <option value="">No projects available</option>
              ) : (
                projectOptions.map((option) => (
                  <option key={option.cwd} value={option.cwd}>
                    {option.label}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="mx-auto mt-20 max-w-2xl rounded-3xl border border-gray-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            <ThreadComposer
              onSend={handleSend}
              onInterrupt={() => {}}
              isInProgress={false}
              disabled={!selectedCwd || isSendingMessage}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomeScreen;
