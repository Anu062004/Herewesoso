'use client';

import { fetchMemos, fetchSignals } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  latestSignalsBySector,
  memoBody,
  memoScore,
  memoSector,
  memoTitle
} from '@/lib/terminal';
import { usePollingResource } from '@/lib/usePollingResource';

import {
  EmptyState,
  ErrorCard,
  PageHeader,
  Panel,
  PanelHeader,
  Pill,
  PollingIndicator,
  SkeletonBlock,
  Sparkline
} from '@/components/terminal/ui';

function tone(score: number) {
  if (score >= 70) return 'text-[var(--green)]';
  if (score >= 40) return 'text-[var(--amber)]';
  return 'text-[var(--red)]';
}

export default function ScannerPage() {
  const signals = usePollingResource({ fetcher: fetchSignals, intervalMs: 60000 });
  const memos = usePollingResource({ fetcher: fetchMemos, intervalMs: 60000 });
  const latestSignals = latestSignalsBySector(signals.data || []).slice(0, 8);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Narrative Scanner"
        description="Sector ranking, narrative momentum, and memo output from the alpha scanner."
        right={<PollingIndicator freshness={signals.freshness} nextPollInMs={signals.nextPollInMs} />}
      />

      <Panel>
        <PanelHeader title="Sector Ranking" accent="purple" subtitle="Latest 8 sectors from /api/signals" />
        <div className="overflow-x-auto">
          {signals.loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : signals.error ? (
            <div className="p-4">
              <ErrorCard message={signals.error} onRetry={() => void signals.refresh()} />
            </div>
          ) : latestSignals.length === 0 ? (
            <EmptyState title="No sectors scored" description="Run the scanner to generate the next sector ranking." />
          ) : (
            <table className="min-w-full text-left">
              <thead className="bg-[var(--bg-panel)] text-[11px] text-[var(--text-3)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Sector</th>
                  <th className="px-4 py-3 font-medium">Combined</th>
                  <th className="px-4 py-3 font-medium">Narrative</th>
                  <th className="px-4 py-3 font-medium">ETF Flow</th>
                  <th className="px-4 py-3 font-medium">Macro</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {latestSignals.map((signal) => (
                  <tr key={signal.sector} className="border-t border-[var(--border)] text-[13px] transition hover:bg-[var(--bg-panel)]">
                    <td className="px-4 py-3 text-[var(--text-1)]">{signal.sector}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={tone(signal.combined_score)}>{signal.combined_score}</span>
                        <Sparkline
                          values={[signal.score_narrative, signal.score_etf_flow, signal.score_macro, signal.combined_score]}
                          tone={signal.combined_score >= 70 ? 'var(--green)' : signal.combined_score >= 40 ? 'var(--amber)' : 'var(--red)'}
                        />
                      </div>
                    </td>
                    <td className={tone(signal.score_narrative) + ' px-4 py-3'}>{signal.score_narrative}</td>
                    <td className={tone(signal.score_etf_flow) + ' px-4 py-3'}>{signal.score_etf_flow}</td>
                    <td className={tone(signal.score_macro) + ' px-4 py-3'}>{signal.score_macro}</td>
                    <td className="px-4 py-3 text-[var(--text-3)]">{formatDateTime(signal.created_at || null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Scanner Memos" accent="purple" subtitle="Recent memo output from /api/memos" />
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {memos.loading ? (
            <>
              <SkeletonBlock className="h-36 w-full" />
              <SkeletonBlock className="h-36 w-full" />
            </>
          ) : memos.error ? (
            <div className="lg:col-span-2">
              <ErrorCard message={memos.error} onRetry={() => void memos.refresh()} />
            </div>
          ) : (memos.data || []).length === 0 ? (
            <div className="lg:col-span-2">
              <EmptyState title="No memos yet" description="Narrative scanner memos will appear here after a run." />
            </div>
          ) : (
            (memos.data || []).slice(0, 4).map((memo) => {
              const score = memoScore(memo);
              return (
                <article key={memo.id || `${memo.content}-${memo.created_at}`} className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[15px] font-medium text-[var(--text-1)]">{memoTitle(memo)}</div>
                    {score !== null ? (
                      <Pill tone={score >= 70 ? 'green' : score >= 40 ? 'amber' : 'red'}>{score}</Pill>
                    ) : null}
                  </div>
                  <div className="mt-3 text-[13px] leading-6 text-[var(--text-2)]">{memoBody(memo)}</div>
                  <div className="mt-4 flex items-center gap-2 text-[11px] text-[var(--text-3)]">
                    <Pill tone="purple">{memoSector(memo)}</Pill>
                    <span>{formatDateTime(memo.created_at || null)}</span>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );
}
