'use client';

import type { AnalysisResult, AnalysisSector } from '@/lib/api';

interface Props {
  open: boolean;
  loading: boolean;
  result: AnalysisResult | null;
  onClose: () => void;
}

function signalColor(signal: string) {
  if (signal === 'STRONG_BUY') return 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10';
  if (signal === 'BUY') return 'text-[#ff6b00] border-[#ff6b00]/30 bg-[#ff6b00]/10';
  if (signal === 'WATCH') return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10';
  if (signal === 'NEUTRAL') return 'text-zinc-400 border-white/10 bg-white/5';
  return 'text-red-400 border-red-400/30 bg-red-400/10';
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-white/10">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(value, 2)}%` }} />
    </div>
  );
}

function SectorCard({ s }: { s: AnalysisSector }) {
  const tone = signalColor(s.signal);
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-headline text-lg font-bold text-white">{s.sector}</span>
        <span className="font-mono text-xs tracking-widest">{s.signal}</span>
      </div>
      <p className="mt-2 font-mono text-3xl font-bold text-white">{s.combined_score}<span className="text-sm text-zinc-500">/100</span></p>

      <div className="mt-3 space-y-1.5">
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
            <span>Narrative</span><span>{s.score_narrative}</span>
          </div>
          <ScoreBar value={s.score_narrative} color="bg-blue-400" />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
            <span>ETF Flow</span><span>{s.score_etf_flow}</span>
          </div>
          <ScoreBar value={s.score_etf_flow} color="bg-purple-400" />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
            <span>Macro</span><span>{s.score_macro}</span>
          </div>
          <ScoreBar value={s.score_macro} color="bg-amber-400" />
        </div>
      </div>

      {s.reasoning && (
        <p className="mt-3 text-xs leading-5 text-zinc-300">{s.reasoning}</p>
      )}

      {s.top_headlines.length > 0 && (
        <div className="mt-3 space-y-1">
          {s.top_headlines.slice(0, 2).map((h, i) => (
            <p key={i} className="truncate text-[10px] text-zinc-500">• {h}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalysisModal({ open, loading, result, onClose }: Props) {
  if (!open) return null;

  const sorted = result?.sectors
    ? [...result.sectors].sort((a, b) => b.combined_score - a.combined_score)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative my-8 w-full max-w-5xl rounded-3xl border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-widest text-zinc-500 uppercase">AI Analysis</p>
            <h2 className="mt-1 font-headline text-2xl font-bold text-white">Market Intelligence Report</h2>
            {result && (
              <p className="mt-1 font-mono text-xs text-zinc-500">
                {result.news_count} articles · {result.macro_events_count} macro events · {(result.duration_ms / 1000).toFixed(1)}s
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-zinc-400 hover:text-white"
          >
            ✕ Close
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="mt-10 flex flex-col items-center gap-4 pb-10">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#ff6b00] border-t-transparent" />
            <p className="text-sm text-zinc-400">Running full market analysis with AI reasoning for all 8 sectors…</p>
            <p className="text-xs text-zinc-600">This takes 15–30 seconds</p>
          </div>
        )}

        {/* Summary */}
        {!loading && result?.summary && (
          <div className="mt-5 rounded-2xl border border-white/8 bg-white/5 p-4">
            <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Market Brief</p>
            <p className="mt-2 text-sm leading-7 text-zinc-200">{result.summary}</p>
          </div>
        )}

        {/* Sector grid */}
        {!loading && sorted.length > 0 && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {sorted.map(s => <SectorCard key={s.sector} s={s} />)}
          </div>
        )}

        {!loading && !result?.success && (
          <p className="mt-6 text-center text-sm text-red-400">{result?.message || 'Analysis failed. Check backend logs.'}</p>
        )}
      </div>
    </div>
  );
}
