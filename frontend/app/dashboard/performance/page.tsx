'use client';

import { fetchPerformance } from '@/lib/api';
import { formatCompactNumber, formatDateTime, formatDuration, formatNumber, formatPercent, formatPrice } from '@/lib/format';
import { usePollingResource } from '@/lib/usePollingResource';

import {
  EmptyState,
  ErrorCard,
  MetricCard,
  PageHeader,
  Panel,
  PanelHeader,
  Pill,
  PollingIndicator,
  SkeletonBlock,
  ValueChange
} from '@/components/terminal/ui';

function readinessTone(status: string): 'green' | 'amber' | 'red' | 'gray' {
  if (status === 'production_evidence' || status === 'early_evidence') return 'green';
  if (status === 'collecting') return 'amber';
  if (status === 'insufficient_data') return 'gray';
  return 'red';
}

function statusTone(status: string): 'green' | 'amber' | 'red' | 'gray' | 'cyan' {
  if (status === 'READY') return 'green';
  if (status === 'PENDING') return 'amber';
  if (status === 'FAILED') return 'red';
  return 'gray';
}

export default function PerformancePage() {
  const performance = usePollingResource({ fetcher: fetchPerformance, intervalMs: 60000 });
  const data = performance.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Performance Evidence"
        description="Signal outcomes, alert validation, portfolio risk, and execution proof collected from the live agent loop."
        right={<PollingIndicator freshness={performance.freshness} nextPollInMs={performance.nextPollInMs} />}
      />

      {performance.loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-32 w-full" />)}
        </div>
      ) : performance.error ? (
        <ErrorCard message={performance.error} onRetry={() => void performance.refresh()} />
      ) : !data ? (
        <EmptyState title="No performance report" description="The backend has not returned a performance report yet." />
      ) : (
        <>
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={readinessTone(data.summary.readiness.status)}>{data.summary.readiness.status.replace(/_/g, ' ')}</Pill>
                  {data.summary.modelVersions.map((version) => <Pill key={version} tone="gray">{version}</Pill>)}
                </div>
                <p className="mt-2 text-[13px] leading-5 text-[var(--text-2)]">{data.summary.readiness.message}</p>
              </div>
              <div className="text-[12px] text-[var(--text-3)]">Generated {formatDateTime(data.generatedAt)}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Validated Signals" value={formatNumber(data.summary.validatedSignals)} supporting={`${data.summary.pendingSignals} pending outcomes`} />
            <MetricCard label="24h Hit Rate" value={data.summary.winRate === null ? '-' : formatPercent(data.summary.winRate, 1)} tone={data.summary.winRate && data.summary.winRate >= 50 ? 'green' : 'default'} supporting="Positive 24h forward return" />
            <MetricCard label="24h Alpha" value={<ValueChange value={data.summary.alpha24h} />} supporting={`Benchmark ${formatPercent(data.summary.benchmarkReturn24h, 2)}`} />
            <MetricCard label="Max Drawdown" value={formatPercent(data.summary.maxDrawdown24h, 2)} tone={data.summary.maxDrawdown24h && data.summary.maxDrawdown24h > 10 ? 'red' : 'default'} supporting="Resolved signal equity curve" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
            <Panel>
              <PanelHeader title="Signal Outcome Buckets" accent="purple" />
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-[var(--bg-panel)] text-[11px] text-[var(--text-3)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Signal</th>
                      <th className="px-4 py-3 font-medium">Logged</th>
                      <th className="px-4 py-3 font-medium">Validated</th>
                      <th className="px-4 py-3 font-medium">Hit Rate</th>
                      <th className="px-4 py-3 font-medium">Avg 24h</th>
                      <th className="px-4 py-3 font-medium">Alpha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bySignal.map((bucket) => (
                      <tr key={bucket.signal} className="border-t border-[var(--border)] text-[13px]">
                        <td className="px-4 py-3"><Pill tone={bucket.signal === 'STRONG_BUY' || bucket.signal === 'BUY' ? 'green' : bucket.signal === 'WATCH' ? 'amber' : 'gray'}>{bucket.signal}</Pill></td>
                        <td className="px-4 py-3 text-[var(--text-1)]">{formatNumber(bucket.count)}</td>
                        <td className="px-4 py-3 text-[var(--text-1)]">{formatNumber(bucket.validated)}</td>
                        <td className="px-4 py-3 text-[var(--text-2)]">{formatPercent(bucket.hitRate, 1)}</td>
                        <td className="px-4 py-3"><ValueChange value={bucket.avgReturn24h} /></td>
                        <td className="px-4 py-3"><ValueChange value={bucket.avgAlpha24h} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Validation Health" accent="amber" />
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <div className="text-[var(--text-3)]">Alerts</div>
                    <div className="mt-1 text-[18px] font-semibold text-[var(--text-1)]">{formatNumber(data.alertValidation.totalAlerts)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-3)]">Liquidation Alerts</div>
                    <div className="mt-1 text-[18px] font-semibold text-[var(--amber)]">{formatNumber(data.alertValidation.liquidationAlerts)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-3)]">Avg Risk Score</div>
                    <div className="mt-1 text-[18px] font-semibold text-[var(--text-1)]">{formatNumber(data.alertValidation.avgRiskScore, 1)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-3)]">Median Latency</div>
                    <div className="mt-1 text-[18px] font-semibold text-[var(--text-1)]">{formatDuration(data.alertValidation.medianAlertLatencyMs)}</div>
                  </div>
                </div>
                <div className="border-t border-[var(--border)] pt-4">
                  <div className="text-[12px] text-[var(--text-3)]">Execution Ledger</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Pill tone="cyan">{formatNumber(data.execution.total)} total</Pill>
                    <Pill tone="green">{formatNumber(data.execution.succeeded)} succeeded</Pill>
                    <Pill tone="red">{formatNumber(data.execution.rejected)} rejected</Pill>
                    <Pill tone="gray">{formatPercent(data.execution.successRate, 1)} success</Pill>
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.7fr)_minmax(0,1.3fr)]">
            <Panel>
              <PanelHeader title="Portfolio Shield Snapshot" accent="cyan" />
              {data.portfolio ? (
                <div className="space-y-4 p-4">
                  <div className="grid grid-cols-2 gap-3 text-[12px]">
                    <div><div className="text-[var(--text-3)]">Account Value</div><div className="mt-1 text-[var(--text-1)]">{formatPrice(data.portfolio.account_value)}</div></div>
                    <div><div className="text-[var(--text-3)]">Available Margin</div><div className="mt-1 text-[var(--text-1)]">{formatPrice(data.portfolio.available_margin)}</div></div>
                    <div><div className="text-[var(--text-3)]">Gross Notional</div><div className="mt-1 text-[var(--text-1)]">{formatCompactNumber(data.portfolio.gross_notional)}</div></div>
                    <div><div className="text-[var(--text-3)]">Net Exposure</div><div className="mt-1 text-[var(--text-1)]">{formatCompactNumber(data.portfolio.net_exposure)}</div></div>
                    <div><div className="text-[var(--text-3)]">Max Risk</div><div className="mt-1 text-[var(--amber)]">{formatNumber(data.portfolio.max_risk_score)}</div></div>
                    <div><div className="text-[var(--text-3)]">Cluster Count</div><div className="mt-1 text-[var(--text-1)]">{formatNumber(data.portfolio.liquidation_cluster_count)}</div></div>
                  </div>
                  <p className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-panel)] p-3 text-[13px] leading-5 text-[var(--text-2)]">{data.portfolio.recommended_action}</p>
                </div>
              ) : (
                <EmptyState title="No portfolio snapshot" description="The shield agent will write portfolio-level exposure after the next position-monitoring cycle." />
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Recent Signal Outcomes" accent="blue" />
              {data.recentOutcomes.length === 0 ? (
                <EmptyState title="No outcome rows" description="New scanner cycles will create pending outcome rows for forward-return validation." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead className="bg-[var(--bg-panel)] text-[11px] text-[var(--text-3)]">
                      <tr>
                        <th className="px-4 py-3 font-medium">Time</th>
                        <th className="px-4 py-3 font-medium">Sector</th>
                        <th className="px-4 py-3 font-medium">Signal</th>
                        <th className="px-4 py-3 font-medium">Score</th>
                        <th className="px-4 py-3 font-medium">24h</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentOutcomes.slice(0, 12).map((row) => (
                        <tr key={row.id || `${row.signal_at}-${row.sector}`} className="border-t border-[var(--border)] text-[13px]">
                          <td className="px-4 py-3 text-[var(--text-2)]">{formatDateTime(row.signal_at)}</td>
                          <td className="px-4 py-3 text-[var(--text-1)]">{row.sector}</td>
                          <td className="px-4 py-3"><Pill tone={row.signal === 'STRONG_BUY' || row.signal === 'BUY' ? 'green' : row.signal === 'WATCH' ? 'amber' : 'gray'}>{row.signal}</Pill></td>
                          <td className="px-4 py-3 text-[var(--text-1)]">{row.combined_score}</td>
                          <td className="px-4 py-3"><ValueChange value={row.forward_return_24h} /></td>
                          <td className="px-4 py-3"><Pill tone={statusTone(row.outcome_status)}>{row.outcome_status}</Pill></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
