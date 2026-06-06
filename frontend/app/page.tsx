import Link from 'next/link';

const marketRows = [
  { symbol: 'BTC-USD', signal: 'Narrative pulse', score: '82', tone: 'text-[var(--green)]', move: '+2.8%' },
  { symbol: 'ETH-USD', signal: 'ETF flow watch', score: '68', tone: 'text-[var(--amber)]', move: '+0.9%' },
  { symbol: 'SOL-USD', signal: 'Risk compression', score: '41', tone: 'text-[var(--red)]', move: '-1.7%' }
];

const featureCards = [
  {
    span: 'lg:col-span-2',
    tag: 'SoSoValue Native',
    title: 'Narratives scored against market context',
    copy:
      'News velocity, ETF flow, and macro events are normalized into an alpha scanner built for crypto operators, not passive readers.',
    metric: '30m',
    label: 'scanner cycle'
  },
  {
    span: '',
    tag: 'SoDEX Execution',
    title: 'Position protection with signed close actions',
    copy:
      'Liquidation distance, leverage, mark price, and account state feed a guardrail layer that can submit reduce-only testnet closes.',
    metric: 'EIP-712',
    label: 'signed actions'
  },
  {
    span: '',
    tag: 'Terminal Memory',
    title: 'Every alert becomes an operator note',
    copy:
      'Signals, shield warnings, and cycle memos are persisted so the trading desk can explain why a risk decision happened.',
    metric: '24/7',
    label: 'agent watch'
  }
];

const stackSteps = [
  ['Ingest', 'SoSoValue news, ETF data, macro calendar'],
  ['Score', 'Narrative, flow, macro, and liquidation risk'],
  ['Persist', 'Supabase signal rows, memos, alerts'],
  ['Execute', 'SoDEX testnet EIP-712 reduce-only controls']
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

function ArrowLink() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-x-clip bg-[var(--bg-app)] text-[var(--text-1)]">
      <section className="relative border-b border-[var(--border)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_20%_-10%,rgba(255,107,0,0.18),transparent_55%),radial-gradient(ellipse_60%_40%_at_85%_0%,rgba(22,199,132,0.12),transparent_50%)]" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="group flex items-center gap-3" aria-label="Gold and Grit home">
              <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[rgba(255,107,0,0.42)] bg-[var(--brand-soft)] shadow-[0_0_28px_rgba(255,107,0,0.14)]">
                <span className="h-3.5 w-3.5 rounded-[3px] bg-[var(--brand)] transition-transform duration-[var(--dur-short)] ease-[var(--ease-out)] group-hover:scale-110" />
              </span>
              <span>
                <span className="block font-headline text-[15px] font-semibold tracking-wide">Gold & Grit</span>
                <span className="block text-[11px] text-[var(--text-3)]">SoSo Native Desk</span>
              </span>
            </Link>

            <nav className="hidden items-center rounded-[var(--radius-pill)] border border-[var(--border)] bg-[rgba(8,8,8,0.72)] p-1 text-[13px] text-[var(--text-2)] backdrop-blur md:flex">
              {[
                ['Scanner', '#scanner'],
                ['Shield', '#shield'],
                ['Stack', '#stack']
              ].map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  className="rounded-[var(--radius-pill)] px-4 py-2 transition-colors duration-[var(--dur-short)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-1)]"
                >
                  {label}
                </a>
              ))}
            </nav>

            <Link href="/dashboard" className="hm-btn-primary h-10 px-4 text-[13px]">
              Launch Terminal
            </Link>
          </header>

          <div className="grid items-center gap-12 py-16 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-10 lg:py-20">
            <div className="max-w-2xl lg:pt-4">
              <div className="hm-kicker">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)] shadow-[0_0_12px_rgba(22,199,132,0.7)]" />
                Live SoSoValue intelligence plus SoDEX risk control
              </div>

              <h1 className="hm-display mt-7 text-[44px] font-semibold text-white sm:text-[62px] lg:text-[72px]">
                Hunt the narrative. Guard the position.
              </h1>

              <p className="mt-6 max-w-xl text-[16px] leading-[1.75] text-[var(--text-2)] sm:text-[17px]">
                A SoSo-native finance terminal that turns news, ETF flows, macro pressure, and SoDEX liquidation risk into operator-grade trading signals.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/dashboard" className="hm-btn-primary h-12 px-6 text-[14px]">
                  Open Live Dashboard
                </Link>
                <a href="#scanner" className="hm-btn-ghost h-12 px-6 text-[14px]">
                  Explore System
                </a>
              </div>

              <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[var(--border)] pt-8 sm:grid-cols-4">
                {[
                  ['SoSoValue', 'News, ETF, macro'],
                  ['SoDEX', 'Perps risk and execution'],
                  ['Supabase', 'Persistent signal memory'],
                  ['Telegram', 'Operator alerts']
                ].map(([term, detail]) => (
                  <div key={term}>
                    <dt className="text-[13px] font-semibold text-[var(--text-1)]">{term}</dt>
                    <dd className="mt-1 text-[12px] leading-5 text-[var(--text-3)]">{detail}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="relative lg:-mr-2">
              <div className="pointer-events-none absolute -inset-6 rounded-[var(--radius-xl)] bg-[radial-gradient(circle_at_50%_18%,rgba(255,107,0,0.2),transparent_48%)] blur-2xl" />
              <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[rgba(255,255,255,0.1)] bg-[var(--bg-surface)] shadow-[var(--shadow-lift)]">
                <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[rgba(255,255,255,0.025)] px-5 py-3.5">
                  <div>
                    <div className="text-[12px] text-[var(--text-3)]">Sentinel Cycle</div>
                    <div className="mt-0.5 font-headline text-[16px] font-semibold">Narrative Alpha Scanner</div>
                  </div>
                  <span className="rounded-[var(--radius-pill)] border border-[rgba(22,199,132,0.24)] bg-[rgba(22,199,132,0.08)] px-3 py-1 text-[11px] font-medium text-[var(--green)]">
                    synced
                  </span>
                </div>

                <div className="grid lg:grid-cols-[minmax(0,1fr)_200px]">
                  <div className="min-h-[280px] border-b border-[var(--border)] p-5 lg:border-b-0 lg:border-r">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className="text-[12px] text-[var(--text-3)]">BTC narrative pressure</span>
                      <span className="font-mono text-[12px] text-[var(--green)]">+18.4 alpha delta</span>
                    </div>
                    <div className="h-[220px]">
                      <MiniChart />
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="text-[12px] font-medium text-[var(--text-3)]">Risk Queue</div>
                    <div className="rounded-[var(--radius-md)] border border-[rgba(234,57,67,0.28)] bg-[rgba(234,57,67,0.08)] p-3">
                      <div className="text-[11px] text-[var(--text-3)]">Liquidation Shield</div>
                      <div className="mt-1.5 text-[20px] font-semibold tabular-nums text-[var(--red)]">Critical 8.6%</div>
                      <div className="mt-2.5 h-1 overflow-hidden rounded-[var(--radius-pill)] bg-[#222]">
                        <div className="h-full w-[22%] rounded-[var(--radius-pill)] bg-[var(--red)]" />
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[rgba(240,185,11,0.28)] bg-[rgba(240,185,11,0.08)] p-3">
                      <div className="text-[11px] text-[var(--text-3)]">Macro Window</div>
                      <div className="mt-1.5 text-[18px] font-semibold text-[var(--amber)]">FOMC 2h</div>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[rgba(255,107,0,0.3)] bg-[rgba(255,107,0,0.1)] p-3">
                      <div className="text-[11px] text-[var(--text-3)]">Execution</div>
                      <div className="mt-1.5 font-mono text-[11px] text-[var(--brand)]">reduce-only close armed</div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[var(--border)]">
                  {marketRows.map((row) => (
                    <div
                      key={row.symbol}
                      className="grid grid-cols-[minmax(0,90px)_minmax(0,1fr)_52px_58px] gap-3 border-b border-[var(--border)] px-5 py-3 text-[12px] last:border-b-0"
                    >
                      <span className="font-mono text-[var(--text-1)]">{row.symbol}</span>
                      <span className="truncate text-[var(--text-2)]">{row.signal}</span>
                      <span className={`tabular-nums ${row.tone}`}>{row.score}</span>
                      <span className={`tabular-nums ${row.tone}`}>{row.move}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="scanner" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="hm-display text-[32px] font-semibold text-white sm:text-[40px]">Three layers, one operator surface</h2>
          <p className="mt-4 text-[15px] leading-7 text-[var(--text-2)]">
            Intelligence ingestion, risk guardrails, and persistent memory — wired together instead of scattered across tabs.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {featureCards.map((card) => (
            <article
              key={card.title}
              className={`group hm-surface flex flex-col p-6 transition-[transform,box-shadow,border-color] duration-[var(--dur-short)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-lift)] ${card.span}`}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="text-[12px] font-medium text-[var(--brand)]">{card.tag}</span>
                <span className="text-[var(--text-3)] transition-colors duration-[var(--dur-short)] group-hover:text-[var(--brand)]">
                  <ArrowLink />
                </span>
              </div>
              <h3 className="mt-4 font-headline text-[22px] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[26px]">
                {card.title}
              </h3>
              <p className="mt-3 flex-1 text-[14px] leading-6 text-[var(--text-2)]">{card.copy}</p>
              <div className="mt-8 flex items-end gap-4 border-t border-[var(--border)] pt-5">
                <div>
                  <div className="font-headline text-[28px] font-semibold tabular-nums text-[var(--text-1)]">{card.metric}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--text-3)]">{card.label}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="shield" className="border-y border-[var(--border)]">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-start lg:px-8">
          <div className="lg:sticky lg:top-24">
            <p className="text-[13px] font-medium text-[var(--text-3)]">Operator layer</p>
            <h2 className="hm-display mt-4 text-[36px] font-semibold text-white sm:text-[48px]">
              Built for one-person on-chain finance desks.
            </h2>
            <div className="hm-section-rule mt-8 max-w-xs" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Narrative heat', 'Detects sector momentum before it becomes a crowded trade.'],
              ['ETF flow pressure', 'Treats institutional flow as a live input, not a static report.'],
              ['Liquidation distance', 'Turns SoDEX position state into actionable risk levels.'],
              ['Telegram routing', 'Moves critical decisions out of the dashboard and into alerts.']
            ].map(([title, copy], index) => (
              <div
                key={title}
                className="hm-surface-elevated p-5"
                style={{ marginTop: index % 2 === 1 ? 'var(--space-md)' : undefined }}
              >
                <div className="text-[15px] font-semibold text-[var(--text-1)]">{title}</div>
                <p className="mt-2 text-[13px] leading-6 text-[var(--text-2)]">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="stack" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="hm-surface overflow-hidden">
          <div className="grid gap-10 p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="text-[13px] font-medium text-[var(--brand)]">Native integrations</p>
              <h2 className="hm-display mt-3 text-[34px] font-semibold text-white sm:text-[42px]">
                One terminal surface for SoSoValue intelligence and SoDEX action.
              </h2>
            </div>

            <ol className="space-y-0">
              {stackSteps.map(([step, detail], index) => (
                <li key={step} className="relative flex gap-4 border-b border-[var(--border)] py-4 last:border-b-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-panel)] font-mono text-[12px] text-[var(--text-3)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <div className="text-[14px] font-semibold text-[var(--text-1)]">{step}</div>
                    <div className="mt-1 text-[13px] leading-6 text-[var(--text-2)]">{detail}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col items-start justify-between gap-5 border-t border-[var(--border)] bg-[var(--bg-panel)] px-6 py-5 sm:flex-row sm:items-center sm:px-8">
            <p className="max-w-xl text-[13px] leading-6 text-[var(--text-2)]">
              Designed as a working product surface: every landing-page promise maps to a live dashboard module already in the terminal.
            </p>
            <Link href="/dashboard" className="hm-btn-primary h-11 shrink-0 px-5 text-[14px]">
              Enter Dashboard
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 py-8 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div>
            <div className="font-headline text-[15px] font-semibold">Gold & Grit</div>
            <div className="mt-1 text-[12px] text-[var(--text-3)]">SoSo-native crypto intelligence terminal</div>
          </div>
          <Link href="/dashboard" className="text-[13px] text-[var(--text-2)] transition-colors hover:text-[var(--brand)]">
            Open terminal →
          </Link>
        </div>
      </footer>
    </main>
  );
}
