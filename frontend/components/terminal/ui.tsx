'use client';

import type { ReactNode } from 'react';

import { useEffect, useMemo, useRef, useState } from 'react';

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

type CandlestickPoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

const DEFAULT_VISIBLE_CANDLES = 120;
const MIN_VISIBLE_CANDLES = 24;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function compactTimeLabel(time: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric'
  }).format(new Date(time));
}

function detailedTimeLabel(time: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(time));
}

function ChartButton({
  children,
  disabled,
  label,
  onClick
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 text-[12px] font-medium text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)] disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}

export function CandlestickChart({
  points,
  symbol,
  interval
}: {
  points: CandlestickPoint[];
  symbol?: string;
  interval?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE_CANDLES);
  const [rightOffset, setRightOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ x: number; rightOffset: number } | null>(null);

  useEffect(() => {
    setHoverIndex(null);
    setRightOffset(0);
    setVisibleCount(DEFAULT_VISIBLE_CANDLES);
  }, [symbol, interval]);

  useEffect(() => {
    if (points.length === 0) {
      setRightOffset(0);
      return;
    }

    const minimumVisible = Math.min(MIN_VISIBLE_CANDLES, points.length);
    setVisibleCount((current) => clampNumber(current, minimumVisible, points.length));
  }, [points.length]);

  useEffect(() => {
    if (points.length === 0) {
      return;
    }

    const safeVisibleCount = clampNumber(
      visibleCount,
      Math.min(MIN_VISIBLE_CANDLES, points.length),
      points.length
    );
    setRightOffset((current) => clampNumber(current, 0, Math.max(0, points.length - safeVisibleCount)));
  }, [points.length, visibleCount]);

  const chart = useMemo(() => {
    const width = 1180;
    const height = 540;
    const priceTop = 24;
    const priceBottom = 366;
    const volumeTop = 404;
    const volumeBottom = 482;
    const left = 20;
    const right = width - 92;
    const bottom = 512;
    const fullLength = points.length;
    const minimumVisible = Math.min(MIN_VISIBLE_CANDLES, fullLength);
    const safeVisibleCount = fullLength === 0
      ? 0
      : clampNumber(Math.round(visibleCount), minimumVisible, fullLength);
    const maxRightOffset = Math.max(0, fullLength - safeVisibleCount);
    const safeRightOffset = clampNumber(Math.round(rightOffset), 0, maxRightOffset);
    const windowEnd = Math.max(0, fullLength - safeRightOffset);
    const windowStart = Math.max(0, windowEnd - safeVisibleCount);
    const source = points.slice(windowStart, windowEnd);
    const rawMax = source.length > 0 ? Math.max(...source.map((point) => point.high)) : 1;
    const rawMin = source.length > 0 ? Math.min(...source.map((point) => point.low)) : 0;
    const rawRange = rawMax - rawMin || Math.max(rawMax * 0.01, 1);
    const max = rawMax + rawRange * 0.1;
    const min = rawMin - rawRange * 0.1;
    const range = max - min || 1;
    const step = (right - left) / Math.max(source.length, 1);
    const maxVolume = Math.max(...source.map((point) => point.volume || 0), 1);
    const priceToY = (value: number) => priceBottom - ((value - min) / range) * (priceBottom - priceTop);
    const volumeToHeight = (value: number) => ((value || 0) / maxVolume) * (volumeBottom - volumeTop);
    const xForIndex = (index: number) => left + step * index + step / 2;
    const ticks = Array.from({ length: 6 }).map((_, index) => {
      const value = min + (range / 5) * index;
      return { value, y: priceToY(value) };
    }).reverse();
    const timeTicks = source.length <= 1
      ? []
      : Array.from({ length: 7 })
          .map((_, index) => Math.round((index / 6) * (source.length - 1)))
          .filter((value, index, array) => array.indexOf(value) === index);
    const windowStartPct = fullLength > 0 ? (windowStart / fullLength) * 100 : 0;
    const windowWidthPct = fullLength > 0 ? Math.max(2, (source.length / fullLength) * 100) : 0;

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
      timeTicks,
      fullLength,
      safeVisibleCount,
      safeRightOffset,
      maxRightOffset,
      windowStart,
      windowEnd,
      windowStartPct,
      windowWidthPct
    };
  }, [points, rightOffset, visibleCount]);

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
  const isLive = chart.safeRightOffset === 0;
  const changePct = firstPoint ? ((lastPoint.close - firstPoint.open) / firstPoint.open) * 100 : 0;
  const activeChange = activePoint ? activePoint.close - activePoint.open : 0;
  const activeChangePct = activePoint ? (activeChange / activePoint.open) * 100 : 0;
  const lastPriceY = chart.priceToY(lastPoint.close);
  const lastPriceTone = lastPoint.close >= lastPoint.open ? 'var(--green)' : 'var(--red)';
  const pageStep = Math.max(6, Math.round(chart.safeVisibleCount * 0.35));
  const canPanOlder = chart.safeRightOffset < chart.maxRightOffset;
  const canPanNewer = chart.safeRightOffset > 0;
  const canZoomIn = chart.safeVisibleCount > Math.min(MIN_VISIBLE_CANDLES, chart.fullLength);
  const canZoomOut = chart.safeVisibleCount < chart.fullLength;

  const zoomTo = (nextVisibleCount: number, anchorRatio = 0.5) => {
    if (chart.fullLength === 0) {
      return;
    }

    const minimumVisible = Math.min(MIN_VISIBLE_CANDLES, chart.fullLength);
    const nextVisible = clampNumber(Math.round(nextVisibleCount), minimumVisible, chart.fullLength);
    const safeAnchorRatio = clampNumber(anchorRatio, 0, 1);
    const anchorIndex = chart.windowStart + Math.max(0, chart.safeVisibleCount - 1) * safeAnchorRatio;
    const nextStart = clampNumber(
      Math.round(anchorIndex - Math.max(0, nextVisible - 1) * safeAnchorRatio),
      0,
      Math.max(0, chart.fullLength - nextVisible)
    );

    setVisibleCount(nextVisible);
    setRightOffset(chart.fullLength - (nextStart + nextVisible));
    setHoverIndex(null);
  };

  const panBy = (candles: number) => {
    setRightOffset((current) => clampNumber(current + candles, 0, chart.maxRightOffset));
    setHoverIndex(null);
  };

  const resetView = () => {
    setVisibleCount(Math.min(DEFAULT_VISIBLE_CANDLES, chart.fullLength));
    setRightOffset(0);
    setHoverIndex(null);
  };

  const relativePosition = (clientX: number, rect: DOMRect) => {
    return ((clientX - rect.left) / rect.width) * chart.width;
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-[var(--text-1)]">{symbol || 'Market'}</span>
          {interval ? <Pill tone="cyan">{interval}</Pill> : null}
          <Pill tone={changePct >= 0 ? 'green' : 'red'}>
            {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
          </Pill>
          <Pill tone={isLive ? 'green' : 'amber'}>{isLive ? 'Live' : 'History'}</Pill>
          <span className="text-[12px] text-[var(--text-3)]">
            {chart.windowStart + 1}-{chart.windowEnd} / {chart.fullLength}
          </span>
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

        <div className="flex flex-wrap items-center gap-1.5">
          <ChartButton label="Show older candles" disabled={!canPanOlder} onClick={() => panBy(pageStep)}>{'<'}</ChartButton>
          <ChartButton label="Show newer candles" disabled={!canPanNewer} onClick={() => panBy(-pageStep)}>{'>'}</ChartButton>
          <ChartButton label="Zoom in" disabled={!canZoomIn} onClick={() => zoomTo(chart.safeVisibleCount * 0.75)}>+</ChartButton>
          <ChartButton label="Zoom out" disabled={!canZoomOut} onClick={() => zoomTo(chart.safeVisibleCount * 1.25)}>-</ChartButton>
          <ChartButton label="Reset chart view" onClick={resetView}>
            <RefreshIcon className="h-3.5 w-3.5" />
          </ChartButton>
          <button
            type="button"
            onClick={() => setRightOffset(0)}
            disabled={isLive}
            className="inline-flex h-8 items-center justify-center rounded-md border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] px-3 text-[12px] font-medium text-[var(--green)] transition hover:bg-[rgba(34,197,94,0.14)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Live
          </button>
        </div>
      </div>

      <div className="border-b border-[var(--border)] bg-[var(--bg-panel)] px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[var(--text-3)]">History</span>
          <input
            type="range"
            min={0}
            max={chart.maxRightOffset}
            value={chart.maxRightOffset - chart.safeRightOffset}
            onChange={(event) => {
              setRightOffset(chart.maxRightOffset - Number(event.target.value));
              setHoverIndex(null);
            }}
            aria-label="Chart history position"
            className="h-2 min-w-0 flex-1 accent-[var(--brand)]"
          />
          <span className="w-24 text-right text-[11px] tabular-nums text-[var(--text-3)]">{chart.safeVisibleCount} bars</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-card)]">
          <div
            className="h-full rounded-full bg-[var(--brand)]"
            style={{ marginLeft: `${chart.windowStartPct}%`, width: `${chart.windowWidthPct}%` }}
          />
        </div>
      </div>

      <div className="relative p-3">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className={cx('h-[540px] w-full select-none', isDragging ? 'cursor-grabbing' : 'cursor-grab')}
          role="img"
          aria-label={`${symbol || 'Market'} ${interval || ''} candlestick chart`}
          style={{ touchAction: 'none' }}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }

            dragRef.current = { x: event.clientX, rightOffset: chart.safeRightOffset };
            setIsDragging(true);
            setHoverIndex(null);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const relativeX = relativePosition(event.clientX, rect);

            if (dragRef.current) {
              const deltaSvg = ((event.clientX - dragRef.current.x) / rect.width) * chart.width;
              const deltaCandles = Math.round(deltaSvg / Math.max(chart.step, 1));
              setRightOffset(clampNumber(dragRef.current.rightOffset + deltaCandles, 0, chart.maxRightOffset));
              setHoverIndex(null);
              return;
            }

            const index = Math.round((relativeX - chart.left - chart.step / 2) / chart.step);
            setHoverIndex(clampNumber(index, 0, chart.source.length - 1));
          }}
          onPointerUp={(event) => {
            dragRef.current = null;
            setIsDragging(false);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            setIsDragging(false);
          }}
          onPointerLeave={() => {
            if (!dragRef.current) {
              setHoverIndex(null);
            }
          }}
          onWheel={(event) => {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const relativeX = relativePosition(event.clientX, rect);
            const anchorRatio = clampNumber((relativeX - chart.left) / Math.max(1, chart.right - chart.left), 0, 1);
            const scale = event.deltaY < 0 ? 0.82 : 1.18;
            zoomTo(chart.safeVisibleCount * scale, anchorRatio);
          }}
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
          <rect x={chart.right + 5} y={lastPriceY - 11} width="83" height="22" rx="5" fill={lastPriceTone} opacity="0.18" />
          <text x={chart.right + 10} y={lastPriceY + 4} fill={lastPriceTone} fontSize="12" fontFamily="monospace">
            {formatPrice(lastPoint.close)}
          </text>

          {chart.timeTicks.map((index) => {
            const point = chart.source[index];
            const x = chart.xForIndex(index);
            return (
              <g key={`${point.time}-${index}`}>
                <line x1={x} x2={x} y1={chart.priceTop} y2={chart.volumeBottom} stroke="var(--border)" strokeWidth="1" opacity="0.35" />
                <text x={x} y={chart.bottom} textAnchor="middle" fill="var(--text-3)" fontSize="11" fontFamily="monospace">
                  {compactTimeLabel(point.time)}
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
                <rect x={tooltipX} y={tooltipY} width="196" height="72" rx="8" fill="var(--bg-elevated)" stroke="var(--border-hover)" />
                <text x={tooltipX + 10} y={tooltipY + 18} fill="var(--text-1)" fontSize="12" fontFamily="monospace">
                  {detailedTimeLabel(activePoint.time)}
                </text>
                <text x={tooltipX + 10} y={tooltipY + 39} fill="var(--text-2)" fontSize="11" fontFamily="monospace">
                  O {formatPrice(activePoint.open)}  H {formatPrice(activePoint.high)}
                </text>
                <text x={tooltipX + 10} y={tooltipY + 58} fill="var(--text-2)" fontSize="11" fontFamily="monospace">
                  L {formatPrice(activePoint.low)}  C {formatPrice(activePoint.close)}
                </text>
              </g>
            );
          })() : null}
        </svg>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-3)]">
          <span>{detailedTimeLabel(firstPoint.time)} - {detailedTimeLabel(lastPoint.time)}</span>
          <span>Last visible candle {detailedTimeLabel(lastPoint.time)}</span>
        </div>
      </div>
    </div>
  );
}
