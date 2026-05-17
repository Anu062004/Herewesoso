'use client';

import { fetchMemos } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { memoBody, memoScore, memoSector, memoTitle } from '@/lib/terminal';
import { usePollingResource } from '@/lib/usePollingResource';

import { CompassIcon } from '@/components/terminal/icons';
import {
  EmptyState,
  ErrorCard,
  PageHeader,
  Panel,
  PanelHeader,
  Pill,
  SkeletonBlock
} from '@/components/terminal/ui';

export default function TradeMemosPage() {
  const memos = usePollingResource({ fetcher: fetchMemos, intervalMs: 60000 });

  return (
    <div className="space-y-4">
      <PageHeader title="Trade Memos" description="Scanner and shield memo output collected from /api/memos." />

      <Panel>
        <PanelHeader title="Memo Archive" accent="purple" />
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {memos.loading ? (
            <>
              <SkeletonBlock className="h-40 w-full" />
              <SkeletonBlock className="h-40 w-full" />
            </>
          ) : memos.error ? (
            <div className="lg:col-span-2">
              <ErrorCard message={memos.error} onRetry={() => void memos.refresh()} />
            </div>
          ) : (memos.data || []).length === 0 ? (
            <div className="lg:col-span-2">
              <EmptyState
                title="No trade memos yet"
                description="Run the Narrative Scanner to generate memos."
                icon={<CompassIcon className="h-6 w-6 text-[var(--text-3)]" />}
              />
            </div>
          ) : (
            (memos.data || []).map((memo) => {
              const score = memoScore(memo);
              return (
                <article key={memo.id || `${memo.content}-${memo.created_at}`} className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[15px] font-medium text-[var(--text-1)]">{memoTitle(memo)}</div>
                    {score !== null ? (
                      <Pill tone={score >= 70 ? 'green' : score >= 40 ? 'amber' : 'red'}>{score}</Pill>
                    ) : null}
                  </div>
                  <div className="mt-3 text-[13px] leading-6 text-[var(--text-2)]">{memoBody(memo)}</div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-3)]">
                    <Pill tone="purple" className="bg-[rgba(139,92,246,0.15)]">
                      {memoSector(memo)}
                    </Pill>
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
