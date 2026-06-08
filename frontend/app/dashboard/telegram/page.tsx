'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { AlertTriangleIcon, CheckIcon, ChevronRightIcon, ShieldIcon, TelegramIcon, WorldIcon } from '@/components/terminal/icons';
import { PageHeader, Panel, PanelHeader, Pill } from '@/components/terminal/ui';

type CopyBlockProps = {
  code: string;
  label: string;
  note?: string;
};

type StepCardProps = {
  index: string;
  icon: ReactNode;
  title: string;
  body: string;
  tone: 'cyan' | 'purple' | 'amber' | 'blue';
  children?: ReactNode;
};

type ChecklistItemProps = {
  title: string;
  body: string;
  icon: ReactNode;
};

const TELEGRAM_STEPS = [
  {
    index: '1',
    title: 'Create the bot in BotFather',
    body: 'Open @BotFather, send /newbot, then follow the prompts. BotFather returns the bot token, which becomes TELEGRAM_BOT_TOKEN.',
    code: '/newbot',
    label: 'BotFather command',
    note: 'The bot token stays on the backend. Do not paste it into the browser.'
  },
  {
    index: '2',
    title: 'Get the authorized chat ID',
    body: 'Message @userinfobot and copy the numeric user ID it returns. That number becomes TELEGRAM_CHAT_ID and limits access to one Telegram account.',
    code: '@userinfobot',
    label: 'Chat ID helper',
    note: 'If the chat ID is wrong, the bot will stay silent even if the token is valid.'
  },
  {
    index: '3',
    title: 'Add the Telegram env vars',
    body: 'Store the bot token and chat ID in your server environment, then restart the backend so the bot picks them up.',
    code: 'TELEGRAM_BOT_TOKEN=<bot_token>\nTELEGRAM_CHAT_ID=<numeric_chat_id>',
    label: '.env snippet',
    note: 'The dashboard can only test the bot after the backend sees both values.'
  },
  {
    index: '4',
    title: 'Verify the bot',
    body: 'Start the app, then send /start to the bot. You should receive the menu and can confirm the connection from the dashboard test button.',
    code: 'npm run dev\nnpm run frontend:dev',
    label: 'Local dev',
    note: 'Only the configured chat ID can use the bot commands.'
  }
];

const SODEX_STEPS = [
  {
    index: '1',
    title: 'Open SoDEX testnet and sign in',
    body: 'Go to testnet.sodex.dev and sign in with the wallet that will own the account. This is the login step for SoDEX access.',
    code: 'https://testnet.sodex.dev',
    label: 'SoDEX testnet',
    note: 'Use the testnet site and testnet wallet only.'
  },
  {
    index: '2',
    title: 'Set the account address',
    body: 'Copy the SoDEX account or wallet address into SODEX_ACCOUNT_ADDRESS. If the signer and the account are the same wallet, the same address can be used for both.',
    code: 'SODEX_ACCOUNT_ADDRESS=0xYourWalletAddress\nSODEX_TESTNET_PERPS=https://testnet-gw.sodex.dev/api/v1/perps\nSODEX_CHAIN_ID=138565',
    label: 'Account config',
    note: 'Testnet chain ID is 138565.'
  },
  {
    index: '3',
    title: 'Choose a signing mode',
    body: 'Use either a registered API key or the master wallet. For API-key signing, set the key name and the matching private key. For master-wallet signing, leave SODEX_API_KEY_NAME unset and sign with the wallet private key.',
    code: '# Registered API key\nSODEX_API_KEY_NAME=webkey\nSODEX_API_PRIVATE_KEY=0x...\n\n# Master wallet signing\n# leave SODEX_API_KEY_NAME unset\nSODEX_API_PRIVATE_KEY=0x...',
    label: 'Signing modes',
    note: 'Do not set SODEX_API_KEY_NAME to default. Omit it entirely for the master wallet.'
  },
  {
    index: '4',
    title: 'Load a key at runtime if needed',
    body: 'You can also load the signing key through Telegram. Send /setkey, paste the private key, then verify it with /keyinfo.',
    code: '/setkey\n/keyinfo\n/removekey',
    label: 'Telegram key flow',
    note: 'The key is stored on the backend in .sodex_key, not in the browser.'
  }
];

const ENV_ROWS = [
  ['TELEGRAM_BOT_TOKEN', 'BotFather token for the alert bot'],
  ['TELEGRAM_CHAT_ID', 'The one Telegram chat allowed to use the bot'],
  ['SODEX_ACCOUNT_ADDRESS', 'Wallet address that owns the SoDEX account'],
  ['SODEX_API_KEY_NAME', 'Registered SoDEX API key name, or omit for master wallet'],
  ['SODEX_API_PRIVATE_KEY', 'Private key that matches the selected signing mode'],
  ['SODEX_TESTNET_PERPS', 'Perps REST base URL'],
  ['SODEX_CHAIN_ID', '138565 for SoDEX testnet']
] as const;

function CopyBlock({ code, label, note }: CopyBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg-panel)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
        <span className="text-[11px] font-medium text-[var(--text-3)]">{label}</span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="text-[11px] font-medium text-[var(--blue)] transition hover:text-[var(--text-1)]"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-3 font-mono text-[12px] leading-6 whitespace-pre-wrap text-[var(--text-1)]">{code}</pre>
      {note ? <div className="border-t border-[var(--border)] px-3 py-2 text-[11px] leading-5 text-[var(--text-3)]">{note}</div> : null}
    </div>
  );
}

function StepCard({ index, icon, title, body, tone, children }: StepCardProps) {
  const circleTone = {
    cyan: 'border-[rgba(8,145,178,0.24)] bg-[rgba(8,145,178,0.09)] text-[var(--cyan)]',
    purple: 'border-[rgba(99,102,241,0.24)] bg-[rgba(99,102,241,0.09)] text-[var(--purple)]',
    amber: 'border-[rgba(217,119,6,0.24)] bg-[rgba(217,119,6,0.09)] text-[var(--amber)]',
    blue: 'border-[rgba(59,130,246,0.24)] bg-[rgba(59,130,246,0.09)] text-[var(--blue)]'
  }[tone];

  return (
    <article className="rounded-[18px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold ${circleTone}`}>
          {index}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-3)]">{icon}</span>
            <h3 className="text-[14px] font-semibold text-[var(--text-1)]">{title}</h3>
          </div>
          <p className="mt-2 text-[13px] leading-6 text-[var(--text-2)]">{body}</p>
        </div>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </article>
  );
}

function ChecklistItem({ title, body, icon }: ChecklistItemProps) {
  return (
    <div className="flex gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-3">
      <div className="mt-0.5 text-[var(--green)]">{icon}</div>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-[var(--text-1)]">{title}</div>
        <div className="mt-1 text-[12px] leading-5 text-[var(--text-3)]">{body}</div>
      </div>
    </div>
  );
}

export default function TelegramSetupPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Telegram Setup"
        description="Beginner-friendly setup for Telegram alerts and SoDEX access. There is no separate app login here. Telegram handles notifications, and SoDEX access comes from your wallet and signing key."
      />

      <Panel>
        <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Pill tone="cyan">Beginner flow</Pill>
              <Pill tone="purple">Telegram alerts</Pill>
              <Pill tone="amber">SoDEX testnet</Pill>
              <Pill tone="gray">No browser login</Pill>
            </div>

            <div className="max-w-3xl">
              <h2 className="text-[26px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                One guide for the bot, the chat ID, and the trading key.
              </h2>
              <p className="mt-3 text-[14px] leading-7 text-[var(--text-2)]">
                New users usually need the same four things: a Telegram bot token, a numeric chat ID, a SoDEX testnet wallet, and a signing key.
                This page shows the exact path in the same order the app expects it.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[rgba(0,242,255,0.2)] bg-[rgba(0,242,255,0.08)] px-3 text-[13px] font-medium text-[var(--cyan)] transition hover:border-[rgba(0,242,255,0.35)] hover:bg-[rgba(0,242,255,0.12)]"
              >
                Open BotFather
                <ChevronRightIcon className="h-4 w-4" />
              </a>
              <a
                href="https://testnet.sodex.dev"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-[13px] font-medium text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]"
              >
                Open SoDEX testnet
                <ChevronRightIcon className="h-4 w-4" />
              </a>
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-[13px] font-medium text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]"
              >
                Back to dashboard
              </Link>
            </div>
          </div>

          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
            <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--text-3)]">
              Setup at a glance
            </div>
            <div className="mt-3 space-y-3">
              <ChecklistItem
                icon={<CheckIcon className="h-4 w-4" />}
                title="Create the Telegram bot"
                body="Use BotFather to get the bot token."
              />
              <ChecklistItem
                icon={<CheckIcon className="h-4 w-4" />}
                title="Authorize one chat ID"
                body="The bot only responds to the chat ID you store in TELEGRAM_CHAT_ID."
              />
              <ChecklistItem
                icon={<CheckIcon className="h-4 w-4" />}
                title="Pick a SoDEX signing mode"
                body="Use the master wallet or a registered API key, but keep the private key server-side."
              />
            </div>
            <div className="mt-4 rounded-[14px] border border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.08)] px-3 py-3 text-[13px] leading-6 text-[var(--text-2)]">
              <div className="flex items-center gap-2 font-medium text-[var(--amber)]">
                <AlertTriangleIcon className="h-4 w-4" />
                Important
              </div>
              <p className="mt-2">
                If you are new, treat Telegram as alert delivery and SoDEX as the trade environment. The browser never sees your private key.
              </p>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Telegram bot setup" accent="cyan" subtitle="Create the bot, capture the chat ID, then wire the env vars." />
            <div className="space-y-3 p-4">
              {TELEGRAM_STEPS.map((step, index) => (
                <StepCard
                  key={step.index}
                  index={step.index}
                  icon={<TelegramIcon className="h-4 w-4" />}
                  title={step.title}
                  body={step.body}
                  tone={index === 0 ? 'cyan' : index === 1 ? 'blue' : index === 2 ? 'purple' : 'amber'}
                >
                  <CopyBlock code={step.code} label={step.label} note={step.note} />
                </StepCard>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="SoDEX access and login" accent="purple" subtitle="This is the part new users usually miss. SoDEX does not use a separate app login." />
            <div className="space-y-3 p-4">
              {SODEX_STEPS.map((step, index) => (
                <StepCard
                  key={step.index}
                  index={step.index}
                  icon={index < 2 ? <WorldIcon className="h-4 w-4" /> : <ShieldIcon className="h-4 w-4" />}
                  title={step.title}
                  body={step.body}
                  tone={index === 0 ? 'purple' : index === 1 ? 'blue' : index === 2 ? 'amber' : 'cyan'}
                >
                  <CopyBlock code={step.code} label={step.label} note={step.note} />
                </StepCard>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Verification" accent="blue" subtitle="Confirm the full path before you rely on alerts or trading actions." />
            <div className="grid gap-3 p-4 md:grid-cols-3">
              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                <div className="text-[12px] font-medium text-[var(--text-3)]">1. Start services</div>
                <div className="mt-2 text-[13px] leading-6 text-[var(--text-2)]">
                  Run the backend and frontend, then wait for the Telegram bot to connect.
                </div>
                <CopyBlock code={'npm run dev\nnpm run frontend:dev'} label="Local commands" />
              </div>
              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                <div className="text-[12px] font-medium text-[var(--text-3)]">2. Check health</div>
                <div className="mt-2 text-[13px] leading-6 text-[var(--text-2)]">
                  Open /health or the dashboard status bar and confirm Telegram is active.
                </div>
                <CopyBlock code={'GET /health'} label="Health check" />
              </div>
              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                <div className="text-[12px] font-medium text-[var(--text-3)]">3. Send a test</div>
                <div className="mt-2 text-[13px] leading-6 text-[var(--text-2)]">
                  Use the dashboard Telegram test button, then send /start and /menu in the authorized chat.
                </div>
                <CopyBlock code={'/start\n/menu'} label="Telegram commands" />
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Troubleshooting" accent="amber" subtitle="Fast fixes for the most common new-user problems." />
            <div className="grid gap-3 p-4 lg:grid-cols-2">
              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                <div className="text-[13px] font-medium text-[var(--text-1)]">Bot does not reply</div>
                <p className="mt-2 text-[12px] leading-6 text-[var(--text-3)]">
                  Check TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, and restart the backend. If the chat ID is wrong, the bot will ignore the message.
                </p>
              </div>
              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                <div className="text-[13px] font-medium text-[var(--text-1)]">SoDEX API key not found</div>
                <p className="mt-2 text-[12px] leading-6 text-[var(--text-3)]">
                  Make sure the private key matches the registered key name. For master-wallet signing, leave SODEX_API_KEY_NAME unset.
                </p>
              </div>
              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                <div className="text-[13px] font-medium text-[var(--text-1)]">Positions still look empty</div>
                <p className="mt-2 text-[12px] leading-6 text-[var(--text-3)]">
                  Open a position on SoDEX testnet first. Empty positions are expected when the account is flat.
                </p>
              </div>
              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                <div className="text-[13px] font-medium text-[var(--text-1)]">Need to remove access</div>
                <p className="mt-2 text-[12px] leading-6 text-[var(--text-3)]">
                  Use /removekey to clear the Telegram-loaded key and remove TELEGRAM_CHAT_ID if you want to disable the bot.
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4 xl:sticky xl:top-6 self-start">
          <Panel>
            <PanelHeader title="Environment reference" accent="cyan" />
            <div className="p-4">
              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-panel)]">
                <div className="border-b border-[var(--border)] px-3 py-2 text-[11px] font-medium text-[var(--text-3)]">
                  Required variables
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {ENV_ROWS.map(([name, use]) => (
                    <div key={name} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-3 py-3 text-[12px]">
                      <div className="font-mono text-[var(--text-1)]">{name}</div>
                      <div className="text-[var(--text-3)]">{use}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Copy this template" accent="purple" />
            <div className="space-y-3 p-4">
              <CopyBlock
                label="Telegram"
                code={'TELEGRAM_BOT_TOKEN=<bot_token>\nTELEGRAM_CHAT_ID=<numeric_chat_id>'}
                note="Telegram is only for alerts and commands."
              />
              <CopyBlock
                label="SoDEX"
                code={'SODEX_ACCOUNT_ADDRESS=0xYourWalletAddress\nSODEX_API_KEY_NAME=webkey\nSODEX_API_PRIVATE_KEY=0x...\nSODEX_TESTNET_PERPS=https://testnet-gw.sodex.dev/api/v1/perps\nSODEX_CHAIN_ID=138565'}
                note="If you use the master wallet, omit SODEX_API_KEY_NAME."
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Runtime key flow" accent="amber" />
            <div className="space-y-3 p-4">
              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-3 text-[12px] leading-6 text-[var(--text-2)]">
                Send <span className="font-mono text-[var(--text-1)]">/setkey</span> to the Telegram bot when you want to load a key without editing the env file.
              </div>
              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-3 text-[12px] leading-6 text-[var(--text-2)]">
                The bot stores the key on the backend only. Use <span className="font-mono text-[var(--text-1)]">/keyinfo</span> to confirm it and <span className="font-mono text-[var(--text-1)]">/removekey</span> to clear it.
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="One rule to remember" accent="blue" />
            <div className="space-y-3 p-4 text-[13px] leading-6 text-[var(--text-2)]">
              <div className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 h-4 w-4 text-[var(--green)]" />
                <p>Telegram is the alert channel, not the login screen.</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 h-4 w-4 text-[var(--green)]" />
                <p>SoDEX access is the wallet and the signing key.</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 h-4 w-4 text-[var(--green)]" />
                <p>Private keys stay on the backend, never in the browser.</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
