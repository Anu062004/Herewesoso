import type { MemoRow } from '@/lib/types';

export default function TradeMemo({ memos }: { memos: MemoRow[] }) {
  const latest = memos[0];

  return (
    <section className="panel rounded-3xl p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Claude AI Memos</p>
          <h2 className="mt-3 font-headline text-2xl font-bold text-white">Latest memo</h2>
        </div>
        <p className="font-mono text-xs text-zinc-500">{memos.length} stored memos</p>
      </div>

      <div className="terminal-rule my-5" />

      {latest ? (
        <article className="rounded-2xl border border-white/8 bg-black/20 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="data-label">{latest.memo_type}</p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                {latest.related_symbol || 'System memo'}
              </h3>
            </div>
            <span className="font-mono text-xs text-zinc-500">
              {latest.created_at ? new Date(latest.created_at).toLocaleString() : ''}
            </span>
          </div>
          <p className="mt-4 text-sm leading-7 text-zinc-300">{latest.content}</p>
        </article>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-zinc-500">
          No memos yet. Run a cycle and the latest Claude note will appear here.
        </div>
      )}
    </section>
  );
}
