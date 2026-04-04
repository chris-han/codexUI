import { useState, useEffect } from 'react';
import { useCodexStore } from '../../stores';
import { IconTablerX, IconTablerFolder } from '../icons';

interface NewThreadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (threadId: string) => void;
}

// Base path where all user threads are stored
const BASE_PATH = '/home/chris/repo/codexUI/user_threads';

function NewThreadDialog({ isOpen, onClose, onCreated }: NewThreadDialogProps) {
  const [childPath, setChildPath] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { startNewThread } = useCodexStore();

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen) {
      setChildPath('');
      setError('');
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

    // Construct full path
    const fullPath = `${BASE_PATH}/${cleanChildPath}`;

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
              Thread Folder Name
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
              Will be created at: <code className="bg-gray-100 px-1 rounded">{BASE_PATH}/</code>
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
