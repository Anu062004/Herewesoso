'use client';

import { fetchAlerts, fetchPositions } from '@/lib/api';
import { formatNumber, formatPercent, formatPrice, formatRelativeTime } from '@/lib/format';
import {
  alertSourceLabel,
  alertTone,
  computeDistancePercent,
  latestRiskBySymbol,
  resolvePositions,
  riskLabel
} from '@/lib/terminal';
import { useSodexConnection } from '@/lib/useSodexConnection';
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
  SkeletonBlock,
  MetricCard
} from '@/components/terminal/ui';

export default function ShieldPage() {
  const connection = useSodexConnection();
  const network = connection?.network || 'testnet';
  const networkLabel = network === 'mainnet' ? 'Mainnet' : 'Testnet';
  const positions = usePollingResource({
    fetcher: fetchPositions,
    intervalMs: 10000,
    key: `${network}:${connection?.address || 'env'}`
  });
  const alerts = usePollingResource({ fetcher: fetchAlerts, intervalMs: 30000 });
  const positionsState = positions.data || { live: null, history: [] };
  const openPositions = resolvePositions(positionsState);
  const latestRisk = latestRiskBySymbol(positionsState.history);
  const riskAlerts = (alerts.data || []).filter((alert) => alert.alert_type === 'LIQUIDATION_RISK').slice(0, 6);
  const portfolio = positionsState.live?.portfolioRisk;
  const account = positionsState.live;

  return (
    <div className="space-y-4">
      {openPositions.fallbackActive && openPositions.positions.length > 0 ? (
        <div className="flex h-9 items-center rounded-[10px] border border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.12)] px-4 text-[13px] text-[var(--amber)]">
          Warning: SoDEX position fetch failed - showing demo BTC-USD testnet position
        </div>
      ) : null}

      <PageHeader
        title="Liquidation Shield"
        description={`Position-by-position liquidation distance monitoring for the selected SoDEX ${networkLabel.toLowerCase()} account.`}
        right={<PollingIndicator freshness={positions.freshness} nextPollInMs={positions.nextPollInMs} />}
      />

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-3)]">
        <Pill tone={positionsState.stream?.connected ? 'green' : 'amber'}>{positionsState.stream?.connected ? 'SoDEX stream live' : 'REST fallback'}</Pill>
        <span>{positionsState.stream?.connected ? `${positionsState.stream.tickCount} markets receiving block updates` : 'WebSocket is reconnecting; 10-second authenticated refresh remains active.'}</span>
      </div>

      {account ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Account Equity" value={formatPrice(account.accountValue)} supporting={`${formatPrice(account.availableMargin)} available`} />
          <MetricCard label="Margin Utilization" value={formatPercent(account.accountValue ? ((account.initialMargin || 0) / account.accountValue) * 100 : 0)} supporting={`${formatPrice(account.initialMargin)} initial margin`} tone={account.accountValue && (account.initialMargin || 0) / account.accountValue > 0.7 ? 'red' : 'default'} />
          <MetricCard label="Gross Exposure" value={formatPrice(portfolio?.grossNotional || 0)} supporting={`${formatPercent(portfolio?.concentrationPct || 0)} concentrated · ${formatPercent(portfolio?.correlatedExposurePct || 0)} highly correlated`} />
          <MetricCard label="Portfolio 5% Stress" value={formatPrice(portfolio?.stressLoss5Pct || 0)} supporting={`${portfolio?.riskLevel || 'SAFE'} portfolio state`} tone={portfolio?.riskLevel === 'CRITICAL' || portfolio?.riskLevel === 'DANGER' ? 'red' : portfolio?.riskLevel === 'CAUTION' ? 'amber' : 'green'} />
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        <Panel>
          <PanelHeader title="Protected Positions" accent="cyan" subtitle="Live calculations refresh every 10 seconds" />
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
                const analysis = position.analysis;
                const distance = analysis?.distancePct ?? snapshot?.distance_to_liquidation_pct ?? computeDistancePercent(position);
                const risk = riskLabel({ distance, riskLevel: analysis?.riskLevel || snapshot?.risk_level, riskScore: analysis?.score || snapshot?.risk_score });

                return (
                  <div key={position.symbol} className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-[15px] font-medium text-[var(--text-1)]">{position.symbol}</div>
                          <Pill tone={position.positionSide === 'SHORT' ? 'red' : 'green'}>{position.positionSide}</Pill>
                          {analysis ? <Pill tone={analysis.confidence === 'HIGH' ? 'green' : analysis.confidence === 'MEDIUM' ? 'amber' : 'gray'}>{analysis.confidence} confidence</Pill> : null}
                          {openPositions.fallbackActive ? <Pill tone="gray">Demo Position</Pill> : null}
                        </div>
                        <div className="mt-2 text-[11px] text-[var(--text-3)]">Leverage {position.leverage}x</div>
                      </div>
                      <div className="text-right">
                        <ShieldIcon className={risk.tone === 'green' ? 'ml-auto h-5 w-5 text-[var(--green)]' : risk.tone === 'amber' ? 'ml-auto h-5 w-5 text-[var(--amber)]' : 'ml-auto h-5 w-5 text-[var(--red)]'} />
                        <div className="mt-1 text-[12px] font-semibold text-[var(--text-1)]">Risk {analysis?.score ?? snapshot?.risk_score ?? '—'}/100</div>
                      </div>
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
                        <div className="mt-1 text-[13px] text-[var(--text-1)]">{formatPrice(analysis?.liquidationPrice || position.liquidationPrice)}</div>
                        {analysis ? <div className="mt-1 text-[10px] text-[var(--text-3)]">{analysis.liquidationPriceSource}</div> : null}
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

                    {analysis ? (
                      <div className="mt-4 grid gap-4 border-t border-[var(--border)] pt-4 lg:grid-cols-2">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">Risk breakdown</div>
                          <div className="mt-3 space-y-2">
                            {Object.entries(analysis.breakdown).map(([label, value]) => (
                              <div key={label} className="grid grid-cols-[110px_1fr_30px] items-center gap-2 text-[11px]">
                                <span className="capitalize text-[var(--text-2)]">{label.replace(/([A-Z])/g, ' $1')}</span>
                                <span className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]"><span className="block h-full rounded-full bg-[var(--cyan)]" style={{ width: `${value}%` }} /></span>
                                <span className="text-right tabular-nums text-[var(--text-3)]">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-lg border border-[rgba(245,158,11,0.22)] bg-[rgba(245,158,11,0.06)] p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--amber)]">Rescue plan</div>
                          <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                            <div><div className="text-[var(--text-3)]">Target leverage</div><div className="mt-1 font-semibold text-[var(--text-1)]">{analysis.rescue.targetLeverage}x</div></div>
                            <div><div className="text-[var(--text-3)]">Add margin</div><div className="mt-1 font-semibold text-[var(--text-1)]">{formatPrice(analysis.rescue.addMargin)}</div></div>
                            <div><div className="text-[var(--text-3)]">Close quantity</div><div className="mt-1 font-semibold text-[var(--text-1)]">{formatNumber(analysis.rescue.quantityToClose, 6)}</div></div>
                            <div><div className="text-[var(--text-3)]">Suggested stop</div><div className="mt-1 font-semibold text-[var(--text-1)]">{formatPrice(analysis.rescue.suggestedStopPrice)}</div></div>
                          </div>
                        </div>
                        <div className="lg:col-span-2">
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">Adverse stress test</div>
                          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                            <table className="w-full text-left text-[11px]">
                              <thead className="bg-[var(--bg-elevated)] text-[var(--text-3)]"><tr><th className="px-3 py-2">Move</th><th className="px-3 py-2">Stressed price</th><th className="px-3 py-2">P&amp;L impact</th><th className="px-3 py-2">Equity after</th><th className="px-3 py-2">Status</th></tr></thead>
                              <tbody>{analysis.stressScenarios.map((scenario) => <tr key={scenario.movePct} className="border-t border-[var(--border)]"><td className="px-3 py-2 text-[var(--red)]">{scenario.movePct}%</td><td className="px-3 py-2">{formatPrice(scenario.stressedPrice)}</td><td className="px-3 py-2 text-[var(--red)]">{formatPrice(scenario.estimatedPnl)}</td><td className="px-3 py-2">{formatPrice(scenario.accountEquityAfter)}</td><td className="px-3 py-2"><Pill tone={scenario.liquidationBreached ? 'red' : 'green'}>{scenario.liquidationBreached ? 'Liq breached' : 'Survives'}</Pill></td></tr>)}</tbody>
                            </table>
                          </div>
                          <div className="mt-2 text-[10px] text-[var(--text-3)]">{analysis.rescue.disclaimer} Updated {formatRelativeTime(analysis.calculatedAt)} · {analysis.modelVersion}</div>
                        </div>
                      </div>
                    ) : null}
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
