import type {
  AgentRunsResponse,
  AlertRow,
  AnalysisSector,
  AnalysisResult,
  DashboardActionResponse,
  ExecutionActionRow,
  ExecutionSimulationResponse,
  HealthStatus,
  KlinePoint,
  MacroEvent,
  MacroResponse,
  MemoRow,
  NewsResponse,
  PerformanceResponse,
  PositionsResponse,
  SignalRow,
  SoDexKlinesResponse,
  SoDexMarketsResponse,
  SoDexOrderbook,
  SoDexMarket,
  TriggerCycleResponse
} from '@/lib/types';
import type { SodexConnection, SodexNetwork } from '@/lib/sodexConnection';

import { backendBaseUrl } from '@/lib/backendConfig';
import { buildSodexQuery, getSodexConnection, SODEX_NETWORK_CONFIG } from '@/lib/sodexConnection';

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
  ? backendBaseUrl()
  : '/api/proxy';

function resolvePath(path: string) {
  return isServer ? path : path.replace(/^\/api/, '');
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${resolvePath(path)}`, {
    cache: 'no-store',
    credentials: 'include',
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
        : typeof payload === 'object' && payload && 'message' in payload
          ? String((payload as { message?: unknown }).message || 'Request failed.')
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

export async function fetchSignals() {
  return requestJson<SignalRow[]>('/api/signals');
}

export async function fetchPositions() {
  return requestJson<PositionsResponse>(`/api/positions${buildSodexQuery()}`);
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

export async function fetchPerformance() {
  return requestJson<PerformanceResponse>('/api/performance');
}

export async function fetchExecutions(limit = 100) {
  return requestJson<ExecutionActionRow[]>(`/api/executions?limit=${limit}`);
}

export async function triggerCycle() {
  return requestJson<TriggerCycleResponse>('/api/trigger', { method: 'POST' });
}

export async function queueDashboardAction(payload: {
  action: 'REDUCE_LEVERAGE' | 'CLOSE_POSITION' | 'CANCEL_ORDER' | 'QUEUE_ACTION';
  symbol: string;
  currentLeverage?: number;
  targetLeverage?: number;
  orderId?: string | number;
  clOrdId?: string;
  cancels?: Array<{ orderId?: string | number; clOrdId?: string }>;
}) {
  const connection = getSodexConnection();
  if (!connection) {
    throw new Error('Connect and verify your SoDEX wallet before approving an action.');
  }

  const actionPayload = {
    ...payload,
    network: connection.network,
    wallet: connection.address
  };
  const prepared = await requestJson<{
    requiresSignature: boolean;
    intentToken?: string;
    typedData?: Record<string, unknown>;
  }>('/api/actions/prepare', {
    method: 'POST',
    body: JSON.stringify(actionPayload)
  });

  if (!prepared.requiresSignature) {
    return requestJson<DashboardActionResponse>('/api/actions/confirm', {
      method: 'POST',
      body: JSON.stringify(actionPayload)
    });
  }

  if (!prepared.intentToken || !prepared.typedData) {
    throw new Error('The backend did not return a complete SoDEX signing request.');
  }

  const provider = typeof window !== 'undefined' ? window.ethereum : undefined;
  if (!provider) {
    throw new Error('No browser wallet was detected. Reconnect an EVM wallet and try again.');
  }

  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
  const activeAddress = accounts[0];
  if (!activeAddress || activeAddress.toLowerCase() !== connection.address.toLowerCase()) {
    throw new Error('The active browser wallet does not match the authenticated SoDEX wallet. Reconnect and try again.');
  }

  const networkConfig = SODEX_NETWORK_CONFIG[connection.network];
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: networkConfig.chainIdHex }]
    });
  } catch (error) {
    const walletError = error as { code?: number; message?: string };
    if (walletError?.code === 4001) {
      throw new Error(`Switching to ${networkConfig.label} was rejected in the wallet.`);
    }
    throw new Error(`Switch to ${networkConfig.label} in your wallet, then try again.`);
  }

  let signature: string;
  try {
    signature = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [activeAddress, JSON.stringify(prepared.typedData)]
    }) as string;
  } catch (error) {
    const walletError = error as { code?: number; message?: string };
    if (walletError?.code === 4001) {
      throw new Error('The SoDEX action signature was rejected in the wallet.');
    }
    throw new Error(walletError?.message || 'The wallet could not sign the SoDEX action.');
  }

  return requestJson<DashboardActionResponse>('/api/actions/confirm-wallet', {
    method: 'POST',
    body: JSON.stringify({
      intentToken: prepared.intentToken,
      signature
    })
  });
}

export async function simulateDashboardAction(payload: {
  action: 'REDUCE_LEVERAGE' | 'CLOSE_POSITION' | 'CANCEL_ORDER' | 'QUEUE_ACTION';
  symbol: string;
  currentLeverage?: number;
  targetLeverage?: number;
  orderId?: string | number;
  clOrdId?: string;
  cancels?: Array<{ orderId?: string | number; clOrdId?: string }>;
}) {
  const connection = getSodexConnection();

  return requestJson<ExecutionSimulationResponse>('/api/actions/simulate', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      network: connection?.network || 'testnet',
      wallet: connection?.address
    })
  });
}

export async function cancelOrder(payload: {
  symbol: string;
  orderId?: string | number;
  clOrdId?: string;
  cancels?: Array<{ orderId?: string | number; clOrdId?: string }>;
}) {
  return queueDashboardAction({
    action: 'CANCEL_ORDER',
    ...payload
  });
}

export async function fetchSodexOpenOrders(symbol?: string) {
  const suffix = buildSodexQuery({ symbol });
  return requestJson<unknown>(`/api/sodex/orders${suffix}`);
}

export async function connectSodex(payload: {
  network: SodexNetwork;
  address: string;
  signature: string;
  challengeId: string;
}) {
  return requestJson<SodexConnection>('/api/sodex/connect', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export interface SodexLoginChallenge {
  challengeId: string;
  network: SodexNetwork;
  chainId: number;
  address: string;
  issuedAt: number;
  expiresAt: number;
  message: string;
}

export async function fetchSodexLoginChallenge(network: SodexNetwork, address: string) {
  const query = new URLSearchParams({ network, address });
  return requestJson<SodexLoginChallenge>(`/api/sodex/login-challenge?${query.toString()}`);
}

export async function fetchSodexSession() {
  return requestJson<SodexConnection>('/api/sodex/session');
}

export interface NarrativePreferences {
  stages: string[];
  minConfidence: number;
  maxCrowding: number;
}

export async function fetchNarrativePreferences() {
  return requestJson<NarrativePreferences>('/api/narrative/preferences');
}

export async function saveNarrativePreferences(preferences: NarrativePreferences) {
  return requestJson<NarrativePreferences>('/api/narrative/preferences', {
    method: 'POST',
    body: JSON.stringify(preferences)
  });
}

export async function saveNarrativeFeedback(payload: { signalId: string; sector: string; useful: boolean; reason?: string }) {
  return requestJson<{ saved: true; signalId: string; useful: boolean }>('/api/narrative/feedback', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export interface NarrativeAdvisorResponse {
  intent: string;
  sector: string;
  answer: string;
  evidence: string[];
  metrics: Record<string, number | string | boolean>;
  invalidation: string;
  scenario: null | {
    eligible: boolean;
    lowAmount: number;
    highAmount: number;
    capacityPct: number;
    currentExposurePct: number;
    reasons: string[];
    allocations: Array<{ symbol: string; percentage: number; lowAmount: number; highAmount: number }>;
  };
  dataTimestamp: string;
  conversationId: string | null;
  recommendationId: string | null;
}

export async function askNarrativeScanner(payload: { question: string; investableAmount: number; riskMode: 'conservative' | 'balanced' | 'aggressive' }) {
  return requestJson<NarrativeAdvisorResponse>('/api/narrative/ask', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchNarrativeConversationHistory() {
  return requestJson<Array<Record<string, unknown>>>('/api/narrative/ask/history');
}

export async function saveRecommendationStatus(id: string, status: 'ACCEPTED' | 'REJECTED' | 'SAVED') {
  return requestJson<{ saved: true; status: string }>(`/api/narrative/ask/recommendations/${encodeURIComponent(id)}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ status })
  });
}

export async function disconnectSodex() {
  return requestJson<{ disconnected: true }>('/api/sodex/disconnect', { method: 'POST' });
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
  const suffix = buildSodexQuery({ symbol });
  const raw = await requestJson<unknown>(`/api/sodex/markets${suffix}`);
  return normalizeMarkets(raw);
}

export async function fetchSodexOrderbook(symbol: string, limit = 20) {
  const raw = await requestJson<unknown>(
    `/api/sodex/orderbook/${encodeURIComponent(symbol)}${buildSodexQuery({ limit })}`
  );

  return normalizeOrderbook(symbol, raw);
}

export async function fetchSodexKlines(symbol: string, interval = '1h', limit = 80) {
  const raw = await requestJson<unknown>(
    `/api/sodex/klines/${encodeURIComponent(symbol)}${buildSodexQuery({ interval, limit })}`
  );

  return normalizeKlines(symbol, interval, raw);
}

export interface TechnicalGraphAnalysis {
  version: string;
  symbol: string;
  interval: string;
  observations: number;
  trend: 'BULLISH' | 'BEARISH' | 'RANGE';
  momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  volatilityRegime: 'NORMAL' | 'ELEVATED' | 'HIGH';
  breakout: 'UPSIDE' | 'DOWNSIDE' | 'NONE';
  confidence: number;
  changePct: number;
  volatilityPct: number | null;
  volumeRatio: number | null;
  support: number;
  resistance: number;
  invalidation: number;
  indicators: Record<string, number | null>;
  evidence: string[];
  conflicts: string[];
  narrative: string;
  disclaimer: string;
  calculatedAt: string;
}

export async function fetchTechnicalGraphAnalysis(symbol: string, interval = '1h', limit = 240) {
  const query = buildSodexQuery({ interval, limit });
  return requestJson<TechnicalGraphAnalysis>(`/api/sodex/chart-analysis/${encodeURIComponent(symbol)}${query}`);
}

export interface SosoIndex {
  id: string;
  symbol: string;
  name: string;
  price: number | null;
  change24h: number | null;
  roi7d: number | null;
  roi1m: number | null;
  roi3m: number | null;
  roi1y: number | null;
  ytd: number | null;
  marketCap: number | null;
  description: string | null;
}

export interface IndexPoint { time: number; value: number }

export async function fetchSosoIndices() {
  return requestFallback<{ indices: SosoIndex[]; count: number; updatedAt: string; unavailable?: boolean }>('/api/indices', {
    indices: [], count: 0, updatedAt: new Date().toISOString(), unavailable: true
  });
}

export async function fetchSosoIndexHistory(identifier: string, days = 90) {
  return requestFallback<{ identifier: string; points: IndexPoint[]; updatedAt: string; unavailable?: boolean }>(
    `/api/indices/${encodeURIComponent(identifier)}/history?days=${days}`,
    { identifier, points: [], updatedAt: new Date().toISOString(), unavailable: true }
  );
}

export async function fetchNews(limit = 30): Promise<NewsResponse> {
  return requestJson<NewsResponse>(`/api/news?limit=${limit}`);
}

export async function fetchHotNews(): Promise<NewsResponse> {
  return requestJson<NewsResponse>('/api/news/hot');
}

export async function fetchETFData() {
  return requestJson('/api/news/etf');
}

export async function fetchMacroEvents(date?: string): Promise<MacroResponse> {
  const query = date ? `?date=${date}` : '';
  return requestJson<MacroResponse>(`/api/news/macro${query}`);
}
