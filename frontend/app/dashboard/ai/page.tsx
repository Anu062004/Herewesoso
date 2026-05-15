'use client';

import { useEffect, useState } from 'react';
import { runAnalysis, fetchSignals, type AnalysisResult, type AnalysisSector } from '@/lib/api';
import type { SignalRow } from '@/lib/types';

const SECTORS = ['DeFi', 'AI', 'RWA', 'L1', 'L2', 'GameFi', 'DePIN', 'Meme'] as const;

function signalColor(signal: string) {
  if (signal === 'STRONG_BUY') return 'border-safe/30 bg-safe/10 text-safe';
  if (signal === 'BUY') return 'border-accent/25 bg-accent/10 text-accent';
  if (signal === 'WATCH') return 'border-caution/25 bg-caution/10 text-caution';
  if (signal === 'NEUTRAL') return 'border-white/10 bg-white/5 text-zinc-300';
  return 'border-danger/25 bg-danger/10 text-danger';
}

function signalBg(signal: string) {
  if (signal === 'STRONG_BUY') return 'bg-safe';
  if (signal === 'BUY') return 'bg-accent';
  if (signal === 'WATCH') return 'bg-caution';
  if (signal === 'NEUTRAL') return 'bg-zinc-500';
  return 'bg-danger';
}

function ScoreBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
        <span>{label}</span><span>{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${Math.max(value, 2)}%` }} />
      </div>
    </div>
  );
}

function SectorCard({ sector }: { sector: AnalysisSector }) {
  const [expanded, setExpanded] = useState(false);
  const tone = signalColor(sector.signal);

  return (
    <article className={`rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-headline text-xl font-bold text-white">{sector.sector}</h3>
        <span className="font-mono text-xs tracking-widest">{sector.signal}</span>
      </div>
      <p className="mt-2 font-mono text-3xl font-bold text-white">
        {sector.combined_score}<span className="text-sm text-zinc-500">/100</span>
      </p>

      <div className="mt-4 space-y-2">
        <ScoreBar value={sector.score_narrative} color="bg-blue-400" label="Narrative" />
        <ScoreBar value={sector.score_etf_flow} color="bg-purple-400" label="ETF Flow" />
        <ScoreBar value={sector.score_macro} color="bg-amber-400" label="Macro" />
      </div>

      {sector.reasoning && (
        <div className="mt-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition"
          >
            {expanded ? '▲ Hide reasoning' : '▼ AI reasoning'}
          </button>
          {expanded && (
            <p className="mt-2 text-xs leading-5 text-zinc-300 border-t border-white/5 pt-3">
              {sector.reasoning}
            </p>
          )}
        </div>
      )}

      {sector.top_headlines?.length > 0 && (
        <div className="mt-3 space-y-1">
          {sector.top_headlines.slice(0, 2).map((h, i) => (
            <p key={i} className="truncate text-[10px] text-zinc-500">• {h}</p>
          ))}
        </div>
      )}
    </article>
  );
}

function latestSignals(signals: SignalRow[]) {
  const seen = new Map<string, SignalRow>();
  [...signals]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .forEach((s) => { if (!seen.has(s.sector)) seen.set(s.sector, s); });

  return SECTORS.map((sector) => {
    const s = seen.get(sector);
    return s || { sector, score_narrative: 0, score_etf_flow: 0, score_macro: 0, combined_score: 0, signal: 'NEUTRAL' as const };
  });
}

export default function AIPage() {
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const data = await fetchSignals();
      setSignals(data);
      setLoading(false);
    })();
  }, []);

  async function handleAnalyze() {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    const result = await runAnalysis();
    setAnalysisResult(result);
    setIsAnalyzing(false);
    // Refresh signals after analysis
    setSignals(await fetchSignals());
  }

  const heatmapCards = latestSignals(signals);
  const analysisCards = analysisResult?.sectors
    ? [...analysisResult.sectors].sort((a, b) => b.combined_score - a.combined_score)
    : [];

  // Generate AI suggestions based on signals
  const suggestions = heatmapCards
    .filter(s => s.signal === 'STRONG_BUY' || s.signal === 'BUY')
    .sort((a, b) => b.combined_score - a.combined_score);

  const warnings = heatmapCards
    .filter(s => s.signal === 'AVOID')
    .sort((a, b) => b.combined_score - a.combined_score);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-8 sm:px-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-magenta">AI Intelligence</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-white sm:text-4xl">AI Suggestions</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Narrative scoring, sector analysis, and AI-powered trade recommendations
          </p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="rounded-full bg-gradient-to-r from-magenta to-accent px-6 py-3 font-mono text-sm font-bold text-white transition hover:shadow-[0_0_30px_rgba(255,0,217,0.3)] disabled:opacity-50"
        >
          {isAnalyzing ? '⏳ Analyzing 8 sectors…' : '🧠 Run Full AI Analysis'}
        </button>
      </div>

      {/* Quick Suggestions */}
      {suggestions.length > 0 && (
        <section className="mt-8">
          <div className="panel rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-safe/10 border border-safe/20 text-safe">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <h2 className="font-headline text-xl font-bold text-white">Recommended Sectors</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map(s => (
                <div key={s.sector} className="rounded-xl border border-safe/15 bg-safe/5 p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-headline text-lg font-semibold text-white">{s.sector}</h3>
                    <p className="mt-1 font-mono text-xs text-safe">{s.signal} · Score {s.combined_score}</p>
                  </div>
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${signalBg(s.signal)}`}>
                    <span className="font-mono text-xs font-bold text-black">{s.combined_score}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <section className="mt-6">
          <div className="panel rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger/10 border border-danger/20 text-danger">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </span>
              <h2 className="font-headline text-xl font-bold text-white">Sectors to Avoid</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {warnings.map(s => (
                <div key={s.sector} className="rounded-xl border border-danger/15 bg-danger/5 p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-headline text-lg font-semibold text-white">{s.sector}</h3>
                    <p className="mt-1 font-mono text-xs text-danger">{s.signal} · Score {s.combined_score}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full flex items-center justify-center bg-danger">
                    <span className="font-mono text-xs font-bold text-white">{s.combined_score}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Narrative Heatmap */}
      <section className="mt-8">
        <div className="panel rounded-2xl p-6">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <p className="eyebrow">Narrative Scanner</p>
              <h2 className="mt-2 font-headline text-2xl font-bold text-white">8 Sector Heatmap</h2>
            </div>
            <p className="font-mono text-xs text-zinc-500">Auto-updates every 60s</p>
          </div>
          <div className="terminal-rule mb-5" />

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-magenta border-t-transparent" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {heatmapCards.map((card) => (
                <article
                  key={`${card.sector}-${card.combined_score}`}
                  className={`rounded-2xl border px-4 py-4 transition-all hover:-translate-y-0.5 ${signalColor(card.signal)}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-headline text-xl font-semibold text-white">{card.sector}</h3>
                    <span className="font-mono text-xs tracking-[0.14em]">{card.signal === 'STRONG_BUY' ? 'SBUY' : card.signal}</span>
                  </div>
                  <p className="mt-4 font-mono text-3xl font-bold text-white">{card.combined_score}</p>
                  <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-xs text-zinc-400">
                    N {card.score_narrative} | ETF {card.score_etf_flow} | M {card.score_macro}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Analysis Loading */}
      {isAnalyzing && (
        <section className="mt-8">
          <div className="panel rounded-2xl p-8 flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-magenta border-t-transparent" />
            <p className="font-mono text-sm text-zinc-300">Running full AI analysis across all 8 sectors…</p>
            <p className="font-mono text-xs text-zinc-500">This takes 15–30 seconds. Please wait.</p>
          </div>
        </section>
      )}

      {/* Analysis Results */}
      {analysisResult && !isAnalyzing && (
        <section className="mt-8 space-y-6">
          {/* Summary */}
          {analysisResult.summary && (
            <div className="panel rounded-2xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow text-magenta">AI Market Brief</p>
                  <h2 className="mt-2 font-headline text-2xl font-bold text-white">Intelligence Report</h2>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-[10px] text-zinc-500">
                    {analysisResult.news_count} articles · {analysisResult.macro_events_count} events · {(analysisResult.duration_ms / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>
              <div className="terminal-rule my-4" />
              <p className="text-sm leading-7 text-zinc-200">{analysisResult.summary}</p>
            </div>
          )}

          {/* Detailed Sector Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {analysisCards.map(s => <SectorCard key={s.sector} sector={s} />)}
          </div>

          {!analysisResult.success && (
            <div className="panel rounded-2xl p-6 text-center">
              <p className="text-sm text-danger">{analysisResult.message || 'Analysis failed. Check backend logs.'}</p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
