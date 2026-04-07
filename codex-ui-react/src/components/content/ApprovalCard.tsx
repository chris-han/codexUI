import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  MessageSquareDiff,
  ChevronDown,
  ChevronRight,
  Send,
  ShieldAlert,
  ListChecks,
} from 'lucide-react';
import type { UiServerRequest, ThreadComposerSubmitPayload } from '../../types/codex';

type ApprovalCardProps = {
  request: UiServerRequest;
  onRespond: (id: number | string, result: unknown) => void;
  onSendMessage: (payload: ThreadComposerSubmitPayload) => void;
};

type ActiveSection = 'approve' | 'reject' | 'instructions' | null;

type RequestUserInputOption = {
  label: string;
  description: string;
};

type RequestUserInputQuestion = {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: RequestUserInputOption[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseRequestUserInputQuestions(request: UiServerRequest): RequestUserInputQuestion[] {
  const params = asRecord(request.params);
  const questions = Array.isArray(params?.questions) ? params.questions : [];
  const parsed: RequestUserInputQuestion[] = [];

  for (const row of questions) {
    const question = asRecord(row);
    if (!question) continue;

    const id = typeof question.id === 'string' ? question.id : '';
    if (!id) continue;

    const options = Array.isArray(question.options)
      ? question.options
          .map((option) => asRecord(option))
          .map((option) => ({
            label: typeof option?.label === 'string' ? option.label : '',
            description: typeof option?.description === 'string' ? option.description : '',
          }))
          .filter((option) => option.label.length > 0)
      : [];

    parsed.push({
      id,
      header: typeof question.header === 'string' ? question.header : '',
      question: typeof question.question === 'string' ? question.question : '',
      isOther: question.isOther === true || question.is_other === true,
      isSecret: question.isSecret === true || question.is_secret === true,
      options,
    });
  }

  return parsed;
}

export function ApprovalCard({ request, onRespond, onSendMessage }: ApprovalCardProps) {
  const [activeSection, setActiveSection] = useState<ActiveSection>(null);
  const [instructions, setInstructions] = useState('');
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [otherAnswers, setOtherAnswers] = useState<Record<string, string>>({});

  const params = asRecord(request.params);
  const command = typeof params?.command === 'string' ? params.command : null;
  const cwd = typeof params?.cwd === 'string' ? params.cwd : null;
  const reason = typeof params?.reason === 'string' ? params.reason : null;
  const isFileChange = request.method === 'item/fileChange/requestApproval';
  const isRequestUserInput = request.method === 'item/tool/requestUserInput';
  const grantRoot = isFileChange
    ? (typeof params?.grantRoot === 'string'
        ? params.grantRoot
        : typeof params?.grant_root === 'string'
          ? params.grant_root
          : null)
    : null;
  const toolQuestions = parseRequestUserInputQuestions(request);
  const title = isRequestUserInput
    ? 'User input required'
    : isFileChange
      ? 'File write approval required'
      : 'Command execution approval required';

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

  function readQuestionAnswer(question: RequestUserInputQuestion): string {
    const saved = questionAnswers[question.id];
    if (typeof saved === 'string' && saved.length > 0) return saved;
    return question.options[0]?.label ?? '';
  }

  function readOtherAnswer(question: RequestUserInputQuestion): string {
    return otherAnswers[question.id] ?? '';
  }

  function handleSubmitUserInput() {
    const answers: Record<string, { answers: string[] }> = {};

    for (const question of toolQuestions) {
      const selected = readQuestionAnswer(question).trim();
      const other = readOtherAnswer(question).trim();
      const values = [selected, other].filter((value) => value.length > 0);

      if (values.length === 0 && question.options[0]?.label) {
        values.push(question.options[0].label);
      }

      answers[question.id] = { answers: values };
    }

    onRespond(request.id, { answers });
  }

  const isUserInputReady = !isRequestUserInput || toolQuestions.every((question) => {
    const selected = readQuestionAnswer(question).trim();
    const other = readOtherAnswer(question).trim();
    return selected.length > 0 || other.length > 0;
  });

  if (isRequestUserInput) {
    return (
      <div className="flex justify-center my-4">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-md">
          <div className="flex items-center gap-2.5 border-b border-sky-200 bg-sky-50 px-4 py-3">
            <ListChecks className="h-4 w-4 shrink-0 text-sky-600" strokeWidth={2} />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-sky-800">{title}</p>
              <p className="mt-0.5 text-xs text-sky-700">
                {reason || 'The agent is waiting for your answer before it can continue.'}
              </p>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4">
            {toolQuestions.map((question) => {
              const selectedValue = readQuestionAnswer(question);
              const otherValue = readOtherAnswer(question);

              return (
                <div key={`${request.id}:${question.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {question.header || question.question || 'Question'}
                  </p>
                  {question.header && question.question ? (
                    <p className="mt-1 text-sm text-slate-600">{question.question}</p>
                  ) : null}

                  {question.options.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {question.options.map((option) => {
                        const checked = selectedValue === option.label;
                        return (
                          <label
                            key={`${request.id}:${question.id}:${option.label}`}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors ${
                              checked
                                ? 'border-sky-300 bg-sky-50'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`request-${request.id}-${question.id}`}
                              className="mt-0.5 h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
                              checked={checked}
                              onChange={() => {
                                setQuestionAnswers((current) => ({
                                  ...current,
                                  [question.id]: option.label,
                                }));
                              }}
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-slate-800">{option.label}</span>
                              {option.description ? (
                                <span className="mt-0.5 block text-xs text-slate-500">{option.description}</span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      type={question.isSecret ? 'password' : 'text'}
                      value={selectedValue}
                      onChange={(event) => {
                        const { value } = event.target;
                        setQuestionAnswers((current) => ({
                          ...current,
                          [question.id]: value,
                        }));
                      }}
                      placeholder={question.isSecret ? 'Enter secret answer' : 'Enter your answer'}
                      className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  )}

                  {question.isOther ? (
                    <input
                      type={question.isSecret ? 'password' : 'text'}
                      value={otherValue}
                      onChange={(event) => {
                        const { value } = event.target;
                        setOtherAnswers((current) => ({
                          ...current,
                          [question.id]: value,
                        }));
                      }}
                      placeholder={question.isSecret ? 'Other secret answer' : 'Other answer'}
                      className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  ) : null}
                </div>
              );
            })}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                This is a structured `request_user_input` / `AskUserQuestion` prompt.
              </p>
              <button
                type="button"
                onClick={handleSubmitUserInput}
                disabled={!isUserInputReady}
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Submit answers
              </button>
            </div>
          </div>
        </div>
      </div>
    );
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
