import { useEffect, useMemo, useRef, useState } from 'react';
import { useCodexStore } from '../../stores';
import type {
  CollaborationModeKind,
  ReasoningEffort,
  SkillInfo,
  ThreadComposerSubmitPayload,
} from '../../types/codex';
import {
  IconTablerArrowUp,
  IconTablerPlayerStopFilled,
  IconTablerX,
} from '../icons';

interface ThreadComposerProps {
  onSend: (payload: ThreadComposerSubmitPayload) => void;
  onInterrupt: () => void;
  isInProgress: boolean;
  disabled?: boolean;
}

function buildSkillSelection(skill: SkillInfo) {
  return {
    name: skill.name,
    path: skill.path ?? skill.id,
  };
}

function ThreadComposer({ onSend, onInterrupt, isInProgress, disabled }: ThreadComposerProps) {
  const [message, setMessage] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<Array<{ name: string; path: string }>>([]);
  const [highlightedSkillIndex, setHighlightedSkillIndex] = useState(0);
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

  const canSubmit = message.trim().length > 0 || selectedSkills.length > 0;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit || isInProgress || disabled) return;
    onSend({
      text: message.trim(),
      imageUrls: [],
      fileAttachments: [],
      skills: selectedSkills,
    });
    setMessage('');
    setSelectedSkills([]);
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

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
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
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
        <select
          value={selectedCollaborationMode}
          onChange={(e) => handleCollaborationModeChange(e.target.value)}
          className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary"
          disabled={disabled || isInProgress}
          aria-label="Collaboration mode"
        >
          {availableCollaborationModes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={selectedModelId}
          onChange={(e) => setSelectedModelId(e.target.value)}
          className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary"
          disabled={disabled || isInProgress}
          aria-label="Model"
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

        <select
          value=""
          onChange={(e) => {
            handleSkillDropdownChange(e.target.value);
            e.currentTarget.value = '';
          }}
          className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary"
          disabled={disabled || isInProgress || installedSkills.length === 0}
          aria-label="Skills"
        >
          <option value="">Skills</option>
          {installedSkills
            .filter((skill) => skill.path)
            .map((skill) => (
              <option key={skill.path} value={skill.path}>
                {skill.name}
              </option>
            ))}
        </select>

        <select
          value={selectedReasoningEffort}
          onChange={(e) => setSelectedReasoningEffort(e.target.value as ReasoningEffort)}
          className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary"
          disabled={disabled || isInProgress}
          aria-label="Reasoning effort"
        >
          {reasoningOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
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
