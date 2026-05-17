'use client';

import { fetchMacro } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cryptoSensitivity, macroImpact, sortMacroEvents } from '@/lib/terminal';
import { usePollingResource } from '@/lib/usePollingResource';

import {
  EmptyState,
  ErrorCard,
  MetricCard,
  PageHeader,
  Panel,
  PanelHeader,
  Pill,
  SkeletonBlock
} from '@/components/terminal/ui';

export default function MacroPage() {
  const macro = usePollingResource({ fetcher: fetchMacro, intervalMs: 300000 });
  const events = sortMacroEvents(macro.data || []);
  const highImpact = events.filter((event) => macroImpact(event) === 'High').length;
  const mediumImpact = events.filter((event) => macroImpact(event) === 'Medium').length;

  return (
    <div className="space-y-4">
      <PageHeader title="Macro" description="Upcoming macro releases and their likely crypto pressure profile." />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Upcoming Events" value={events.length} supporting="Next 48 hours" />
        <MetricCard label="High Impact" value={highImpact} tone={highImpact > 0 ? 'red' : 'default'} supporting="Priority watchlist" />
        <MetricCard label="Medium Impact" value={mediumImpact} tone="amber" supporting="Conditional volatility" />
      </div>

      <Panel>
        <PanelHeader title="Macro Calendar" accent="amber" />
        <div className="overflow-x-auto">
          {macro.loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : macro.error ? (
            <div className="p-4">
              <ErrorCard message={macro.error} onRetry={() => void macro.refresh()} />
            </div>
          ) : events.length === 0 ? (
            <EmptyState title="No macro calendar rows" description="Upcoming events will render here when the feed is available." />
          ) : (
            <table className="min-w-full text-left">
              <thead className="bg-[var(--bg-panel)] text-[11px] text-[var(--text-3)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Impact</th>
                  <th className="px-4 py-3 font-medium">Crypto Sensitivity</th>
                  <th className="px-4 py-3 font-medium">Forecast</th>
                  <th className="px-4 py-3 font-medium">Previous</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, index) => {
                  const impact = macroImpact(event);

                  return (
                    <tr key={`${event.name}-${event.eventTime}-${index}`} className="border-t border-[var(--border)] text-[13px] hover:bg-[var(--bg-panel)]">
                      <td className="px-4 py-3 text-[var(--text-1)]">{event.name || 'Macro Event'}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{formatDateTime(event.eventTime || event.releaseDate || null)}</td>
                      <td className="px-4 py-3">
                        <Pill tone={impact === 'High' ? 'red' : impact === 'Medium' ? 'amber' : 'gray'}>{impact}</Pill>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{cryptoSensitivity(event)}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{String(event.forecast || '—')}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{String(event.previous || '—')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
    </div>
  );
}
