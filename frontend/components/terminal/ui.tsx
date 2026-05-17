'use client';

import type { ReactNode } from 'react';

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
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-[18px] font-semibold text-[var(--text-1)]">{title}</h1>
        {description ? <p className="mt-2 text-[13px] text-[var(--text-2)]">{description}</p> : null}
      </div>
      {right ? <div className="flex items-center gap-3">{right}</div> : null}
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
    <section className={cx('rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)]', className)}>
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
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          {accent ? <span className="h-5 w-[3px] rounded-full" style={{ backgroundColor: accentColor }} /> : null}
          <h2 className="truncate text-[15px] font-medium text-[var(--text-1)]">{title}</h2>
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
    default: 'border-[var(--border)] bg-[var(--bg-panel)] text-[var(--text-2)]',
    green: 'border-[rgba(16,185,129,0.22)] bg-[rgba(16,185,129,0.12)] text-[var(--green)]',
    amber: 'border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.12)] text-[var(--amber)]',
    red: 'border-[rgba(239,68,68,0.24)] bg-[rgba(239,68,68,0.12)] text-[var(--red)]',
    cyan: 'border-[rgba(6,182,212,0.24)] bg-[rgba(6,182,212,0.12)] text-[var(--cyan)]',
    purple: 'border-[rgba(139,92,246,0.24)] bg-[rgba(139,92,246,0.14)] text-[var(--purple)]',
    gray: 'border-[var(--border)] bg-[var(--bg-panel)] text-[var(--text-3)]'
  }[tone];

  return (
    <span className={cx('inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-medium', styles, className)}>
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
      ? 'border-[rgba(59,130,246,0.4)] bg-[var(--blue)] text-white hover:brightness-110'
      : 'border-[var(--border)] bg-transparent text-[var(--text-2)] hover:border-[var(--border-hover)] hover:text-[var(--text-1)]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex h-9 items-center justify-center rounded-md border px-4 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
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
    <div className="rounded-[10px] border border-[rgba(239,68,68,0.24)] bg-[var(--bg-card)]">
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
      <div className="flex h-12 w-12 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)]">
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
  return <div className={cx('animate-pulse rounded-[8px] border border-[var(--border)] bg-[var(--bg-panel)]', className)} />;
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
    <Panel className="p-4">
      <div className="text-[11px] font-medium text-[var(--text-2)]">{label}</div>
      <div className={cx('mt-3 text-[28px] font-semibold leading-none', color)}>{value}</div>
      {supporting ? <div className="mt-3 text-[13px] text-[var(--text-2)]">{supporting}</div> : null}
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
    <div className={cx('w-full overflow-hidden rounded-[999px] bg-[var(--bg-panel)]', compact ? 'h-[10px]' : 'h-2')}>
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
    return <span className="text-[var(--text-3)]">—</span>;
  }

  const positive = value >= 0;

  return (
    <span className={positive ? 'text-[var(--green)]' : 'text-[var(--red)]'}>
      {positive ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

export function DataCellPrice({ value }: { value: number | null }) {
  return <span className="font-medium text-[var(--text-1)]">{formatPrice(value)}</span>;
}

export function CandlestickChart({
  points
}: {
  points: Array<{ time: number; open: number; high: number; low: number; close: number }>;
}) {
  if (points.length === 0) {
    return (
      <EmptyState
        title="No market candles"
        description="Kline data is unavailable for the selected symbol and interval."
        icon={<RefreshIcon className="h-6 w-6 text-[var(--text-3)]" />}
      />
    );
  }

  const width = 900;
  const height = 360;
  const padding = 28;
  const highs = points.map((point) => point.high);
  const lows = points.map((point) => point.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min || 1;
  const step = (width - padding * 2) / Math.max(points.length, 1);

  const priceToY = (value: number) => height - padding - ((value - min) / range) * (height - padding * 2);

  return (
    <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[320px] w-full">
        {[0.2, 0.4, 0.6, 0.8].map((stop) => {
          const y = padding + stop * (height - padding * 2);
          return <line key={stop} x1={padding} x2={width - padding} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />;
        })}
        {points.map((point, index) => {
          const x = padding + step * index + step / 2;
          const openY = priceToY(point.open);
          const closeY = priceToY(point.close);
          const highY = priceToY(point.high);
          const lowY = priceToY(point.low);
          const bullish = point.close >= point.open;
          const color = bullish ? 'var(--green)' : 'var(--red)';
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(2, Math.abs(closeY - openY));

          return (
            <g key={`${point.time}-${index}`}>
              <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth="1.5" />
              <rect x={x - Math.max(3, step * 0.26)} y={bodyTop} width={Math.max(6, step * 0.52)} height={bodyHeight} rx="1" fill={color} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
