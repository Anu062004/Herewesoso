'use client';

import type { ReactNode } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';

import { fetchAgentRuns, fetchHealth, sendTelegramTest, triggerCycle } from '@/lib/api';
import { formatDateTime, formatDuration, formatRelativeTime, initials } from '@/lib/format';
import { parseRunSummary } from '@/lib/terminal';
import { usePollingResource } from '@/lib/usePollingResource';

import { ConfirmationModal } from '@/components/terminal/ConfirmationModal';
import {
  AntennaIcon,
  BellIcon,
  BriefcaseIcon,
  CandleIcon,
  CheckIcon,
  DashboardIcon,
  NotesIcon,
  RadarIcon,
  ShieldIcon,
  TelegramIcon,
  WorldIcon
} from '@/components/terminal/icons';
import { Button, Dot, Pill, PollingIndicator, cx } from '@/components/terminal/ui';

interface DashboardShellProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  dot?: 'purple' | 'cyan';
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'INTELLIGENCE',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: <DashboardIcon className="h-4 w-4" /> },
      { label: 'Narrative Scanner', href: '/dashboard/scanner', icon: <AntennaIcon className="h-4 w-4" />, dot: 'purple' },
      { label: 'Liquidation Shield', href: '/dashboard/shield', icon: <ShieldIcon className="h-4 w-4" />, dot: 'cyan' }
    ]
  },
  {
    label: 'RISK',
    items: [
      { label: 'Positions', href: '/dashboard/positions', icon: <BriefcaseIcon className="h-4 w-4" /> },
      { label: 'Alerts', href: '/dashboard/alerts', icon: <BellIcon className="h-4 w-4" /> },
      { label: 'Trade Memos', href: '/dashboard/memos', icon: <NotesIcon className="h-4 w-4" /> }
    ]
  },
  {
    label: 'DATA',
    items: [
      { label: 'Macro', href: '/dashboard/macro', icon: <WorldIcon className="h-4 w-4" /> },
      { label: 'SoDEX Markets', href: '/dashboard/sodex/markets', icon: <CandleIcon className="h-4 w-4" /> },
      { label: 'Signals', href: '/dashboard/signals', icon: <RadarIcon className="h-4 w-4" /> }
    ]
  }
];

export default function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
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
  const statusTone =
    runStatus === 'completed' ? 'green' : runStatus === 'failed' ? 'red' : runStatus === 'running' ? 'cyan' : 'gray';

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[rgba(6,182,212,0.2)] bg-[rgba(6,182,212,0.12)] text-[var(--cyan)]">
              <ShieldIcon className="h-4 w-4" />
            </span>
            <div className="text-[15px] font-semibold text-[var(--text-1)]">Sentinel Finance</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className={groupIndex === 0 ? '' : 'mt-5'}>
              <div className="px-3 text-[10px] font-medium tracking-[0.16em] text-[var(--text-3)]">{group.label}</div>
              <div className="mt-2 space-y-1">
                {group.items.map((item) => {
                  const active = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
                  const navDotTone =
                    item.dot === 'purple'
                      ? runStatus === 'running'
                        ? 'purple'
                        : undefined
                      : item.dot === 'cyan'
                        ? health.data?.status === 'ok'
                          ? 'cyan'
                          : undefined
                        : undefined;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cx(
                        'relative flex h-10 items-center gap-3 rounded-md border border-transparent px-3 text-[14px] text-[var(--text-2)] transition',
                        active
                          ? 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)]'
                          : 'hover:border-[var(--border)] hover:bg-[var(--bg-card)] hover:text-[var(--text-1)]'
                      )}
                    >
                      {active ? <span className="absolute left-0 top-0 h-full w-[3px] rounded-r-full bg-[var(--blue)]" /> : null}
                      <span className="text-current">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                      {navDotTone ? <Dot tone={navDotTone} /> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-medium text-[var(--text-1)]">Agent Run</div>
              <Dot tone={statusTone} />
            </div>
            <div className="mt-3 space-y-2 text-[11px] text-[var(--text-3)]">
              <div className="flex items-center justify-between gap-3">
                <span>Start</span>
                <span className="text-[var(--text-2)]">{formatDateTime(lastRun?.created_at || null)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Duration</span>
                <span className="text-[var(--text-2)]">{formatDuration(lastRun?.duration_ms)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Status</span>
                <Pill
                  tone={statusTone === 'green' ? 'green' : statusTone === 'red' ? 'red' : statusTone === 'cyan' ? 'cyan' : 'gray'}
                >
                  {runStatus === 'completed' ? 'Success' : runStatus === 'failed' ? 'Failed' : runStatus === 'running' ? 'Running' : 'Idle'}
                </Pill>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Modules</span>
                <div className="flex items-center gap-2 text-[var(--text-2)]">
                  <span className="inline-flex items-center gap-1">
                    Scanner {narrativeSuccess ? <CheckIcon className="h-3 w-3 text-[var(--green)]" /> : <span className="text-[var(--text-3)]">•</span>}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    Shield {shieldSuccess ? <CheckIcon className="h-3 w-3 text-[var(--green)]" /> : <span className="text-[var(--text-3)]">•</span>}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <PollingIndicator freshness={runs.freshness} nextPollInMs={runs.nextPollInMs} />
              <Button
                tone="primary"
                className="h-8 px-3 text-[12px]"
                onClick={() =>
                  setActionModal({
                    title: 'Trigger Manual Run',
                    description: 'This will queue an orchestrator cycle for the Narrative Scanner and Liquidation Shield modules.',
                    confirmLabel: 'Confirm',
                    disclaimer: 'Wave 1 — No real signing',
                    onConfirm: async () => {
                      const result = await triggerCycle();
                      await runs.refresh();
                      return {
                        title: result.success ? 'Manual run started' : 'Manual run response',
                        message: result.error || result.message || (result.success ? 'The orchestrator cycle completed and the panel has been refreshed.' : 'The run request returned without a success flag.')
                      };
                    }
                  })
                }
              >
                Trigger Manual Run
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen bg-[var(--bg-surface)] pl-[240px]">
        <header className="fixed left-[240px] right-0 top-0 z-30 h-14 border-b border-[var(--border)] bg-[var(--bg-surface)]">
          <div className="flex h-full items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <span className="text-[var(--cyan)]">
                <ShieldIcon className="h-4 w-4" />
              </span>
              <span className="text-[15px] font-semibold text-[var(--text-1)]">Sentinel Finance</span>
            </div>

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Pill tone="amber">Testnet</Pill>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTelegramOpen((open) => !open)}
                  className="inline-flex items-center gap-2 text-[13px] text-[var(--text-2)] transition hover:text-[var(--text-1)]"
                >
                  <Dot tone={health.data?.telegram.connected ? 'green' : 'red'} />
                  <span>{health.data?.telegram.connected ? 'Telegram Active' : 'Telegram Disconnected'}</span>
                </button>
                {telegramOpen ? (
                  <div className="absolute right-0 top-[calc(100%+10px)] w-[260px] rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-1)]">
                      <TelegramIcon className="h-4 w-4 text-[var(--cyan)]" />
                      Telegram Status
                    </div>
                    <div className="mt-3 text-[12px] text-[var(--text-3)]">Last message sent</div>
                    <div className="mt-1 text-[13px] text-[var(--text-2)]">
                      {formatDateTime(health.data?.telegram.lastMessageSentAt || null)}
                    </div>
                    <Button
                      className="mt-4 h-8 w-full text-[12px]"
                      onClick={() => {
                        setTelegramOpen(false);
                        setActionModal({
                          title: 'Send Telegram Test',
                          description: 'This will send a connectivity test message to the configured Telegram chat.',
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

              <div className="text-[11px] text-[var(--text-3)]">Last run: {formatRelativeTime(lastRun?.created_at || null)}</div>

              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[12px] font-semibold text-[var(--text-1)]">
                {initials('Sentinel Finance')}
              </div>
            </div>
          </div>
        </header>

        <main className="px-6 pb-8 pt-[80px]">{children}</main>
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
