import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="relative z-10 mx-auto flex min-h-screen w-full flex-col items-center px-6 py-10 sm:px-10">
      
      {/* Navbar */}
      <nav className="absolute top-0 w-full max-w-7xl px-6 py-8 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 border border-accent/20">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-accent" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span className="font-mono text-lg font-bold text-white tracking-widest">SENTINEL</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://app.sodex.com"
            target="_blank"
            rel="noreferrer"
            className="group relative rounded-full bg-gradient-to-r from-accent via-cyan to-magenta p-[1px] transition-all hover:shadow-[0_0_30px_rgba(0,242,255,0.3)]"
          >
            <span className="flex items-center gap-2 rounded-full bg-background-deep px-5 py-2.5 font-mono text-sm font-semibold text-white transition group-hover:bg-transparent group-hover:text-black">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Connect SoSo DEX
            </span>
          </a>
          <Link
            href="/dashboard"
            className="rounded-full bg-panel border border-border px-6 py-2.5 font-mono text-sm font-semibold tracking-wide text-accent transition-all hover:border-accent hover:shadow-[0_0_20px_rgba(0,242,255,0.2)]"
          >
            Launch Terminal
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative w-full max-w-5xl text-center flex flex-col items-center pt-32 pb-16">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] bg-accent/20 blur-[150px] rounded-full pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[600px] bg-magenta/10 blur-[150px] rounded-full pointer-events-none" />
        
        <div className="relative z-10 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5 mb-8">
          <span className="h-2 w-2 rounded-full bg-safe animate-pulse" />
          <span className="font-mono text-xs font-semibold tracking-[0.3em] text-accent">SYSTEM ONLINE</span>
        </div>

        <h1 className="relative z-10 max-w-4xl font-headline text-5xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-7xl">
          Institutional Grade <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-magenta">Risk Intelligence</span>
        </h1>
        <p className="relative z-10 mt-6 max-w-2xl text-base leading-8 text-text-dim sm:text-lg">
          Real-time SoSoValue news, SoDEX perpetuals monitoring, AI-powered trading insights, and automated Liquidation Shield — all in one terminal.
        </p>

        <div className="relative z-10 mt-10 flex flex-wrap justify-center gap-4">
          <a
            href="https://app.sodex.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 rounded-lg bg-gradient-to-r from-accent via-[#55a2ff] to-magenta px-8 py-4 font-mono text-sm font-bold tracking-widest text-black transition-all hover:shadow-[0_0_40px_rgba(0,242,255,0.4)] hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            CONNECT SOSO DEX
          </a>
          <Link
            href="/dashboard"
            className="rounded-lg bg-accent px-8 py-4 font-mono text-sm font-bold tracking-widest text-black transition-all hover:bg-white hover:shadow-[0_0_30px_rgba(0,242,255,0.4)]"
          >
            LAUNCH DASHBOARD
          </Link>
        </div>
      </section>

      {/* 4 Core Features — Map to the 4 pages */}
      <section className="relative z-10 mt-8 grid w-full max-w-6xl gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Link href="/dashboard/news" className="group">
          <article className="panel rounded-2xl p-8 hover:-translate-y-1 transition-all duration-300 h-full group-hover:border-accent/30 group-hover:shadow-[0_0_30px_rgba(0,242,255,0.08)]">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 border border-accent/20 text-accent">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="2">
                <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
              </svg>
            </div>
            <h3 className="font-headline text-xl font-semibold text-white">Live News Feed</h3>
            <p className="mt-3 text-sm leading-relaxed text-text-dim">
              Real-time crypto news from SoSoValue. ETF flows, macro events, and market-moving headlines.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 font-mono text-xs text-accent opacity-0 group-hover:opacity-100 transition-opacity">
              Open Feed →
            </span>
          </article>
        </Link>

        <Link href="/dashboard/positions" className="group">
          <article className="panel rounded-2xl p-8 hover:-translate-y-1 transition-all duration-300 h-full group-hover:border-safe/30 group-hover:shadow-[0_0_30px_rgba(0,255,163,0.08)]">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-safe/10 border border-safe/20 text-safe">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h3 className="font-headline text-xl font-semibold text-white">Current Positions</h3>
            <p className="mt-3 text-sm leading-relaxed text-text-dim">
              Monitor SoDEX perpetual positions, liquidation distance, and risk gauges in real-time.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 font-mono text-xs text-safe opacity-0 group-hover:opacity-100 transition-opacity">
              View Positions →
            </span>
          </article>
        </Link>

        <Link href="/dashboard/telegram" className="group">
          <article className="panel rounded-2xl p-8 hover:-translate-y-1 transition-all duration-300 h-full group-hover:border-[#2AABEE]/30 group-hover:shadow-[0_0_30px_rgba(42,171,238,0.08)]">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#2AABEE]/10 border border-[#2AABEE]/20 text-[#2AABEE]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-1.97 9.269c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.062 13.67l-2.99-.937c-.65-.204-.662-.65.136-.964l11.677-4.501c.54-.194 1.017.133.842.98z"/>
              </svg>
            </div>
            <h3 className="font-headline text-xl font-semibold text-white">Telegram Bot</h3>
            <p className="mt-3 text-sm leading-relaxed text-text-dim">
              Set up automated alerts, check positions, and run commands directly from Telegram.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 font-mono text-xs text-[#2AABEE] opacity-0 group-hover:opacity-100 transition-opacity">
              Setup Bot →
            </span>
          </article>
        </Link>

        <Link href="/dashboard/ai" className="group">
          <article className="panel rounded-2xl p-8 hover:-translate-y-1 transition-all duration-300 h-full group-hover:border-magenta/30 group-hover:shadow-[0_0_30px_rgba(255,0,217,0.08)]">
            <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-magenta/10 border border-magenta/20 text-magenta">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            </div>
            <h3 className="font-headline text-xl font-semibold text-white">AI Suggestions</h3>
            <p className="mt-3 text-sm leading-relaxed text-text-dim">
              AI-powered sector analysis, narrative scoring, and trade recommendations across 8 crypto sectors.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 font-mono text-xs text-magenta opacity-0 group-hover:opacity-100 transition-opacity">
              Get Insights →
            </span>
          </article>
        </Link>
      </section>

      {/* SoSo DEX Connection Banner */}
      <section className="relative z-10 mt-16 mb-10 w-full max-w-6xl">
        <div className="panel rounded-2xl p-8 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-magenta/5 to-accent/5 pointer-events-none" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-accent/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <p className="eyebrow mb-3 text-accent">SoSo DEX Integration</p>
              <h2 className="font-headline text-2xl font-bold text-white sm:text-3xl">
                Connect your SoSo DEX account
              </h2>
              <p className="mt-3 text-sm leading-7 text-text-dim max-w-lg">
                Link your SoSo DEX wallet to enable live position monitoring, automated risk alerts, and one-click trade execution through the Sentinel terminal.
              </p>
            </div>
            <a
              href="https://app.sodex.com"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 group relative rounded-xl bg-gradient-to-r from-accent to-magenta p-[1.5px] transition-all hover:shadow-[0_0_40px_rgba(0,242,255,0.35)]"
            >
              <span className="flex items-center gap-3 rounded-[10px] bg-background-deep px-8 py-4 font-mono text-sm font-bold text-white transition group-hover:bg-transparent group-hover:text-black">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                Connect Wallet
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 mt-auto w-full max-w-6xl border-t border-white/5 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-mono text-xs text-zinc-500">
            © 2026 Sentinel Finance · Powered by SoSoValue & SoDEX
          </p>
          <div className="flex items-center gap-4">
            <a href="https://sodex.com/documentation/api/api" target="_blank" rel="noreferrer" className="font-mono text-xs text-zinc-500 hover:text-accent transition">API Docs</a>
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="font-mono text-xs text-zinc-500 hover:text-accent transition">Telegram</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
