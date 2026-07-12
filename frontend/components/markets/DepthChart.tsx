'use client';

import type { OrderbookLevel } from '@/lib/types';

export default function DepthChart({ bids, asks }: { bids: OrderbookLevel[]; asks: OrderbookLevel[] }) {
  const width = 900; const height = 360; const pad = 34;
  let bidCumulative = 0;
  const bidRows = [...bids].sort((a, b) => b.price - a.price).map((row) => ({ ...row, total: bidCumulative += row.size })).reverse();
  let askCumulative = 0;
  const askRows = [...asks].sort((a, b) => a.price - b.price).map((row) => ({ ...row, total: askCumulative += row.size }));
  const rows = [...bidRows, ...askRows];
  if (!rows.length) return null;
  const prices = rows.map((row) => row.price); const totals = rows.map((row) => row.total);
  const minPrice = Math.min(...prices); const maxPrice = Math.max(...prices); const priceSpan = maxPrice - minPrice || 1; const maxTotal = Math.max(...totals, 1);
  const x = (price: number) => pad + (price - minPrice) / priceSpan * (width - pad * 2);
  const y = (total: number) => height - pad - total / maxTotal * (height - pad * 2);
  const bidPoints = bidRows.map((row) => `${x(row.price)},${y(row.total)}`).join(' ');
  const askPoints = askRows.map((row) => `${x(row.price)},${y(row.total)}`).join(' ');
  const bidEnd = bidRows[bidRows.length - 1]; const askStart = askRows[0]; const midpoint = bidEnd && askStart ? (bidEnd.price + askStart.price) / 2 : prices[0];
  return <div className="rounded-[10px] border border-[var(--border)] bg-[#050505] p-3">
    <div className="mb-2 flex items-center justify-between text-[11px]"><span className="text-[var(--text-3)]">Cumulative market depth</span><span className="text-[var(--text-2)]">Mid {midpoint.toLocaleString(undefined,{maximumFractionDigits:4})}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[340px] w-full" role="img" aria-label="Cumulative bid and ask depth chart">
      <defs><linearGradient id="bid-depth" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16c784" stopOpacity=".4"/><stop offset="100%" stopColor="#16c784" stopOpacity=".03"/></linearGradient><linearGradient id="ask-depth" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ea3943" stopOpacity=".4"/><stop offset="100%" stopColor="#ea3943" stopOpacity=".03"/></linearGradient></defs>
      {[.25,.5,.75].map(r=><line key={r} x1={pad} x2={width-pad} y1={height*r} y2={height*r} stroke="rgba(148,163,184,.12)"/>)}
      {bidRows.length ? <><polygon points={`${x(bidRows[0].price)},${height-pad} ${bidPoints} ${x(bidEnd.price)},${height-pad}`} fill="url(#bid-depth)"/><polyline points={bidPoints} fill="none" stroke="#16c784" strokeWidth="2.5"/></> : null}
      {askRows.length ? <><polygon points={`${x(askStart.price)},${height-pad} ${askPoints} ${x(askRows[askRows.length-1].price)},${height-pad}`} fill="url(#ask-depth)"/><polyline points={askPoints} fill="none" stroke="#ea3943" strokeWidth="2.5"/></> : null}
      <line x1={x(midpoint)} x2={x(midpoint)} y1={pad} y2={height-pad} stroke="rgba(255,255,255,.35)" strokeDasharray="5 5"/>
      <text x={pad} y={height-8} fill="#16c784" fontSize="12">BIDS</text><text x={width-pad} y={height-8} fill="#ea3943" fontSize="12" textAnchor="end">ASKS</text>
    </svg>
  </div>;
}
