import Link from 'next/link';

import { CheckIcon, ChevronRightIcon, TelegramIcon } from '@/components/terminal/icons';

const STEPS = [
  {
    n: '1',
    title: 'Create the bot',
    body: 'Open BotFather and run /newbot to get the token.'
  },
  {
    n: '2',
    title: 'Capture the chat ID',
    body: 'Use @userinfobot and store the numeric ID in TELEGRAM_CHAT_ID.'
  },
  {
    n: '3',
    title: 'Set SoDEX access',
    body: 'Add the wallet address and choose either the master wallet or a registered API key.'
  },
  {
    n: '4',
    title: 'Verify the flow',
    body: 'Restart the backend, send /start, then test a Telegram message from the dashboard.'
  }
];

export default function BotSetup() {
  return (
    <section className="panel rounded-3xl p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <p className="eyebrow">Telegram Integration</p>
          <h2 className="mt-3 font-headline text-2xl font-bold text-white">Bot Setup</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Telegram handles alert delivery. The full beginner guide now lives on the dashboard setup page, including the SoDEX login and key flow.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Link
            href="/dashboard/telegram"
            className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 font-mono text-sm font-semibold text-accent transition hover:bg-accent/20"
          >
            Open full guide
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-sm text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
          >
            Open BotFather
          </a>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {['BotFather', 'Chat ID', '.env', '/setkey'].map((label) => (
          <span key={label} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-zinc-400">
            {label}
          </span>
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((step) => (
          <article key={step.n} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 font-mono text-xs font-bold text-accent">
                {step.n}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <TelegramIcon className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold text-white">{step.title}</h3>
                </div>
                <p className="mt-2 text-xs leading-5 text-zinc-400">{step.body}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-safe/20 bg-safe/10 px-4 py-3 text-sm text-zinc-200">
        <div className="flex items-center gap-2 font-medium text-safe">
          <CheckIcon className="h-4 w-4" />
          New user rule
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-300">
          Telegram is the alert channel. SoDEX access is the wallet and signing key. Keep private keys on the backend.
        </p>
      </div>
    </section>
  );
}
