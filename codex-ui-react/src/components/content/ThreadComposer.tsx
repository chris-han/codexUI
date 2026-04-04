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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    availableModelIds,
    selectedModelId,
    selectedReasoningEffort,
    selectedCollaborationMode,
    availableCollaborationModes,
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

  const collaborationModeOptions = useMemo(
    () =>
      dedupeByValue(
        availableCollaborationModes.map((option) => ({
          value: typeof option.value === 'string' ? option.value : '',
          label:
            option.label?.trim() ||
            (option.value === 'plan' ? 'Plan' : 'Default'),
        }))
      ),
    [availableCollaborationModes]
  );
  const selectedCollaborationModeLabel = useMemo(() => {
    const selected = collaborationModeOptions.find((option) => option.value === selectedCollaborationMode);
    if (selected?.label?.trim()) return selected.label.trim();
    return selectedCollaborationMode === 'plan' ? 'Plan' : 'Default';
  }, [collaborationModeOptions, selectedCollaborationMode]);

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
      className="relative rounded-3xl border border-gray-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
    >
      {selectedSkills.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {selectedSkills.map((skill) => (
            <span
              key={skill.path}
              className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
            >
              <span>{skill.name}</span>
              <button
                type="button"
                onClick={() => handleRemoveSkill(skill.path)}
                className="text-gray-400 transition-colors hover:text-gray-700"
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
              className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"
            >
              <span title={attachment.fsPath}>{attachment.label}</span>
              <button
                type="button"
                onClick={() => handleRemoveFileAttachment(attachment.fsPath)}
                className="text-blue-400 transition-colors hover:text-blue-700"
                aria-label={`Remove file ${attachment.label}`}
              >
                <IconTablerX className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
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
          placeholder={disabled ? 'Loading...' : 'Type a message... (@ for files, / for skills)'}
          disabled={disabled || isInProgress}
          className="min-h-[112px] w-full resize-none border-0 bg-transparent px-2 py-2 pr-12 text-[15px] text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-50"
          rows={4}
        />

        {slashSkillOptions.length > 0 ? (
          <div className="absolute left-0 top-full z-20 mt-2 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
            {slashSkillOptions.map((skill, index) => (
              <button
                key={skill.path ?? skill.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleAddSkill(skill);
                }}
                className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left ${
                  index === highlightedSkillIndex ? 'bg-gray-50' : 'bg-white'
                }`}
              >
                <span className="text-sm font-medium text-gray-900">{skill.name}</span>
                <span className="text-xs text-gray-500">
                  {skill.description || skill.path || 'Skill'}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {fileMentionSuggestions.length > 0 ? (
          <div className="absolute left-0 top-full z-20 mt-2 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
            {fileMentionSuggestions.map((suggestion, index) => (
              <button
                key={suggestion.path}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleAddFileAttachment(suggestion);
                }}
                className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left ${
                  index === highlightedFileIndex ? 'bg-gray-50' : 'bg-white'
                }`}
              >
                <span className="text-sm font-medium text-gray-900">{getBaseName(suggestion.path)}</span>
                <span className="text-xs text-gray-500">{suggestion.path}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-100 pt-3">
        <div className="relative min-w-[84px]">
          <span className="pointer-events-none block truncate pr-4 text-sm font-normal text-gray-500">
            {selectedCollaborationModeLabel}
          </span>
          <select
            value={selectedCollaborationMode}
            onChange={(e) => handleCollaborationModeChange(e.target.value)}
            className="absolute inset-0 w-full cursor-pointer appearance-none border-0 bg-transparent px-0 py-0 opacity-0 outline-none"
            disabled={disabled || isInProgress}
            aria-label="Collaboration mode"
          >
            {collaborationModeOptions.map((option) => (
              <option key={`mode-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <IconTablerChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>

        <div className="relative min-w-[210px] flex-1 sm:flex-none">
          <select
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            className="w-full appearance-none border-0 bg-transparent px-0 py-0 pr-4 text-sm font-normal text-gray-700 outline-none transition hover:text-gray-900"
            disabled={disabled || isInProgress}
            aria-label="Model"
          >
            {modelOptions.map((option) => (
              <option key={`model-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <IconTablerChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>

        <div className="relative min-w-[124px] flex-1">
          <select
            value=""
            onChange={(e) => {
              handleSkillDropdownChange(e.target.value);
              e.currentTarget.value = '';
            }}
            className="w-full appearance-none border-0 bg-transparent px-0 py-0 pr-4 text-sm font-normal text-gray-700 outline-none transition hover:text-gray-900"
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
          <IconTablerChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>

        <div className="relative min-w-[112px]">
          <select
            value={selectedReasoningEffort}
            onChange={(e) => setSelectedReasoningEffort(e.target.value as ReasoningEffort)}
            className="w-full appearance-none border-0 bg-transparent px-0 py-0 pr-4 text-sm font-normal text-gray-700 outline-none transition hover:text-gray-900"
            disabled={disabled || isInProgress}
            aria-label="Reasoning effort"
          >
            {reasoningOptions.map((option) => (
              <option key={`effort-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <IconTablerChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>

        <div className="ml-auto flex items-center gap-2 self-end">
          {isInProgress ? (
            <button
              type="button"
              onClick={onInterrupt}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
              title="Stop"
            >
              <IconTablerPlayerStopFilled className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSubmit || disabled}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              title="Send"
            >
              <IconTablerArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

export default ThreadComposer;
