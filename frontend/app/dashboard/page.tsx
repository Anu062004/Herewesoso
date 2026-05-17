'use client';

import Link from 'next/link';

import { fetchAlerts, fetchMacro, fetchPositions, fetchSignals } from '@/lib/api';
import { formatDateTime, formatPercent, formatPrice } from '@/lib/format';
import {
  alertSourceLabel,
  alertTone,
  computeDistancePercent,
  cryptoSensitivity,
  highestRiskSummary,
  latestRiskBySymbol,
  latestSignalsBySector,
  macroImpact,
  resolvePositions,
  riskLabel,
  sortMacroEvents,
  unreadAlertCount
} from '@/lib/terminal';
import { usePollingResource } from '@/lib/usePollingResource';

import { BellIcon, ShieldIcon } from '@/components/terminal/icons';
import {
  DistanceBar,
  Dot,
  EmptyState,
  ErrorCard,
  MetricCard,
  PageHeader,
  Panel,
  PanelHeader,
  Pill,
  PollingIndicator,
  SkeletonBlock,
  Sparkline
} from '@/components/terminal/ui';

function scoreTone(score: number) {
  if (score >= 70) {
    return 'text-[var(--green)]';
  }

  if (score >= 40) {
    return 'text-[var(--amber)]';
  }

  return 'text-[var(--red)]';
}

export default function DashboardPage() {
  const signals = usePollingResource({ fetcher: fetchSignals, intervalMs: 60000 });
  const positions = usePollingResource({ fetcher: fetchPositions, intervalMs: 30000 });
  const alerts = usePollingResource({ fetcher: fetchAlerts, intervalMs: 30000 });
  const macro = usePollingResource({ fetcher: fetchMacro, intervalMs: 300000 });

  const latestSignals = latestSignalsBySector(signals.data || []).slice(0, 8);
  const positionsState = positions.data || { live: null, history: [] };
  const openPositions = resolvePositions(positionsState);
  const latestRisk = latestRiskBySymbol(positionsState.history);
  const topSignal = latestSignals[0];
  const highestRisk = highestRiskSummary(positionsState);
  const unreadCount = unreadAlertCount(alerts.data || []);
  const macroEvents = sortMacroEvents(macro.data || []).slice(0, 6);

  return (
    <div className="space-y-4">
      {openPositions.fallbackActive && openPositions.positions.length > 0 ? (
        <div className="flex h-9 items-center rounded-[10px] border border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.12)] px-4 text-[13px] text-[var(--amber)]">
          ⚠ SoDEX position fetch failed — showing demo {openPositions.positions[0]?.symbol || 'BTC-USD'} testnet position
        </div>
      ) : null}

      <PageHeader title="Dashboard" description="Cross-market narrative, macro, and liquidation intelligence in one terminal view." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Top Sector Score"
          value={topSignal ? topSignal.combined_score : '—'}
          tone="purple"
          supporting={topSignal ? <span className="text-[var(--purple)]">{topSignal.sector}</span> : 'Awaiting signals'}
        />
        <MetricCard
          label="SoDEX Testnet Positions"
          value={openPositions.positions.length}
          supporting={`${openPositions.fallbackActive ? 'Fallback' : 'Live'} position view`}
        />
        <MetricCard
          label="Highest Risk Level"
          value={highestRisk.label}
          tone={highestRisk.tone === 'green' ? 'green' : highestRisk.tone === 'amber' ? 'amber' : 'red'}
          supporting="Safe / Warning / Critical"
        />
        <MetricCard
          label="Unread Alerts"
          value={unreadCount}
          tone={unreadCount > 0 ? 'red' : 'default'}
          supporting={unreadCount > 0 ? <Pill tone="red">{unreadCount} pending</Pill> : 'No active alert backlog'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Narrative Alpha Scanner"
              accent="purple"
              right={<PollingIndicator freshness={signals.freshness} nextPollInMs={signals.nextPollInMs} />}
            />
            <div className="overflow-x-auto">
              {signals.loading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <SkeletonBlock key={index} className="h-12 w-full" />
                  ))}
                </div>
              ) : signals.error ? (
                <div className="p-4">
                  <ErrorCard message={signals.error} onRetry={() => void signals.refresh()} />
                </div>
              ) : latestSignals.length === 0 ? (
                <EmptyState
                  title="No signal rows"
                  description="Narrative scanner results will appear here after the next cycle."
                />
              ) : (
                <table className="min-w-full text-left">
                  <thead className="bg-[var(--bg-panel)] text-[11px] text-[var(--text-3)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Sector</th>
                      <th className="px-4 py-3 font-medium">Score</th>
                      <th className="px-4 py-3 font-medium">News Signal</th>
                      <th className="px-4 py-3 font-medium">ETF Flow</th>
                      <th className="px-4 py-3 font-medium">Macro Signal</th>
                      <th className="px-4 py-3 font-medium">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestSignals.map((signal) => (
                      <tr key={signal.sector} className="border-t border-[var(--border)] text-[13px] transition hover:bg-[var(--bg-panel)]">
                        <td className="px-4 py-3 text-[var(--text-1)]">{signal.sector}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className={scoreTone(signal.combined_score)}>{signal.combined_score}</span>
                            <Sparkline
                              values={[
                                Math.max(signal.score_narrative - 8, 0),
                                signal.score_etf_flow,
                                signal.score_macro,
                                signal.combined_score
                              ]}
                              tone={
                                signal.combined_score >= 70
                                  ? 'var(--green)'
                                  : signal.combined_score >= 40
                                    ? 'var(--amber)'
                                    : 'var(--red)'
                              }
                            />
                          </div>
                        </td>
                        <td className={scoreTone(signal.score_narrative) + ' px-4 py-3'}>{signal.score_narrative}</td>
                        <td className={scoreTone(signal.score_etf_flow) + ' px-4 py-3'}>{signal.score_etf_flow}</td>
                        <td className={scoreTone(signal.score_macro) + ' px-4 py-3'}>{signal.score_macro}</td>
                        <td className="px-4 py-3 text-[var(--text-2)]">
                          {signal.combined_score >= 70 ? 'Acceleration' : signal.combined_score >= 40 ? 'Balanced' : 'Weakening'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Macro Pressure" accent="amber" />
            <div className="overflow-x-auto">
              {macro.loading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <SkeletonBlock key={index} className="h-12 w-full" />
                  ))}
                </div>
              ) : macro.error ? (
                <div className="p-4">
                  <ErrorCard message={macro.error} onRetry={() => void macro.refresh()} />
                </div>
              ) : macroEvents.length === 0 ? (
                <EmptyState title="No macro events" description="Upcoming macro releases will populate this panel when available." />
              ) : (
                <table className="min-w-full text-left">
                  <thead className="bg-[var(--bg-panel)] text-[11px] text-[var(--text-3)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Event</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Impact</th>
                      <th className="px-4 py-3 font-medium">Crypto Sensitivity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {macroEvents.map((event, index) => {
                      const impact = macroImpact(event);
                      return (
                        <tr key={`${event.name}-${event.eventTime}-${index}`} className="border-t border-[var(--border)] text-[13px]">
                          <td className="px-4 py-3 text-[var(--text-1)]">{event.name || 'Macro Event'}</td>
                          <td className="px-4 py-3 text-[var(--text-2)]">{formatDateTime(event.eventTime || event.releaseDate || null)}</td>
                          <td className="px-4 py-3">
                            <Pill tone={impact === 'High' ? 'red' : impact === 'Medium' ? 'amber' : 'gray'}>{impact}</Pill>
                          </td>
                          <td className="px-4 py-3 text-[var(--text-2)]">{cryptoSensitivity(event)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Liquidation Shield"
              accent="cyan"
              right={<PollingIndicator freshness={positions.freshness} nextPollInMs={positions.nextPollInMs} />}
            />
            <div className="space-y-3 p-4">
              {positions.loading ? (
                <>
                  <SkeletonBlock className="h-28 w-full" />
                  <SkeletonBlock className="h-28 w-full" />
                </>
              ) : positions.error ? (
                <ErrorCard message={positions.error} onRetry={() => void positions.refresh()} />
              ) : openPositions.positions.length === 0 ? (
                <EmptyState
                  title="No open positions"
                  description="Liquidation buffers will show here when SoDEX positions are active."
                />
              ) : (
                openPositions.positions.map((position) => {
                  const snapshot = latestRisk.get(position.symbol);
                  const distance = snapshot?.distance_to_liquidation_pct ?? computeDistancePercent(position);
                  const risk = riskLabel({
                    distance,
                    riskLevel: snapshot?.risk_level,
                    riskScore: snapshot?.risk_score
                  });

                  return (
                    <div key={position.symbol} className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="text-[14px] font-medium text-[var(--text-1)]">{position.symbol}</div>
                            {openPositions.fallbackActive ? <Pill tone="gray">Demo Position</Pill> : null}
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--text-3)]">{risk.label}</div>
                        </div>
                        <ShieldIcon className={risk.tone === 'green' ? 'h-4 w-4 text-[var(--green)]' : risk.tone === 'amber' ? 'h-4 w-4 text-[var(--amber)]' : 'h-4 w-4 text-[var(--red)]'} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                        <div>
                          <div className="text-[var(--text-3)]">Entry Price</div>
                          <div className="mt-1 text-[var(--text-1)]">{formatPrice(position.entryPrice)}</div>
                        </div>
                        <div>
                          <div className="text-[var(--text-3)]">Current Price</div>
                          <div className="mt-1 text-[var(--text-1)]">{formatPrice(position.markPrice)}</div>
                        </div>
                        <div>
                          <div className="text-[var(--text-3)]">Liquidation Price</div>
                          <div className="mt-1 text-[var(--text-1)]">{formatPrice(position.liquidationPrice)}</div>
                        </div>
                        <div>
                          <div className="text-[var(--text-3)]">Distance</div>
                          <div className={risk.tone === 'green' ? 'mt-1 text-[var(--green)]' : risk.tone === 'amber' ? 'mt-1 text-[var(--amber)]' : 'mt-1 text-[var(--red)]'}>
                            {formatPercent(distance, 1)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <DistanceBar percent={distance} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Recent Alerts"
              right={<PollingIndicator freshness={alerts.freshness} nextPollInMs={alerts.nextPollInMs} />}
            />
            <div className="p-4">
              {alerts.loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <SkeletonBlock key={index} className="h-14 w-full" />
                  ))}
                </div>
              ) : alerts.error ? (
                <ErrorCard message={alerts.error} onRetry={() => void alerts.refresh()} />
              ) : (alerts.data || []).length === 0 ? (
                <EmptyState title="No recent alerts" description="Alert traffic will appear here as the system monitors risk and signals." />
              ) : (
                <>
                  <div className="space-y-2">
                    {(alerts.data || []).slice(0, 5).map((alert) => (
                      <div key={alert.id || `${alert.message}-${alert.created_at}`} className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-3">
                        <div className="flex items-start gap-3">
                          <Dot tone={alertTone(alert.severity)} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] text-[var(--text-1)]">{alert.message}</div>
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-3)]">
                              <span>{alertSourceLabel(alert.alert_type)}</span>
                              <span>•</span>
                              <span>{formatDateTime(alert.created_at || null)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Link href="/dashboard/alerts" className="text-[12px] text-[var(--blue)]">
                      View All
                    </Link>
                  </div>
                </>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
