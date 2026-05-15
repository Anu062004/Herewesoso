'use client';

import { useState } from 'react';

type Tab = 'add' | 'remove';

const STEP_ADD = [
  {
    n: 1,
    title: 'Create Your Bot',
    body: 'Open Telegram and message @BotFather. Send /newbot, follow the prompts, and copy your Bot Token.',
    code: '/newbot',
    tag: 'BotFather'
  },
  {
    n: 2,
    title: 'Get Your Chat ID',
    body: 'Message @userinfobot on Telegram — it will reply with your numeric User ID. This is your Chat ID.',
    code: '@userinfobot',
    tag: 'Telegram'
  },
  {
    n: 3,
    title: 'Set Environment Variables',
    body: 'Add the following to your .env file on the EC2 server, then restart PM2.',
    code: 'TELEGRAM_BOT_TOKEN=<your_token>\nTELEGRAM_CHAT_ID=<your_chat_id>',
    tag: '.env'
  },
  {
    n: 4,
    title: 'Restart & Verify',
    body: 'After restarting, message /start to your bot. You should receive the Sentinel main menu.',
    code: 'pm2 restart sentinel-finance',
    tag: 'EC2'
  }
];

const STEP_REMOVE = [
  {
    n: 1,
    title: 'Remove the Chat ID',
    body: 'Edit your .env file on the EC2 server and delete or blank out the TELEGRAM_CHAT_ID line.',
    code: '# TELEGRAM_CHAT_ID=',
    tag: '.env'
  },
  {
    n: 2,
    title: 'Restart the Backend',
    body: 'Restart PM2 to apply the change. The bot will stop responding to that user immediately.',
    code: 'pm2 restart sentinel-finance',
    tag: 'EC2'
  },
  {
    n: 3,
    title: 'Revoke Bot (optional)',
    body: 'To fully shut down the bot, message @BotFather and send /deletebot, then select your bot.',
    code: '/deletebot',
    tag: 'BotFather'
  }
];

function CodeBlock({ code, tag }: { code: string; tag: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <div className="relative mt-2 rounded-xl border border-white/10 bg-black/40 px-4 py-3">
      <span className="absolute right-3 top-2 font-mono text-[9px] tracking-widest text-zinc-600">{tag}</span>
      <pre className="font-mono text-xs text-accent leading-6 whitespace-pre-wrap pr-12">{code}</pre>
      <button
        onClick={copy}
        className="absolute bottom-2 right-3 font-mono text-[10px] text-zinc-500 hover:text-zinc-200 transition"
      >
        {copied ? '✓ copied' : 'copy'}
      </button>
    </div>
  );
}

function StepList({ steps }: { steps: typeof STEP_ADD }) {
  return (
    <ol className="mt-5 space-y-5">
      {steps.map(step => (
        <li key={step.n} className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 font-mono text-xs font-bold text-accent">
            {step.n}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-sm">{step.title}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">{step.body}</p>
            <CodeBlock code={step.code} tag={step.tag} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function BotSetup() {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>('add');

  return (
    <section className="panel rounded-3xl p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Telegram Integration</p>
          <h2 className="mt-3 font-headline text-2xl font-bold text-white">Bot Setup</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Connect the Sentinel Telegram bot to receive real-time alerts, check positions, and run commands from anywhere.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 font-mono text-sm font-semibold text-accent transition hover:bg-accent/20"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-1.97 9.269c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.062 13.67l-2.99-.937c-.65-.204-.662-.65.136-.964l11.677-4.501c.54-.194 1.017.133.842.98z"/>
            </svg>
            Open BotFather
          </a>
          <button
            onClick={() => setExpanded(v => !v)}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-sm text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
          >
            {expanded ? '▲ Hide Guide' : '▼ Setup Guide'}
          </button>
        </div>
      </div>

      {/* Feature pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        {['📊 Positions', '⚠️ Risk Alerts', '🗞 News', '📅 Macro Events', '🤖 AI Brief', '🚨 Panic Close'].map(f => (
          <span key={f} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-zinc-400">
            {f}
          </span>
        ))}
      </div>

      {/* Expandable guide */}
      {expanded && (
        <div className="mt-6">
          <div className="terminal-rule mb-5" />

          {/* Tabs */}
          <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
            <button
              onClick={() => setTab('add')}
              className={`rounded-lg px-4 py-1.5 font-mono text-sm font-semibold transition ${
                tab === 'add'
                  ? 'bg-accent text-black'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              ＋ Add User
            </button>
            <button
              onClick={() => setTab('remove')}
              className={`rounded-lg px-4 py-1.5 font-mono text-sm font-semibold transition ${
                tab === 'remove'
                  ? 'bg-danger text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              − Remove User
            </button>
          </div>

          {tab === 'add' && (
            <div>
              <p className="mt-4 text-xs text-zinc-500">
                The bot supports one authorized user (set via TELEGRAM_CHAT_ID). Only that Telegram account can interact with it.
              </p>
              <StepList steps={STEP_ADD} />
            </div>
          )}

          {tab === 'remove' && (
            <div>
              <p className="mt-4 text-xs text-zinc-500">
                Removing TELEGRAM_CHAT_ID makes the bot ignore all incoming messages until a new one is set.
              </p>
              <StepList steps={STEP_REMOVE} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
