'use client';

import { useState } from 'react';
import { sendTelegramTest } from '@/lib/api';

type Tab = 'add' | 'remove' | 'commands';

const STEP_ADD = [
  {
    n: 1,
    title: 'Create Your Bot',
    body: 'Open Telegram and message @BotFather. Send /newbot, follow the prompts, and copy your Bot Token.',
    code: '/newbot',
    tag: 'BotFather',
  },
  {
    n: 2,
    title: 'Get Your Chat ID',
    body: 'Message @userinfobot on Telegram — it will reply with your numeric User ID. This is your Chat ID.',
    code: '@userinfobot',
    tag: 'Telegram',
  },
  {
    n: 3,
    title: 'Set Environment Variables',
    body: 'Add the following to your .env file on the EC2 server, then restart PM2.',
    code: 'TELEGRAM_BOT_TOKEN=<your_token>\nTELEGRAM_CHAT_ID=<your_chat_id>',
    tag: '.env',
  },
  {
    n: 4,
    title: 'Restart & Verify',
    body: 'After restarting, message /start to your bot. You should receive the Sentinel main menu.',
    code: 'pm2 restart sentinel-finance',
    tag: 'EC2',
  },
];

const STEP_REMOVE = [
  {
    n: 1,
    title: 'Remove the Chat ID',
    body: 'Edit your .env file on the EC2 server and delete or blank out the TELEGRAM_CHAT_ID line.',
    code: '# TELEGRAM_CHAT_ID=',
    tag: '.env',
  },
  {
    n: 2,
    title: 'Restart the Backend',
    body: 'Restart PM2 to apply the change. The bot will stop responding to that user immediately.',
    code: 'pm2 restart sentinel-finance',
    tag: 'EC2',
  },
  {
    n: 3,
    title: 'Revoke Bot (optional)',
    body: 'To fully shut down the bot, message @BotFather and send /deletebot, then select your bot.',
    code: '/deletebot',
    tag: 'BotFather',
  },
];

const BOT_COMMANDS = [
  { cmd: '/start', desc: 'Open the main menu and verify bot connection' },
  { cmd: '/positions', desc: 'View current SoDEX perpetual positions with PnL' },
  { cmd: '/risk', desc: 'Check risk scores and liquidation distance' },
  { cmd: '/news', desc: 'Get latest crypto news from SoSoValue' },
  { cmd: '/macro', desc: 'View upcoming macro events and their impact' },
  { cmd: '/analysis', desc: 'Run AI analysis across all 8 sectors' },
  { cmd: '/brief', desc: 'Get the daily AI market intelligence brief' },
  { cmd: '/panic', desc: 'Emergency close all positions (Wave 2)' },
  { cmd: '/help', desc: 'List all available commands' },
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
    <ol className="space-y-5">
      {steps.map((step) => (
        <li key={step.n} className="flex gap-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 font-mono text-xs font-bold text-accent">
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

export default function TelegramPage() {
  const [tab, setTab] = useState<Tab>('add');
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  async function handleTest() {
    setIsTesting(true);
    setTestStatus(null);
    const result = await sendTelegramTest();
    setTestStatus(result.message);
    setIsTesting(false);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-8 sm:px-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-[#2AABEE]">Telegram Integration</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-white sm:text-4xl">Bot Setup</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Connect the Sentinel Telegram bot for real-time alerts, position checks, and AI commands
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={isTesting}
            className="rounded-full border border-[#2AABEE]/30 bg-[#2AABEE]/10 px-5 py-2.5 font-mono text-sm font-semibold text-[#2AABEE] transition hover:bg-[#2AABEE]/20 disabled:opacity-50"
          >
            {isTesting ? '⏳ Sending…' : '📡 Test Bot'}
          </button>
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#2AABEE] px-5 py-2.5 font-mono text-sm font-bold text-white transition hover:bg-[#229ED9]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-1.97 9.269c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.062 13.67l-2.99-.937c-.65-.204-.662-.65.136-.964l11.677-4.501c.54-.194 1.017.133.842.98z"/>
            </svg>
            Open BotFather
          </a>
        </div>
      </div>

      {/* Test Status */}
      {testStatus && (
        <div className="mt-4 rounded-2xl border border-[#2AABEE]/20 bg-[#2AABEE]/10 px-4 py-3 text-sm text-zinc-100">
          {testStatus}
        </div>
      )}

      {/* Feature Pills */}
      <div className="mt-6 flex flex-wrap gap-2">
        {['📊 Positions', '⚠️ Risk Alerts', '🗞 News Feed', '📅 Macro Events', '🤖 AI Brief', '🚨 Panic Close'].map((f) => (
          <span
            key={f}
            className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 font-mono text-xs text-zinc-300"
          >
            {f}
          </span>
        ))}
      </div>

      {/* Tabs */}
      <div className="mt-8 flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
        <button
          onClick={() => setTab('add')}
          className={`rounded-lg px-5 py-2 font-mono text-xs font-semibold transition ${
            tab === 'add' ? 'bg-accent text-black' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          ＋ Add User
        </button>
        <button
          onClick={() => setTab('remove')}
          className={`rounded-lg px-5 py-2 font-mono text-xs font-semibold transition ${
            tab === 'remove' ? 'bg-danger text-white' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          − Remove User
        </button>
        <button
          onClick={() => setTab('commands')}
          className={`rounded-lg px-5 py-2 font-mono text-xs font-semibold transition ${
            tab === 'commands' ? 'bg-[#2AABEE] text-white' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          ⌘ Commands
        </button>
      </div>

      {/* Content */}
      <div className="mt-6">
        {tab === 'add' && (
          <div className="panel rounded-2xl p-6">
            <p className="text-xs text-zinc-500 mb-5">
              The bot supports one authorized user (set via TELEGRAM_CHAT_ID). Only that Telegram account can interact with it.
            </p>
            <StepList steps={STEP_ADD} />
          </div>
        )}

        {tab === 'remove' && (
          <div className="panel rounded-2xl p-6">
            <p className="text-xs text-zinc-500 mb-5">
              Removing TELEGRAM_CHAT_ID makes the bot ignore all incoming messages until a new one is set.
            </p>
            <StepList steps={STEP_REMOVE} />
          </div>
        )}

        {tab === 'commands' && (
          <div className="panel rounded-2xl p-6">
            <p className="eyebrow mb-3 text-[#2AABEE]">Available Commands</p>
            <h2 className="font-headline text-xl font-bold text-white mb-5">Bot Command Reference</h2>
            <div className="space-y-2">
              {BOT_COMMANDS.map((cmd) => (
                <div
                  key={cmd.cmd}
                  className="flex items-start gap-4 rounded-xl border border-white/8 bg-black/20 px-4 py-3 hover:border-[#2AABEE]/20 transition"
                >
                  <code className="shrink-0 rounded-lg bg-[#2AABEE]/10 border border-[#2AABEE]/20 px-3 py-1 font-mono text-sm font-bold text-[#2AABEE]">
                    {cmd.cmd}
                  </code>
                  <p className="text-sm text-zinc-400 pt-0.5">{cmd.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick Connect Card */}
      <section className="mt-8">
        <div className="panel rounded-2xl p-6 bg-gradient-to-r from-[#2AABEE]/5 to-transparent">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-headline text-lg font-bold text-white">Quick Start</h3>
              <p className="mt-1 text-sm text-zinc-400">
                Already have a bot? Click &quot;Test Bot&quot; to verify connectivity, or open BotFather to create a new one.
              </p>
            </div>
            <button
              onClick={handleTest}
              disabled={isTesting}
              className="shrink-0 rounded-full bg-[#2AABEE] px-6 py-3 font-mono text-sm font-bold text-white transition hover:bg-[#229ED9] disabled:opacity-50"
            >
              Send Test Message
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
