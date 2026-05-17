'use client';

import { fetchNews } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { usePollingResource } from '@/lib/usePollingResource';

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

export default function NewsPage() {
  const news = usePollingResource({
    fetcher: async () => {
      const response = await fetchNews(20);

      if (!response.success && response.error) {
        throw new Error(response.error);
      }

      return response;
    },
    intervalMs: 60000
  });

  const articles = news.data?.articles || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Market News"
        description="Latest crypto headlines and summaries from the SoSoValue news feed."
        right={<PollingIndicator freshness={news.freshness} nextPollInMs={news.nextPollInMs} />}
      />

      <Panel>
        <PanelHeader title="Latest Headlines" accent="blue" />
        <div className="p-4">
          {news.loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-24 w-full" />
              ))}
            </div>
          ) : news.error ? (
            <ErrorCard message={news.error} onRetry={() => void news.refresh()} />
          ) : articles.length === 0 ? (
            <EmptyState title="No news available" description="The news feed will appear here once the upstream source responds." />
          ) : (
            <div className="space-y-3">
              {articles.map((article) => (
                <a
                  key={article.id}
                  href={article.url || undefined}
                  target={article.url ? '_blank' : undefined}
                  rel={article.url ? 'noreferrer' : undefined}
                  className="block rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-4 transition hover:border-[var(--border-hover)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] text-[var(--text-1)]">{article.title}</div>
                      <div className="mt-2 text-[13px] leading-6 text-[var(--text-2)]">{article.summary || 'No summary available.'}</div>
                    </div>
                    <Pill tone="gray">{article.category}</Pill>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-3)]">
                    <span>{article.source}</span>
                    <span>•</span>
                    <span>{formatDateTime(article.publishedAt)}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
