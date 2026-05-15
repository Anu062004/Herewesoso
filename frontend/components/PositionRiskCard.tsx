'use client';

import RiskGauge from '@/components/RiskGauge';
import type { LivePosition, MemoRow, PositionSnapshot } from '@/lib/types';

interface PositionRiskCardProps {
  position: LivePosition;
  snapshot?: PositionSnapshot;
  memo?: MemoRow;
  onReduce: () => void;
  onClose: () => void;
}

function formatPrice(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return '--';
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: value > 100 ? 0 : 2 })}`;
}

function riskTone(level: string | undefined) {
  if (level === 'SAFE') return 'text-safe border-safe/20 bg-safe/5';
  if (level === 'CAUTION') return 'text-caution border-caution/20 bg-caution/5';
  if (level === 'DANGER') return 'text-danger border-danger/20 bg-danger/10';
  return 'text-danger border-danger/30 bg-danger/15';
}

export default function PositionRiskCard({
  position,
  snapshot,
  memo,
  onReduce,
  onClose
}: PositionRiskCardProps) {
  const riskScore = snapshot?.risk_score ?? 0;
  const riskLevel = snapshot?.risk_level || 'SAFE';
  const macroThreat = snapshot?.macro_threats?.event
    ? `${snapshot.macro_threats.event} in ${Number(snapshot.macro_threats.hoursUntil || 0).toFixed(1)}h`
    : 'No imminent macro event';
  const positionDirection = position.positionSide === 'SHORT' ? 'SHORT' : 'LONG';

  const pnlPct =
    position.entryPrice && position.markPrice && position.entryPrice > 0
      ? ((position.markPrice - position.entryPrice) / position.entryPrice) *
        100 *
        (positionDirection === 'SHORT' ? -1 : 1)
      : null;

  return (
    <article className={`panel rounded-3xl p-6 ${riskLevel === 'CRITICAL' ? 'critical-pulse' : ''}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="eyebrow">Liquidation Shield</p>
          <h2 className="mt-3 font-headline text-2xl font-bold text-white">
            {position.symbol} {position.leverage}x {positionDirection}
          </h2>
          <div className="mt-4 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
            <p>Entry: {formatPrice(position.entryPrice)}</p>
            <p>Mark: {formatPrice(position.markPrice)}</p>
            <p>Liquidation: {formatPrice(position.liquidationPrice)}</p>
            <p>Size: {position.size}</p>
          </div>
        </div>

        <div className={`rounded-full border px-3 py-1 font-mono text-xs tracking-[0.14em] ${riskTone(riskLevel)}`}>
          {riskLevel}
        </div>
      </div>

      <div className="terminal-rule my-6" />

      <div className="grid gap-6 xl:grid-cols-[240px_1fr]">
        <RiskGauge score={riskScore} />

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/8 bg-black/20 px-4 py-4">
            <p className="data-label">Distance To Liquidation</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {snapshot ? `${snapshot.distance_to_liquidation_pct.toFixed(2)}%` : '--'}
            </p>
          </div>
          <div className="rounded-3xl border border-white/8 bg-black/20 px-4 py-4">
            <p className="data-label">Unrealised PnL</p>
            <p className={`mt-3 text-2xl font-semibold ${
              pnlPct === null ? 'text-zinc-400' :
              pnlPct >= 0 ? 'text-safe' : 'text-danger'
            }`}>
              {pnlPct === null ? '--' : `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`}
            </p>
          </div>
          <div className="rounded-3xl border border-white/8 bg-black/20 px-4 py-4">
            <p className="data-label">Macro Threat</p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">{macroThreat}</p>
          </div>
          <div className="rounded-3xl border border-white/8 bg-black/20 px-4 py-4 lg:col-span-3">
            <p className="data-label">AI Insight</p>
            <p className="mt-3 text-sm leading-7 text-zinc-300">
              {memo?.content || 'No risk memo stored yet for this position.'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onReduce}
          className="rounded-full border border-accent/25 bg-accent px-4 py-2 font-mono text-sm font-semibold text-black transition hover:bg-[#ff8f3a]"
        >
          Reduce Leverage
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-danger/25 bg-danger px-4 py-2 font-mono text-sm font-semibold text-white transition hover:bg-[#ff4d6a]"
        >
          Close Position
        </button>
      </div>
    </article>
  );
}
