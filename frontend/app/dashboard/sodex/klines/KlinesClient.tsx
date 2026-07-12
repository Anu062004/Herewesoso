'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { fetchSodexKlines, fetchSodexMarkets, fetchTechnicalGraphAnalysis } from '@/lib/api';
import { formatCompactNumber, formatDateTime, formatPercent, formatPrice } from '@/lib/format';
import { useSodexConnection } from '@/lib/useSodexConnection';
import { usePollingResource } from '@/lib/usePollingResource';
import { analyzeChart } from '@/lib/chartNarrative';

import {
  CandlestickChart,
  EmptyState,
  ErrorCard,
  PageHeader,
  Panel,
  PanelHeader,
  Pill,
  PollingIndicator,
  RefreshButton,
  SkeletonBlock,
  ValueChange
} from '@/components/terminal/ui';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];
const CANDLE_LIMITS = [120, 240, 500];
const FALLBACK_SYMBOLS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD'];

function pollingIntervalFor(interval: string) {
  if (interval === '1m' || interval === '5m' || interval === '15m') return 5000;
  if (interval === '1h' || interval === '4h') return 15000;
  return 30000;
}

export default function KlinesClient({ initialSymbol }: { initialSymbol: string }) {
  const connection = useSodexConnection();
  const [symbol, setSymbol] = useState(initialSymbol || 'BTC-USD');
  const [interval, setInterval] = useState('1h');
  const [limit, setLimit] = useState(240);
  const [showNarrative, setShowNarrative] = useState(false);
  const network = connection?.network || 'testnet';
  const networkLabel = network === 'mainnet' ? 'Mainnet' : 'Testnet';
  const markets = usePollingResource({ fetcher: () => fetchSodexMarkets(), intervalMs: 30000, key: network });
  const klines = usePollingResource({
    fetcher: () => fetchSodexKlines(symbol, interval, limit),
    intervalMs: pollingIntervalFor(interval),
    key: `${network}:${symbol}:${interval}:${limit}`
  });
  const backendAnalysis = usePollingResource({
    fetcher: () => showNarrative ? fetchTechnicalGraphAnalysis(symbol, interval, limit) : Promise.resolve(null),
    intervalMs: pollingIntervalFor(interval),
    key: `${showNarrative}:${network}:${symbol}:${interval}:${limit}`
  });

  const symbols = (markets.data?.markets || []).map((market) => market.symbol);
  const options = symbols.length > 0 ? symbols : FALLBACK_SYMBOLS;
  const points = klines.data?.points || [];
  const stats = useMemo(() => {
    const latest = points[points.length - 1] || null;
    const previous = points[points.length - 2] || null;
    const first = points[0] || null;
    const high = points.length > 0 ? Math.max(...points.map((point) => point.high)) : null;
    const low = points.length > 0 ? Math.min(...points.map((point) => point.low)) : null;
    const volume = points.reduce((sum, point) => sum + (point.volume || 0), 0);
    const candleChange = latest && previous ? latest.close - previous.close : null;
    const candleChangePct = latest && previous ? (candleChange! / previous.close) * 100 : null;
    const rangeChangePct = latest && first ? ((latest.close - first.open) / first.open) * 100 : null;

    return { latest, high, low, volume, candleChangePct, rangeChangePct };
  }, [points]);
  const localNarrative = useMemo(() => analyzeChart(points), [points]);
  const chartNarrative = backendAnalysis.data || localNarrative;

  return (
    <div className="space-y-4">
      <PageHeader
        title="SoDEX Klines"
        description={`${symbol} ${interval} candles on SoDEX ${networkLabel.toLowerCase()}.`}
        right={
          <div className="flex items-center gap-3">
            <PollingIndicator freshness={klines.freshness} nextPollInMs={klines.nextPollInMs} />
            <RefreshButton onClick={() => void klines.refresh()} spinning={klines.loading} />
          </div>
        }
      />

      <Panel className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={network === 'mainnet' ? 'amber' : 'cyan'}>{networkLabel}</Pill>
            <Link href="/dashboard/sodex/connect" className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-[12px] text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]">
              Connect
            </Link>
            <Link href="/dashboard/sodex/markets" className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-[12px] text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]">
              Markets
            </Link>
            <Link href={`/dashboard/sodex/orderbook?symbol=${encodeURIComponent(symbol)}`} className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-[12px] text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]">
              Orderbook
            </Link>
            <Pill tone="cyan">Klines</Pill>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <select
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-[13px] text-[var(--text-1)] outline-none focus:border-[var(--brand)]"
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNarrative((value) => !value)}
              className={showNarrative ? 'h-9 rounded-md border border-[rgba(8,145,178,.4)] bg-[rgba(8,145,178,.12)] px-3 text-[12px] font-medium text-[var(--cyan)]' : 'h-9 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-[12px] text-[var(--text-2)]'}
            >
              {showNarrative ? 'Hide Graph Analysis' : 'Analyse Graph Narrative'}
            </button>

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
                        ? 'inline-flex h-9 min-w-10 items-center justify-center rounded-md border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.12)] px-3 text-[12px] font-medium text-[var(--brand)]'
                        : 'inline-flex h-9 min-w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-[12px] text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]'
                    }
                  >
                    {value}
                  </button>
                );
              })}
            </div>

            <select
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-[13px] text-[var(--text-1)] outline-none focus:border-[var(--brand)]"
            >
              {CANDLE_LIMITS.map((value) => (
                <option key={value} value={value}>
                  {value} candles
                </option>
              ))}
            </select>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title={`${symbol} Live Candles`}
          accent="blue"
          subtitle={`${interval} interval - ${pollingIntervalFor(interval) / 1000}s refresh`}
          right={stats.latest ? <Pill tone={stats.candleChangePct === null ? 'gray' : stats.candleChangePct >= 0 ? 'green' : 'red'}>{formatPercent(stats.candleChangePct, 2)}</Pill> : null}
        />
        <div className="p-4">
          {klines.error ? (
            <ErrorCard message={klines.error} onRetry={() => void klines.refresh()} />
          ) : klines.loading ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, index) => <SkeletonBlock key={index} className="h-20 w-full" />)}
              </div>
              <SkeletonBlock className="h-[560px] w-full" />
            </div>
          ) : (klines.data?.points || []).length === 0 ? (
            <EmptyState title="No kline data" description="Select another market or interval to request more candles." />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-3">
                  <div className="text-[11px] text-[var(--text-3)]">Last Price</div>
                  <div className="mt-1 text-[18px] font-semibold text-[var(--text-1)]">{formatPrice(stats.latest?.close)}</div>
                </div>
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-3">
                  <div className="text-[11px] text-[var(--text-3)]">Range Change</div>
                  <div className="mt-1 text-[18px] font-semibold"><ValueChange value={stats.rangeChangePct} /></div>
                </div>
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-3">
                  <div className="text-[11px] text-[var(--text-3)]">Range High</div>
                  <div className="mt-1 text-[18px] font-semibold text-[var(--green)]">{formatPrice(stats.high)}</div>
                </div>
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-3">
                  <div className="text-[11px] text-[var(--text-3)]">Range Low</div>
                  <div className="mt-1 text-[18px] font-semibold text-[var(--red)]">{formatPrice(stats.low)}</div>
                </div>
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-3">
                  <div className="text-[11px] text-[var(--text-3)]">Volume</div>
                  <div className="mt-1 text-[18px] font-semibold text-[var(--text-1)]">{formatCompactNumber(stats.volume, 2)}</div>
                </div>
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-3">
                  <div className="text-[11px] text-[var(--text-3)]">Updated</div>
                  <div className="mt-1 text-[13px] font-medium text-[var(--text-1)]">{formatDateTime(klines.data?.updatedAt || null)}</div>
                </div>
              </div>

              <CandlestickChart points={points} symbol={symbol} interval={interval} />
              {showNarrative ? (
                chartNarrative ? (
                  <div className="rounded-[10px] border border-[rgba(8,145,178,.26)] bg-[rgba(8,145,178,.06)] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[14px] font-semibold text-[var(--text-1)]">Chart Narrative</div>
                      <Pill tone={chartNarrative.trend === 'BULLISH' ? 'green' : chartNarrative.trend === 'BEARISH' ? 'red' : 'amber'}>{chartNarrative.trend}</Pill>
                      <Pill tone="gray">{chartNarrative.momentum} momentum</Pill>
                      {'breakout' in chartNarrative ? <Pill tone="purple">{chartNarrative.breakout} breakout</Pill> : null}
                      <Pill tone="cyan">{chartNarrative.confidence}% confidence</Pill>
                    </div>
                    <p className="mt-3 text-[13px] leading-6 text-[var(--text-2)]">{chartNarrative.narrative}</p>
                    {backendAnalysis.error ? <p className="mt-2 text-[11px] text-[var(--amber)]">Backend skill unavailable; showing deterministic browser fallback.</p> : null}
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <NarrativeMetric label="Range change" value={formatPercent(chartNarrative.changePct, 2)} />
                      <NarrativeMetric label="Volatility" value={formatPercent(chartNarrative.volatilityPct, 2)} />
                      <NarrativeMetric label="Support" value={formatPrice(chartNarrative.support)} />
                      <NarrativeMetric label="Resistance" value={formatPrice(chartNarrative.resistance)} />
                      <NarrativeMetric label="Volume ratio" value={chartNarrative.volumeRatio === null ? 'Unavailable' : `${chartNarrative.volumeRatio.toFixed(2)}x`} />
                    </div>
                    {'evidence' in chartNarrative && chartNarrative.evidence.length ? <div className="mt-3 grid gap-2 md:grid-cols-2"><div className="rounded-lg border border-[var(--border)] p-3"><div className="text-[10px] uppercase text-[var(--green)]">Evidence</div>{chartNarrative.evidence.map((item) => <div key={item} className="mt-1 text-[11px] text-[var(--text-2)]">• {item}</div>)}</div><div className="rounded-lg border border-[var(--border)] p-3"><div className="text-[10px] uppercase text-[var(--amber)]">Conflicts</div>{chartNarrative.conflicts.length ? chartNarrative.conflicts.map((item) => <div key={item} className="mt-1 text-[11px] text-[var(--text-2)]">• {item}</div>) : <div className="mt-1 text-[11px] text-[var(--text-3)]">No major conflicts detected.</div>}</div></div> : null}
                    <p className="mt-3 text-[10px] text-[var(--text-3)]">{chartNarrative.disclaimer}</p>
                  </div>
                ) : <EmptyState title="Not enough chart data" description="At least eight valid candles are required to create a graph narrative." />
              ) : null}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function NarrativeMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-3"><div className="text-[10px] text-[var(--text-3)]">{label}</div><div className="mt-1 text-[13px] font-semibold text-[var(--text-1)]">{value}</div></div>;
}
