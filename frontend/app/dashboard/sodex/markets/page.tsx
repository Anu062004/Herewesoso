'use client';

import Link from 'next/link';

import { fetchSodexMarkets } from '@/lib/api';
import { formatCompactNumber, formatPrice } from '@/lib/format';
import { usePollingResource } from '@/lib/usePollingResource';

import {
  EmptyState,
  ErrorCard,
  PageHeader,
  Panel,
  PanelHeader,
  Pill,
  PollingIndicator,
  SkeletonBlock,
  ValueChange
} from '@/components/terminal/ui';

export default function SodexMarketsPage() {
  const markets = usePollingResource({ fetcher: () => fetchSodexMarkets(), intervalMs: 30000 });
  const rows = markets.data?.markets || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="SoDEX Markets"
        description="Available testnet markets, mark prices, and 24h movement."
        right={<PollingIndicator freshness={markets.freshness} nextPollInMs={markets.nextPollInMs} />}
      />

      <div className="flex gap-2">
        <Pill tone="cyan">Markets</Pill>
        <Link href="/dashboard/sodex/orderbook" className="inline-flex h-6 items-center rounded-md border border-[var(--border)] px-2 text-[11px] text-[var(--text-2)]">
          Orderbook
        </Link>
        <Link href="/dashboard/sodex/klines" className="inline-flex h-6 items-center rounded-md border border-[var(--border)] px-2 text-[11px] text-[var(--text-2)]">
          Klines
        </Link>
      </div>

      <Panel>
        <PanelHeader title="Market List" accent="blue" />
        <div className="overflow-x-auto">
          {markets.loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : markets.error ? (
            <div className="p-4">
              <ErrorCard message={markets.error} onRetry={() => void markets.refresh()} />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="No SoDEX markets" description="Market metadata will appear here when the testnet feed responds." />
          ) : (
            <table className="min-w-full text-left">
              <thead className="bg-[var(--bg-panel)] text-[11px] text-[var(--text-3)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Last Price</th>
                  <th className="px-4 py-3 font-medium">24h Change</th>
                  <th className="px-4 py-3 font-medium">Volume</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((market) => (
                  <tr key={market.symbol} className="border-t border-[var(--border)] text-[13px] hover:bg-[var(--bg-panel)]">
                    <td className="px-4 py-3 text-[var(--text-1)]">
                      <div className="flex items-center gap-3">
                        <span>{market.symbol}</span>
                        <Link href={`/dashboard/sodex/orderbook?symbol=${encodeURIComponent(market.symbol)}`} className="text-[11px] text-[var(--blue)]">
                          Orderbook
                        </Link>
                        <Link href={`/dashboard/sodex/klines?symbol=${encodeURIComponent(market.symbol)}`} className="text-[11px] text-[var(--blue)]">
                          Klines
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-1)]">{formatPrice(market.lastPrice)}</td>
                    <td className="px-4 py-3">
                      <ValueChange value={market.change24h} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{formatCompactNumber(market.volume)}</td>
                    <td className="px-4 py-3">
                      <Pill tone="gray">{market.status}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
    </div>
  );
}
