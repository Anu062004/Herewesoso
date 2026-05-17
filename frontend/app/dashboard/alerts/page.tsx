'use client';

import { useMemo, useState } from 'react';

import { fetchAlerts } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { alertSourceLabel, alertTone, isUnreadAlert } from '@/lib/terminal';
import { usePollingResource } from '@/lib/usePollingResource';
import type { SeverityFilter } from '@/lib/types';

import {
  EmptyState,
  ErrorCard,
  PageHeader,
  Panel,
  PanelHeader,
  Pill,
  PollingIndicator,
  SkeletonBlock
} from '@/components/terminal/ui';

export default function AlertsPage() {
  const alerts = usePollingResource({ fetcher: fetchAlerts, intervalMs: 30000 });
  const [filter, setFilter] = useState<SeverityFilter>('ALL');

  const filteredAlerts = useMemo(() => {
    const rows = alerts.data || [];

    if (filter === 'ALL') {
      return rows;
    }

    if (filter === 'CRITICAL') {
      return rows.filter((alert) => alert.severity === 'CRITICAL' || alert.severity === 'DANGER');
    }

    return rows.filter((alert) => alert.severity === filter);
  }, [alerts.data, filter]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Alerts"
        description="Live alert feed from liquidation, macro, and narrative modules."
        right={<PollingIndicator freshness={alerts.freshness} nextPollInMs={alerts.nextPollInMs} />}
      />

      <div className="flex flex-wrap gap-2">
        {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as SeverityFilter[]).map((value) => {
          const active = filter === value;

          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={
                active
                  ? 'inline-flex h-8 items-center rounded-md border border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.12)] px-3 text-[12px] text-[var(--blue)]'
                  : 'inline-flex h-8 items-center rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-[12px] text-[var(--text-2)]'
              }
            >
              {value === 'ALL' ? 'All' : value === 'CRITICAL' ? 'Critical' : value === 'WARNING' ? 'Warning' : 'Info'}
            </button>
          );
        })}
      </div>

      <Panel>
        <PanelHeader title="Alert Feed" accent="blue" />
        <div className="space-y-3 p-4">
          {alerts.loading ? (
            <>
              <SkeletonBlock className="h-24 w-full" />
              <SkeletonBlock className="h-24 w-full" />
              <SkeletonBlock className="h-24 w-full" />
            </>
          ) : alerts.error ? (
            <ErrorCard message={alerts.error} onRetry={() => void alerts.refresh()} />
          ) : filteredAlerts.length === 0 ? (
            <EmptyState title="No alerts for this filter" description="Switch filters or wait for the next cycle to populate the feed." />
          ) : (
            filteredAlerts.map((alert) => {
              const tone = alertTone(alert.severity);
              const unread = isUnreadAlert(alert);

              return (
                <article
                  key={alert.id || `${alert.message}-${alert.created_at}`}
                  className={unread ? 'rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)]' : 'rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)]'}
                >
                  <div className="flex gap-0">
                    <span
                      className="w-[3px] rounded-l-[10px]"
                      style={{
                        backgroundColor:
                          tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : 'var(--cyan)'
                      }}
                    />
                    <div className="flex-1 px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : 'cyan'}>
                          {alert.severity === 'DANGER' ? 'Critical' : alert.severity}
                        </Pill>
                        <Pill tone="gray">{alertSourceLabel(alert.alert_type)}</Pill>
                      </div>
                      <div className="mt-3 text-[14px] text-[var(--text-1)]">{alert.message}</div>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-3)]">
                        <span>{formatDateTime(alert.created_at || null)}</span>
                        {alert.telegram_sent ? <span>↗ Sent to Telegram</span> : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );
}
