import { useState } from 'react';
import { ThumbsUp, ThumbsDown, X, Send } from 'lucide-react';

type FeedbackRating = 'positive' | 'negative' | null;

type MessageFeedbackProps = {
  messageId: string;
};

export function MessageFeedback({ messageId }: MessageFeedbackProps) {
  const [rating, setRating] = useState<FeedbackRating>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleRate(value: FeedbackRating) {
    if (submitted) return;
    if (rating === value) {
      setRating(null);
      setShowComment(false);
      return;
    }
    setRating(value);
    setShowComment(value === 'negative');
  }

  function handleSubmit() {
    if (!rating) return;
    // Persist feedback locally so it survives within the session
    try {
      const key = `msg-feedback-${messageId}`;
      localStorage.setItem(key, JSON.stringify({ rating, comment, ts: Date.now() }));
    } catch {
      // storage unavailable — continue silently
    }
    setSubmitted(true);
    setShowComment(false);
  }

  function handleDismiss() {
    setShowComment(false);
    setRating(null);
  }

  if (submitted) {
    return (
      <span className="text-xs text-gray-400 italic">Thanks for your feedback</span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleRate('positive')}
          title="Good response"
          aria-pressed={rating === 'positive'}
          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
            rating === 'positive'
              ? 'border-green-400 bg-green-50 text-green-600'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          onClick={() => handleRate('negative')}
          title="Bad response"
          aria-pressed={rating === 'negative'}
          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
            rating === 'negative'
              ? 'border-red-400 bg-red-50 text-red-600'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          <ThumbsDown className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
        {rating === 'positive' && (
          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex items-center gap-1 rounded-lg border border-green-400 bg-green-50 px-2.5 py-1.5 text-xs text-green-700 hover:bg-green-100"
          >
            <Send className="h-3 w-3" strokeWidth={1.8} />
            Submit
          </button>
        )}
      </div>

      {showComment && rating === 'negative' && (
        <div className="flex flex-col gap-2 rounded-xl border border-red-100 bg-red-50/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-red-700">What went wrong?</span>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Dismiss feedback"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us what was wrong with this response (optional)"
            rows={3}
            className="w-full resize-none rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-gray-700 placeholder-gray-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs text-white hover:bg-red-600"
            >
              <Send className="h-3 w-3" strokeWidth={1.8} />
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
