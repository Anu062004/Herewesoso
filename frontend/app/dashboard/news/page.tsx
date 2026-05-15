'use client';

import { useEffect, useState } from 'react';
import { fetchNews, fetchHotNews, fetchETFData, fetchMacroEvents, type NewsArticle, type ETFResponse, type MacroResponse } from '@/lib/api';

type Tab = 'all' | 'hot' | 'etf' | 'macro';

function timeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    'DeFi': 'border-accent/25 bg-accent/10 text-accent',
    'AI': 'border-magenta/25 bg-magenta/10 text-magenta',
    'Trending': 'border-caution/25 bg-caution/10 text-caution',
    'General': 'border-white/10 bg-white/5 text-zinc-400',
  };
  const cls = colors[category] || colors['General'];
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold tracking-widest ${cls}`}>
      {category.toUpperCase()}
    </span>
  );
}

function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <article className="group panel rounded-2xl p-5 hover:-translate-y-0.5 transition-all duration-300 hover:border-accent/20">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <CategoryBadge category={article.category} />
            <span className="font-mono text-[10px] text-zinc-500">{timeAgo(article.publishedAt)}</span>
          </div>
          {article.url ? (
            <a href={article.url} target="_blank" rel="noreferrer" className="block group/link">
              <h3 className="font-headline text-base font-semibold text-white leading-snug group-hover/link:text-accent transition-colors line-clamp-2">
                {article.title}
              </h3>
            </a>
          ) : (
            <h3 className="font-headline text-base font-semibold text-white leading-snug line-clamp-2">
              {article.title}
            </h3>
          )}
          <p className="mt-2 text-sm leading-6 text-zinc-400 line-clamp-2">{article.summary}</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="font-mono text-[10px] text-zinc-500">{article.source}</span>
            {article.sentiment && (
              <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold ${
                article.sentiment === 'positive' ? 'bg-safe/10 text-safe' :
                article.sentiment === 'negative' ? 'bg-danger/10 text-danger' :
                'bg-white/5 text-zinc-400'
              }`}>
                {article.sentiment.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function NewsPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [hotArticles, setHotArticles] = useState<NewsArticle[]>([]);
  const [etfData, setEtfData] = useState<ETFResponse | null>(null);
  const [macroData, setMacroData] = useState<MacroResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function loadData() {
    setLoading(true);
    const [newsRes, hotRes, etfRes, macroRes] = await Promise.all([
      fetchNews(50),
      fetchHotNews(),
      fetchETFData(),
      fetchMacroEvents(),
    ]);
    setArticles(newsRes.articles || []);
    setHotArticles(hotRes.articles || []);
    setEtfData(etfRes);
    setMacroData(macroRes);
    setLastRefresh(new Date());
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All News', count: articles.length },
    { key: 'hot', label: '🔥 Trending', count: hotArticles.length },
    { key: 'etf', label: '📊 ETF Flows', count: 0 },
    { key: 'macro', label: '📅 Macro', count: macroData?.events?.length || 0 },
  ];

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-8 sm:px-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-accent">SoSoValue Intelligence</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-white sm:text-4xl">News Feed</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Real-time crypto news, ETF flows, and macro events from SoSoValue API
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-500">
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={loadData}
            disabled={loading}
            className="rounded-full border border-accent/25 bg-accent/10 px-4 py-2 font-mono text-xs font-semibold text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            {loading ? '⏳ Loading…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 w-fit overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 font-mono text-xs font-semibold transition whitespace-nowrap ${
              tab === t.key
                ? 'bg-accent text-black'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 ${tab === t.key ? 'text-black/60' : 'text-zinc-600'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="mt-6">
        {loading && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="font-mono text-xs text-zinc-500">Fetching news from SoSoValue…</p>
          </div>
        )}

        {!loading && tab === 'all' && (
          <div className="grid gap-4 md:grid-cols-2">
            {articles.length === 0 ? (
              <div className="md:col-span-2 panel rounded-2xl p-8 text-center">
                <p className="text-zinc-500 text-sm">No news articles available. The SoSoValue news endpoint may be loading.</p>
              </div>
            ) : (
              articles.map(a => <NewsCard key={a.id} article={a} />)
            )}
          </div>
        )}

        {!loading && tab === 'hot' && (
          <div className="grid gap-4 md:grid-cols-2">
            {hotArticles.length === 0 ? (
              <div className="md:col-span-2 panel rounded-2xl p-8 text-center">
                <p className="text-zinc-500 text-sm">No trending news available right now.</p>
              </div>
            ) : (
              hotArticles.map(a => <NewsCard key={a.id} article={a} />)
            )}
          </div>
        )}

        {!loading && tab === 'etf' && (
          <div className="panel rounded-2xl p-6">
            <p className="eyebrow mb-3">ETF Flow Summary</p>
            <h2 className="font-headline text-2xl font-bold text-white">Bitcoin & Ethereum ETF Flows</h2>
            <div className="terminal-rule my-5" />
            {etfData?.success ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <p className="data-label">Net Flow (7D)</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-white">
                    ${((etfData.summary?.netFlow7Day as number) || 0).toLocaleString()}M
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <p className="data-label">Net Flow (Latest)</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-white">
                    ${((etfData.summary?.netFlow as number) || 0).toLocaleString()}M
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <p className="data-label">Status</p>
                  <p className="mt-2 font-mono text-lg font-semibold text-safe">
                    {etfData.summary?.unavailable ? 'Unavailable' : 'Active'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">ETF data is currently unavailable from SoSoValue.</p>
            )}
          </div>
        )}

        {!loading && tab === 'macro' && (
          <div className="space-y-4">
            <div className="panel rounded-2xl p-6">
              <p className="eyebrow mb-3">Economic Calendar</p>
              <h2 className="font-headline text-2xl font-bold text-white">Upcoming Macro Events</h2>
            </div>
            {(macroData?.events || []).length === 0 ? (
              <div className="panel rounded-2xl p-8 text-center">
                <p className="text-zinc-500 text-sm">No macro events loaded. Configure SoSoValue API key.</p>
              </div>
            ) : (
              <div className="relative space-y-3 pl-4 before:absolute before:bottom-3 before:left-0 before:top-3 before:w-px before:bg-white/10">
                {(macroData?.events || []).slice(0, 15).map((event: any, i: number) => {
                  const eventTime = event.eventTime || event.releaseDate || event.date || '';
                  const importance = (event.importance || event.name || '').toLowerCase();
                  const isHigh = importance.includes('high') || importance.includes('cpi') || importance.includes('fomc');
                  const isMed = importance.includes('medium') || importance.includes('gdp');

                  return (
                    <article key={`${event.name}-${i}`} className="relative rounded-2xl border border-white/10 bg-black/25 p-4">
                      <span className="absolute -left-[1.15rem] top-5 h-3 w-3 rounded-full border border-accent/40 bg-accent/90" />
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-xs text-zinc-500">
                            {eventTime ? new Date(eventTime).toLocaleString() : 'TBD'}
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-white">{event.name || 'Event'}</h3>
                          <p className="mt-1 text-xs text-zinc-400">
                            {[event.country, event.forecast ? `Forecast: ${event.forecast}` : null].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest ${
                          isHigh ? 'border-danger/30 bg-danger/10 text-danger' :
                          isMed ? 'border-caution/30 bg-caution/10 text-caution' :
                          'border-white/10 bg-white/5 text-zinc-400'
                        }`}>
                          {isHigh ? 'HIGH' : isMed ? 'MED' : 'LOW'}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
