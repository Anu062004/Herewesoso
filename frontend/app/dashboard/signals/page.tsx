'use client';

import { fetchSignals } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { getSignalDirection, latestSignalsBySector } from '@/lib/terminal';
import { usePollingResource } from '@/lib/usePollingResource';

import {
  EmptyState,
  ErrorCard,
  PageHeader,
  Panel,
  PanelHeader,
  PollingIndicator,
  SkeletonBlock
} from '@/components/terminal/ui';

function heatmapColor(score: number) {
  if (score >= 80) return 'rgba(16,185,129,0.25)';
  if (score >= 60) return 'rgba(16,185,129,0.1)';
  if (score >= 40) return 'rgba(245,158,11,0.1)';
  if (score >= 20) return 'rgba(239,68,68,0.1)';
  return 'rgba(239,68,68,0.25)';
}

function directionClass(tone: 'green' | 'amber' | 'red') {
  if (tone === 'green') return 'text-[var(--green)]';
  if (tone === 'amber') return 'text-[var(--amber)]';
  return 'text-[var(--red)]';
}

export default function SignalsPage() {
  const signals = usePollingResource({ fetcher: fetchSignals, intervalMs: 60000 });
  const latestSignals = latestSignalsBySector(signals.data || []).slice(0, 8);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Signals"
        description="Sector heatmap and expanded signal detail from /api/signals."
        right={<PollingIndicator freshness={signals.freshness} nextPollInMs={signals.nextPollInMs} />}
      />

      <Panel>
        <PanelHeader title="Sector Heatmap" accent="purple" />
        <div className="p-4">
          {signals.loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-28 w-full" />
              ))}
            </div>
          ) : signals.error ? (
            <ErrorCard message={signals.error} onRetry={() => void signals.refresh()} />
          ) : latestSignals.length === 0 ? (
            <EmptyState title="No signal heatmap" description="The sector grid will populate after the next narrative cycle." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {latestSignals.map((signal) => (
                <div
                  key={signal.sector}
                  className="rounded-[10px] border border-[var(--border)] p-4"
                  style={{ backgroundColor: heatmapColor(signal.combined_score) }}
                >
                  <div className="text-[13px] text-[var(--text-2)]">{signal.sector}</div>
                  <div className="mt-4 text-[28px] font-semibold text-[var(--text-1)]">{signal.combined_score}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Signal Detail"
          accent="purple"
          right={<div className="text-[11px] text-[var(--text-3)]">Last updated {formatDateTime(latestSignals[0]?.created_at || null)}</div>}
        />
        <div className="overflow-x-auto">
          {signals.loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : signals.error ? (
            <div className="p-4">
              <ErrorCard message={signals.error} onRetry={() => void signals.refresh()} />
            </div>
          ) : latestSignals.length === 0 ? (
            <EmptyState title="No detailed signals" description="Expanded signal rows will appear once sectors are scored." />
          ) : (
            <table className="min-w-full text-left">
              <thead className="bg-[var(--bg-panel)] text-[11px] text-[var(--text-3)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Sector</th>
                  <th className="px-4 py-3 font-medium">News Signal</th>
                  <th className="px-4 py-3 font-medium">ETF Flow</th>
                  <th className="px-4 py-3 font-medium">Macro Signal</th>
                  <th className="px-4 py-3 font-medium">Combined</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {latestSignals.map((signal) => {
                  const news = getSignalDirection(signal.score_narrative);
                  const etf = getSignalDirection(signal.score_etf_flow);
                  const macroSignal = getSignalDirection(signal.score_macro);

                  return (
                    <tr key={signal.sector} className="border-t border-[var(--border)] text-[13px] transition hover:bg-[var(--bg-panel)]">
                      <td className="px-4 py-3 text-[var(--text-1)]">{signal.sector}</td>
                      <td className={'px-4 py-3 ' + directionClass(news.tone)}>
                        {news.arrow} {signal.score_narrative}
                      </td>
                      <td className={'px-4 py-3 ' + directionClass(etf.tone)}>
                        {etf.arrow} {signal.score_etf_flow}
                      </td>
                      <td className={'px-4 py-3 ' + directionClass(macroSignal.tone)}>
                        {macroSignal.arrow} {signal.score_macro}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-1)]">{signal.combined_score}</td>
                      <td className="px-4 py-3 text-[var(--text-3)]">{formatDateTime(signal.created_at || null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
    </div>
  );
}
