import Link from 'next/link';

const pillars = [
  {
    name: 'Narrative Alpha Scanner',
    description: 'Scores eight crypto sectors every cycle using SoSoValue news, ETF flow, and macro data.'
  },
  {
    name: 'Liquidation Shield',
    description: 'Checks open SoDEX testnet positions against liquidation distance and incoming macro risk.'
  },
  {
    name: 'Telegram Alerts',
    description: 'Sends alert-only notifications and deep-links the user back to the dashboard to act.'
  }
];

const waveOne = [
  'Backend agents and API routes',
  'Telegram alert delivery',
  'Terminal-style dashboard UI',
  'Execution confirmation modal',
  'No real EIP-712 signing yet'
];

export default function HomePage() {
  return (
    <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-10 sm:px-10">
      <section className="panel overflow-hidden rounded-[2rem] px-8 py-12 sm:px-12 sm:py-16">
        <p className="eyebrow">Sentinel Finance</p>
        <h1 className="mt-5 max-w-4xl font-headline text-5xl font-extrabold leading-[1.02] tracking-tight text-white sm:text-7xl">
          Find the trade. Protect the trade. Execute from the dashboard.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-zinc-400 sm:text-lg">
          Sentinel Finance combines a narrative sector scanner with a liquidation defense loop
          for leveraged crypto positions. Telegram handles alerts only. The dashboard is where
          the user reviews risk and confirms actions.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/dashboard"
            className="rounded-full bg-accent px-6 py-3.5 font-mono text-sm font-semibold tracking-wide text-black transition-all hover:bg-accent-glow hover:shadow-[0_0_30px_rgba(255,109,0,0.28)]"
          >
            Open Dashboard
          </Link>
          <a
            href="https://sosovalue.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/8 px-6 py-3.5 font-mono text-sm font-semibold text-zinc-300 transition-all hover:border-white/15 hover:bg-white/5 hover:text-white"
          >
            View SoSoValue
          </a>
        </div>

        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-accent/10 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-20 right-40 h-60 w-60 rounded-full bg-safe/5 blur-[100px]" />
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {pillars.map((pillar) => (
          <article key={pillar.name} className="panel rounded-3xl p-7">
            <p className="eyebrow">{pillar.name}</p>
            <p className="mt-5 text-sm leading-7 text-zinc-400">{pillar.description}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="panel rounded-3xl p-7">
          <p className="eyebrow">Cycle Logic</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="inset-card rounded-2xl p-5">
              <p className="font-mono text-[0.65rem] font-bold tracking-[0.2em] text-zinc-600">STEP 01</p>
              <h2 className="mt-2.5 font-headline text-xl font-semibold text-white">Scan narratives</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Pull SoSoValue feeds, ETF history, and macro events to score the market every 30 minutes.
              </p>
            </div>
            <div className="inset-card rounded-2xl p-5">
              <p className="font-mono text-[0.65rem] font-bold tracking-[0.2em] text-zinc-600">STEP 02</p>
              <h2 className="mt-2.5 font-headline text-xl font-semibold text-white">Watch positions</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Pull SoDEX testnet account state and compare liquidation distance against macro stress.
              </p>
            </div>
            <div className="inset-card rounded-2xl p-5">
              <p className="font-mono text-[0.65rem] font-bold tracking-[0.2em] text-zinc-600">STEP 03</p>
              <h2 className="mt-2.5 font-headline text-xl font-semibold text-white">Alert only</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Send Telegram alerts with a direct dashboard link. No trading actions happen inside Telegram.
              </p>
            </div>
            <div className="inset-card rounded-2xl p-5">
              <p className="font-mono text-[0.65rem] font-bold tracking-[0.2em] text-zinc-600">STEP 04</p>
              <h2 className="mt-2.5 font-headline text-xl font-semibold text-white">Confirm action</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                The dashboard queues a reduce-leverage or close-position confirmation flow for Wave 1.
              </p>
            </div>
          </div>
        </div>

        <div className="panel rounded-3xl p-7">
          <p className="eyebrow">Wave 1 Scope</p>
          <h2 className="mt-5 font-headline text-3xl font-bold tracking-tight text-white">
            Ship the alert and review loop first.
          </h2>
          <div className="mt-6 space-y-3">
            {waveOne.map((item) => (
              <div key={item} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-zinc-300">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
