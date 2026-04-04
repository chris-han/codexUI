import { useState } from 'react';
import { useCodexStore } from '../../stores';
import { IconTablerArrowUp, IconTablerPlayerStopFilled, IconTablerBolt, IconTablerChevronDown } from '../icons';

interface ThreadComposerProps {
  onSend: (message: string) => void;
  onInterrupt: () => void;
  isInProgress: boolean;
  disabled?: boolean;
}

function ThreadComposer({ onSend, onInterrupt, isInProgress, disabled }: ThreadComposerProps) {
  const [message, setMessage] = useState('');
  const [showOptions, setShowOptions] = useState(false);

  const {
    availableModelIds,
    selectedModelId,
    selectedReasoningEffort,
    setSelectedModelId,
    setSelectedReasoningEffort,
  } = useCodexStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isInProgress && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const reasoningOptions = [
    { value: 'none', label: 'None' },
    { value: 'minimal', label: 'Minimal' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'Max' },
  ];

  return (
    <div className="space-y-2">
      {/* Options bar */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="flex items-center gap-1 px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-md"
        >
          <IconTablerBolt className="w-4 h-4" />
          <span>Options</span>
          <IconTablerChevronDown className={`w-3 h-3 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
        </button>

        {showOptions && (
          <>
            {/* Model selector */}
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {availableModelIds.length === 0 ? (
                <option value={selectedModelId}>{selectedModelId}</option>
              ) : (
                availableModelIds.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))
              )}
            </select>

            {/* Reasoning effort selector */}
            <select
              value={selectedReasoningEffort}
              onChange={(e) => setSelectedReasoningEffort(e.target.value as 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh')}
              className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {reasoningOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Reasoning: {opt.label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="relative">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder={disabled ? 'Loading...' : isInProgress ? 'Processing...' : 'Type a message...'}
          disabled={disabled || isInProgress}
          className="w-full px-4 py-3 pr-12 bg-gray-100 border-0 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          rows={3}
        />

        <div className="absolute right-2 bottom-2">
          {isInProgress ? (
            <button
              type="button"
              onClick={onInterrupt}
              className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              title="Stop"
            >
              <IconTablerPlayerStopFilled className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!message.trim() || disabled}
              className="p-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Send"
            >
              <IconTablerArrowUp className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      <div className="text-xs text-gray-400 text-center">
        Press Enter to send, Shift+Enter for new line
      </div>
    </div>
  );
}

export default ThreadComposer;
