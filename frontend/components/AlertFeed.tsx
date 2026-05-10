import type { AlertRow } from '@/lib/types';

function tone(severity: AlertRow['severity']) {
  if (severity === 'INFO') return 'border-safe/25 bg-safe/5';
  if (severity === 'WARNING') return 'border-caution/25 bg-caution/5';
  return 'border-danger/25 bg-danger/10';
}

export default function AlertFeed({ alerts }: { alerts: AlertRow[] }) {
  return (
    <section className="panel rounded-3xl p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Recent Alerts</p>
          <h2 className="mt-3 font-headline text-2xl font-bold text-white">Alert feed</h2>
        </div>
        <p className="font-mono text-xs text-zinc-500">{alerts.length} recent alerts</p>
      </div>

      <div className="terminal-rule my-5" />

      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-zinc-500">
            No alerts have been logged yet.
          </div>
        ) : (
          alerts.map((alert) => (
            <article
              key={alert.id || `${alert.title}-${alert.created_at}`}
              className={`rounded-2xl border px-4 py-4 ${tone(alert.severity)}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="data-label">{alert.alert_type}</p>
                  <h3 className="mt-2 text-base font-semibold text-white">{alert.title}</h3>
                </div>
                <span className="font-mono text-xs text-zinc-500">
                  {alert.created_at ? new Date(alert.created_at).toLocaleTimeString() : ''}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-300">
                {alert.message}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
