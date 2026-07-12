'use client';

import { useMemo, useState } from 'react';

import { fetchSosoIndexHistory, fetchSosoIndices } from '@/lib/api';
import { analyzeChart } from '@/lib/chartNarrative';
import { formatCompactNumber, formatPercent, formatPrice } from '@/lib/format';
import { usePollingResource } from '@/lib/usePollingResource';

import { EmptyState, ErrorCard, Panel, PanelHeader, Pill, SkeletonBlock, ValueChange } from '@/components/terminal/ui';

const RANGES = [30, 90, 365];

export default function SosoIndexMarkets() {
  const [selectedId, setSelectedId] = useState('');
  const [days, setDays] = useState(90);
  const indices = usePollingResource({ fetcher: fetchSosoIndices, intervalMs: 60000 });
  const rows = indices.data?.indices || [];
  const activeId = selectedId || rows[0]?.id || '';
  const active = rows.find((item) => item.id === activeId) || rows[0];
  const history = usePollingResource({
    fetcher: () => activeId ? fetchSosoIndexHistory(activeId, days) : Promise.resolve({ identifier: '', points: [], updatedAt: '', unavailable: true }),
    intervalMs: 60000,
    key: `${activeId}:${days}`
  });
  const points = history.data?.points || [];
  const fallbackPoints = useMemo(() => {
    if (!active?.price) return [];
    const now = Date.now();
    const anchors = [[90, active.roi3m], [30, active.roi1m], [7, active.roi7d], [0, 0]] as Array<[number, number | null]>;
    return anchors.flatMap(([daysAgo, roi]) => roi !== null && roi > -100
      ? [{ time: now - daysAgo * 86400000, value: active.price! / (1 + roi / 100) }]
      : []);
  }, [active]);
  const displayPoints = points.length >= 2 ? points : fallbackPoints;
  const narrative = useMemo(() => analyzeChart(displayPoints), [displayPoints]);

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="SoSoValue Indexes" accent="purple" subtitle="Sector index performance from the SoSoValue SSI feed" />
        {indices.loading ? <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-32" />)}</div>
          : indices.error ? <div className="p-4"><ErrorCard message={indices.error} onRetry={() => void indices.refresh()} /></div>
          : rows.length === 0 ? <EmptyState title="SoSo indexes unavailable" description="The index list will appear when the configured SoSoValue SSI endpoint responds." />
          : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">{rows.map((index) => (
            <button key={index.id} type="button" onClick={() => setSelectedId(index.id)} className={`rounded-[10px] border p-4 text-left transition ${activeId === index.id ? 'border-[rgba(249,115,22,0.45)] bg-[rgba(249,115,22,0.08)]' : 'border-[var(--border)] bg-[var(--bg-panel)] hover:border-[var(--border-hover)]'}`}>
              <div className="flex items-start justify-between gap-2"><div><div className="text-[14px] font-semibold text-[var(--text-1)]">{index.symbol}</div><div className="mt-1 line-clamp-1 text-[11px] text-[var(--text-3)]">{index.name}</div></div><Pill tone={Number(index.change24h) >= 0 ? 'green' : 'red'}>{formatPercent(index.change24h, 2)}</Pill></div>
              <div className="mt-4 text-[20px] font-semibold text-[var(--text-1)]">{formatPrice(index.price)}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div><span className="text-[var(--text-3)]">7D </span><ValueChange value={index.roi7d} /></div><div><span className="text-[var(--text-3)]">1M </span><ValueChange value={index.roi1m} /></div></div>
            </button>
          ))}</div>}
      </Panel>

      {active ? <Panel>
        <PanelHeader title={`${active.symbol} Index Graph`} accent="blue" subtitle={active.description || `${active.name} historical index value`} right={<div className="flex gap-1">{RANGES.map((range) => <button key={range} type="button" onClick={() => setDays(range)} className={`h-7 rounded px-2 text-[11px] ${days === range ? 'bg-[var(--brand)] text-black' : 'border border-[var(--border)] text-[var(--text-3)]'}`}>{range === 365 ? '1Y' : `${range}D`}</button>)}</div>} />
        <div className="p-4">
          {history.loading ? <SkeletonBlock className="h-[340px]" /> : displayPoints.length < 2 ? <EmptyState title="Index graph unavailable" description="Current SSI performance is available above, but neither history nor enough ROI anchors were returned by the upstream API." /> : <><IndexLineChart points={displayPoints} /><div className="mt-2 text-[10px] text-[var(--text-3)]">{points.length >= 2 ? 'Historical index series from SoSoValue.' : 'ROI snapshot graph using reported 3M, 1M, 7D and current performance anchors; it is not a daily price series.'}</div></>}
          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Price" value={formatPrice(active.price)} /><Stat label="24H" value={formatPercent(active.change24h, 2)} /><Stat label="7D" value={formatPercent(active.roi7d, 2)} /><Stat label="1M" value={formatPercent(active.roi1m, 2)} /><Stat label="YTD" value={formatPercent(active.ytd, 2)} /><Stat label="Market Cap" value={formatCompactNumber(active.marketCap)} />
          </div>
          {narrative ? <div className="mt-4 rounded-[10px] border border-[rgba(8,145,178,0.25)] bg-[rgba(8,145,178,0.06)] p-4"><div className="flex flex-wrap items-center gap-2"><div className="text-[13px] font-semibold text-[var(--text-1)]">Graph Narrative</div><Pill tone={narrative.trend === 'BULLISH' ? 'green' : narrative.trend === 'BEARISH' ? 'red' : 'amber'}>{narrative.trend}</Pill><Pill tone="gray">{narrative.confidence}% confidence</Pill></div><p className="mt-3 text-[13px] leading-6 text-[var(--text-2)]">{narrative.narrative}</p><p className="mt-2 text-[10px] text-[var(--text-3)]">{narrative.disclaimer}</p></div> : null}
        </div>
      </Panel> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-3"><div className="text-[10px] text-[var(--text-3)]">{label}</div><div className="mt-1 text-[14px] font-semibold text-[var(--text-1)]">{value}</div></div>; }

function IndexLineChart({ points }: { points: Array<{ time: number; value: number }> }) {
  const width = 1000; const height = 320; const padding = 22;
  const values = points.map((point) => point.value); const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  const coordinates = points.map((point, index) => `${padding + index / Math.max(points.length - 1, 1) * (width - padding * 2)},${height - padding - (point.value - min) / span * (height - padding * 2)}`).join(' ');
  const positive = values[values.length - 1] >= values[0]; const color = positive ? '#16c784' : '#ea3943';
  return <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-[#050505] p-2"><svg viewBox={`0 0 ${width} ${height}`} className="h-[320px] w-full" role="img" aria-label="Index history line graph"><defs><linearGradient id="index-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>{[0.25,0.5,0.75].map((ratio)=><line key={ratio} x1={padding} x2={width-padding} y1={height*ratio} y2={height*ratio} stroke="rgba(148,163,184,.12)"/>)}<polygon points={`${padding},${height-padding} ${coordinates} ${width-padding},${height-padding}`} fill="url(#index-fill)"/><polyline points={coordinates} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round"/></svg></div>;
}
