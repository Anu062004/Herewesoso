'use client';

interface StatusBarProps {
  wallet: string;
  lastUpdated: string;
  onTestTelegram: () => void;
  onRunAnalysis: () => void;
  onRefresh: () => void;
  isAnalyzing: boolean;
  isRefreshing: boolean;
}

function truncateWallet(wallet: string) {
  if (!wallet) return 'not configured';
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export default function StatusBar({
  wallet,
  lastUpdated,
  onTestTelegram,
  onRunAnalysis,
  onRefresh,
  isAnalyzing,
  isRefreshing
}: StatusBarProps) {
  return (
    <section className="panel rounded-[1.75rem] px-6 py-5 sm:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Brand + Status */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-accent" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs font-semibold tracking-[0.28em] text-zinc-400">SENTINEL FINANCE</p>
              <span className="rounded-full border border-safe/25 bg-safe/10 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.2em] text-safe">LIVE</span>
            </div>
            <p className="mt-1 font-mono text-sm text-zinc-300 truncate">
              Wallet: <span className="text-white font-semibold">{truncateWallet(wallet)}</span>
            </p>
            <p className="font-mono text-xs text-zinc-500">Updated {lastUpdated}</p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRunAnalysis}
            disabled={isAnalyzing}
            className="rounded-full border border-blue-500/40 bg-blue-500/15 px-4 py-2 font-mono text-sm font-semibold text-blue-300 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAnalyzing ? '⏳ Analyzing…' : '🔍 Run Analysis'}
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-sm font-semibold text-zinc-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? '⏳ Refreshing…' : '⟳ Refresh'}
          </button>

          <button
            type="button"
            onClick={onTestTelegram}
            className="rounded-full border border-white/10 px-4 py-2 font-mono text-sm font-semibold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
          >
            📡 Test Bot
          </button>
        </div>
      </div>
    </section>
  );
}
