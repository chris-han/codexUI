import { useEffect, useMemo, useRef, useState } from 'react';
import { useCodexStore } from '../../stores';
import { searchComposerFiles, type ComposerFileSuggestion } from '../../api/codexGateway';
import type {
  ComposerFileAttachment,
  CollaborationModeKind,
  ReasoningEffort,
  SkillInfo,
  ThreadComposerSubmitPayload,
} from '../../types/codex';
import {
  IconTablerArrowUp,
  IconTablerChevronDown,
  IconTablerMicrophone,
  IconTablerPlayerStopFilled,
  IconTablerX,
} from '../icons';

interface ThreadComposerProps {
  onSend: (payload: ThreadComposerSubmitPayload) => void;
  onInterrupt: () => void;
  isInProgress: boolean;
  disabled?: boolean;
  cwd?: string;
}

function buildSkillSelection(skill: SkillInfo) {
  return {
    name: skill.name,
    path: skill.path ?? skill.id,
  };
}

function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function removeTrailingMentionToken(value: string): string {
  return value.replace(/(^|\s)@[^\s]*$/, '$1').trimEnd();
}

function dedupeByValue<T extends { value?: string | null }>(items: T[]): Array<T & { value: string }> {
  const seen = new Set<string>();
  const result: Array<T & { value: string }> = [];
  for (const item of items) {
    const rawValue = typeof item.value === 'string' ? item.value : '';
    const value = rawValue.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push({
      ...item,
      value,
    });
  }
  return result;
}

function ThreadComposer({ onSend, onInterrupt, isInProgress, disabled, cwd }: ThreadComposerProps) {
  const [message, setMessage] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<Array<{ name: string; path: string }>>([]);
  const [fileAttachments, setFileAttachments] = useState<ComposerFileAttachment[]>([]);
  const [highlightedSkillIndex, setHighlightedSkillIndex] = useState(0);
  const [fileMentionSuggestions, setFileMentionSuggestions] = useState<ComposerFileSuggestion[]>([]);
  const [highlightedFileIndex, setHighlightedFileIndex] = useState(0);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const {
    availableModelIds,
    selectedModelId,
    selectedReasoningEffort,
    selectedCollaborationMode,
    installedSkills,
    setSelectedModelId,
    setSelectedReasoningEffort,
    setSelectedCollaborationMode,
  } = useCodexStore();

  const reasoningOptions = [
    { value: 'none', label: 'None' },
    { value: 'minimal', label: 'Minimal' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'Max' },
  ];

  const modelOptions = useMemo(
    () =>
      dedupeByValue(
        (availableModelIds.length === 0 ? [selectedModelId] : availableModelIds).map((model) => ({
          value: typeof model === 'string' ? model : '',
          label: typeof model === 'string' ? model : '',
        }))
      ),
    [availableModelIds, selectedModelId]
  );

  const skillOptions = useMemo(
    () =>
      dedupeByValue(
        installedSkills
          .filter((skill) => skill.path || skill.id)
          .map((skill) => ({
            value: typeof (skill.path ?? skill.id) === 'string' ? (skill.path ?? skill.id) : '',
            label: skill.name || 'Skill',
          }))
      ),
    [installedSkills]
  );
  const selectedReasoningLabel = useMemo(() => {
    const selected = reasoningOptions.find((option) => option.value === selectedReasoningEffort);
    return selected?.label ?? 'Medium';
  }, [selectedReasoningEffort]);

  const slashQuery = useMemo(() => {
    const trimmed = message.trimStart();
    if (!trimmed.startsWith('/')) return null;
    return trimmed.slice(1).trim().toLowerCase();
  }, [message]);

  const slashSkillOptions = useMemo(() => {
    if (slashQuery === null) return [];
    const alreadySelected = new Set(selectedSkills.map((skill) => skill.path));
    return installedSkills
      .filter((skill) => skill.path)
      .filter((skill) => !alreadySelected.has(skill.path ?? ''))
      .filter((skill) => {
        if (!slashQuery) return true;
        const haystacks = [skill.name, skill.description ?? '', skill.path ?? ''];
        return haystacks.some((value) => value.toLowerCase().includes(slashQuery));
      })
      .slice(0, 8);
  }, [installedSkills, selectedSkills, slashQuery]);

  useEffect(() => {
    setHighlightedSkillIndex(0);
  }, [slashQuery]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const root = menuRef.current;
      if (!root) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (root.contains(target)) return;
      setIsPlusMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const fileMentionQuery = useMemo(() => {
    const match = message.match(/(?:^|\s)@([^\s]*)$/);
    return match ? match[1].toLowerCase() : null;
  }, [message]);

  useEffect(() => {
    setHighlightedFileIndex(0);
  }, [fileMentionQuery]);

  useEffect(() => {
    if (fileMentionQuery === null || !cwd?.trim()) {
      setFileMentionSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const suggestions = await searchComposerFiles(cwd, fileMentionQuery, 20);
        if (!cancelled) {
          setFileMentionSuggestions(suggestions);
        }
      } catch {
        if (!cancelled) {
          setFileMentionSuggestions([]);
        }
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cwd, fileMentionQuery]);

  const canSubmit =
    message.trim().length > 0 || selectedSkills.length > 0 || fileAttachments.length > 0;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit || isInProgress || disabled) return;
    onSend({
      text: message.trim(),
      imageUrls: [],
      fileAttachments,
      skills: selectedSkills,
    });
    setMessage('');
    setSelectedSkills([]);
    setFileAttachments([]);
    setFileMentionSuggestions([]);
  };

  const handleAddSkill = (skill: SkillInfo) => {
    const next = buildSkillSelection(skill);
    setSelectedSkills((current) => {
      if (current.some((item) => item.path === next.path)) return current;
      return [...current, next];
    });
    setMessage((current) => (current.trimStart().startsWith('/') ? '' : current));
    textareaRef.current?.focus();
  };

  const handleRemoveSkill = (path: string) => {
    setSelectedSkills((current) => current.filter((skill) => skill.path !== path));
  };

  const handleAddFileAttachment = (suggestion: ComposerFileSuggestion) => {
    const normalizedPath = suggestion.path.trim();
    if (!normalizedPath) return;
    setFileAttachments((current) => {
      if (current.some((attachment) => attachment.fsPath === normalizedPath)) {
        return current;
      }
      return [
        ...current,
        {
          label: getBaseName(normalizedPath),
          path: normalizedPath,
          fsPath: normalizedPath,
        },
      ];
    });
    setMessage((current) => removeTrailingMentionToken(current));
    setFileMentionSuggestions([]);
    textareaRef.current?.focus();
  };

  const handleRemoveFileAttachment = (fsPath: string) => {
    setFileAttachments((current) => current.filter((attachment) => attachment.fsPath !== fsPath));
  };

  const handleFilePickerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setFileAttachments((current) => {
      const existing = new Set(current.map((attachment) => attachment.fsPath));
      const additions: ComposerFileAttachment[] = [];
      for (const file of files) {
        const inferredPath = file.webkitRelativePath || file.name;
        if (!inferredPath || existing.has(inferredPath)) continue;
        existing.add(inferredPath);
        additions.push({
          label: getBaseName(inferredPath),
          path: inferredPath,
          fsPath: inferredPath,
        });
      }
      return [...current, ...additions];
    });
    event.target.value = '';
    setIsPlusMenuOpen(false);
  };

  const handleSkillDropdownChange = (value: string) => {
    if (!value) return;
    const skill = installedSkills.find((candidate) => (candidate.path ?? candidate.id) === value);
    if (skill) {
      handleAddSkill(skill);
    }
  };

  const handleCollaborationModeChange = (value: string) => {
    setSelectedCollaborationMode(value as CollaborationModeKind);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative rounded-[2rem] border border-white/8 bg-[#343434] p-5 text-white shadow-[0_24px_60px_rgba(0,0,0,0.24)]"
    >
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFilePickerChange}
      />

      {selectedSkills.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {selectedSkills.map((skill) => (
            <span
              key={skill.path}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-white"
            >
              <span>{skill.name}</span>
              <button
                type="button"
                onClick={() => handleRemoveSkill(skill.path)}
                className="text-white/55 transition-colors hover:text-white"
                aria-label={`Remove skill ${skill.name}`}
              >
                <IconTablerX className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {fileAttachments.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {fileAttachments.map((attachment) => (
            <span
              key={attachment.fsPath}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-white"
            >
              <span title={attachment.fsPath}>{attachment.label}</span>
              <button
                type="button"
                onClick={() => handleRemoveFileAttachment(attachment.fsPath)}
                className="text-white/55 transition-colors hover:text-white"
                aria-label={`Remove file ${attachment.label}`}
              >
                <IconTablerX className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {selectedCollaborationMode === 'plan' ? (
        <div className="mb-3">
          <span className="inline-flex items-center rounded-full bg-white/14 px-2.5 py-1 text-xs font-medium text-white">
            Plan
          </span>
        </div>
      ) : null}

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (fileMentionSuggestions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              setHighlightedFileIndex((current) => {
                if (e.key === 'ArrowDown') {
                  return (current + 1) % fileMentionSuggestions.length;
                }
                return (current - 1 + fileMentionSuggestions.length) % fileMentionSuggestions.length;
              });
              return;
            }

            if (fileMentionSuggestions.length > 0 && e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const suggestion = fileMentionSuggestions[highlightedFileIndex];
              if (suggestion) {
                handleAddFileAttachment(suggestion);
                return;
              }
            }

            if (slashSkillOptions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              setHighlightedSkillIndex((current) => {
                if (e.key === 'ArrowDown') {
                  return (current + 1) % slashSkillOptions.length;
                }
                return (current - 1 + slashSkillOptions.length) % slashSkillOptions.length;
              });
              return;
            }

            if (slashSkillOptions.length > 0 && e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const skill = slashSkillOptions[highlightedSkillIndex];
              if (skill) {
                handleAddSkill(skill);
                return;
              }
            }

            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={disabled ? 'Loading...' : 'Ask a question with /plan'}
          disabled={disabled || isInProgress}
          className="min-h-[112px] w-full resize-none border-0 bg-transparent px-2 py-2 pr-12 text-[17px] text-white outline-none placeholder:text-white/55 disabled:opacity-50"
          rows={4}
        />

        {slashSkillOptions.length > 0 ? (
          <div className="absolute left-0 top-full z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/8 bg-[#343434] shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
            {slashSkillOptions.map((skill, index) => (
              <button
                key={skill.path ?? skill.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleAddSkill(skill);
                }}
                className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left ${
                  index === highlightedSkillIndex ? 'bg-white/10' : 'bg-[#343434]'
                }`}
              >
                <span className="text-sm font-medium text-white">{skill.name}</span>
                <span className="text-xs text-white/55">
                  {skill.description || skill.path || 'Skill'}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {fileMentionSuggestions.length > 0 ? (
          <div className="absolute left-0 top-full z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/8 bg-[#343434] shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
            {fileMentionSuggestions.map((suggestion, index) => (
              <button
                key={suggestion.path}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleAddFileAttachment(suggestion);
                }}
                className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left ${
                  index === highlightedFileIndex ? 'bg-white/10' : 'bg-[#343434]'
                }`}
              >
                <span className="text-sm font-medium text-white">{getBaseName(suggestion.path)}</span>
                <span className="text-xs text-white/55">{suggestion.path}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/8 pt-4">
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setIsPlusMenuOpen((open) => !open)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled || isInProgress}
            aria-label="More actions"
          >
            <span className="relative block h-4 w-4">
              <span className="absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
              <span className="absolute left-1/2 top-1/2 h-4 w-[1.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
            </span>
          </button>

          {isPlusMenuOpen ? (
            <div className="absolute bottom-[calc(100%+12px)] left-0 z-30 min-w-[220px] overflow-hidden rounded-3xl border border-white/8 bg-[#343434] p-3 text-white shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
              <button
                type="button"
                onClick={() => {
                  handleCollaborationModeChange(selectedCollaborationMode === 'plan' ? 'default' : 'plan');
                  setIsPlusMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition hover:bg-white/10"
              >
                <span className="text-lg leading-none">{selectedCollaborationMode === 'plan' ? '✓' : '↗'}</span>
                <span>Plan</span>
              </button>
              <div className="my-2 h-px bg-white/15" />
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition hover:bg-white/10"
              >
                <span className="text-lg leading-none">+</span>
                <span>Upload attachment</span>
              </button>
            </div>
          ) : null}
        </div>

        <div className="relative min-w-[210px] flex-1 sm:flex-none">
          <span className="pointer-events-none inline-flex items-center gap-1 truncate text-sm font-medium text-white">
            <span className="truncate">{selectedModelId}</span>
            <IconTablerChevronDown className="h-3.5 w-3.5 shrink-0 text-white/85" />
          </span>
          <select
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            className="absolute inset-0 w-full cursor-pointer appearance-none border-0 bg-transparent px-0 py-0 opacity-0 outline-none"
            disabled={disabled || isInProgress}
            aria-label="Model"
          >
            {modelOptions.map((option) => (
              <option key={`model-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="relative min-w-[124px] flex-1">
          <span className="pointer-events-none inline-flex items-center gap-1 truncate text-sm font-medium text-white">
            <span className="truncate">Skills</span>
            <IconTablerChevronDown className="h-3.5 w-3.5 shrink-0 text-white/85" />
          </span>
          <select
            value=""
            onChange={(e) => {
              handleSkillDropdownChange(e.target.value);
              e.currentTarget.value = '';
            }}
            className="absolute inset-0 w-full cursor-pointer appearance-none border-0 bg-transparent px-0 py-0 opacity-0 outline-none"
            disabled={disabled || isInProgress || skillOptions.length === 0}
            aria-label="Skills"
          >
            <option value="">Skills</option>
            {skillOptions.map((option) => (
              <option key={`skill-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="relative min-w-[112px]">
          <span className="pointer-events-none inline-flex items-center gap-1 truncate text-sm font-medium text-white">
            <span className="truncate">{selectedReasoningLabel}</span>
            <IconTablerChevronDown className="h-3.5 w-3.5 shrink-0 text-white/85" />
          </span>
          <select
            value={selectedReasoningEffort}
            onChange={(e) => setSelectedReasoningEffort(e.target.value as ReasoningEffort)}
            className="absolute inset-0 w-full cursor-pointer appearance-none border-0 bg-transparent px-0 py-0 opacity-0 outline-none"
            disabled={disabled || isInProgress}
            aria-label="Reasoning effort"
          >
            {reasoningOptions.map((option) => (
              <option key={`effort-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-3 self-end">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-white transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50"
            disabled
            aria-label="Microphone unavailable"
            title="Microphone unavailable"
          >
            <IconTablerMicrophone className="h-6 w-6" />
          </button>
          {isInProgress ? (
            <button
              type="button"
              onClick={onInterrupt}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/18 text-white transition-colors hover:bg-white/24"
              title="Stop"
            >
              <IconTablerPlayerStopFilled className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSubmit || disabled}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/18 text-white transition-colors hover:bg-white/24 disabled:cursor-not-allowed disabled:opacity-50"
              title="Send"
            >
              <IconTablerArrowUp className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

export default ThreadComposer;
