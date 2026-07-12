'use client';

import Link from 'next/link';
import { useState } from 'react';

import { fetchSodexMarkets, fetchSodexOrderbook } from '@/lib/api';
import { formatNumber, formatPrice } from '@/lib/format';
import { useSodexConnection } from '@/lib/useSodexConnection';
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
import DepthChart from '@/components/markets/DepthChart';

const FALLBACK_SYMBOLS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD'];

export default function OrderbookClient({ initialSymbol }: { initialSymbol: string }) {
  const connection = useSodexConnection();
  const [symbol, setSymbol] = useState(initialSymbol || 'BTC-USD');
  const network = connection?.network || 'testnet';
  const networkLabel = network === 'mainnet' ? 'Mainnet' : 'Testnet';
  const markets = usePollingResource({ fetcher: () => fetchSodexMarkets(), intervalMs: 30000, key: network });
  const orderbook = usePollingResource({
    fetcher: () => fetchSodexOrderbook(symbol, 20),
    intervalMs: 5000,
    key: `${network}:${symbol}`
  });

  const symbols = (markets.data?.markets || []).map((market) => market.symbol);
  const options = symbols.length > 0 ? symbols : FALLBACK_SYMBOLS;
  const asks = [...(orderbook.data?.asks || [])].sort((left, right) => right.price - left.price);
  const bids = [...(orderbook.data?.bids || [])].sort((left, right) => right.price - left.price);

  return (
    <div className="space-y-4">
      <PageHeader
        title="SoDEX Orderbook"
        description={`Live ${networkLabel.toLowerCase()} asks and bids for the selected market.`}
        right={<PollingIndicator freshness={orderbook.freshness} nextPollInMs={orderbook.nextPollInMs} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Pill tone={network === 'mainnet' ? 'amber' : 'cyan'}>{networkLabel}</Pill>
        <Link href="/dashboard/sodex/connect" className="inline-flex h-6 items-center rounded-md border border-[var(--border)] px-2 text-[11px] text-[var(--text-2)]">
          Connect
        </Link>
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
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,.65fr)]">
                <DepthChart bids={bids} asks={asks} />
                <div className="max-h-[400px] overflow-y-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)]">
                  <div className="grid grid-cols-3 border-b border-[var(--border)] px-4 py-3 text-[11px] text-[var(--red)]">
                    <div>Ask Price</div>
                    <div>Size</div>
                    <div>Total</div>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {asks.slice(-10).map((level, index) => (
                      <div key={`${level.price}-${index}`} className="relative grid grid-cols-3 px-4 py-1.5 text-[12px] text-[var(--text-2)]">
                        <span className="pointer-events-none absolute inset-y-0 right-0 bg-[rgba(234,57,67,.08)]" style={{width:`${Math.min(100, level.total / Math.max(...asks.map(row=>row.total),1)*100)}%`}} />
                        <div className="text-[var(--red)]">{formatPrice(level.price)}</div>
                        <div>{formatNumber(level.size, 4)}</div>
                        <div>{formatNumber(level.total, 4)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="border-y border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-center text-[13px] font-semibold text-[var(--text-1)]">Spread {formatPrice(orderbook.data?.spread ?? null)}</div>
                  <div className="grid grid-cols-3 border-b border-[var(--border)] px-4 py-3 text-[11px] text-[var(--green)]">
                    <div>Bid Price</div>
                    <div>Size</div>
                    <div>Total</div>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {bids.slice(0, 10).map((level, index) => (
                      <div key={`${level.price}-${index}`} className="relative grid grid-cols-3 px-4 py-1.5 text-[12px] text-[var(--text-2)]">
                        <span className="pointer-events-none absolute inset-y-0 right-0 bg-[rgba(22,199,132,.08)]" style={{width:`${Math.min(100, level.total / Math.max(...bids.map(row=>row.total),1)*100)}%`}} />
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
