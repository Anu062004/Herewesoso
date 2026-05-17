'use client';

import Link from 'next/link';
import { useState } from 'react';

import { fetchSodexKlines, fetchSodexMarkets } from '@/lib/api';
import { usePollingResource } from '@/lib/usePollingResource';

import {
  CandlestickChart,
  EmptyState,
  ErrorCard,
  PageHeader,
  Panel,
  PanelHeader,
  Pill,
  PollingIndicator
} from '@/components/terminal/ui';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];
const FALLBACK_SYMBOLS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD'];

export default function KlinesClient({ initialSymbol }: { initialSymbol: string }) {
  const [symbol, setSymbol] = useState(initialSymbol || 'BTC-USD');
  const [interval, setInterval] = useState('1h');
  const markets = usePollingResource({ fetcher: () => fetchSodexMarkets(), intervalMs: 30000 });
  const klines = usePollingResource({
    fetcher: () => fetchSodexKlines(symbol, interval, 60),
    intervalMs: 30000,
    key: `${symbol}:${interval}`
  });

  const symbols = (markets.data?.markets || []).map((market) => market.symbol);
  const options = symbols.length > 0 ? symbols : FALLBACK_SYMBOLS;

  return (
    <div className="space-y-4">
      <PageHeader
        title="SoDEX Klines"
        description="Candlestick view using the same dark finance palette as the terminal."
        right={<PollingIndicator freshness={klines.freshness} nextPollInMs={klines.nextPollInMs} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/sodex/markets" className="inline-flex h-6 items-center rounded-md border border-[var(--border)] px-2 text-[11px] text-[var(--text-2)]">
          Markets
        </Link>
        <Link href="/dashboard/sodex/orderbook" className="inline-flex h-6 items-center rounded-md border border-[var(--border)] px-2 text-[11px] text-[var(--text-2)]">
          Orderbook
        </Link>
        <Pill tone="cyan">Klines</Pill>
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
        <div className="flex flex-wrap gap-2">
          {INTERVALS.map((value) => {
            const active = interval === value;

            return (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                className={
                  active
                    ? 'inline-flex h-8 items-center rounded-md border border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.12)] px-3 text-[12px] text-[var(--blue)]'
                    : 'inline-flex h-8 items-center rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-[12px] text-[var(--text-2)]'
                }
              >
                {value}
              </button>
            );
          })}
        </div>
      </div>

      <Panel>
        <PanelHeader title={`${symbol} Candles`} accent="blue" subtitle={`Interval ${interval}`} />
        <div className="p-4">
          {klines.error ? (
            <ErrorCard message={klines.error} onRetry={() => void klines.refresh()} />
          ) : klines.loading ? (
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-8 text-[13px] text-[var(--text-3)]">
              Loading market candles...
            </div>
          ) : (klines.data?.points || []).length === 0 ? (
            <EmptyState title="No kline data" description="Select another market or interval to request more candles." />
          ) : (
            <CandlestickChart points={klines.data?.points || []} />
          )}
        </div>
      </Panel>
    </div>
  );
}
