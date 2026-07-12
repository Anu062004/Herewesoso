'use client';

import { useEffect, useState } from 'react';
import { fetchMemos, fetchNarrativePreferences, fetchSignals, saveNarrativePreferences } from '@/lib/api';
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
import { Button } from '@/components/terminal/ui';

const LIFECYCLE_STAGES = ['EMERGING', 'ACCELERATING', 'ESTABLISHED', 'CROWDED', 'FADING', 'REVERSING'];

function tone(score: number) {
  if (score >= 70) return 'text-[var(--green)]';
  if (score >= 40) return 'text-[var(--amber)]';
  return 'text-[var(--red)]';
}

function stageTone(stage?: string) {
  if (stage === 'EMERGING' || stage === 'ACCELERATING') return 'green' as const;
  if (stage === 'CROWDED' || stage === 'REVERSING') return 'red' as const;
  if (stage === 'FADING') return 'amber' as const;
  return 'purple' as const;
}

export default function ScannerPage() {
  const signals = usePollingResource({ fetcher: fetchSignals, intervalMs: 60000 });
  const memos = usePollingResource({ fetcher: fetchMemos, intervalMs: 60000 });
  const latestSignals = latestSignalsBySector(signals.data || []).slice(0, 8);
  const [preferences, setPreferences] = useState({ stages: ['EMERGING', 'ACCELERATING'], minConfidence: 60, maxCrowding: 65 });
  const [preferenceStatus, setPreferenceStatus] = useState('');

  useEffect(() => {
    void fetchNarrativePreferences().then(setPreferences).catch(() => undefined);
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Narrative Scanner"
        description="Sector ranking, narrative momentum, and memo output from the alpha scanner."
        right={<PollingIndicator freshness={signals.freshness} nextPollInMs={signals.nextPollInMs} />}
      />

      <Panel>
        <PanelHeader title="Narrative Radar" accent="purple" subtitle="Lifecycle, momentum, confirmation, and crowding ranked by opportunity" />
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
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium">Opportunity</th>
                  <th className="px-4 py-3 font-medium">Confidence</th>
                  <th className="px-4 py-3 font-medium">Velocity</th>
                  <th className="px-4 py-3 font-medium">Market</th>
                  <th className="px-4 py-3 font-medium">Crowding</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {latestSignals.map((signal) => (
                  <tr key={signal.sector} className="border-t border-[var(--border)] text-[13px] transition hover:bg-[var(--bg-panel)]">
                    <td className="px-4 py-3 text-[var(--text-1)]">
                      <div>{signal.sector}</div>
                      <div className="mt-1 text-[11px] text-[var(--text-3)]">{signal.sub_narrative || 'General'}</div>
                    </td>
                    <td className="px-4 py-3"><Pill tone={stageTone(signal.lifecycle_stage)}>{signal.lifecycle_stage || signal.signal}</Pill></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={tone(signal.combined_score)}>{signal.combined_score}</span>
                        <Sparkline
                          values={[signal.score_narrative, signal.score_etf_flow, signal.score_macro, signal.combined_score]}
                          tone={signal.combined_score >= 70 ? 'var(--green)' : signal.combined_score >= 40 ? 'var(--amber)' : 'var(--red)'}
                        />
                      </div>
                    </td>
                    <td className={tone(signal.confidence || 0) + ' px-4 py-3'}>{signal.confidence ?? '—'}</td>
                    <td className={tone(signal.velocity_score || 0) + ' px-4 py-3'}>{signal.velocity_score ?? '—'}</td>
                    <td className={tone(signal.market_confirmation_score || 0) + ' px-4 py-3'}>{signal.market_confirmation_score ?? '—'}</td>
                    <td className={tone(100 - (signal.crowding_score || 0)) + ' px-4 py-3'}>{signal.crowding_score ?? '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-3)]">{formatDateTime(signal.created_at || null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="My Narrative Alerts" accent="amber" subtitle="Wallet-specific lifecycle and quality thresholds" />
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            {LIFECYCLE_STAGES.map((stage) => {
              const selected = preferences.stages.includes(stage);
              return (
                <button key={stage} type="button" onClick={() => setPreferences((current) => ({
                  ...current,
                  stages: selected ? current.stages.filter((value) => value !== stage) : [...current.stages, stage]
                }))}>
                  <Pill tone={selected ? stageTone(stage) : 'gray'}>{stage}</Pill>
                </button>
              );
            })}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-[12px] text-[var(--text-2)]">
              <span className="flex justify-between"><span>Minimum confidence</span><span>{preferences.minConfidence}</span></span>
              <input className="mt-2 w-full accent-[var(--brand)]" type="range" min="0" max="100" value={preferences.minConfidence} onChange={(event) => setPreferences((current) => ({ ...current, minConfidence: Number(event.target.value) }))} />
            </label>
            <label className="text-[12px] text-[var(--text-2)]">
              <span className="flex justify-between"><span>Maximum crowding</span><span>{preferences.maxCrowding}</span></span>
              <input className="mt-2 w-full accent-[var(--brand)]" type="range" min="0" max="100" value={preferences.maxCrowding} onChange={(event) => setPreferences((current) => ({ ...current, maxCrowding: Number(event.target.value) }))} />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => {
              setPreferenceStatus('Saving...');
              void saveNarrativePreferences(preferences)
                .then((saved) => { setPreferences(saved); setPreferenceStatus('Saved for this wallet'); })
                .catch(() => setPreferenceStatus('Could not save preferences'));
            }}>Save alert preferences</Button>
            <span className="text-[11px] text-[var(--text-3)]">{preferenceStatus}</span>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Why now" accent="cyan" subtitle="Catalysts, leading assets, evidence breadth, and wallet relevance" />
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {latestSignals.slice(0, 4).map((signal) => {
            const evidence = signal.evidence || {};
            const relevance = (evidence.portfolioRelevance || {}) as {
              exposurePct?: number; suggestedMaxPct?: number; overexposed?: boolean; matchedAssets?: string[];
            };
            return (
              <article key={`evidence-${signal.sector}`} className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-semibold text-[var(--text-1)]">{signal.sector} · {signal.sub_narrative || 'General'}</div>
                    <div className="mt-1 text-[12px] text-[var(--text-3)]">{evidence.primaryCatalyst || 'Organic attention'}</div>
                  </div>
                  <Pill tone={stageTone(signal.lifecycle_stage)}>{signal.lifecycle_stage || signal.signal}</Pill>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-md border border-[var(--border)] p-2"><div className="text-[var(--text-3)]">Sources</div><div className="mt-1 text-[var(--text-1)]">{evidence.uniqueSources?.length || 0}</div></div>
                  <div className="rounded-md border border-[var(--border)] p-2"><div className="text-[var(--text-3)]">1h / 24h</div><div className="mt-1 text-[var(--text-1)]">{evidence.counts?.hour1 || 0} / {evidence.counts?.hours24 || 0}</div></div>
                  <div className="rounded-md border border-[var(--border)] p-2"><div className="text-[var(--text-3)]">Acceleration</div><div className="mt-1 text-[var(--text-1)]">{signal.acceleration_score ?? '—'}</div></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(evidence.leadingAssets || []).map((asset) => <Pill key={asset} tone="gray">{asset}</Pill>)}
                </div>
                <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[12px] text-[var(--text-2)]">
                  Wallet exposure: <span className="text-[var(--text-1)]">{relevance.exposurePct ?? 0}%</span>
                  <span className="mx-2 text-[var(--text-3)]">·</span>
                  Suggested maximum: <span className={relevance.overexposed ? 'text-[var(--red)]' : 'text-[var(--green)]'}>{relevance.suggestedMaxPct ?? 0}%</span>
                </div>
                {evidence.matchedHeadlines?.[0] ? (
                  <p className="mt-3 text-[12px] leading-5 text-[var(--text-2)]">{evidence.matchedHeadlines[0].title}</p>
                ) : null}
                {evidence.invalidation ? <p className="mt-2 text-[11px] leading-5 text-[var(--text-3)]">Invalidation: {evidence.invalidation}</p> : null}
              </article>
            );
          })}
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
