'use client';

import Link from 'next/link';
import { useState } from 'react';

import { fetchSodexMarkets, fetchSodexOrderbook } from '@/lib/api';
import { formatNumber, formatPrice } from '@/lib/format';
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

const FALLBACK_SYMBOLS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD'];

export default function OrderbookClient({ initialSymbol }: { initialSymbol: string }) {
  const [symbol, setSymbol] = useState(initialSymbol || 'BTC-USD');
  const markets = usePollingResource({ fetcher: () => fetchSodexMarkets(), intervalMs: 30000 });
  const orderbook = usePollingResource({
    fetcher: () => fetchSodexOrderbook(symbol, 20),
    intervalMs: 5000,
    key: symbol
  });

  const symbols = (markets.data?.markets || []).map((market) => market.symbol);
  const options = symbols.length > 0 ? symbols : FALLBACK_SYMBOLS;
  const asks = [...(orderbook.data?.asks || [])].sort((left, right) => right.price - left.price);
  const bids = [...(orderbook.data?.bids || [])].sort((left, right) => right.price - left.price);

  return (
    <div className="space-y-4">
      <PageHeader
        title="SoDEX Orderbook"
        description="Live asks and bids for the selected market."
        right={<PollingIndicator freshness={orderbook.freshness} nextPollInMs={orderbook.nextPollInMs} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/sodex/markets" className="inline-flex h-6 items-center rounded-md border border-[var(--border)] px-2 text-[11px] text-[var(--text-2)]">
          Markets
        </Link>
        <Pill tone="cyan">Orderbook</Pill>
        <Link href="/dashboard/sodex/klines" className="inline-flex h-6 items-center rounded-md border border-[var(--border)] px-2 text-[11px] text-[var(--text-2)]">
          Klines
        </Link>
        <select
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-[13px] text-[var(--text-1)]"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {orderbook.error ? <ErrorCard message={orderbook.error} onRetry={() => void orderbook.refresh()} /> : null}

      <Panel>
        <PanelHeader title={`${symbol} Orderbook`} accent="blue" />
        <div className="p-4">
          {orderbook.loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <SkeletonBlock className="h-80 w-full" />
              <SkeletonBlock className="h-80 w-full" />
            </div>
          ) : asks.length === 0 && bids.length === 0 ? (
            <EmptyState title="No orderbook data" description="Depth rows are unavailable for the selected symbol." />
          ) : (
            <>
              <div className="mb-4 flex items-center justify-center text-[11px] text-[var(--text-3)]">
                Spread {formatPrice(orderbook.data?.spread ?? null)}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)]">
                  <div className="grid grid-cols-3 border-b border-[var(--border)] px-4 py-3 text-[11px] text-[var(--red)]">
                    <div>Price</div>
                    <div>Size</div>
                    <div>Total</div>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {asks.map((level, index) => (
                      <div key={`${level.price}-${index}`} className="grid grid-cols-3 px-4 py-2 text-[13px] text-[var(--text-2)]">
                        <div className="text-[var(--red)]">{formatPrice(level.price)}</div>
                        <div>{formatNumber(level.size, 4)}</div>
                        <div>{formatNumber(level.total, 4)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)]">
                  <div className="grid grid-cols-3 border-b border-[var(--border)] px-4 py-3 text-[11px] text-[var(--green)]">
                    <div>Price</div>
                    <div>Size</div>
                    <div>Total</div>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {bids.map((level, index) => (
                      <div key={`${level.price}-${index}`} className="grid grid-cols-3 px-4 py-2 text-[13px] text-[var(--text-2)]">
                        <div className="text-[var(--green)]">{formatPrice(level.price)}</div>
                        <div>{formatNumber(level.size, 4)}</div>
                        <div>{formatNumber(level.total, 4)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
