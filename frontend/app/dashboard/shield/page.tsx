'use client';

import { fetchAlerts, fetchPositions } from '@/lib/api';
import { formatPercent, formatPrice } from '@/lib/format';
import {
  alertSourceLabel,
  alertTone,
  computeDistancePercent,
  latestRiskBySymbol,
  resolvePositions,
  riskLabel
} from '@/lib/terminal';
import { usePollingResource } from '@/lib/usePollingResource';

import { ShieldIcon } from '@/components/terminal/icons';
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

export default function ShieldPage() {
  const positions = usePollingResource({ fetcher: fetchPositions, intervalMs: 30000 });
  const alerts = usePollingResource({ fetcher: fetchAlerts, intervalMs: 30000 });
  const positionsState = positions.data || { live: null, history: [] };
  const openPositions = resolvePositions(positionsState);
  const latestRisk = latestRiskBySymbol(positionsState.history);
  const riskAlerts = (alerts.data || []).filter((alert) => alert.alert_type === 'LIQUIDATION_RISK').slice(0, 6);

  return (
    <div className="space-y-4">
      {openPositions.fallbackActive && openPositions.positions.length > 0 ? (
        <div className="flex h-9 items-center rounded-[10px] border border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.12)] px-4 text-[13px] text-[var(--amber)]">
          ⚠ SoDEX position fetch failed — showing demo BTC-USD testnet position
        </div>
      ) : null}

      <PageHeader
        title="Liquidation Shield"
        description="Position-by-position liquidation distance monitoring with fallback protection."
        right={<PollingIndicator freshness={positions.freshness} nextPollInMs={positions.nextPollInMs} />}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        <Panel>
          <PanelHeader title="Protected Positions" accent="cyan" />
          <div className="space-y-4 p-4">
            {positions.loading ? (
              <>
                <SkeletonBlock className="h-36 w-full" />
                <SkeletonBlock className="h-36 w-full" />
              </>
            ) : positions.error ? (
              <ErrorCard message={positions.error} onRetry={() => void positions.refresh()} />
            ) : openPositions.positions.length === 0 ? (
              <EmptyState title="No active protection targets" description="Open a SoDEX position to monitor liquidation distance and risk." />
            ) : (
              openPositions.positions.map((position) => {
                const snapshot = latestRisk.get(position.symbol);
                const distance = snapshot?.distance_to_liquidation_pct ?? computeDistancePercent(position);
                const risk = riskLabel({ distance, riskLevel: snapshot?.risk_level, riskScore: snapshot?.risk_score });

                return (
                  <div key={position.symbol} className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-[15px] font-medium text-[var(--text-1)]">{position.symbol}</div>
                          {openPositions.fallbackActive ? <Pill tone="gray">Demo Position</Pill> : null}
                        </div>
                        <div className="mt-2 text-[11px] text-[var(--text-3)]">Leverage {position.leverage}x</div>
                      </div>
                      <ShieldIcon className={risk.tone === 'green' ? 'h-5 w-5 text-[var(--green)]' : risk.tone === 'amber' ? 'h-5 w-5 text-[var(--amber)]' : 'h-5 w-5 text-[var(--red)]'} />
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <div>
                        <div className="text-[11px] text-[var(--text-3)]">Entry</div>
                        <div className="mt-1 text-[13px] text-[var(--text-1)]">{formatPrice(position.entryPrice)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[var(--text-3)]">Current</div>
                        <div className="mt-1 text-[13px] text-[var(--text-1)]">{formatPrice(position.markPrice)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[var(--text-3)]">Liquidation</div>
                        <div className="mt-1 text-[13px] text-[var(--text-1)]">{formatPrice(position.liquidationPrice)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[var(--text-3)]">Distance</div>
                        <div className={risk.tone === 'green' ? 'mt-1 text-[13px] text-[var(--green)]' : risk.tone === 'amber' ? 'mt-1 text-[13px] text-[var(--amber)]' : 'mt-1 text-[13px] text-[var(--red)]'}>
                          {formatPercent(distance, 1)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <DistanceBar percent={distance} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Recent Shield Alerts" accent="cyan" right={<PollingIndicator freshness={alerts.freshness} nextPollInMs={alerts.nextPollInMs} />} />
          <div className="space-y-2 p-4">
            {alerts.loading ? (
              <>
                <SkeletonBlock className="h-14 w-full" />
                <SkeletonBlock className="h-14 w-full" />
                <SkeletonBlock className="h-14 w-full" />
              </>
            ) : alerts.error ? (
              <ErrorCard message={alerts.error} onRetry={() => void alerts.refresh()} />
            ) : riskAlerts.length === 0 ? (
              <EmptyState title="No shield alerts" description="Critical liquidation warnings will populate here when risk accelerates." />
            ) : (
              riskAlerts.map((alert) => (
                <div key={alert.id || `${alert.message}-${alert.created_at}`} className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-3">
                  <div className="flex items-start gap-3">
                    <span className={alertTone(alert.severity) === 'red' ? 'mt-1 h-2 w-2 rounded-full bg-[var(--red)]' : 'mt-1 h-2 w-2 rounded-full bg-[var(--amber)]'} />
                    <div>
                      <div className="text-[13px] text-[var(--text-1)]">{alert.message}</div>
                      <div className="mt-1 text-[11px] text-[var(--text-3)]">{alertSourceLabel(alert.alert_type)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
