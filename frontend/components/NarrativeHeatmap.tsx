import type { SignalRow } from '@/lib/types';

const SECTORS = ['DeFi', 'AI', 'RWA', 'L1', 'L2', 'GameFi', 'DePIN', 'Meme'] as const;

function latestSignals(signals: SignalRow[]) {
  const seen = new Map<string, SignalRow>();

  [...signals]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .forEach((signal) => {
      if (!seen.has(signal.sector)) {
        seen.set(signal.sector, signal);
      }
    });

  return SECTORS.map((sector) => {
    const signal = seen.get(sector);

    return signal || {
      sector,
      score_narrative: 0,
      score_etf_flow: 0,
      score_macro: 0,
      combined_score: 0,
      signal: 'NEUTRAL' as const
    };
  });
}

function tone(signal: SignalRow['signal']) {
  if (signal === 'STRONG_BUY') return 'border-safe/30 bg-safe/10 text-safe';
  if (signal === 'BUY') return 'border-accent/25 bg-accent/10 text-accent';
  if (signal === 'WATCH') return 'border-caution/25 bg-caution/10 text-caution';
  if (signal === 'NEUTRAL') return 'border-white/10 bg-white/5 text-zinc-300';
  return 'border-danger/25 bg-danger/10 text-danger';
}

function signalLabel(signal: SignalRow['signal']) {
  if (signal === 'STRONG_BUY') return 'SBUY';
  return signal;
}

export default function NarrativeHeatmap({ signals }: { signals: SignalRow[] }) {
  const cards = latestSignals(signals);

  return (
    <section className="panel rounded-3xl p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Narrative Scanner</p>
          <h2 className="mt-3 font-headline text-2xl font-bold text-white">8 sectors</h2>
        </div>
        <p className="font-mono text-xs text-zinc-500">Updated every 60 seconds</p>
      </div>

      <div className="terminal-rule my-5" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article
            key={`${card.sector}-${card.created_at || card.combined_score}`}
            className={`rounded-2xl border px-4 py-4 ${tone(card.signal)}`}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-headline text-xl font-semibold text-white">{card.sector}</h3>
              <span className="font-mono text-xs tracking-[0.14em]">{signalLabel(card.signal)}</span>
            </div>
            <p className="mt-4 font-mono text-3xl font-bold text-white">{card.combined_score}</p>
            <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-xs text-zinc-400">
              N {card.score_narrative} | ETF {card.score_etf_flow} | M {card.score_macro}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
