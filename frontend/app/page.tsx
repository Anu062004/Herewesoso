import Link from 'next/link';

const marketRows = [
  { symbol: 'BTC-USD', signal: 'Narrative pulse', score: '82', tone: 'text-[var(--green)]', move: '+2.8%' },
  { symbol: 'ETH-USD', signal: 'ETF flow watch', score: '68', tone: 'text-[var(--amber)]', move: '+0.9%' },
  { symbol: 'SOL-USD', signal: 'Risk compression', score: '41', tone: 'text-[var(--red)]', move: '-1.7%' }
];

const featureCards = [
  {
    eyebrow: 'SoSoValue Native',
    title: 'Narratives scored against market context',
    copy:
      'News velocity, ETF flow, and macro events are normalized into an alpha scanner built for crypto operators, not passive readers.',
    metric: '30m',
    label: 'scanner cycle'
  },
  {
    eyebrow: 'SoDEX Execution',
    title: 'Position protection with signed close actions',
    copy:
      'Liquidation distance, leverage, mark price, and account state feed a guardrail layer that can submit reduce-only testnet closes.',
    metric: 'EIP-712',
    label: 'signed actions'
  },
  {
    eyebrow: 'Terminal Memory',
    title: 'Every alert becomes an operator note',
    copy:
      'Signals, shield warnings, and cycle memos are persisted so the trading desk can explain why a risk decision happened.',
    metric: '24/7',
    label: 'agent watch'
  }
];

const stats = [
  ['SoSoValue', 'News, ETF, macro'],
  ['SoDEX', 'Perps risk and execution'],
  ['Supabase', 'Persistent signal memory'],
  ['Telegram', 'Operator alerts']
];

function MiniChart() {
  return (
    <svg viewBox="0 0 520 210" className="h-full w-full" role="img" aria-label="Synthetic market signal chart">
      <defs>
        <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(22,199,132,0.3)" />
          <stop offset="100%" stopColor="rgba(22,199,132,0)" />
        </linearGradient>
      </defs>
      {[42, 84, 126, 168].map((y) => (
        <line key={y} x1="0" x2="520" y1={y} y2={y} stroke="rgba(255,255,255,0.07)" />
      ))}
      {[65, 130, 195, 260, 325, 390, 455].map((x) => (
        <line key={x} x1={x} x2={x} y1="0" y2="210" stroke="rgba(255,255,255,0.045)" />
      ))}
      <path
        d="M0 158 C44 146 54 120 94 126 C134 132 132 88 180 92 C226 96 230 54 274 61 C320 68 318 111 365 94 C414 76 425 34 466 42 C496 48 508 36 520 29 L520 210 L0 210 Z"
        fill="url(#chartFill)"
      />
      <path
        d="M0 158 C44 146 54 120 94 126 C134 132 132 88 180 92 C226 96 230 54 274 61 C320 68 318 111 365 94 C414 76 425 34 466 42 C496 48 508 36 520 29"
        fill="none"
        stroke="var(--green)"
        strokeWidth="3"
      />
      <path
        d="M0 94 C40 88 70 101 104 91 C146 78 164 111 208 103 C252 95 278 116 314 121 C360 128 384 101 420 107 C462 114 488 96 520 103"
        fill="none"
        stroke="var(--brand)"
        strokeDasharray="7 8"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-1)]">
      <section className="relative border-b border-[var(--border)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,107,0,0.22),transparent_28%),radial-gradient(circle_at_78%_6%,rgba(22,199,132,0.18),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_44%)]" />
        <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:42px_42px]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="group flex items-center gap-3" aria-label="Gold and Grit home">
              <span className="flex h-10 w-10 items-center justify-center rounded-md border border-[rgba(255,107,0,0.42)] bg-[rgba(255,107,0,0.12)] shadow-[0_0_34px_rgba(255,107,0,0.18)]">
                <span className="h-4 w-4 rounded-[3px] bg-[var(--brand)] transition group-hover:rotate-45" />
              </span>
              <span>
                <span className="block font-headline text-[15px] font-semibold tracking-wide">Gold & Grit</span>
                <span className="block text-[11px] uppercase tracking-[0.28em] text-[var(--text-3)]">SoSo Native Desk</span>
              </span>
            </Link>

            <nav className="hidden items-center gap-6 text-[13px] text-[var(--text-2)] md:flex">
              <a href="#scanner" className="transition hover:text-[var(--text-1)]">
                Scanner
              </a>
              <a href="#shield" className="transition hover:text-[var(--text-1)]">
                Shield
              </a>
              <a href="#stack" className="transition hover:text-[var(--text-1)]">
                Stack
              </a>
            </nav>

            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-md border border-[rgba(255,107,0,0.58)] bg-[var(--brand)] px-4 text-[13px] font-semibold text-black transition hover:brightness-110"
            >
              Launch Terminal
            </Link>
          </header>

          <div className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(520px,1fr)] lg:py-10">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-md border border-[rgba(22,199,132,0.24)] bg-[rgba(22,199,132,0.08)] px-3 py-2 text-[12px] text-[var(--green)]">
                <span className="h-2 w-2 rounded-full bg-[var(--green)] shadow-[0_0_18px_rgba(22,199,132,0.8)]" />
                Live SoSoValue intelligence plus SoDEX risk control
              </div>

              <h1 className="mt-6 max-w-4xl font-headline text-[54px] font-semibold leading-[0.92] tracking-[-0.055em] text-white sm:text-[76px] lg:text-[88px]">
                Hunt the narrative. Guard the position.
              </h1>

              <p className="mt-6 max-w-2xl text-[16px] leading-8 text-[var(--text-2)] sm:text-[18px]">
                A SoSo-native finance terminal that turns news, ETF flows, macro pressure, and SoDEX liquidation risk into operator-grade trading signals.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/dashboard"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-[rgba(255,107,0,0.62)] bg-[var(--brand)] px-5 text-[14px] font-semibold text-black transition hover:brightness-110"
                >
                  Open Live Dashboard
                </Link>
                <a
                  href="#scanner"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-[var(--border)] bg-[rgba(255,255,255,0.04)] px-5 text-[14px] font-medium text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]"
                >
                  Explore System
                </a>
              </div>

              <div className="mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
                {stats.map(([name, detail]) => (
                  <div key={name} className="rounded-lg border border-[var(--border)] bg-[rgba(10,10,10,0.68)] p-3">
                    <div className="text-[13px] font-semibold text-[var(--text-1)]">{name}</div>
                    <div className="mt-1 text-[11px] leading-4 text-[var(--text-3)]">{detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-5 rounded-[32px] bg-[radial-gradient(circle_at_50%_20%,rgba(255,107,0,0.24),transparent_42%)] blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.12)] bg-[#080808]/95 shadow-[0_34px_110px_rgba(0,0,0,0.64)]">
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <div>
                    <div className="text-[12px] uppercase tracking-[0.22em] text-[var(--text-3)]">Sentinel Cycle</div>
                    <div className="mt-1 text-[15px] font-semibold">Narrative Alpha Scanner</div>
                  </div>
                  <div className="rounded-md border border-[rgba(22,199,132,0.24)] bg-[rgba(22,199,132,0.08)] px-2.5 py-1 text-[11px] text-[var(--green)]">
                    synced
                  </div>
                </div>

                <div className="grid gap-0 lg:grid-cols-[1fr_220px]">
                  <div className="min-h-[300px] border-b border-[var(--border)] p-4 lg:border-b-0 lg:border-r">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-[12px] text-[var(--text-3)]">BTC narrative pressure</span>
                      <span className="font-mono text-[12px] text-[var(--green)]">+18.4 alpha delta</span>
                    </div>
                    <div className="h-[240px]">
                      <MiniChart />
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="text-[12px] uppercase tracking-[0.2em] text-[var(--text-3)]">Risk Queue</div>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-lg border border-[rgba(234,57,67,0.28)] bg-[rgba(234,57,67,0.08)] p-3">
                        <div className="text-[12px] text-[var(--text-3)]">Liquidation Shield</div>
                        <div className="mt-2 text-[18px] font-semibold text-[var(--red)]">Critical 8.6%</div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#222]">
                          <div className="h-full w-[22%] rounded-full bg-[var(--red)]" />
                        </div>
                      </div>
                      <div className="rounded-lg border border-[rgba(240,185,11,0.28)] bg-[rgba(240,185,11,0.08)] p-3">
                        <div className="text-[12px] text-[var(--text-3)]">Macro Window</div>
                        <div className="mt-2 text-[18px] font-semibold text-[var(--amber)]">FOMC 2h</div>
                      </div>
                      <div className="rounded-lg border border-[rgba(255,107,0,0.3)] bg-[rgba(255,107,0,0.1)] p-3">
                        <div className="text-[12px] text-[var(--text-3)]">Execution</div>
                        <div className="mt-2 font-mono text-[12px] text-[var(--brand)]">reduce-only close armed</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[var(--border)]">
                  {marketRows.map((row) => (
                    <div key={row.symbol} className="grid grid-cols-[90px_1fr_52px_58px] gap-3 border-b border-[var(--border)] px-4 py-3 text-[12px] last:border-b-0">
                      <span className="font-mono text-[var(--text-1)]">{row.symbol}</span>
                      <span className="truncate text-[var(--text-2)]">{row.signal}</span>
                      <span className={row.tone}>{row.score}</span>
                      <span className={row.tone}>{row.move}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="scanner" className="mx-auto grid max-w-7xl gap-4 px-4 py-16 sm:px-6 lg:grid-cols-3 lg:px-8">
        {featureCards.map((card) => (
          <article key={card.title} className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-sm)] transition hover:-translate-y-1 hover:border-[var(--border-hover)]">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--brand)]">{card.eyebrow}</div>
            <h2 className="mt-4 font-headline text-[24px] font-semibold leading-7 tracking-[-0.03em] text-white">{card.title}</h2>
            <p className="mt-4 min-h-[96px] text-[13px] leading-6 text-[var(--text-2)]">{card.copy}</p>
            <div className="mt-6 flex items-end justify-between border-t border-[var(--border)] pt-4">
              <div>
                <div className="font-headline text-[32px] font-semibold text-[var(--text-1)]">{card.metric}</div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-3)]">{card.label}</div>
              </div>
              <span className="h-9 w-9 rounded-md border border-[rgba(255,107,0,0.24)] bg-[rgba(255,107,0,0.1)] transition group-hover:rotate-45 group-hover:bg-[var(--brand)]" />
            </div>
          </article>
        ))}
      </section>

      <section id="shield" className="border-y border-[var(--border)] bg-[linear-gradient(90deg,rgba(255,107,0,0.08),rgba(22,199,132,0.05),rgba(234,57,67,0.08))]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-3)]">Operator Layer</div>
            <h2 className="mt-4 max-w-xl font-headline text-[42px] font-semibold leading-[0.98] tracking-[-0.045em] text-white sm:text-[56px]">
              Built for one-person on-chain finance desks.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Narrative heat', 'Detects sector momentum before it becomes a crowded trade.'],
              ['ETF flow pressure', 'Treats institutional flow as a live input, not a static report.'],
              ['Liquidation distance', 'Turns SoDEX position state into actionable risk levels.'],
              ['Telegram routing', 'Moves critical decisions out of the dashboard and into alerts.']
            ].map(([title, copy]) => (
              <div key={title} className="rounded-xl border border-[var(--border)] bg-[rgba(8,8,8,0.78)] p-4">
                <div className="text-[15px] font-semibold text-[var(--text-1)]">{title}</div>
                <p className="mt-2 text-[13px] leading-6 text-[var(--text-2)]">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="stack" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr] lg:items-end">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--brand)]">Native Integrations</div>
              <h2 className="mt-4 max-w-2xl font-headline text-[38px] font-semibold leading-[1] tracking-[-0.04em] text-white">
                One terminal surface for SoSoValue intelligence and SoDEX action.
              </h2>
            </div>
            <div className="grid gap-2 text-[13px]">
              {[
                ['Ingest', 'SoSoValue news, ETF data, macro calendar'],
                ['Score', 'Narrative, flow, macro, and liquidation risk'],
                ['Persist', 'Supabase signal rows, memos, alerts'],
                ['Execute', 'SoDEX testnet EIP-712 reduce-only controls']
              ].map(([step, detail], index) => (
                <div key={step} className="grid grid-cols-[34px_86px_1fr] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-3">
                  <span className="font-mono text-[var(--text-3)]">{String(index + 1).padStart(2, '0')}</span>
                  <span className="font-semibold text-[var(--text-1)]">{step}</span>
                  <span className="text-[var(--text-2)]">{detail}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-[var(--border)] pt-6 sm:flex-row sm:items-center">
            <p className="max-w-xl text-[13px] leading-6 text-[var(--text-2)]">
              Designed as a working product surface: every landing-page promise maps to a live dashboard module already in the terminal.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center rounded-md border border-[rgba(255,107,0,0.62)] bg-[var(--brand)] px-5 text-[14px] font-semibold text-black transition hover:brightness-110"
            >
              Enter Dashboard
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
