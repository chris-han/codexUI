import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { IconTablerX } from '../icons';

type ModalShellProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
};

export function ModalShell({
  isOpen,
  title,
  onClose,
  children,
  footer,
  widthClassName = 'max-w-md',
}: ModalShellProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`w-full rounded-2xl bg-white p-6 shadow-xl ${widthClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close dialog"
          >
            <IconTablerX className="h-5 w-5" />
          </button>
        </div>
        <div>{children}</div>
        {footer ? <div className="mt-6 flex gap-3">{footer}</div> : null}
      </div>
    </div>
  );
}

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  tone?: 'default' | 'danger';
};

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  tone = 'default',
}: ConfirmDialogProps) {
  return (
    <ModalShell
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-lg px-4 py-2 text-white transition ${
              tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-hover'
            }`}
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      <p className="text-sm text-gray-600">{message}</p>
    </ModalShell>
  );
}

type TextInputDialogProps = {
  isOpen: boolean;
  title: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  confirmLabel: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
  isSubmitting?: boolean;
};

export function TextInputDialog({
  isOpen,
  title,
  label,
  value,
  onChange,
  onSubmit,
  onClose,
  confirmLabel,
  placeholder,
  helperText,
  error,
  isSubmitting = false,
}: TextInputDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isOpen]);

  return (
    <ModalShell
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim() || isSubmitting}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : confirmLabel}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          <span className="mb-1 block">{label}</span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder={placeholder}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 outline-none transition focus:border-primary"
          />
        </label>
        {helperText ? <p className="text-xs text-gray-500">{helperText}</p> : null}
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
