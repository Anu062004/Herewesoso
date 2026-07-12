'use client';

import type { ReactNode } from 'react';
import type {
  CandlestickData,
  HistogramData,
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  UTCTimestamp
} from 'lightweight-charts';

import { useEffect, useMemo, useRef, useState } from 'react';

import { formatCompactNumber, formatPrice } from '@/lib/format';

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

export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  size = 132
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  centerValue: string | number;
  centerLabel: string;
  size?: number;
}) {
  const normalized = segments.map((segment) => ({ ...segment, value: Math.max(0, Number(segment.value) || 0) }));
  const total = normalized.reduce((sum, segment) => sum + segment.value, 0);
  let cursor = 0;
  const stops = total > 0
    ? normalized.map((segment) => {
        const start = cursor;
        cursor += (segment.value / total) * 100;
        return `${segment.color} ${start}% ${cursor}%`;
      }).join(', ')
    : 'var(--border) 0% 100%';
  const description = normalized.map((segment) => `${segment.label} ${segment.value.toFixed(0)}`).join(', ');

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div
        role="img"
        aria-label={`${centerLabel}: ${centerValue}. ${description}`}
        className="relative shrink-0 rounded-full"
        style={{ width: size, height: size, background: `conic-gradient(${stops})` }}
      >
        <div className="absolute inset-[15%] flex flex-col items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-center shadow-[0_0_18px_rgba(0,0,0,0.35)]">
          <div className="text-[22px] font-semibold tabular-nums text-[var(--text-1)]">{centerValue}</div>
          <div className="mt-0.5 max-w-[74px] text-[9px] uppercase tracking-[0.12em] text-[var(--text-3)]">{centerLabel}</div>
        </div>
      </div>
      <div className="min-w-0 space-y-2">
        {normalized.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-5 text-[11px]">
            <span className="flex min-w-0 items-center gap-2 text-[var(--text-2)]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="truncate">{segment.label}</span>
            </span>
            <span className="tabular-nums text-[var(--text-1)]">{segment.value.toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
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
const PRICE_UP = '#16c784';
const PRICE_DOWN = '#ea3943';
const GRID_COLOR = 'rgba(148, 163, 184, 0.12)';
const TEXT_MUTED = '#8f98a8';

type ActiveCandle = CandlestickPoint & { color: string };

function toChartTimestamp(time: number): UTCTimestamp {
  return Math.floor(time > 1_000_000_000_000 ? time / 1000 : time) as UTCTimestamp;
}

function toDateMs(time: UTCTimestamp) {
  return Number(time) * 1000;
}

function detailedTimeLabel(time: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(time));
}

function normalizeChartData(points: CandlestickPoint[]) {
  const rows = points
    .filter((point) =>
      Number.isFinite(point.time) &&
      Number.isFinite(point.open) &&
      Number.isFinite(point.high) &&
      Number.isFinite(point.low) &&
      Number.isFinite(point.close)
    )
    .map((point) => ({
      ...point,
      time: toChartTimestamp(point.time)
    }))
    .sort((left, right) => Number(left.time) - Number(right.time));

  const deduped = new Map<number, CandlestickPoint & { time: UTCTimestamp }>();
  rows.forEach((point) => deduped.set(Number(point.time), point));

  const normalized = Array.from(deduped.values());
  const candles: CandlestickData<UTCTimestamp>[] = normalized.map((point) => ({
    time: point.time,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close
  }));
  const volumes: HistogramData<UTCTimestamp>[] = normalized.map((point) => ({
    time: point.time,
    value: point.volume || 0,
    color: point.close >= point.open ? 'rgba(22, 199, 132, 0.35)' : 'rgba(234, 57, 67, 0.35)'
  }));
  const byTime = new Map<number, ActiveCandle>();
  normalized.forEach((point) => {
    byTime.set(Number(point.time), {
      time: toDateMs(point.time),
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
      color: point.close >= point.open ? PRICE_UP : PRICE_DOWN
    });
  });

  return {
    candles,
    volumes,
    byTime,
    latest: normalized.length > 0 ? byTime.get(Number(normalized[normalized.length - 1].time)) || null : null
  };
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const rangeKeyRef = useRef<string>('');
  const [chartReady, setChartReady] = useState(0);
  const chartData = useMemo(() => normalizeChartData(points), [points]);
  const chartDataRef = useRef(chartData);
  const [activePoint, setActivePoint] = useState<ActiveCandle | null>(chartData.latest);

  useEffect(() => {
    setActivePoint(chartData.latest);
  }, [chartData.latest, symbol, interval]);

  useEffect(() => {
    chartDataRef.current = chartData;
  }, [chartData]);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let crosshairHandler: ((param: MouseEventParams) => void) | null = null;

    async function mountChart() {
      const {
        CandlestickSeries,
        ColorType,
        CrosshairMode,
        HistogramSeries,
        LineStyle,
        PriceScaleMode,
        createChart
      } = await import('lightweight-charts');

      if (disposed || !containerRef.current) {
        return;
      }

      const chart = createChart(containerRef.current, {
        autoSize: true,
        height: 640,
        layout: {
          background: { type: ColorType.Solid, color: '#050505' },
          textColor: TEXT_MUTED,
          fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
          attributionLogo: false
        },
        grid: {
          vertLines: { color: GRID_COLOR, style: LineStyle.Solid },
          horzLines: { color: GRID_COLOR, style: LineStyle.Solid }
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: 'rgba(226, 232, 240, 0.55)',
            labelBackgroundColor: '#111827',
            style: LineStyle.LargeDashed
          },
          horzLine: {
            color: 'rgba(226, 232, 240, 0.55)',
            labelBackgroundColor: '#111827',
            style: LineStyle.LargeDashed
          }
        },
        localization: {
          priceFormatter: (price: number) => formatPrice(price)
        },
        rightPriceScale: {
          autoScale: true,
          borderVisible: false,
          mode: PriceScaleMode.Normal,
          scaleMargins: {
            top: 0.06,
            bottom: 0.24
          }
        },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 8,
          barSpacing: 9,
          minBarSpacing: 3,
          fixLeftEdge: false,
          fixRightEdge: false
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false
        },
        handleScale: {
          axisDoubleClickReset: true,
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true
        },
        kineticScroll: {
          mouse: true,
          touch: true
        }
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: PRICE_UP,
        downColor: PRICE_DOWN,
        borderUpColor: PRICE_UP,
        borderDownColor: PRICE_DOWN,
        wickUpColor: PRICE_UP,
        wickDownColor: PRICE_DOWN,
        borderVisible: false,
        priceLineVisible: true,
        lastValueVisible: true,
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01
        }
      });

      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: 'volume',
        priceFormat: { type: 'volume' },
        lastValueVisible: false,
        priceLineVisible: false
      });

      chart.priceScale('volume').applyOptions({
        borderVisible: false,
        scaleMargins: {
          top: 0.78,
          bottom: 0
        }
      });

      crosshairHandler = (param) => {
        const candle = candleSeriesRef.current
          ? param.seriesData.get(candleSeriesRef.current) as CandlestickData<UTCTimestamp> | undefined
          : undefined;

        if (candle) {
          const currentData = chartDataRef.current;
          const matched = currentData.byTime.get(Number(candle.time));
          setActivePoint(matched || {
            time: toDateMs(candle.time),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            color: candle.close >= candle.open ? PRICE_UP : PRICE_DOWN
          });
          return;
        }

        setActivePoint(chartDataRef.current.latest);
      };

      chart.subscribeCrosshairMove(crosshairHandler);
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }

        chart.applyOptions({
          width: Math.floor(entry.contentRect.width),
          height: Math.max(520, Math.floor(entry.contentRect.height))
        });
      });
      resizeObserver.observe(containerRef.current);

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      volumeSeriesRef.current = volumeSeries;
      setChartReady((current) => current + 1);
    }

    void mountChart();

    return () => {
      disposed = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (chartRef.current && crosshairHandler) {
        chartRef.current.unsubscribeCrosshairMove(crosshairHandler);
      }
      chartRef.current?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;

    if (!chart || !candleSeries || !volumeSeries || chartData.candles.length === 0) {
      return;
    }

    candleSeries.setData(chartData.candles);
    volumeSeries.setData(chartData.volumes);
    setActivePoint(chartData.latest);

    const rangeKey = `${symbol || 'Market'}:${interval || 'interval'}`;
    if (rangeKeyRef.current !== rangeKey) {
      const to = chartData.candles.length + 8;
      const from = Math.max(0, chartData.candles.length - DEFAULT_VISIBLE_CANDLES);
      chart.timeScale().setVisibleLogicalRange({ from, to });
      rangeKeyRef.current = rangeKey;
    }
  }, [chartData, chartReady, interval, symbol]);

  if (points.length === 0) {
    return (
      <EmptyState
        title="No market candles"
        description="Kline data is unavailable for the selected symbol and interval."
        icon={<RefreshIcon className="h-6 w-6 text-[var(--text-3)]" />}
      />
    );
  }

  const latestPoint = chartData.latest;
  const displayPoint = activePoint || latestPoint;
  const change = displayPoint ? displayPoint.close - displayPoint.open : 0;
  const changePct = displayPoint ? (change / displayPoint.open) * 100 : 0;
  const changeColor = change >= 0 ? PRICE_UP : PRICE_DOWN;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[#050505]">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[#090909] px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[14px] font-semibold text-[var(--text-1)]">{symbol || 'Market'}</span>
          <span className="rounded border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-2)]">
            {interval || '1h'}
          </span>
          {displayPoint ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-3)]">
              <span>O <strong className="font-medium text-[var(--text-1)]">{formatPrice(displayPoint.open)}</strong></span>
              <span>H <strong className="font-medium text-[var(--green)]">{formatPrice(displayPoint.high)}</strong></span>
              <span>L <strong className="font-medium text-[var(--red)]">{formatPrice(displayPoint.low)}</strong></span>
              <span>C <strong className="font-medium text-[var(--text-1)]">{formatPrice(displayPoint.close)}</strong></span>
              <span style={{ color: changeColor }}>
                {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
              </span>
              <span>Vol <strong className="font-medium text-[var(--text-1)]">{formatCompactNumber(displayPoint.volume || 0, 2)}</strong></span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => chartRef.current?.timeScale().resetTimeScale()}
            className="inline-flex h-8 items-center rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 text-[12px] font-medium text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
            className="inline-flex h-8 items-center rounded-md border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] px-3 text-[12px] font-medium text-[var(--green)] transition hover:bg-[rgba(34,197,94,0.14)]"
          >
            Live
          </button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={containerRef}
          className="h-[640px] w-full"
          aria-label={`${symbol || 'Market'} ${interval || ''} TradingView style candlestick chart`}
        />
        {latestPoint ? (
          <div className="pointer-events-none absolute left-4 top-4 rounded border border-[rgba(148,163,184,0.18)] bg-[rgba(5,5,5,0.72)] px-3 py-2 text-[11px] text-[var(--text-3)] backdrop-blur">
            <div className="font-medium text-[var(--text-1)]">{detailedTimeLabel(displayPoint?.time || latestPoint.time)}</div>
            <div className="mt-1">
              Last <span style={{ color: latestPoint.color }}>{formatPrice(latestPoint.close)}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
