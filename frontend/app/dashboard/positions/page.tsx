'use client';

import { useState } from 'react';

import { fetchPositions } from '@/lib/api';
import { formatPercent, formatPrice } from '@/lib/format';
import {
  computeDistancePercent,
  latestRiskBySymbol,
  positionStatus,
  resolvePositions,
  riskLabel,
  scoreFromDistance
} from '@/lib/terminal';
import { usePollingResource } from '@/lib/usePollingResource';

import { ConfirmationModal } from '@/components/terminal/ConfirmationModal';
import { RefreshIcon } from '@/components/terminal/icons';
import {
  DistanceBar,
  EmptyState,
  ErrorCard,
  PageHeader,
  Panel,
  PanelHeader,
  Pill,
  PollingIndicator,
  SkeletonBlock
} from '@/components/terminal/ui';

export default function PositionsPage() {
  const positions = usePollingResource({ fetcher: fetchPositions, intervalMs: 30000 });
  const [pendingSymbol, setPendingSymbol] = useState<string | null>(null);
  const state = positions.data || { live: null, history: [] };
  const resolved = resolvePositions(state);
  const latestRisk = latestRiskBySymbol(state.history);

  return (
    <div className="space-y-4">
      {resolved.fallbackActive && resolved.positions.length > 0 ? (
        <div className="flex h-9 items-center rounded-[10px] border border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.12)] px-4 text-[13px] text-[var(--amber)]">
          ⚠ SoDEX position fetch failed — showing demo BTC-USD testnet position
        </div>
      ) : null}

      <PageHeader
        title="Positions"
        description="Polling every 30s"
        right={
          <div className="flex items-center gap-3">
            <PollingIndicator freshness={positions.freshness} nextPollInMs={positions.nextPollInMs} />
            <button
              type="button"
              onClick={() => void positions.refresh()}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-[13px] text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]"
            >
              <RefreshIcon className={positions.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </button>
          </div>
        }
      />

      <Panel>
        <PanelHeader title="Open Positions" accent="cyan" subtitle="Sticky header table" />
        <div className="overflow-x-auto">
          {positions.loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : positions.error ? (
            <div className="p-4">
              <ErrorCard message={positions.error} onRetry={() => void positions.refresh()} />
            </div>
          ) : resolved.positions.length === 0 ? (
            <EmptyState title="No open positions" description="The table will populate after a SoDEX position is opened." />
          ) : (
            <table className="min-w-[1100px] text-left">
              <thead className="sticky top-0 z-10 bg-[var(--bg-panel)] text-[11px] text-[var(--text-3)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Side</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Entry Price</th>
                  <th className="px-4 py-3 font-medium">Mark Price</th>
                  <th className="px-4 py-3 font-medium">Liquidation Price</th>
                  <th className="px-4 py-3 font-medium">Distance%</th>
                  <th className="px-4 py-3 font-medium">Risk Score</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {resolved.positions.map((position) => {
                  const snapshot = latestRisk.get(position.symbol);
                  const distance = snapshot?.distance_to_liquidation_pct ?? computeDistancePercent(position);
                  const riskScore = snapshot?.risk_score ?? scoreFromDistance(distance);
                  const risk = riskLabel({ distance, riskLevel: snapshot?.risk_level, riskScore });
                  const status = positionStatus(distance);

                  return (
                    <tr key={position.symbol} className="border-t border-[var(--border)] text-[13px] hover:bg-[var(--bg-panel)]">
                      <td className="px-4 py-3 text-[var(--text-1)]">{position.symbol}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{position.positionSide === 'SHORT' || position.size < 0 ? 'Short' : 'Long'}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{Math.abs(position.size)}</td>
                      <td className="px-4 py-3 text-[var(--text-1)]">{formatPrice(position.entryPrice)}</td>
                      <td className="px-4 py-3 text-[var(--text-1)]">{formatPrice(position.markPrice)}</td>
                      <td className="px-4 py-3 text-[var(--text-1)]">{formatPrice(position.liquidationPrice)}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-2">
                          <div className={risk.tone === 'green' ? 'text-[var(--green)]' : risk.tone === 'amber' ? 'text-[var(--amber)]' : 'text-[var(--red)]'}>
                            {formatPercent(distance, 1)}
                          </div>
                          <DistanceBar percent={distance} compact />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={risk.tone === 'green' ? 'green' : risk.tone === 'amber' ? 'amber' : 'red'}>{Math.round(riskScore)}</Pill>
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={status.tone === 'green' ? 'green' : 'amber'}>{status.label}</Pill>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setPendingSymbol(position.symbol)}
                          className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-[12px] text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Panel>

      <ConfirmationModal
        open={Boolean(pendingSymbol)}
        title="Manage Position"
        description={`This opens the Wave 2 position-management flow for ${pendingSymbol || 'the selected market'}.`}
        confirmLabel="Confirm"
        onClose={() => setPendingSymbol(null)}
        onConfirm={async () => ({
          title: 'Wave 2 placeholder',
          message: `Advanced management for ${pendingSymbol || 'this position'} is reserved for the Wave 2 execution flow.`
        })}
      />
    </div>
  );
}
