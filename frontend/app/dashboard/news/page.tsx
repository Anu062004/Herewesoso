'use client';

import { useMemo, useState } from 'react';

import { fetchNews } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { usePollingResource } from '@/lib/usePollingResource';

import { ChevronRightIcon, SearchIcon, WorldIcon } from '@/components/terminal/icons';
import {
  Button,
  EmptyState,
  ErrorCard,
  PageHeader,
  Panel,
  PanelHeader,
  Pill,
  PollingIndicator,
  SkeletonBlock,
  cx
} from '@/components/terminal/ui';

type TimeFilter = 'ALL' | '24H' | '7D';
type SortOrder = 'NEWEST' | 'OLDEST';

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown time';

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : formatDateTime(value);
}

function sentimentTone(sentiment: string | null): 'green' | 'red' | 'amber' | 'gray' {
  const normalized = sentiment?.toLowerCase() || '';
  if (normalized.includes('bull') || normalized.includes('positive')) return 'green';
  if (normalized.includes('bear') || normalized.includes('negative')) return 'red';
  if (normalized.includes('neutral')) return 'gray';
  return 'amber';
}

export default function NewsPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [source, setSource] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('ALL');
  const [sortOrder, setSortOrder] = useState<SortOrder>('NEWEST');

  const news = usePollingResource({
    fetcher: async () => {
      const response = await fetchNews(50);

      if (!response.success && response.error) throw new Error(response.error);
      return response;
    },
    intervalMs: 60000
  });

  const articles = useMemo(() => news.data?.articles || [], [news.data?.articles]);
  const categories = useMemo(
    () => [...new Set(articles.map((article) => article.category).filter(Boolean))].sort(),
    [articles]
  );
  const sources = useMemo(
    () => [...new Set(articles.map((article) => article.source).filter(Boolean))].sort(),
    [articles]
  );

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const now = Date.now();

    return articles
      .filter((article) => {
        const searchable = `${article.title} ${article.summary} ${article.source} ${article.category}`.toLowerCase();
        const publishedAt = new Date(article.publishedAt).getTime();
        const withinTime =
          timeFilter === 'ALL' ||
          (Number.isFinite(publishedAt) && now - publishedAt <= (timeFilter === '24H' ? 86400000 : 604800000));

        return (
          (!normalizedQuery || searchable.includes(normalizedQuery)) &&
          (category === 'ALL' || article.category === category) &&
          (source === 'ALL' || article.source === source) &&
          withinTime
        );
      })
      .sort((a, b) => {
        const difference = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        return sortOrder === 'NEWEST' ? difference : -difference;
      });
  }, [articles, category, query, sortOrder, source, timeFilter]);

  const filtersActive = query !== '' || category !== 'ALL' || source !== 'ALL' || timeFilter !== 'ALL';
  const clearFilters = () => {
    setQuery('');
    setCategory('ALL');
    setSource('ALL');
    setTimeFilter('ALL');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Market News"
        description="Follow market-moving crypto stories, filter the noise, and open the original coverage."
        right={<div className="flex items-center gap-2">{news.data?.stale ? <Pill tone="amber">Cached data</Pill> : null}<PollingIndicator freshness={news.freshness} nextPollInMs={news.nextPollInMs} /></div>}
      />

      <Panel>
        <PanelHeader
          title="News Feed"
          accent="blue"
          subtitle={news.loading ? 'Loading the latest coverage' : `${filteredArticles.length} of ${articles.length} stories shown`}
        />

        <div className="border-b border-[var(--border)] bg-[var(--bg-panel)] p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_180px_150px]">
            <label className="relative block">
              <span className="sr-only">Search news</span>
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search headlines, topics or sources"
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] pl-10 pr-3 text-[13px] text-[var(--text-1)] outline-none transition placeholder:text-[var(--text-3)] focus:border-[var(--blue)]"
              />
            </label>

            <FilterSelect label="Category" value={category} onChange={setCategory} options={categories} />
            <FilterSelect label="Source" value={source} onChange={setSource} options={sources} />
            <label>
              <span className="sr-only">Sort stories</span>
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as SortOrder)}
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-[13px] text-[var(--text-2)] outline-none focus:border-[var(--blue)]"
              >
                <option value="NEWEST">Newest first</option>
                <option value="OLDEST">Oldest first</option>
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-3)]">Published</span>
            {(['ALL', '24H', '7D'] as TimeFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTimeFilter(value)}
                className={cx(
                  'h-8 rounded-md border px-3 text-[12px] transition',
                  timeFilter === value
                    ? 'border-[rgba(59,130,246,0.45)] bg-[rgba(59,130,246,0.12)] text-[var(--blue)]'
                    : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-3)] hover:border-[var(--border-hover)] hover:text-[var(--text-1)]'
                )}
              >
                {value === 'ALL' ? 'Any time' : value === '24H' ? 'Last 24 hours' : 'Last 7 days'}
              </button>
            ))}
            {filtersActive ? (
              <Button onClick={clearFilters} className="ml-auto h-8 px-3 text-[12px]">Clear filters</Button>
            ) : null}
          </div>
        </div>

        <div className="p-4">
          {news.loading ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => <SkeletonBlock key={index} className="h-44 w-full" />)}
            </div>
          ) : news.error ? (
            <ErrorCard message={news.error} onRetry={() => void news.refresh()} />
          ) : articles.length === 0 ? (
            <EmptyState title="No news available" description="The news feed will appear here once the upstream source responds." />
          ) : filteredArticles.length === 0 ? (
            <EmptyState
              title="No stories match these filters"
              description="Try another keyword, source, category, or a wider publishing window."
              icon={<SearchIcon className="h-6 w-6 text-[var(--text-3)]" />}
            />
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {filteredArticles.map((article) => (
                <article
                  key={article.id}
                  className="group flex min-h-[176px] flex-col rounded-[12px] border border-[var(--border)] bg-[var(--bg-panel)] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-sm)]"
                >
                  <div className="flex items-center gap-2">
                    <Pill tone="cyan">{article.category || 'General'}</Pill>
                    {article.sentiment ? <Pill tone={sentimentTone(article.sentiment)}>{article.sentiment}</Pill> : null}
                    <span className="ml-auto whitespace-nowrap text-[11px] text-[var(--text-3)]" title={formatDateTime(article.publishedAt)}>
                      {relativeTime(article.publishedAt)}
                    </span>
                  </div>

                  <h2 className="mt-3 line-clamp-2 text-[15px] font-semibold leading-6 text-[var(--text-1)] transition group-hover:text-[var(--blue)]">
                    {article.title}
                  </h2>
                  <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[var(--text-2)]">
                    {article.summary || 'Open the original story for full coverage and context.'}
                  </p>

                  <div className="mt-auto flex items-center gap-2 border-t border-[var(--border)] pt-3 text-[12px]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]">
                      <WorldIcon className="h-3.5 w-3.5 text-[var(--text-3)]" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[var(--text-2)]">{article.source}</span>
                    {article.url ? (
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Read ${article.title}`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--blue)] hover:underline"
                      >
                        Read story <ChevronRightIcon className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-[var(--text-3)]">Source unavailable</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="sr-only">Filter by {label.toLowerCase()}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-[13px] text-[var(--text-2)] outline-none focus:border-[var(--blue)]"
      >
        <option value="ALL">All {label.toLowerCase()}s</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}
