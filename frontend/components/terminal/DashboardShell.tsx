'use client';

import type { FormEvent, ReactNode } from 'react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { fetchAgentRuns, fetchHealth, sendTelegramTest, triggerCycle } from '@/lib/api';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { shortWallet } from '@/lib/sodexConnection';
import { parseRunSummary } from '@/lib/terminal';
import { useSodexConnection } from '@/lib/useSodexConnection';
import { usePollingResource } from '@/lib/usePollingResource';

import { ConfirmationModal } from '@/components/terminal/ConfirmationModal';
import {
  AntennaIcon,
  AvatarIcon,
  BellIcon,
  BriefcaseIcon,
  CandleIcon,
  DashboardIcon,
  NotesIcon,
  RadarIcon,
  SearchIcon,
  ShieldIcon,
  TelegramIcon,
  WorldIcon
} from '@/components/terminal/icons';
import { Button, Dot, cx } from '@/components/terminal/ui';

interface DashboardShellProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  aliases: string[];
}

const PRIMARY_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <DashboardIcon className="h-4 w-4" />, aliases: ['home', 'overview'] },
  { label: 'Narrative Scanner', href: '/dashboard/scanner', icon: <AntennaIcon className="h-4 w-4" />, aliases: ['scanner', 'narrative', 'alpha'] },
  { label: 'Liquidation Shield', href: '/dashboard/shield', icon: <ShieldIcon className="h-4 w-4" />, aliases: ['shield', 'liquidation', 'risk'] },
  { label: 'Positions', href: '/dashboard/positions', icon: <BriefcaseIcon className="h-4 w-4" />, aliases: ['position', 'portfolio'] },
  { label: 'SoDEX Connect', href: '/dashboard/sodex/connect', icon: <AvatarIcon className="h-4 w-4" />, aliases: ['sodex', 'connect', 'wallet', 'login', 'mainnet', 'testnet'] },
  { label: 'SoDEX Markets', href: '/dashboard/sodex/markets', icon: <CandleIcon className="h-4 w-4" />, aliases: ['markets', 'sodex', 'prices'] },
];

const MORE_NAV_ITEMS: NavItem[] = [
  { label: 'Performance', href: '/dashboard/performance', icon: <RadarIcon className="h-4 w-4" />, aliases: ['performance', 'evidence', 'proof', 'accuracy'] },
  { label: 'Execution Audit', href: '/dashboard/executions', icon: <NotesIcon className="h-4 w-4" />, aliases: ['execution', 'audit', 'ledger', 'signed'] },
  { label: 'Alerts', href: '/dashboard/alerts', icon: <BellIcon className="h-4 w-4" />, aliases: ['alert', 'warning'] },
  { label: 'Trade Memos', href: '/dashboard/memos', icon: <NotesIcon className="h-4 w-4" />, aliases: ['memo', 'notes'] },
  { label: 'Macro', href: '/dashboard/macro', icon: <WorldIcon className="h-4 w-4" />, aliases: ['macro', 'calendar', 'fed'] },
  { label: 'Signals', href: '/dashboard/signals', icon: <RadarIcon className="h-4 w-4" />, aliases: ['signals', 'heatmap'] },
  { label: 'NewsFeed', href: '/dashboard/news', icon: <WorldIcon className="h-4 w-4" />, aliases: ['news', 'feed', 'headlines'] },
  { label: 'Telegram Setup', href: '/dashboard/telegram', icon: <TelegramIcon className="h-4 w-4" />, aliases: ['telegram', 'bot', 'setup'] }
];

const NAV_ITEMS: NavItem[] = [...PRIMARY_NAV_ITEMS, ...MORE_NAV_ITEMS];

function isActive(pathname: string, href: string) {
  return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
}

function routeForSearch(term: string) {
  const normalized = term.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const navHit = NAV_ITEMS.find((item) => {
    return item.label.toLowerCase().includes(normalized) || item.aliases.some((alias) => alias.includes(normalized));
  });

  if (navHit) {
    return navHit.href;
  }

  const symbol = term.trim().toUpperCase();
  if (/^[A-Z0-9]{2,12}(-USD)?$/.test(symbol)) {
    return `/dashboard/sodex/orderbook?symbol=${encodeURIComponent(symbol.includes('-') ? symbol : `${symbol}-USD`)}`;
  }

  return '/dashboard/news';
}

function TapeItem({
  label,
  value,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'green' | 'red' | 'amber' | 'blue';
}) {
  const toneClass = {
    neutral: 'text-white',
    green: 'text-[#4ade80]',
    red: 'text-[#f87171]',
    amber: 'text-[#fbbf24]',
    blue: 'text-[#93c5fd]'
  }[tone];

  return (
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap tabular-nums">
      <span className="text-[var(--text-3)]">{label}</span>
      <span className={cx('font-medium', toneClass)}>{value}</span>
    </span>
  );
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const sodexConnection = useSodexConnection();
  const [searchTerm, setSearchTerm] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [actionModal, setActionModal] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    disclaimer?: string;
    onConfirm: () => Promise<{ title?: string; message: string }>;
  } | null>(null);

  const health = usePollingResource({
    fetcher: fetchHealth,
    intervalMs: 30000
  });
  const runs = usePollingResource({
    fetcher: fetchAgentRuns,
    intervalMs: 30000
  });

  const lastRun = runs.data?.lastRun || null;
  const summary = useMemo(() => parseRunSummary(lastRun?.summary), [lastRun?.summary]);
  const narrativeSuccess = summary?.narrativeSuccess !== false;
  const shieldSuccess = summary?.shieldSuccess !== false;
  const runStatus = String(lastRun?.status || 'idle').toLowerCase();
  const telegramTone = !health.data ? 'gray' : health.data.telegram.connected ? 'green' : 'red';
  const sodexSignerReady = health.data?.sodex?.tradingKeyConfigured;
  const hasActiveSecondaryNav = MORE_NAV_ITEMS.some((item) => isActive(pathname, item.href));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const route = routeForSearch(searchTerm);
    if (route) {
      router.push(route);
      setSearchTerm('');
    }
  }

  return (
    <>
      <div className="min-h-screen bg-[var(--bg-app)]">
        <div className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border)] bg-[var(--bg-surface)]/95 shadow-[0_1px_0_rgba(255,255,255,0.04)] backdrop-blur">
          <div className="border-b border-[var(--border)] bg-[var(--bg-app)] text-[12px]">
            <div className="mx-auto flex h-9 max-w-[1520px] items-center gap-6 overflow-x-auto px-4 sm:px-6">
              <TapeItem label="Terminal" value="Gold and Grith Live" tone="amber" />
              <TapeItem label="Run" value={runStatus === 'completed' ? 'Success' : runStatus === 'failed' ? 'Failed' : runStatus === 'running' ? 'Running' : 'Idle'} tone={runStatus === 'failed' ? 'red' : runStatus === 'running' ? 'blue' : 'green'} />
              <TapeItem label="Narrative" value={narrativeSuccess ? 'Scanner OK' : 'Check'} tone={narrativeSuccess ? 'green' : 'amber'} />
              <TapeItem label="Shield" value={shieldSuccess ? 'Risk OK' : 'Check'} tone={shieldSuccess ? 'green' : 'amber'} />
              <TapeItem label="Telegram" value={health.data?.telegram.connected ? 'Active' : 'Disconnected'} tone={health.data?.telegram.connected ? 'green' : 'red'} />
              <TapeItem
                label="SoDEX"
                value={
                  sodexSignerReady === undefined
                    ? 'Signer Check'
                    : sodexSignerReady
                      ? 'Signer Ready'
                      : 'Signer Missing'
                }
                tone={sodexSignerReady === false ? 'red' : sodexSignerReady ? 'green' : 'amber'}
              />
              <TapeItem label="Last run" value={formatRelativeTime(lastRun?.created_at || null)} />
            </div>
          </div>

          <header className="mx-auto flex min-h-[68px] max-w-[1520px] flex-wrap items-center gap-3 px-4 py-3.5 sm:px-6">
            <Link href="/" className="flex min-w-0 max-w-[230px] flex-1 items-center gap-2.5 transition-opacity hover:opacity-90 sm:min-w-[240px] sm:max-w-none sm:flex-none" aria-label="Gold and Grith home">
              <img src="/brand/gold-and-grith-mark.svg" alt="" className="h-10 w-10 shrink-0" />
              <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap font-headline text-[17px] font-bold tracking-[-0.035em] text-[var(--text-1)]">
                <span>Gold</span>
                <span className="text-[var(--brand)]">&amp;</span>
                <span>Grith</span>
              </span>
            </Link>

            <form onSubmit={handleSearch} className="relative order-3 min-w-full flex-1 md:order-none md:min-w-[320px]">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search sector / symbol / macro / alert"
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-panel)] pl-10 pr-3 text-[13px] text-[var(--text-1)] outline-none transition-[border-color,background,box-shadow] duration-[var(--dur-short)] placeholder:text-[var(--text-3)] focus:border-[var(--brand)] focus:bg-[var(--bg-elevated)] focus:shadow-[0_0_0_3px_rgba(255,107,0,0.12)]"
              />
            </form>

            <div className="order-2 grid w-full shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:order-none sm:ml-auto sm:flex sm:w-auto sm:justify-start sm:gap-3">
              <Link
                href="/dashboard/sodex/connect"
                className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-[12px] text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]"
              >
                <Dot tone={sodexConnection ? (sodexConnection.network === 'mainnet' ? 'amber' : 'cyan') : 'gray'} />
                <span className="hidden lg:inline">
                  {sodexConnection
                    ? `${sodexConnection.network === 'mainnet' ? 'Mainnet' : 'Testnet'} ${shortWallet(sodexConnection.address)}`
                    : 'Connect SoDEX'}
                </span>
                <AvatarIcon className="h-4 w-4 lg:hidden" />
              </Link>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTelegramOpen((open) => !open)}
                  className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-[13px] text-[var(--text-2)] transition-[border-color,color,background] duration-[var(--dur-short)] hover:border-[var(--border-hover)] hover:text-[var(--text-1)]"
                >
                  <Dot tone={telegramTone} />
                  <span className="hidden sm:inline">{health.data?.telegram.connected ? 'Telegram Active' : 'Telegram Off'}</span>
                  <TelegramIcon className="h-4 w-4 text-[var(--cyan)] sm:hidden" />
                </button>
                {telegramOpen ? (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-[var(--z-dropdown)] w-[280px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow-md)]">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-1)]">
                      <TelegramIcon className="h-4 w-4 text-[var(--cyan)]" />
                      Telegram Status
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                      <div>
                        <div className="text-[var(--text-3)]">State</div>
                        <div className="mt-1 text-[var(--text-1)]">{health.data?.telegram.connected ? 'Connected' : 'Disconnected'}</div>
                      </div>
                      <div>
                        <div className="text-[var(--text-3)]">Last sent</div>
                        <div className="mt-1 text-[var(--text-1)]">{formatDateTime(health.data?.telegram.lastMessageSentAt || null)}</div>
                      </div>
                    </div>
                    <Link
                      href="/dashboard/telegram"
                      className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-panel)] px-3 text-[12px] text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]"
                    >
                      Open setup guide
                    </Link>
                    <Button
                      className="mt-4 h-8 w-full text-[12px]"
                      onClick={() => {
                        setTelegramOpen(false);
                        setActionModal({
                          title: 'Send Telegram Test',
                          description: 'Send a connectivity test message to the configured Telegram chat.',
                          confirmLabel: 'Send Test',
                          disclaimer: 'Operational check only',
                          onConfirm: async () => {
                            const result = await sendTelegramTest();
                            await health.refresh();
                            return {
                              title: 'Telegram message sent',
                              message: result.message
                            };
                          }
                        });
                      }}
                    >
                      Send Test
                    </Button>
                  </div>
                ) : null}
              </div>

              <Button
                tone="primary"
                className="h-9 w-full px-3 text-[12px] sm:w-auto"
                onClick={() =>
                  setActionModal({
                    title: 'Trigger Manual Run',
                    description: 'Queue an orchestrator cycle for Narrative Scanner and Liquidation Shield modules.',
                    confirmLabel: 'Confirm',
                    disclaimer: 'Wave 1 - No real signing',
                    onConfirm: async () => {
                      const result = await triggerCycle();
                      await runs.refresh();
                      return {
                        title: result.success ? 'Manual run started' : 'Manual run response',
                        message: result.error || result.message || (result.success ? 'The orchestrator cycle completed and the page has refreshed.' : 'The run request returned without a success flag.')
                      };
                    }
                  })
                }
              >
                <span className="hidden sm:inline">Trigger Run</span>
                <span className="sm:hidden">Run</span>
              </Button>

              <div className="hidden h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-panel)] p-1.5 sm:flex">
                <img src="/brand/gold-and-grith-mark.svg" alt="" className="h-full w-full" />
              </div>
            </div>
          </header>

          <nav className="border-t border-[var(--border)] bg-[var(--bg-surface)]">
            <div className="mx-auto flex max-w-[1520px] items-center gap-1 overflow-x-auto px-3 py-1.5 sm:px-5">
              {PRIMARY_NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cx(
                      'relative inline-flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius-md)] px-3 text-[13px] font-medium transition-[color,background] duration-[var(--dur-short)]',
                      active
                        ? 'bg-[var(--brand-soft)] text-[var(--text-1)]'
                        : 'text-[var(--text-2)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-1)]'
                    )}
                  >
                    <span className={active ? 'text-[var(--brand)]' : 'text-[var(--text-3)]'}>{item.icon}</span>
                    <span className="whitespace-nowrap">{item.label}</span>
                    {active ? <span className="absolute inset-x-3 -bottom-1.5 h-0.5 rounded-full bg-[var(--brand)]" /> : null}
                  </Link>
                );
              })}

              <div className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setMoreOpen((open) => !open)}
                  className={cx(
                    'relative inline-flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius-md)] px-3 text-[13px] font-medium transition-[color,background] duration-[var(--dur-short)]',
                    hasActiveSecondaryNav || moreOpen
                      ? 'bg-[var(--brand-soft)] text-[var(--text-1)]'
                      : 'text-[var(--text-2)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-1)]'
                  )}
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                >
                  <NotesIcon className={hasActiveSecondaryNav || moreOpen ? 'h-4 w-4 text-[var(--brand)]' : 'h-4 w-4 text-[var(--text-3)]'} />
                  <span>More</span>
                </button>

                {moreOpen ? (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-[var(--z-dropdown)] w-[268px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-2 shadow-[var(--shadow-md)]">
                    <div className="px-3 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-3)]">
                      Secondary sections
                    </div>
                    <div className="space-y-1">
                      {MORE_NAV_ITEMS.map((item) => {
                        const active = isActive(pathname, item.href);

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMoreOpen(false)}
                            className={cx(
                              'flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-[13px] transition',
                              active
                                ? 'bg-[var(--brand-soft)] text-[var(--text-1)]'
                                : 'text-[var(--text-2)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-1)]'
                            )}
                          >
                            <span className={active ? 'text-[var(--brand)]' : 'text-[var(--text-3)]'}>{item.icon}</span>
                            <span className="whitespace-nowrap">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </nav>
        </div>

        <main className="mx-auto max-w-[1520px] px-4 py-6 sm:px-6">{children}</main>
      </div>

      <ConfirmationModal
        open={Boolean(actionModal)}
        title={actionModal?.title || ''}
        description={actionModal?.description || ''}
        confirmLabel={actionModal?.confirmLabel}
        disclaimer={actionModal?.disclaimer}
        onClose={() => setActionModal(null)}
        onConfirm={async () => {
          if (!actionModal) {
            return { message: 'No action configured.' };
          }

          return actionModal.onConfirm();
        }}
      />
    </>
  );
}
