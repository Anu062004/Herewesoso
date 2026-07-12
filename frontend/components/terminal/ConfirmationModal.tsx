'use client';

import { useEffect, useState } from 'react';

interface ActionResult {
  title?: string;
  message: string;
}

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  disclaimer?: string;
  onClose: () => void;
  onConfirm: () => Promise<ActionResult>;
}

export function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  disclaimer = 'Review before confirming',
  onClose,
  onConfirm
}: ConfirmationModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSubmitting(false);
    setResult(null);
    setError(null);
  }, [open, title, description, confirmLabel]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-md)]">
        <h2 className="text-[15px] font-semibold text-[var(--text-1)]">{title}</h2>
        <p className="mt-3 text-[13px] leading-6 text-[var(--text-2)]">{description}</p>

        <div className="mt-4 inline-flex h-7 items-center rounded-md border border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.12)] px-2 text-[11px] font-medium text-[var(--amber)]">
          {disclaimer}
        </div>

        {result ? (
          <div className="mt-4 rounded-[10px] border border-[rgba(16,185,129,0.28)] bg-[rgba(16,185,129,0.1)] p-4">
            <div className="text-[13px] font-medium text-[var(--text-1)]">{result.title || 'Action queued'}</div>
            <div className="mt-2 text-[13px] leading-6 text-[var(--text-2)]">{result.message}</div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-[10px] border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.1)] p-4 text-[13px] leading-6 text-[var(--red)]">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-9 items-center rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-4 text-[13px] font-medium text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              setSubmitting(true);
              setError(null);

              try {
                const next = await onConfirm();
                setResult(next);
              } catch (confirmError) {
                setError(confirmError instanceof Error ? confirmError.message : 'Action failed.');
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={submitting}
            className="inline-flex h-9 items-center rounded-md border border-[rgba(255,107,0,0.56)] bg-[var(--brand)] px-4 text-[13px] font-medium text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border border-black/30 border-t-black" />
                Processing
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
