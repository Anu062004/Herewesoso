import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="relative z-10 mx-auto flex min-h-screen w-full flex-col items-center justify-center px-6 py-10 sm:px-10">
      
      {/* Navbar / Header */}
      <nav className="absolute top-0 w-full max-w-7xl px-6 py-8 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 border border-accent/20">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-accent" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span className="font-mono text-lg font-bold text-white tracking-widest">SENTINEL</span>
        </div>
        <Link
          href="/dashboard"
          className="rounded-full bg-panel border border-border px-6 py-2.5 font-mono text-sm font-semibold tracking-wide text-accent transition-all hover:border-accent hover:shadow-[0_0_20px_rgba(0,242,255,0.2)]"
        >
          Launch Terminal
        </Link>
      </nav>

      {/* Hero Section */}
      <section className="relative w-full max-w-5xl text-center flex flex-col items-center pt-24 pb-16">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] bg-accent/20 blur-[150px] rounded-full pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[600px] bg-magenta/10 blur-[150px] rounded-full pointer-events-none" />
        
        <p className="eyebrow mb-6 text-accent animate-pulse tracking-[0.3em]">System Online</p>
        <h1 className="relative z-10 max-w-4xl font-headline text-5xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-7xl">
          Institutional Grade <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-magenta">Risk Intelligence</span>
        </h1>
        <p className="relative z-10 mt-6 max-w-2xl text-base leading-8 text-text-dim sm:text-lg">
          Real-time narrative tracking, SoDEX perpetuals monitoring, and automated Liquidation Shield for advanced crypto traders.
        </p>

        <div className="relative z-10 mt-10 flex flex-wrap justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-lg bg-accent px-8 py-4 font-mono text-sm font-bold tracking-widest text-black transition-all hover:bg-white hover:shadow-[0_0_30px_rgba(0,242,255,0.4)]"
          >
            CONNECT WALLET
          </Link>
          <a
            href="https://sosovalue.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-accent/30 bg-black/40 px-8 py-4 font-mono text-sm font-semibold text-accent transition-all hover:border-accent hover:bg-accent/10"
          >
            VIEW DOCS
          </a>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 mt-16 grid w-full max-w-6xl gap-6 md:grid-cols-3">
        <article className="panel rounded-2xl p-8 hover:-translate-y-1 transition-transform duration-300">
          <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 border border-accent/20 text-accent">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h3 className="font-headline text-xl font-semibold text-white">Liquidation Shield</h3>
          <p className="mt-4 text-sm leading-relaxed text-text-dim">
            Automatically monitor your SoDEX perps and get Telegram alerts before liquidations hit.
          </p>
        </article>

        <article className="panel rounded-2xl p-8 hover:-translate-y-1 transition-transform duration-300">
          <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-magenta/10 border border-magenta/20 text-magenta">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h3 className="font-headline text-xl font-semibold text-white">Narrative Scanner</h3>
          <p className="mt-4 text-sm leading-relaxed text-text-dim">
            Real-time parsing of SoSoValue macroeconomic data and ETF flows to catch the next meta shift.
          </p>
        </article>

        <article className="panel rounded-2xl p-8 hover:-translate-y-1 transition-transform duration-300">
          <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-safe/10 border border-safe/20 text-safe">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <h3 className="font-headline text-xl font-semibold text-white">Automated Execution</h3>
          <p className="mt-4 text-sm leading-relaxed text-text-dim">
            Connect to the Telegram bot to auto-hedge or reduce leverage when risk thresholds are breached.
          </p>
        </article>
      </section>
    </main>
  );
}
