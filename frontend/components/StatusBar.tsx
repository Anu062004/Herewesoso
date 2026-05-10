'use client';

interface StatusBarProps {
  wallet: string;
  lastUpdated: string;
  onRunNow: () => void;
  onTestTelegram: () => void;
  onRunAnalysis: () => void;
  isRunning: boolean;
  isAnalyzing: boolean;
}

function truncateWallet(wallet: string) {
  if (!wallet) return 'wallet not configured';
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export default function StatusBar({
  wallet,
  lastUpdated,
  onRunNow,
  onTestTelegram,
  onRunAnalysis,
  isRunning,
  isAnalyzing
}: StatusBarProps) {
  return (
    <section className="panel rounded-[1.75rem] px-6 py-5 sm:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-xs font-semibold tracking-[0.28em] text-zinc-500">
              SENTINEL FINANCE
            </p>
            <span className="rounded-full border border-safe/25 bg-safe/10 px-2.5 py-1 font-mono text-[11px] tracking-[0.2em] text-safe">
              LIVE
            </span>
          </div>
          <p className="mt-4 font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Last update: {lastUpdated}
          </p>
          <p className="mt-3 font-mono text-sm text-zinc-400">
            Wallet: {truncateWallet(wallet)}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onRunAnalysis}
            disabled={isAnalyzing}
            className="rounded-full border border-blue-500/40 bg-blue-500/15 px-4 py-2 font-mono text-sm font-semibold text-blue-300 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAnalyzing ? '⏳ Analyzing...' : '🔍 Run Analysis'}
          </button>
          <button
            type="button"
            onClick={onRunNow}
            disabled={isRunning}
            className="rounded-full border border-accent/40 bg-accent px-4 py-2 font-mono text-sm font-semibold text-black transition hover:bg-[#ff8f3a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? 'Running...' : 'Run Now'}
          </button>
          <button
            type="button"
            onClick={onTestTelegram}
            className="rounded-full border border-white/10 px-4 py-2 font-mono text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
          >
            Test Telegram
          </button>
        </div>
      </div>
    </section>
  );
}
