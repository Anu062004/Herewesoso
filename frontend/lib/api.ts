import type {
  AgentRunsResponse,
  AlertRow,
  AnalysisSector,
  AnalysisResult,
  DashboardActionResponse,
  DashboardData,
  HealthStatus,
  KlinePoint,
  MacroEvent,
  MacroResponse,
  MemoRow,
  NewsResponse,
  PositionsResponse,
  SignalRow,
  SoDexKlinesResponse,
  SoDexMarketsResponse,
  SoDexOrderbook,
  SoDexMarket,
  TriggerCycleResponse
} from '@/lib/types';

export type {
  AnalysisResult,
  AnalysisSector,
  NewsArticle,
  NewsResponse,
  ETFResponse,
  MacroResponse
} from '@/lib/types';

const isServer = typeof window === 'undefined';
const API_BASE = isServer
  ? process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://3.87.110.3:3001'
  : '/api/proxy';

function resolvePath(path: string) {
  return isServer ? path : path.replace(/^\/api/, '');
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${resolvePath(path)}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {})
    },
    ...init
  });

  const text = await response.text();
  const payload = text ? tryParse(text) : null;

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error?: unknown }).error || 'Request failed.')
        : response.statusText || 'Request failed.';

    throw new Error(message);
  }

  return payload as T;
}

async function requestFallback<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    return await requestJson<T>(path, init);
  } catch {
    return fallback;
  }
}

function tryParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asArray(input: unknown): Record<string, unknown>[] {
  if (Array.isArray(input)) {
    return input.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null);
  }

  if (input && typeof input === 'object') {
    const directData = (input as { data?: unknown }).data;
    if (Array.isArray(directData)) {
      return directData.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null);
    }
  }

  return [];
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function marketStatus(raw: Record<string, unknown>): string {
  const candidates = [raw.status, raw.state, raw.marketStatus, raw.tradeStatus];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  return 'Active';
}

function normalizeMarkets(input: unknown): SoDexMarketsResponse {
  const rows = asArray(input);
  const markets: SoDexMarket[] = rows.map((row) => ({
    symbol: String(row.symbol || row.s || row.market || 'UNKNOWN'),
    lastPrice: toNumber(row.markPrice ?? row.lastPrice ?? row.price ?? row.last),
    change24h: toNumber(
      row.change24h ?? row.price24hPcnt ?? row.changePercent24h ?? row.changePercent ?? row.ratio24h
    ),
    volume: toNumber(row.volume ?? row.volume24h ?? row.turnover24h ?? row.quoteVolume),
    status: marketStatus(row),
    raw: row
  }));

  return {
    markets: markets.sort((left, right) => left.symbol.localeCompare(right.symbol)),
    updatedAt: new Date().toISOString()
  };
}

function normalizeOrderbook(symbol: string, input: unknown): SoDexOrderbook {
  const raw = (input && typeof input === 'object' ? input : null) as Record<string, unknown> | null;
  const payload =
    raw && typeof raw.data === 'object' && raw.data !== null ? (raw.data as Record<string, unknown>) : raw;

  const asksRaw = Array.isArray(payload?.asks) ? payload.asks : Array.isArray(payload?.a) ? payload.a : [];
  const bidsRaw = Array.isArray(payload?.bids) ? payload.bids : Array.isArray(payload?.b) ? payload.b : [];

  const normalizeLevels = (levels: unknown[]) => {
    let cumulative = 0;

    return levels
      .map((level) => {
        if (Array.isArray(level)) {
          const price = toNumber(level[0]) || 0;
          const size = toNumber(level[1]) || 0;
          cumulative += size;
          return { price, size, total: cumulative };
        }

        if (level && typeof level === 'object') {
          const row = level as Record<string, unknown>;
          const price = toNumber(row.price ?? row[0]) || 0;
          const size = toNumber(row.size ?? row.quantity ?? row.qty ?? row[1]) || 0;
          cumulative += size;
          return { price, size, total: cumulative };
        }

        return null;
      })
      .filter((level): level is { price: number; size: number; total: number } => Boolean(level));
  };

  const asks = normalizeLevels(asksRaw);
  const bids = normalizeLevels(bidsRaw);
  const spread = asks[0] && bids[0] ? Math.abs(asks[0].price - bids[0].price) : null;

  return {
    symbol,
    asks,
    bids,
    spread,
    updatedAt: new Date().toISOString(),
    raw
  };
}

function normalizeKlines(symbol: string, interval: string, input: unknown): SoDexKlinesResponse {
  const source = Array.isArray(input)
    ? input
    : Array.isArray((input as { data?: unknown })?.data)
      ? ((input as { data: unknown[] }).data as unknown[])
      : [];

  const points: KlinePoint[] = source
    .map((entry) => {
      if (Array.isArray(entry)) {
        const time = toNumber(entry[0]);
        const open = toNumber(entry[1]);
        const high = toNumber(entry[2]);
        const low = toNumber(entry[3]);
        const close = toNumber(entry[4]);
        const volume = toNumber(entry[5]) || 0;

        if ([time, open, high, low, close].some((value) => value === null)) {
          return null;
        }

        return {
          time: Number(time),
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume
        };
      }

      if (entry && typeof entry === 'object') {
        const row = entry as Record<string, unknown>;
        const time = toNumber(row.time ?? row.openTime ?? row.t ?? row.timestamp);
        const open = toNumber(row.open ?? row.o);
        const high = toNumber(row.high ?? row.h);
        const low = toNumber(row.low ?? row.l);
        const close = toNumber(row.close ?? row.c);
        const volume = toNumber(row.volume ?? row.v) || 0;

        if ([time, open, high, low, close].some((value) => value === null)) {
          return null;
        }

        return {
          time: Number(time),
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume
        };
      }

      return null;
    })
    .filter((point): point is KlinePoint => Boolean(point));

  return {
    symbol,
    interval,
    points,
    updatedAt: new Date().toISOString(),
    raw: input
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const [signals, positions, alerts, memos, macro] = await Promise.all([
    requestFallback<SignalRow[]>('/api/signals', []),
    requestFallback<PositionsResponse>('/api/positions', { live: null, history: [] }),
    requestFallback<AlertRow[]>('/api/alerts', []),
    requestFallback<MemoRow[]>('/api/memos', []),
    requestFallback<MacroEvent[]>('/api/macro', [])
  ]);

  return { signals, positions, alerts, memos, macro };
}

export async function fetchSignals() {
  return requestJson<SignalRow[]>('/api/signals');
}

export async function fetchPositions() {
  return requestJson<PositionsResponse>('/api/positions');
}

export async function fetchAlerts() {
  return requestJson<AlertRow[]>('/api/alerts');
}

export async function fetchMemos() {
  return requestJson<MemoRow[]>('/api/memos');
}

export async function fetchMacro() {
  return requestJson<MacroEvent[]>('/api/macro');
}

export async function fetchHealth() {
  return requestJson<HealthStatus>('/api/health');
}

export async function fetchAgentRuns() {
  return requestJson<AgentRunsResponse>('/api/agent-runs');
}

export async function triggerCycle() {
  return requestJson<TriggerCycleResponse>('/api/trigger', { method: 'POST' });
}

export async function queueDashboardAction(payload: {
  action: 'REDUCE_LEVERAGE' | 'CLOSE_POSITION' | 'QUEUE_ACTION';
  symbol: string;
  currentLeverage?: number;
  targetLeverage?: number;
}) {
  return requestJson<DashboardActionResponse>('/api/actions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function sendTelegramTest() {
  return requestJson<{ message: string }>('/api/test-telegram', {
    method: 'POST'
  });
}

export async function runAnalysis(): Promise<AnalysisResult> {
  return requestJson<AnalysisResult>('/api/analyze', {
    method: 'POST'
  });
}

export async function fetchSodexMarkets(symbol?: string) {
  const suffix = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
  const raw = await requestJson<unknown>(`/api/sodex/markets${suffix}`);
  return normalizeMarkets(raw);
}

export async function fetchSodexOrderbook(symbol: string, limit = 20) {
  const raw = await requestJson<unknown>(
    `/api/sodex/orderbook/${encodeURIComponent(symbol)}?limit=${encodeURIComponent(String(limit))}`
  );

  return normalizeOrderbook(symbol, raw);
}

export async function fetchSodexKlines(symbol: string, interval = '1h', limit = 80) {
  const raw = await requestJson<unknown>(
    `/api/sodex/klines/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(String(limit))}`
  );

  return normalizeKlines(symbol, interval, raw);
}

export async function fetchNews(limit = 30): Promise<NewsResponse> {
  return requestFallback<NewsResponse>(`/api/news?limit=${limit}`, {
    success: false,
    count: 0,
    articles: []
  });
}

export async function fetchHotNews(): Promise<NewsResponse> {
  return requestFallback<NewsResponse>('/api/news/hot', {
    success: false,
    count: 0,
    articles: []
  });
}

export async function fetchETFData() {
  return requestFallback('/api/news/etf', {
    success: false,
    flows: [],
    summary: {}
  });
}

export async function fetchMacroEvents(date?: string): Promise<MacroResponse> {
  const query = date ? `?date=${date}` : '';
  return requestFallback<MacroResponse>(`/api/news/macro${query}`, {
    success: false,
    events: []
  });
}
