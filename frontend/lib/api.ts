import type {
  AlertRow,
  DashboardActionResponse,
  DashboardData,
  MacroEvent,
  MemoRow,
  PositionsResponse,
  SignalRow
} from '@/lib/types';

// Server: call EC2 directly. Client (browser): use Next.js proxy to avoid mixed-content blocks.
const isServer = typeof window === 'undefined';
const API_BASE = isServer
  ? (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001')
  : '/api/proxy';

async function fetchJson<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  // Strip leading /api so we don't double-prefix when using the proxy
  const normalised = isServer ? path : path.replace(/^\/api/, '');
  try {
    const response = await fetch(`${API_BASE}${normalised}`, {
      cache: 'no-store',
      ...init
    });

    if (!response.ok) {
      return fallback;
    }

    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const [signals, positions, alerts, memos, macro] = await Promise.all([
    fetchJson<SignalRow[]>('/api/signals', []),
    fetchJson<PositionsResponse>('/api/positions', { live: null, history: [] }),
    fetchJson<AlertRow[]>('/api/alerts', []),
    fetchJson<MemoRow[]>('/api/memos', []),
    fetchJson<MacroEvent[]>('/api/macro', [])
  ]);

  return { signals, positions, alerts, memos, macro };
}

export async function fetchSignals() {
  return fetchJson<SignalRow[]>('/api/signals', []);
}

export async function fetchPositions() {
  return fetchJson<PositionsResponse>('/api/positions', { live: null, history: [] });
}

export async function fetchAlerts() {
  return fetchJson<AlertRow[]>('/api/alerts', []);
}

export async function fetchMemos() {
  return fetchJson<MemoRow[]>('/api/memos', []);
}

export async function fetchMacro() {
  return fetchJson<MacroEvent[]>('/api/macro', []);
}

export async function triggerCycle() {
  return fetchJson<{ message: string }>(
    '/api/trigger',
    { message: 'Cycle trigger queued.' },
    { method: 'POST' }
  );
}

export async function queueDashboardAction(payload: {
  action: 'REDUCE_LEVERAGE' | 'CLOSE_POSITION';
  symbol: string;
  currentLeverage?: number;
  targetLeverage?: number;
}) {
  return fetchJson<DashboardActionResponse>(
    '/api/actions',
    {
      queued: false,
      action: payload.action,
      symbol: payload.symbol,
      message: 'Unable to queue action right now.'
    },
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );
}

export async function sendTelegramTest() {
  return fetchJson<{ message: string }>(
    '/api/test-telegram',
    { message: 'Unable to send Telegram test message.' },
    { method: 'POST' }
  );
}

export interface AnalysisSector {
  sector: string;
  score_narrative: number;
  score_etf_flow: number;
  score_macro: number;
  combined_score: number;
  signal: string;
  top_headlines: string[];
  reasoning: string | null;
}

export interface AnalysisResult {
  success: boolean;
  duration_ms: number;
  summary: string;
  sectors: AnalysisSector[];
  news_count: number;
  etf_net_flow: number;
  macro_events_count: number;
  analyzed_at: string;
  message?: string;
}

export async function runAnalysis(): Promise<AnalysisResult> {
  return fetchJson<AnalysisResult>(
    '/api/analyze',
    { success: false, duration_ms: 0, summary: '', sectors: [], news_count: 0, etf_net_flow: 0, macro_events_count: 0, analyzed_at: new Date().toISOString(), message: 'Analysis unavailable.' },
    { method: 'POST' }
  );
}

// ─── News API ───────────────────────────────────────────────────────

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string | null;
  imageUrl: string | null;
  publishedAt: string;
  category: string;
  sentiment: string | null;
}

export interface NewsResponse {
  success: boolean;
  count: number;
  articles: NewsArticle[];
  error?: string;
}

export async function fetchNews(limit = 30): Promise<NewsResponse> {
  return fetchJson<NewsResponse>(
    `/api/news?limit=${limit}`,
    { success: false, count: 0, articles: [] }
  );
}

export async function fetchHotNews(): Promise<NewsResponse> {
  return fetchJson<NewsResponse>(
    '/api/news/hot',
    { success: false, count: 0, articles: [] }
  );
}

export interface ETFResponse {
  success: boolean;
  flows: unknown;
  summary: Record<string, unknown>;
  error?: string;
}

export async function fetchETFData(): Promise<ETFResponse> {
  return fetchJson<ETFResponse>(
    '/api/news/etf',
    { success: false, flows: [], summary: {} }
  );
}

export interface MacroResponse {
  success: boolean;
  events: MacroEvent[];
  error?: string;
}

export async function fetchMacroEvents(date?: string): Promise<MacroResponse> {
  const query = date ? `?date=${date}` : '';
  return fetchJson<MacroResponse>(
    `/api/news/macro${query}`,
    { success: false, events: [] }
  );
}
