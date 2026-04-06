import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useCodexStore } from '../../stores';
import { searchComposerFiles, uploadComposerFile, type ComposerFileSuggestion } from '../../api/codexGateway';
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
  IconLucidePlus,
  IconLucideSplinePointer,
  IconLucideZap,
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
  const isMobile = useIsMobile();
  const [message, setMessage] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<Array<{ name: string; path: string }>>([]);
  const [fileAttachments, setFileAttachments] = useState<ComposerFileAttachment[]>([]);
  const [highlightedSkillIndex, setHighlightedSkillIndex] = useState(0);
  const [fileMentionSuggestions, setFileMentionSuggestions] = useState<ComposerFileSuggestion[]>([]);
  const [highlightedFileIndex, setHighlightedFileIndex] = useState(0);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<null | 'model' | 'skills' | 'reasoning'>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const skillsButtonRef = useRef<HTMLButtonElement | null>(null);
  const reasoningButtonRef = useRef<HTMLButtonElement | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ left: number; bottom: number } | null>(null);

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
      const root = controlsRef.current;
      if (!root) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (root.contains(target)) return;
      setIsPlusMenuOpen(false);
      setOpenDropdown(null);
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
    void (async () => {
      try {
        setUploadError(null);
        const uploaded = await Promise.all(files.map((file) => uploadComposerFile(file)));
        setFileAttachments((current) => {
          const existing = new Set(current.map((attachment) => attachment.fsPath));
          const additions = uploaded.filter((attachment) => {
            if (!attachment.fsPath || existing.has(attachment.fsPath)) return false;
            existing.add(attachment.fsPath);
            return true;
          });
          return [...current, ...additions];
        });
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Failed to upload file attachment');
      }
    })();
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

  const toggleDropdown = (dropdown: 'model' | 'skills' | 'reasoning') => {
    setIsPlusMenuOpen(false);
    const isClosing = openDropdown === dropdown;
    setOpenDropdown(isClosing ? null : dropdown);
    if (!isClosing) {
      const ref = dropdown === 'model' ? modelButtonRef : dropdown === 'skills' ? skillsButtonRef : reasoningButtonRef;
      const rect = ref.current?.getBoundingClientRect();
      if (rect) {
        setDropdownPosition({ left: rect.left, bottom: window.innerHeight - rect.top + 12 });
      }
    }
  };

  const closeMenus = () => {
    setIsPlusMenuOpen(false);
    setOpenDropdown(null);
    setDropdownPosition(null);
  };

  const textAreaPlaceholder = disabled ? 'Loading...' : `Type a message...${isMobile ? ' (/ for skills)' : ' (@ for files, / for skills)'}`;

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative flex h-full flex-col rounded-xl border border-gray-200 bg-white shadow-[0_4px_12px_rgba(15,23,42,0.06)] ${
        isMobile ? 'p-4' : 'p-3'
      }`}
    >
      {uploadError ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {uploadError}
        </div>
      ) : null}

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

      {selectedCollaborationMode === 'plan' || selectedCollaborationMode === 'full-auto' ? (
        <div className="mb-3">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white ${
            selectedCollaborationMode === 'full-auto' ? 'bg-green-700' : 'bg-gray-900'
          }`}>
            {selectedCollaborationMode === 'full-auto' ? 'Full Auto' : 'Plan'}
          </span>
        </div>
      ) : null}

      <div className="relative flex-1 min-h-0">
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
          placeholder={textAreaPlaceholder}
          disabled={disabled || isInProgress}
          className={`w-full resize-none border-0 bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-50 ${
            isMobile
              ? 'h-full min-h-[132px] px-0 py-0'
              : 'h-full min-h-[56px] px-2 py-2 pr-12'
          }`}
          rows={isMobile ? 4 : 2}
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

      <div
        ref={controlsRef}
        className={`relative mt-2 border-t border-gray-300 pt-1 ${
          isMobile ? 'flex flex-col gap-3' : 'flex items-center gap-3'
        }`}
      >
        <div className={`relative flex items-center shrink-0 ${isMobile ? 'order-1' : ''}`}>
          <button
            type="button"
            onClick={() => {
              setOpenDropdown(null);
              setIsPlusMenuOpen((open) => !open);
            }}
            className="inline-flex h-6 w-6 items-end justify-center rounded-full bg-transparent pb-[6px] text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled || isInProgress}
            aria-label="More actions"
          >
            <span className="relative block h-2 w-2">
              <span className="absolute left-1/2 top-1/2 h-[1px] w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
              <span className="absolute left-1/2 top-1/2 h-3 w-[1px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
            </span>
          </button>

          {isPlusMenuOpen ? (
            <div className="absolute bottom-[calc(100%+12px)] left-0 z-[100] min-w-[260px] overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 text-gray-900 shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
              <div className="max-h-72 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => {
                    handleCollaborationModeChange(selectedCollaborationMode === 'plan' ? 'ask-approval' : 'plan');
                    closeMenus();
                  }}
                  className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left text-sm transition hover:bg-gray-50"
                >
                  <IconLucideSplinePointer className="h-5 w-5 shrink-0" />
                  <span>{selectedCollaborationMode === 'plan' ? 'Exit Plan' : 'Plan'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCollaborationModeChange(selectedCollaborationMode === 'full-auto' ? 'ask-approval' : 'full-auto');
                    closeMenus();
                  }}
                  className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left text-sm transition hover:bg-gray-50"
                >
                  <IconLucideZap className="h-5 w-5 shrink-0 text-green-700" />
                  <div className="flex flex-col">
                    <span>{selectedCollaborationMode === 'full-auto' ? 'Exit Full Auto' : 'Full Auto'}</span>
                    <span className="text-xs text-gray-500">Tools run without approval</span>
                  </div>
                </button>
                <div className="my-2 h-px bg-gray-200" />
                <button
                  type="button"
                  onClick={() => {
                    uploadInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left text-sm transition hover:bg-gray-50"
                >
                  <IconLucidePlus className="h-5 w-5" />
                  <span>Upload attachment</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className={`flex min-w-0 items-center ${isMobile ? 'order-2 gap-5' : 'gap-3'}`}>
          <div className="relative min-w-[120px]">
            <button
              ref={modelButtonRef}
              type="button"
              onClick={() => toggleDropdown('model')}
              className="inline-flex items-center gap-1 truncate text-sm font-normal text-gray-700"
              disabled={disabled || isInProgress}
            >
              <span className="truncate">{selectedModelId}</span>
              <IconTablerChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            </button>
            {openDropdown === 'model' && dropdownPosition ? (
              <div className="fixed z-[100] min-w-[280px] overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-[0_20px_50px_rgba(15,23,42,0.16)]" style={{ left: dropdownPosition.left, bottom: dropdownPosition.bottom }}>
                <div className="max-h-72 overflow-y-auto pr-1">
                  {modelOptions.map((option) => (
                    <button
                      key={`model-${option.value}`}
                      type="button"
                      onClick={() => {
                        setSelectedModelId(option.value);
                        closeMenus();
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition ${
                        option.value === selectedModelId ? 'bg-gray-50 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span>{option.label}</span>
                      {option.value === selectedModelId ? <span className="text-gray-400">✓</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative min-w-[54px]">
            <button
              ref={skillsButtonRef}
              type="button"
              onClick={() => toggleDropdown('skills')}
              className="inline-flex items-center gap-1 truncate text-sm font-normal text-gray-700"
              disabled={disabled || isInProgress || skillOptions.length === 0}
            >
              <span className="truncate">Skills</span>
              <IconTablerChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            </button>
            {openDropdown === 'skills' && dropdownPosition ? (
              <div className="fixed z-[100] min-w-[280px] overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-[0_20px_50px_rgba(15,23,42,0.16)]" style={{ left: dropdownPosition.left, bottom: dropdownPosition.bottom }}>
                <div className="max-h-72 overflow-y-auto pr-1">
                  {skillOptions.map((option) => (
                    <button
                      key={`skill-${option.value}`}
                      type="button"
                      onClick={() => {
                        handleSkillDropdownChange(option.value);
                        closeMenus();
                      }}
                      className="flex w-full items-center rounded-2xl px-4 py-3 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative min-w-[92px]">
            <button
              ref={reasoningButtonRef}
              type="button"
              onClick={() => toggleDropdown('reasoning')}
              className="inline-flex items-center gap-1 truncate text-sm font-normal text-gray-700"
              disabled={disabled || isInProgress}
            >
              <span className="truncate">{selectedReasoningLabel}</span>
              <IconTablerChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            </button>
            {openDropdown === 'reasoning' && dropdownPosition ? (
              <div className="fixed z-[100] min-w-[220px] overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-[0_20px_50px_rgba(15,23,42,0.16)]" style={{ left: dropdownPosition.left, bottom: dropdownPosition.bottom }}>
                <div className="max-h-72 overflow-y-auto pr-1">
                  {reasoningOptions.map((option) => (
                    <button
                      key={`effort-${option.value}`}
                      type="button"
                      onClick={() => {
                        setSelectedReasoningEffort(option.value as ReasoningEffort);
                        closeMenus();
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition ${
                        option.value === selectedReasoningEffort ? 'bg-gray-50 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span>{option.label}</span>
                      {option.value === selectedReasoningEffort ? <span className="text-gray-400">✓</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {isMobile ? (
          <div className="order-3 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled
              aria-label="Microphone"
              title="Microphone"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-700 opacity-70"
            >
              <IconTablerMicrophone className="h-5 w-5" />
            </button>
            {isInProgress ? (
              <button
                type="button"
                onClick={onInterrupt}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
                title="Stop"
              >
                <IconTablerPlayerStopFilled className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSubmit || disabled}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-gray-700 transition-colors hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
                title="Send"
              >
                <IconTablerArrowUp className="h-5 w-5" />
              </button>
            )}
          </div>
        ) : (
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
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                title="Send"
              >
                <IconTablerArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </form>
  );
}

export default ThreadComposer;
