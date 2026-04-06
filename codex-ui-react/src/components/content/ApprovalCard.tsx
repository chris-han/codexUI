import { useState } from 'react';
import { CheckCircle2, XCircle, MessageSquareDiff, ChevronDown, ChevronRight, Send, ShieldAlert } from 'lucide-react';
import type { UiServerRequest, ThreadComposerSubmitPayload } from '../../types/codex';

type ApprovalCardProps = {
  request: UiServerRequest;
  onRespond: (id: number, decision: string) => void;
  onSendMessage: (payload: ThreadComposerSubmitPayload) => void;
};

type ActiveSection = 'approve' | 'reject' | 'instructions' | null;

export function ApprovalCard({ request, onRespond, onSendMessage }: ApprovalCardProps) {
  const [activeSection, setActiveSection] = useState<ActiveSection>(null);
  const [instructions, setInstructions] = useState('');

  const params = request.params as Record<string, unknown> | null | undefined;
  const command = typeof params?.command === 'string' ? params.command : null;
  const cwd = typeof params?.cwd === 'string' ? params.cwd : null;
  const reason = typeof params?.reason === 'string' ? params.reason : null;
  const isFileChange = request.method === 'item/fileChange/requestApproval';
  const grantRoot = isFileChange && typeof params?.grantRoot === 'string' ? params.grantRoot : null;
  const title = isFileChange ? 'File write approval required' : 'Command execution approval required';

  function toggleSection(section: ActiveSection) {
    setActiveSection((prev) => (prev === section ? null : section));
  }

  function handleApprove(decision: 'accept' | 'acceptForSession') {
    onRespond(request.id, decision);
  }

  function handleReject(decision: 'decline' | 'cancel') {
    onRespond(request.id, decision);
  }

  function handleSendInstructions() {
    if (!instructions.trim()) return;
    onRespond(request.id, 'decline');
    onSendMessage({ text: instructions.trim(), imageUrls: [], fileAttachments: [], skills: [] });
  }

  return (
    <div className="flex justify-center my-4">
      <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white shadow-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-3">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" strokeWidth={2} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-800 leading-tight">{title}</p>
            {reason && <p className="text-xs text-amber-700 mt-0.5 line-clamp-2">{reason}</p>}
          </div>
        </div>

        {/* Context block */}
        {(command || grantRoot || cwd) && (
          <div className="px-4 pt-3 pb-2 space-y-2">
            {command && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Command</p>
                <pre className="text-xs font-mono bg-gray-950 text-green-300 rounded-xl px-3 py-2.5 whitespace-pre-wrap break-all leading-relaxed">{command}</pre>
              </div>
            )}
            {grantRoot && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Write path</p>
                <code className="block text-xs bg-gray-100 text-gray-700 rounded-lg px-3 py-1.5 break-all">{grantRoot}</code>
              </div>
            )}
            {cwd && (
              <p className="text-xs text-gray-400"><span className="font-medium text-gray-500">cwd:</span> {cwd}</p>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="mx-4 border-t border-gray-100 mt-1" />

        {/* === Option 1: Approve === */}
        <div className="border-b border-gray-100">
          <button
            type="button"
            onClick={() => toggleSection('approve')}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-green-50/60 transition-colors"
          >
            <CheckCircle2 className="h-4.5 w-4.5 text-green-500 shrink-0" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">Approve</p>
              <p className="text-xs text-gray-500">Allow the agent to proceed</p>
            </div>
            {activeSection === 'approve'
              ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
              : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
          </button>
          {activeSection === 'approve' && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleApprove('accept')}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                Approve once
              </button>
              <button
                type="button"
                onClick={() => handleApprove('acceptForSession')}
                className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm text-green-800 hover:bg-green-100"
              >
                Approve for session
              </button>
            </div>
          )}
        </div>

        {/* === Option 2: Reject === */}
        <div className="border-b border-gray-100">
          <button
            type="button"
            onClick={() => toggleSection('reject')}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-red-50/60 transition-colors"
          >
            <XCircle className="h-4.5 w-4.5 text-red-500 shrink-0" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">Reject</p>
              <p className="text-xs text-gray-500">Deny this action or cancel the entire turn</p>
            </div>
            {activeSection === 'reject'
              ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
              : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
          </button>
          {activeSection === 'reject' && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleReject('decline')}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
              >
                <XCircle className="h-3.5 w-3.5" strokeWidth={2} />
                Deny this action
              </button>
              <button
                type="button"
                onClick={() => handleReject('cancel')}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
              >
                Cancel entire turn
              </button>
            </div>
          )}
        </div>

        {/* === Option 3: User Instructions === */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('instructions')}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-blue-50/60 transition-colors"
          >
            <MessageSquareDiff className="h-4.5 w-4.5 text-blue-500 shrink-0" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">Give instructions</p>
              <p className="text-xs text-gray-500">Reject and redirect the agent with a message</p>
            </div>
            {activeSection === 'instructions'
              ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
              : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
          </button>
          {activeSection === 'instructions' && (
            <div className="px-4 pb-4 space-y-2">
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Tell the agent what to do differently..."
                rows={3}
                className="w-full resize-none rounded-xl border border-blue-200 bg-blue-50/40 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <button
                type="button"
                onClick={handleSendInstructions}
                disabled={!instructions.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" strokeWidth={2} />
                Reject &amp; send instructions
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
