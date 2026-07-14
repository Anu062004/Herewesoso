import type { SignalOutcomeRow, SignalType } from '../types/domain';

import sodex = require('./sodex');
import supabaseService = require('./supabase');
import errorUtils = require('../utils/error');

const { safeSelect, safeUpdate } = supabaseService;
const { getErrorMessage } = errorUtils;

type HorizonLabel = '1h' | '6h' | '24h' | '7d';
type HorizonField = 'forward_return_1h' | 'forward_return_6h' | 'forward_return_24h' | 'forward_return_7d';
type SodexNetwork = 'testnet' | 'mainnet';

interface KlinePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PricePoint {
  price: number;
  time: number;
}

interface ResolutionSummary {
  scanned: number;
  updated: number;
  ready: number;
  insufficientData: number;
  skipped: number;
  errors: Array<{ id?: string; sector?: string; error: string }>;
}

type ResolutionState = 'PENDING' | 'PARTIAL' | 'READY' | 'INSUFFICIENT_DATA';

const DEFAULT_BENCHMARK_SYMBOL = process.env.SIGNAL_BENCHMARK_SYMBOL || 'BTC-USD';
const DEFAULT_NETWORK: SodexNetwork =
  process.env.SIGNAL_OUTCOME_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const KLINE_INTERVAL = process.env.SIGNAL_OUTCOME_INTERVAL || '1h';
const configuredKlineLimit = Number.parseInt(process.env.SIGNAL_OUTCOME_KLINE_LIMIT || '250', 10);
const KLINE_LIMIT = Number.isFinite(configuredKlineLimit) ? Math.max(50, Math.min(1000, configuredKlineLimit)) : 250;
const configuredCandleDistanceMs = Number.parseInt(
  process.env.SIGNAL_OUTCOME_MAX_CANDLE_DISTANCE_MS || String(90 * 60 * 1000),
  10
);
const MAX_CANDLE_DISTANCE_MS = Number.isFinite(configuredCandleDistanceMs) && configuredCandleDistanceMs > 0
  ? configuredCandleDistanceMs
  : 90 * 60 * 1000;
const configuredResolutionExpiryMs = Number.parseInt(
  process.env.SIGNAL_OUTCOME_EXPIRY_MS || String(10 * 24 * 60 * 60 * 1000),
  10
);
const MAX_RESOLUTION_AGE_MS = Number.isFinite(configuredResolutionExpiryMs) && configuredResolutionExpiryMs >= 7 * 24 * 60 * 60 * 1000
  ? configuredResolutionExpiryMs
  : 10 * 24 * 60 * 60 * 1000;

const DEFAULT_SECTOR_PROXY_SYMBOLS: Record<string, string> = {
  DeFi: 'UNI-USD',
  AI: 'RENDER-USD',
  RWA: 'ONDO-USD',
  L1: 'SOL-USD',
  L2: 'ARB-USD',
  GameFi: 'IMX-USD',
  DePIN: 'FIL-USD',
  Meme: 'DOGE-USD'
};

const HORIZONS: Array<{ label: HorizonLabel; field: HorizonField; ms: number }> = [
  { label: '1h', field: 'forward_return_1h', ms: 60 * 60 * 1000 },
  { label: '6h', field: 'forward_return_6h', ms: 6 * 60 * 60 * 1000 },
  { label: '24h', field: 'forward_return_24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', field: 'forward_return_7d', ms: 7 * 24 * 60 * 60 * 1000 }
];

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeTimestamp(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed === null || parsed <= 0) return null;
  return parsed < 10000000000 ? parsed * 1000 : parsed;
}

function round(value: number | null, digits = 4): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseProxyOverrides(): Record<string, string> {
  const raw = process.env.SECTOR_PROXY_SYMBOLS;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([sector, symbol]) => [sector, symbol.trim().toUpperCase()])
        .filter(([, symbol]) => Boolean(symbol))
    );
  } catch {
    return Object.fromEntries(
      raw
        .split(',')
        .map((pair) => pair.split('='))
        .filter((parts): parts is [string, string] => parts.length === 2)
        .map(([sector, symbol]) => [sector.trim(), symbol.trim().toUpperCase()])
        .filter(([sector, symbol]) => Boolean(sector && symbol))
    );
  }
}

function proxyMap(): Record<string, string> {
  return {
    ...DEFAULT_SECTOR_PROXY_SYMBOLS,
    ...parseProxyOverrides()
  };
}

function resolveProxySymbol(sector: string): string {
  return proxyMap()[sector] || DEFAULT_BENCHMARK_SYMBOL;
}

function normalizeKlinePoints(input: unknown): KlinePoint[] {
  const source = Array.isArray(input)
    ? input
    : Array.isArray((input as { data?: unknown })?.data)
      ? ((input as { data: unknown[] }).data as unknown[])
      : [];

  return source
    .map((entry) => {
      if (Array.isArray(entry)) {
        const time = normalizeTimestamp(entry[0]);
        const open = toNumber(entry[1]);
        const high = toNumber(entry[2]);
        const low = toNumber(entry[3]);
        const close = toNumber(entry[4]);
        const volume = toNumber(entry[5]) || 0;

        if ([time, open, high, low, close].some((value) => value === null)) return null;
        return { time: Number(time), open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume };
      }

      if (entry && typeof entry === 'object') {
        const row = entry as Record<string, unknown>;
        const time = normalizeTimestamp(row.time ?? row.openTime ?? row.t ?? row.timestamp);
        const open = toNumber(row.open ?? row.o);
        const high = toNumber(row.high ?? row.h);
        const low = toNumber(row.low ?? row.l);
        const close = toNumber(row.close ?? row.c);
        const volume = toNumber(row.volume ?? row.v) || 0;

        if ([time, open, high, low, close].some((value) => value === null)) return null;
        return { time: Number(time), open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume };
      }

      return null;
    })
    .filter((point): point is KlinePoint => Boolean(point))
    .sort((left, right) => left.time - right.time);
}

function findClosestPrice(points: KlinePoint[], timestampMs: number): PricePoint | null {
  if (points.length === 0) return null;

  let closest: KlinePoint | null = null;
  let closestDistance = Infinity;

  for (const point of points) {
    const distance = Math.abs(point.time - timestampMs);
    if (distance < closestDistance) {
      closest = point;
      closestDistance = distance;
    }
  }

  if (!closest || closestDistance > MAX_CANDLE_DISTANCE_MS) return null;
  return { price: closest.close, time: closest.time };
}

function calculateReturnPct(entryPrice: number | null, exitPrice: number | null): number | null {
  if (!entryPrice || !exitPrice || entryPrice <= 0 || exitPrice <= 0) return null;
  return round(((exitPrice - entryPrice) / entryPrice) * 100, 4);
}

function determineDirectionalHit(signal: SignalType, alpha24h: number | null, return24h: number | null): boolean | null {
  const metric = alpha24h ?? return24h;
  if (metric === null || !Number.isFinite(metric)) return null;

  if (signal === 'STRONG_BUY' || signal === 'BUY') return metric > 0;
  if (signal === 'AVOID') return metric < 0;
  return null;
}

function calculateMaxAdverseMove24h(
  signal: SignalType,
  entryPrice: number | null,
  points: KlinePoint[],
  signalMs: number
): number | null {
  if (!entryPrice || entryPrice <= 0) return null;
  if (!['STRONG_BUY', 'BUY', 'AVOID'].includes(signal)) return null;
  const end = signalMs + 24 * 60 * 60 * 1000;
  const window = points.filter((point) => point.time >= signalMs && point.time <= end);
  if (window.length === 0) return null;
  if (signal === 'AVOID') {
    const highest = Math.max(...window.map((point) => point.high));
    return round(Math.max(0, ((highest - entryPrice) / entryPrice) * 100), 4);
  }
  const lowest = Math.min(...window.map((point) => point.low));
  return round(Math.max(0, ((entryPrice - lowest) / entryPrice) * 100), 4);
}

function determineOutcomeStatus(input: {
  has24h: boolean;
  has7d: boolean;
  elapsedHorizonCount: number;
  resolvedHorizonCount: number;
}): ResolutionState {
  if (input.has7d) return 'READY';
  if (input.has24h) return 'PARTIAL';
  if (input.elapsedHorizonCount > 0 && input.resolvedHorizonCount === 0) return 'INSUFFICIENT_DATA';
  return 'PENDING';
}

function mergeResolvedHorizons(
  existing: Record<string, unknown> | null | undefined,
  label: HorizonLabel,
  value: Record<string, unknown>
) {
  return {
    ...(existing || {}),
    [label]: value
  };
}

async function getKlinesForSymbol(
  symbol: string,
  cache: Map<string, Promise<KlinePoint[]>>,
  network: SodexNetwork
): Promise<KlinePoint[]> {
  const key = `${network}:${symbol}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      sodex
        .getKlines(symbol, KLINE_INTERVAL, KLINE_LIMIT, network)
        .then(normalizeKlinePoints)
    );
  }
  return cache.get(key) as Promise<KlinePoint[]>;
}

async function priceAt(
  symbol: string,
  timestampMs: number,
  cache: Map<string, Promise<KlinePoint[]>>,
  network: SodexNetwork
): Promise<PricePoint | null> {
  const points = await getKlinesForSymbol(symbol, cache, network);
  return findClosestPrice(points, timestampMs);
}

async function resolveOutcomeRow(
  row: SignalOutcomeRow,
  cache: Map<string, Promise<KlinePoint[]>>,
  network: SodexNetwork,
  nowMs = Date.now()
): Promise<'updated' | 'ready' | 'insufficient_data' | 'skipped'> {
  if (!row.id) return 'skipped';

  const signalMs = new Date(row.signal_at).getTime();
  if (!Number.isFinite(signalMs)) {
    await safeUpdate('signal_outcomes', { outcome_status: 'FAILED', resolved_at: new Date().toISOString() }, { id: row.id });
    return 'insufficient_data';
  }

  const proxySymbol = (row.proxy_symbol || resolveProxySymbol(row.sector)).toUpperCase();
  const benchmarkSymbol = (row.benchmark_symbol || DEFAULT_BENCHMARK_SYMBOL).toUpperCase();
  let entryPrice = toNumber(row.entry_price);
  let benchmarkEntryPrice = toNumber(row.benchmark_entry_price);
  let resolvedHorizons = row.resolved_horizons || {};
  const updates: Record<string, unknown> = {
    proxy_symbol: proxySymbol,
    benchmark_symbol: benchmarkSymbol
  };

  if (!entryPrice) {
    const entry = await priceAt(proxySymbol, signalMs, cache, network);
    if (entry) {
      entryPrice = entry.price;
      updates.entry_price = entry.price;
      resolvedHorizons = { ...resolvedHorizons, entry: { entryTime: entry.time } };
    }
  }

  if (!benchmarkEntryPrice) {
    const benchmarkEntry = await priceAt(benchmarkSymbol, signalMs, cache, network);
    if (benchmarkEntry) {
      benchmarkEntryPrice = benchmarkEntry.price;
      updates.benchmark_entry_price = benchmarkEntry.price;
    }
  }

  let elapsedHorizonCount = 0;
  let resolvedHorizonCount = 0;

  for (const horizon of HORIZONS) {
    const targetMs = signalMs + horizon.ms;
    if (nowMs < targetMs) continue;
    elapsedHorizonCount += 1;

    if (toNumber(row[horizon.field]) !== null) {
      resolvedHorizonCount += 1;
      continue;
    }

    const [exit, benchmarkExit] = await Promise.all([
      priceAt(proxySymbol, targetMs, cache, network),
      priceAt(benchmarkSymbol, targetMs, cache, network)
    ]);
    const forwardReturn = calculateReturnPct(entryPrice, exit?.price || null);
    const benchmarkReturn = calculateReturnPct(benchmarkEntryPrice, benchmarkExit?.price || null);
    const alpha = forwardReturn !== null && benchmarkReturn !== null ? round(forwardReturn - benchmarkReturn, 4) : null;

    if (forwardReturn === null) continue;

    updates[horizon.field] = forwardReturn;
    resolvedHorizonCount += 1;
    resolvedHorizons = mergeResolvedHorizons(resolvedHorizons, horizon.label, {
      returnPct: forwardReturn,
      benchmarkReturnPct: benchmarkReturn,
      alphaPct: alpha,
      targetAt: new Date(targetMs).toISOString(),
      exitTime: exit?.time ? new Date(exit.time).toISOString() : null,
      benchmarkExitTime: benchmarkExit?.time ? new Date(benchmarkExit.time).toISOString() : null
    });

    if (horizon.label === '24h') {
      updates.benchmark_return_24h = benchmarkReturn;
      updates.alpha_24h = alpha;
      updates.directional_hit = determineDirectionalHit(row.signal, alpha, forwardReturn);
      const proxyPoints = await getKlinesForSymbol(proxySymbol, cache, network);
      updates.max_drawdown_24h = calculateMaxAdverseMove24h(row.signal, entryPrice, proxyPoints, signalMs);
    }
  }

  updates.resolved_horizons = resolvedHorizons;

  let status: ResolutionState | 'FAILED' = determineOutcomeStatus({
    has24h: updates.forward_return_24h !== undefined || toNumber(row.forward_return_24h) !== null,
    has7d: updates.forward_return_7d !== undefined || toNumber(row.forward_return_7d) !== null,
    elapsedHorizonCount,
    resolvedHorizonCount
  });
  if (status !== 'READY' && nowMs - signalMs > MAX_RESOLUTION_AGE_MS) status = 'FAILED';
  updates.outcome_status = status;
  if (status === 'READY') {
    updates.resolved_at = new Date().toISOString();
  } else if (status === 'FAILED') {
    updates.resolved_at = new Date().toISOString();
  } else {
    updates.resolved_at = null;
  }

  if (Object.keys(updates).length <= 2) return 'skipped';

  await safeUpdate('signal_outcomes', updates, { id: row.id });
  if (status === 'READY') return 'ready';
  if (status === 'INSUFFICIENT_DATA' || status === 'FAILED') return 'insufficient_data';
  return 'updated';
}

async function resolvePendingSignalOutcomes(limit = 250): Promise<ResolutionSummary> {
  const { data: outcomes } = await safeSelect<SignalOutcomeRow>('signal_outcomes', (query: any) =>
    query
      .neq('outcome_status', 'FAILED')
      .is('forward_return_7d', null)
      .order('signal_at', { ascending: true })
      .limit(limit)
  );
  const summary: ResolutionSummary = {
    scanned: outcomes.length,
    updated: 0,
    ready: 0,
    insufficientData: 0,
    skipped: 0,
    errors: []
  };
  const cache = new Map<string, Promise<KlinePoint[]>>();

  for (const outcome of outcomes) {
    try {
      const result = await resolveOutcomeRow(outcome, cache, DEFAULT_NETWORK);
      if (result === 'ready') summary.ready += 1;
      else if (result === 'insufficient_data') summary.insufficientData += 1;
      else if (result === 'updated') summary.updated += 1;
      else summary.skipped += 1;
    } catch (error) {
      console.error(`[OutcomeResolver] ${outcome.id || 'unknown'}: ${getErrorMessage(error)}`);
      summary.errors.push({
        id: outcome.id,
        sector: outcome.sector,
        error: 'Resolution failed.'
      });
    }
  }

  return summary;
}

export = {
  calculateReturnPct,
  calculateMaxAdverseMove24h,
  determineOutcomeStatus,
  determineDirectionalHit,
  normalizeKlinePoints,
  resolvePendingSignalOutcomes,
  resolveProxySymbol
};
