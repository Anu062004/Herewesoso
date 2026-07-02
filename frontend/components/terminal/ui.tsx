'use client';

import type { ReactNode } from 'react';

import { useMemo, useState } from 'react';

import { formatPrice } from '@/lib/format';

import { AlertTriangleIcon, CompassIcon, RefreshIcon } from '@/components/terminal/icons';

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function PageHeader({
  title,
  description,
  right
}: {
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="font-headline text-[26px] font-semibold leading-tight tracking-[-0.03em] text-[var(--text-1)] sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-2 max-w-xs text-[14px] leading-6 text-[var(--text-2)] sm:max-w-3xl">{description}</p> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-3">{right}</div> : null}
    </div>
  );
}

export function Panel({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        'overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-[var(--dur-short)] hover:border-[var(--border-hover)]',
        className
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  accent,
  subtitle,
  right
}: {
  title: string;
  accent?: 'purple' | 'cyan' | 'amber' | 'blue';
  subtitle?: string;
  right?: ReactNode;
}) {
  const accentColor = accent
    ? {
        purple: 'var(--purple)',
        cyan: 'var(--cyan)',
        amber: 'var(--amber)',
        blue: 'var(--blue)'
      }[accent]
    : 'transparent';

  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent),var(--bg-panel)] px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          {accent ? <span className="h-4 w-[3px] rounded-full" style={{ backgroundColor: accentColor }} /> : null}
          <h2 className="truncate text-[14px] font-semibold text-[var(--text-1)]">{title}</h2>
        </div>
        {subtitle ? <p className="mt-1 text-[11px] text-[var(--text-3)]">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function Pill({
  children,
  tone = 'default',
  className
}: {
  children: ReactNode;
  tone?: 'default' | 'green' | 'amber' | 'red' | 'cyan' | 'purple' | 'gray';
  className?: string;
}) {
  const styles = {
    default: 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-2)]',
    green: 'border-[rgba(22,163,74,0.22)] bg-[rgba(22,163,74,0.08)] text-[var(--green)]',
    amber: 'border-[rgba(217,119,6,0.24)] bg-[rgba(217,119,6,0.08)] text-[var(--amber)]',
    red: 'border-[rgba(220,38,38,0.22)] bg-[rgba(220,38,38,0.08)] text-[var(--red)]',
    cyan: 'border-[rgba(8,145,178,0.22)] bg-[rgba(8,145,178,0.08)] text-[var(--cyan)]',
    purple: 'border-[rgba(249,115,22,0.24)] bg-[rgba(249,115,22,0.1)] text-[var(--purple)]',
    gray: 'border-[var(--border)] bg-[var(--bg-panel)] text-[var(--text-3)]'
  }[tone];

  return (
    <span className={cx('inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-medium tabular-nums', styles, className)}>
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: 'green' | 'amber' | 'gray' | 'red' | 'cyan' | 'purple' }) {
  const className = {
    green: 'bg-[var(--green)] animate-pulse',
    amber: 'bg-[var(--amber)]',
    gray: 'bg-[var(--text-3)]',
    red: 'bg-[var(--red)]',
    cyan: 'bg-[var(--cyan)]',
    purple: 'bg-[var(--purple)] animate-pulse'
  }[tone];

  return <span className={cx('inline-block h-2 w-2 rounded-full', className)} />;
}

export function PollingIndicator({
  freshness,
  nextPollInMs
}: {
  freshness: 'fresh' | 'stale' | 'error';
  nextPollInMs: number;
}) {
  const tone = freshness === 'fresh' ? 'green' : freshness === 'stale' ? 'amber' : 'gray';

  return (
    <div className="inline-flex items-center gap-2 text-[11px] text-[var(--text-3)]">
      <Dot tone={tone} />
      <span>&middot; {Math.ceil(nextPollInMs / 1000)}s</span>
    </div>
  );
}

export function Button({
  children,
  tone = 'ghost',
  onClick,
  disabled,
  className
}: {
  children: ReactNode;
  tone?: 'ghost' | 'primary';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const styles =
    tone === 'primary'
      ? 'border-[rgba(255,107,0,0.62)] bg-[var(--brand)] text-black shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset] hover:brightness-110'
      : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-2)] hover:border-[var(--border-hover)] hover:text-[var(--text-1)]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex h-9 items-center justify-center rounded-[var(--radius-md)] border px-4 text-[13px] font-medium transition-[transform,filter,border-color,color,background,box-shadow] duration-[var(--dur-short)] ease-[var(--ease-out)] disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'primary' && 'hover:-translate-y-px hover:brightness-110 active:translate-y-0',
        styles,
        className
      )}
    >
      {children}
    </button>
  );
}

export function RefreshButton({
  onClick,
  spinning = false
}: {
  onClick: () => void;
  spinning?: boolean;
}) {
  return (
    <Button onClick={onClick} className="gap-2 px-3">
      <RefreshIcon className={cx('h-4 w-4', spinning && 'animate-spin')} />
      Refresh
    </Button>
  );
}

export function ErrorCard({
  message,
  onRetry
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-[rgba(234,57,67,0.28)] bg-[var(--bg-card)]">
      <div className="flex items-center gap-3 border-l-[3px] border-[var(--red)] px-4 py-4">
        <AlertTriangleIcon className="h-4 w-4 text-[var(--red)]" />
        <div className="min-w-0 flex-1 text-[13px] text-[var(--text-2)]">{message}</div>
        {onRetry ? (
          <Button onClick={onRetry} className="h-8 px-3 text-[12px]">
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon = <CompassIcon className="h-6 w-6 text-[var(--text-3)]" />
}: {
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-panel)]">
        {icon}
      </div>
      <div className="mt-4 text-[15px] font-medium text-[var(--text-1)]">{title}</div>
      <div className="mt-2 max-w-md text-[13px] leading-6 text-[var(--text-3)]">{description}</div>
    </div>
  );
}

export function SkeletonBlock({
  className
}: {
  className?: string;
}) {
  return <div className={cx('animate-pulse rounded-md border border-[var(--border)] bg-[#171717]', className)} />;
}

export function MetricCard({
  label,
  value,
  supporting,
  tone = 'default'
}: {
  label: string;
  value: ReactNode;
  supporting?: ReactNode;
  tone?: 'default' | 'green' | 'amber' | 'red' | 'purple';
}) {
  const color = {
    default: 'text-[var(--text-1)]',
    green: 'text-[var(--green)]',
    amber: 'text-[var(--amber)]',
    red: 'text-[var(--red)]',
    purple: 'text-[var(--purple)]'
  }[tone];

  return (
    <Panel className="p-5">
      <div className="text-[12px] font-medium text-[var(--text-3)]">{label}</div>
      <div className={cx('mt-2.5 font-headline text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums', color)}>{value}</div>
      {supporting ? <div className="mt-3 text-[12px] leading-5 text-[var(--text-2)]">{supporting}</div> : null}
    </Panel>
  );
}

export function Sparkline({
  values,
  tone = 'var(--blue)'
}: {
  values: number[];
  tone?: string;
}) {
  if (values.length === 0) {
    return null;
  }

  const width = 56;
  const height = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / span) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline fill="none" stroke={tone} strokeWidth="1.5" points={points} />
    </svg>
  );
}

export function DistanceBar({
  percent,
  compact = false
}: {
  percent: number;
  compact?: boolean;
}) {
  const clamped = Math.max(0, Math.min(percent, 100));
  const tone = clamped > 20 ? 'var(--green)' : clamped >= 10 ? 'var(--amber)' : 'var(--red)';

  return (
    <div className={cx('w-full overflow-hidden rounded-[999px] bg-[#222222]', compact ? 'h-[10px]' : 'h-2')}>
      <div className="h-full rounded-[999px]" style={{ width: `${Math.min(clamped, 100)}%`, backgroundColor: tone }} />
    </div>
  );
}

export function ValueChange({
  value
}: {
  value: number | null;
}) {
  if (value === null) {
    return <span className="text-[var(--text-3)]">-</span>;
  }

  const positive = value >= 0;

  return (
    <span className={positive ? 'text-[var(--green)]' : 'text-[var(--red)]'}>
      {positive ? '+' : '-'}{Math.abs(value).toFixed(2)}%
    </span>
  );
}

export function DataCellPrice({ value }: { value: number | null }) {
  return <span className="font-medium text-[var(--text-1)]">{formatPrice(value)}</span>;
}

export function CandlestickChart({
  points,
  symbol,
  interval
}: {
  points: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>;
  symbol?: string;
  interval?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chart = useMemo(() => {
    const source = points.slice(-120);
    const width = 1180;
    const height = 520;
    const priceTop = 24;
    const priceBottom = 366;
    const volumeTop = 404;
    const volumeBottom = 474;
    const left = 20;
    const right = width - 86;
    const bottom = 498;
    const highs = source.map((point) => point.high);
    const lows = source.map((point) => point.low);
    const rawMax = Math.max(...highs);
    const rawMin = Math.min(...lows);
    const rawRange = rawMax - rawMin || Math.max(rawMax * 0.01, 1);
    const max = rawMax + rawRange * 0.08;
    const min = rawMin - rawRange * 0.08;
    const range = max - min || 1;
    const step = (right - left) / Math.max(source.length, 1);
    const maxVolume = Math.max(...source.map((point) => point.volume || 0), 1);
    const priceToY = (value: number) => priceBottom - ((value - min) / range) * (priceBottom - priceTop);
    const volumeToHeight = (value: number) => ((value || 0) / maxVolume) * (volumeBottom - volumeTop);
    const xForIndex = (index: number) => left + step * index + step / 2;
    const ticks = Array.from({ length: 6 }).map((_, index) => {
      const value = min + (range / 5) * index;
      return {
        value,
        y: priceToY(value)
      };
    }).reverse();
    const timeTicks = source.length <= 1
      ? []
      : Array.from({ length: 6 })
          .map((_, index) => Math.round((index / 5) * (source.length - 1)))
          .filter((value, index, array) => array.indexOf(value) === index);

    return {
      source,
      width,
      height,
      priceTop,
      priceBottom,
      volumeTop,
      volumeBottom,
      left,
      right,
      bottom,
      step,
      priceToY,
      volumeToHeight,
      xForIndex,
      ticks,
      timeTicks
    };
  }, [points]);

  if (points.length === 0) {
    return (
      <EmptyState
        title="No market candles"
        description="Kline data is unavailable for the selected symbol and interval."
        icon={<RefreshIcon className="h-6 w-6 text-[var(--text-3)]" />}
      />
    );
  }

  const activeIndex = hoverIndex ?? chart.source.length - 1;
  const activePoint = chart.source[Math.max(0, Math.min(activeIndex, chart.source.length - 1))];
  const firstPoint = chart.source[0];
  const lastPoint = chart.source[chart.source.length - 1];
  const changePct = firstPoint ? ((lastPoint.close - firstPoint.open) / firstPoint.open) * 100 : 0;
  const activeChange = activePoint ? activePoint.close - activePoint.open : 0;
  const activeChangePct = activePoint ? (activeChange / activePoint.open) * 100 : 0;
  const lastPriceY = chart.priceToY(lastPoint.close);
  const lastPriceTone = lastPoint.close >= lastPoint.open ? 'var(--green)' : 'var(--red)';

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-[var(--text-1)]">{symbol || 'Market'}</span>
          {interval ? <Pill tone="cyan">{interval}</Pill> : null}
          <Pill tone={changePct >= 0 ? 'green' : 'red'}>
            {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
          </Pill>
          <span className="text-[12px] text-[var(--text-3)]">{chart.source.length} candles</span>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-[11px] text-[var(--text-3)] sm:grid-cols-5">
          <span>O <strong className="font-medium text-[var(--text-1)]">{formatPrice(activePoint?.open)}</strong></span>
          <span>H <strong className="font-medium text-[var(--green)]">{formatPrice(activePoint?.high)}</strong></span>
          <span>L <strong className="font-medium text-[var(--red)]">{formatPrice(activePoint?.low)}</strong></span>
          <span>C <strong className="font-medium text-[var(--text-1)]">{formatPrice(activePoint?.close)}</strong></span>
          <span className={activeChange >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}>
            {activeChange >= 0 ? '+' : ''}{activeChangePct.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="relative p-3">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="h-[520px] w-full select-none"
          role="img"
          aria-label={`${symbol || 'Market'} ${interval || ''} candlestick chart`}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const relativeX = ((event.clientX - rect.left) / rect.width) * chart.width;
            const index = Math.round((relativeX - chart.left - chart.step / 2) / chart.step);
            setHoverIndex(Math.max(0, Math.min(index, chart.source.length - 1)));
          }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <rect x="0" y="0" width={chart.width} height={chart.height} rx="12" fill="transparent" />
          {chart.ticks.map((tick) => (
            <g key={tick.value}>
              <line x1={chart.left} x2={chart.right} y1={tick.y} y2={tick.y} stroke="var(--border)" strokeWidth="1" opacity="0.75" />
              <text x={chart.right + 12} y={tick.y + 4} fill="var(--text-3)" fontSize="12" fontFamily="monospace">
                {formatPrice(tick.value)}
              </text>
            </g>
          ))}

          <line x1={chart.left} x2={chart.right} y1={lastPriceY} y2={lastPriceY} stroke={lastPriceTone} strokeWidth="1" strokeDasharray="6 6" opacity="0.85" />
          <rect x={chart.right + 8} y={lastPriceY - 11} width="70" height="22" rx="5" fill={lastPriceTone} opacity="0.18" />
          <text x={chart.right + 14} y={lastPriceY + 4} fill={lastPriceTone} fontSize="12" fontFamily="monospace">
            {formatPrice(lastPoint.close)}
          </text>

          {chart.timeTicks.map((index) => {
            const point = chart.source[index];
            const x = chart.xForIndex(index);
            const label = new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric'
            }).format(new Date(point.time));
            return (
              <g key={`${point.time}-${index}`}>
                <line x1={x} x2={x} y1={chart.priceTop} y2={chart.volumeBottom} stroke="var(--border)" strokeWidth="1" opacity="0.35" />
                <text x={x} y={chart.bottom} textAnchor="middle" fill="var(--text-3)" fontSize="11" fontFamily="monospace">
                  {label}
                </text>
              </g>
            );
          })}

          <line x1={chart.left} x2={chart.right} y1={chart.volumeTop - 15} y2={chart.volumeTop - 15} stroke="var(--border)" strokeWidth="1" />
          <text x={chart.left} y={chart.volumeTop - 22} fill="var(--text-3)" fontSize="11" fontFamily="monospace">
            Volume
          </text>

          {chart.source.map((point, index) => {
            const x = chart.xForIndex(index);
            const bullish = point.close >= point.open;
            const color = bullish ? 'var(--green)' : 'var(--red)';
            const volumeHeight = chart.volumeToHeight(point.volume || 0);

            return (
              <rect
                key={`volume-${point.time}-${index}`}
                x={x - Math.max(2, chart.step * 0.24)}
                y={chart.volumeBottom - volumeHeight}
                width={Math.max(3, chart.step * 0.48)}
                height={Math.max(1, volumeHeight)}
                rx="1"
                fill={color}
                opacity="0.22"
              />
            );
          })}

          {chart.source.map((point, index) => {
            const x = chart.xForIndex(index);
            const openY = chart.priceToY(point.open);
            const closeY = chart.priceToY(point.close);
            const highY = chart.priceToY(point.high);
            const lowY = chart.priceToY(point.low);
            const bullish = point.close >= point.open;
            const color = bullish ? 'var(--green)' : 'var(--red)';
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(2, Math.abs(closeY - openY));
            const candleWidth = Math.max(4, Math.min(15, chart.step * 0.58));
            const selected = index === hoverIndex;

            return (
              <g key={`${point.time}-${index}`} opacity={hoverIndex === null || selected ? 1 : 0.58}>
                <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth={selected ? '2.2' : '1.5'} />
                <rect
                  x={x - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  rx="1.5"
                  fill={color}
                />
              </g>
            );
          })}

          {hoverIndex !== null && activePoint ? (() => {
            const x = chart.xForIndex(hoverIndex);
            const y = chart.priceToY(activePoint.close);
            const tooltipX = x > chart.right - 190 ? x - 202 : x + 14;
            const tooltipY = y < 90 ? y + 18 : y - 82;
            return (
              <g>
                <line x1={x} x2={x} y1={chart.priceTop} y2={chart.volumeBottom} stroke="var(--text-2)" strokeWidth="1" strokeDasharray="4 5" opacity="0.7" />
                <line x1={chart.left} x2={chart.right} y1={y} y2={y} stroke="var(--text-2)" strokeWidth="1" strokeDasharray="4 5" opacity="0.55" />
                <rect x={tooltipX} y={tooltipY} width="188" height="70" rx="8" fill="var(--bg-elevated)" stroke="var(--border-hover)" />
                <text x={tooltipX + 10} y={tooltipY + 18} fill="var(--text-1)" fontSize="12" fontFamily="monospace">
                  {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(activePoint.time))}
                </text>
                <text x={tooltipX + 10} y={tooltipY + 38} fill="var(--text-2)" fontSize="11" fontFamily="monospace">
                  O {formatPrice(activePoint.open)}  H {formatPrice(activePoint.high)}
                </text>
                <text x={tooltipX + 10} y={tooltipY + 56} fill="var(--text-2)" fontSize="11" fontFamily="monospace">
                  L {formatPrice(activePoint.low)}  C {formatPrice(activePoint.close)}
                </text>
              </g>
            );
          })() : null}
        </svg>

        <div className="mt-2 flex justify-end text-[11px] text-[var(--text-3)]">
          <span>Last candle {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(lastPoint.time))}</span>
        </div>
      </div>
    </div>
  );
}
