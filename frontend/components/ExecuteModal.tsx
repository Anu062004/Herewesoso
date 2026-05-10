'use client';

interface ExecuteModalProps {
  open: boolean;
  action: 'REDUCE_LEVERAGE' | 'CLOSE_POSITION' | null;
  symbol: string | null;
  currentLeverage?: number | null;
  targetLeverage?: number | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function buildDescription(
  action: 'REDUCE_LEVERAGE' | 'CLOSE_POSITION' | null,
  symbol: string | null,
  currentLeverage?: number | null,
  targetLeverage?: number | null
) {
  if (action === 'REDUCE_LEVERAGE') {
    return `This will reduce your ${symbol} position from ${currentLeverage}x to ${targetLeverage}x.`;
  }

  if (action === 'CLOSE_POSITION') {
    return `This will close your ${symbol} position when execution is added in Wave 2.`;
  }

  return '';
}

export default function ExecuteModal({
  open,
  action,
  symbol,
  currentLeverage,
  targetLeverage,
  isSubmitting,
  onClose,
  onConfirm
}: ExecuteModalProps) {
  if (!open || !action || !symbol) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="panel w-full max-w-lg rounded-3xl p-6">
        <p className="eyebrow">Execution Confirmation</p>
        <h2 className="mt-3 font-headline text-2xl font-bold text-white">
          {action === 'REDUCE_LEVERAGE' ? 'Reduce Leverage' : 'Close Position'}
        </h2>
        <p className="mt-4 text-sm leading-7 text-zinc-300">
          {buildDescription(action, symbol, currentLeverage, targetLeverage)}
        </p>
        <p className="mt-3 rounded-2xl border border-caution/20 bg-caution/10 px-4 py-3 text-sm text-caution">
          Confirming will only queue the action in Wave 1. EIP-712 execution comes in Wave 2.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="rounded-full bg-accent px-4 py-2 font-mono text-sm font-semibold text-black transition hover:bg-[#ff8f3a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Queueing...' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/12 px-4 py-2 font-mono text-sm text-zinc-200 transition hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
