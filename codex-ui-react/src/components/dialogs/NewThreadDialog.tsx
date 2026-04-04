import { useState, useEffect } from 'react';
import { useCodexStore } from '../../stores';
import { IconTablerX, IconTablerFolder, IconTablerFolderOpen, IconTablerChevronLeft } from '../icons';

interface NewThreadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (threadId: string) => void;
}

type DirectoryBrowseEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
};

type DirectoryBrowseResponse = {
  path: string;
  parentPath: string | null;
  entries: DirectoryBrowseEntry[];
};

const DEFAULT_PARENT_PATH = '/home/chris/repo/codexUI/user_threads';

function NewThreadDialog({ isOpen, onClose, onCreated }: NewThreadDialogProps) {
  const [childPath, setChildPath] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingDirectories, setIsLoadingDirectories] = useState(false);
  const [error, setError] = useState('');
  const [currentPath, setCurrentPath] = useState(DEFAULT_PARENT_PATH);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryBrowseEntry[]>([]);

  const { startNewThread } = useCodexStore();

  const loadDirectory = async (path: string) => {
    setIsLoadingDirectories(true);
    setError('');
    try {
      const response = await fetch(`/codex-api/browse-directory?path=${encodeURIComponent(path)}`);
      const payload = await response.json() as { data?: DirectoryBrowseResponse; error?: string };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error || 'Failed to browse directory');
      }
      setCurrentPath(payload.data.path);
      setParentPath(payload.data.parentPath);
      setDirectories(payload.data.entries.filter((entry) => entry.isDirectory));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to browse directory');
    } finally {
      setIsLoadingDirectories(false);
    }
  };

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen) {
      setChildPath('');
      setMessage('');
      setError('');
      setCurrentPath(DEFAULT_PARENT_PATH);
      setParentPath(null);
      setDirectories([]);

      void loadDirectory(DEFAULT_PARENT_PATH);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childPath.trim() || isSubmitting) return;

    // Clean up the child path
    let cleanChildPath = childPath.trim();

    // Remove leading slashes
    cleanChildPath = cleanChildPath.replace(/^\/+/, '');

    // Remove file extensions if accidentally included
    cleanChildPath = cleanChildPath
      .replace(/\.txt$/, '')
      .replace(/\.json$/, '')
      .replace(/\.js$/, '')
      .replace(/\.ts$/, '')
      .replace(/\.md$/, '');

    if (!cleanChildPath) {
      setError('Please enter a valid folder name');
      return;
    }

    const fullPath = `${currentPath}/${cleanChildPath}`;

    setIsSubmitting(true);
    setError('');
    console.log('Creating thread at:', fullPath);
    try {
      const threadId = await startNewThread(fullPath, message.trim() || undefined);
      if (!threadId) {
        throw new Error('Failed to create thread');
      }
      console.log('Thread created:', threadId);
      onCreated?.(threadId);
      onClose();
      setChildPath('');
      setMessage('');
    } catch (err) {
      console.error('Failed to create thread:', err);
      setError(err instanceof Error ? err.message : 'Failed to create thread');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">New Thread</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <IconTablerX className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parent Folder
            </label>
            <div className="border border-gray-200 rounded-xl bg-gray-50 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => parentPath && void loadDirectory(parentPath)}
                  disabled={!parentPath || isLoadingDirectories}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <IconTablerChevronLeft className="w-4 h-4" />
                  Up
                </button>
                <div className="min-w-0 flex-1 rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-700 truncate">
                  {currentPath}
                </div>
              </div>

              <div className="max-h-48 overflow-auto rounded-lg border border-gray-200 bg-white">
                {isLoadingDirectories ? (
                  <div className="px-3 py-4 text-sm text-gray-500">Loading folders...</div>
                ) : directories.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-gray-500">No child folders</div>
                ) : (
                  directories.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => void loadDirectory(entry.path)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 border-b last:border-b-0 border-gray-100"
                    >
                      <IconTablerFolderOpen className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="truncate">{entry.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Folder Name
            </label>
            <div className="relative">
              <IconTablerFolder className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={childPath}
                onChange={(e) => setChildPath(e.target.value)}
                placeholder="my-project-thread"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Will be created at: <code className="bg-gray-100 px-1 rounded">{currentPath}/</code>
              <span className="font-medium">{childPath || 'your-folder-name'}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initial Message (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What would you like to work on?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!childPath.trim() || isSubmitting}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating...' : 'Create Thread'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NewThreadDialog;
