import type { MacroEvent } from '@/lib/types';

function getEventTime(event: MacroEvent) {
  return event.eventTime || event.releaseDate || event.date || event.time || '';
}

function getImpactLabel(event: MacroEvent) {
  const haystack = `${event.name || ''} ${event.importance || ''}`.toLowerCase();

  if (haystack.includes('cpi') || haystack.includes('fomc') || haystack.includes('nfp') || haystack.includes('inflation') || haystack.includes('high')) {
    return { label: 'HIGH', className: 'border-danger/30 bg-danger/10 text-danger' };
  }

  if (haystack.includes('gdp') || haystack.includes('jobs') || haystack.includes('pce') || haystack.includes('medium')) {
    return { label: 'MED', className: 'border-caution/30 bg-caution/10 text-caution' };
  }

  return { label: 'LOW', className: 'border-white/10 bg-white/5 text-zinc-300' };
}

export default function MacroCalendar({ events }: { events: MacroEvent[] }) {
  const sortedEvents = [...events]
    .filter((event) => getEventTime(event))
    .sort((left, right) => new Date(getEventTime(left)).getTime() - new Date(getEventTime(right)).getTime())
    .slice(0, 8);

  return (
    <section className="panel rounded-3xl p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Macro Calendar</p>
          <h2 className="mt-3 font-headline text-2xl font-bold text-white">Upcoming catalysts</h2>
        </div>
        <p className="font-mono text-xs text-zinc-500">{sortedEvents.length} events loaded</p>
      </div>

      <div className="terminal-rule my-5" />

      {sortedEvents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-zinc-500">
          No macro events loaded yet. Configure SoSoValue and this timeline will populate automatically.
        </div>
      ) : (
        <div className="relative space-y-4 pl-4 before:absolute before:bottom-3 before:left-0 before:top-3 before:w-px before:bg-white/10">
          {sortedEvents.map((event, index) => {
            const impact = getImpactLabel(event);
            const eventTime = getEventTime(event);

            return (
              <article
                key={`${event.name || 'event'}-${eventTime}-${index}`}
                className="relative rounded-2xl border border-white/10 bg-black/25 p-4"
              >
                <span className="absolute -left-[1.15rem] top-6 h-3 w-3 rounded-full border border-accent/40 bg-accent/90" />
                <div className="grid gap-3 md:grid-cols-[170px_1fr_auto]">
                  <div className="font-mono text-xs text-zinc-500">
                    {eventTime ? new Date(eventTime).toLocaleString() : 'TBD'}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-50">{event.name || 'Unnamed event'}</h3>
                    <p className="mt-2 text-sm text-zinc-400">
                      {[event.country, event.forecast ? `Forecast: ${event.forecast}` : null]
                        .filter(Boolean)
                        .join(' | ') || 'No extra metadata available'}
                    </p>
                  </div>
                  <div className={`h-fit rounded-full border px-2.5 py-1 text-xs tracking-[0.16em] ${impact.className}`}>
                    {impact.label}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
