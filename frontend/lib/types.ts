export type SignalType = 'STRONG_BUY' | 'BUY' | 'WATCH' | 'NEUTRAL' | 'AVOID';
export type RiskLevel = 'SAFE' | 'CAUTION' | 'DANGER' | 'CRITICAL';
export type AlertSeverity = 'INFO' | 'WARNING' | 'DANGER' | 'CRITICAL';
export type SeverityFilter = 'ALL' | 'CRITICAL' | 'WARNING' | 'INFO';

export interface SignalRow {
  id?: string;
  created_at?: string;
  sector: string;
  score_narrative: number;
  score_etf_flow: number;
  score_macro: number;
  combined_score: number;
  signal: SignalType;
  top_headlines?: string[];
  reasoning?: string | null;
}

export interface PositionSnapshot {
  id?: string;
  created_at?: string;
  wallet_address: string;
  symbol: string;
  entry_price: number;
  mark_price: number;
  liquidation_price: number;
  leverage: number;
  position_size: number;
  distance_to_liquidation_pct: number;
  risk_score: number;
  risk_level: RiskLevel;
  macro_threats?:
    | {
        event?: string;
        hoursUntil?: number;
        historicalMove?: number;
      }
    | null;
}

export interface LivePosition {
  symbol: string;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  leverage: number;
  size: number;
  positionSide: string;
  marginMode?: string;
}

export interface LiveAccountState {
  walletAddress?: string;
  user?: string;
  accountValue?: number;
  availableMargin?: number;
  positions?: LivePosition[];
  balances?: unknown[];
}

export interface PositionsResponse {
  live: LiveAccountState | null;
  liveError?: string | null;
  history: PositionSnapshot[];
  updatedAt?: string;
  error?: string;
}

export interface AlertRow {
  id?: string;
  created_at?: string;
  alert_type: 'NARRATIVE_SIGNAL' | 'LIQUIDATION_RISK' | 'MACRO_EVENT' | 'POSITION_EXIT';
  severity: AlertSeverity;
  title: string;
  message: string;
  telegram_sent?: boolean;
  data?: Record<string, unknown> | null;
}

export interface MemoRow {
  id?: string;
  created_at?: string;
  memo_type: 'ENTRY_SIGNAL' | 'RISK_ALERT' | 'EXIT_SIGNAL' | 'CYCLE_SUMMARY';
  content: string;
  related_symbol?: string | null;
  data?: Record<string, unknown> | null;
}

export interface MacroEvent {
  id?: string;
  name?: string;
  eventTime?: string;
  date?: string;
  time?: string;
  releaseDate?: string;
  importance?: string;
  country?: string;
  actual?: string;
  forecast?: string;
  previous?: string;
  [key: string]: unknown;
}

export interface DashboardActionResponse {
  queued: boolean;
  action: string;
  symbol: string;
  message: string;
}

export interface DashboardData {
  signals: SignalRow[];
  positions: PositionsResponse;
  alerts: AlertRow[];
  memos: MemoRow[];
  macro: MacroEvent[];
}

export interface HealthStatus {
  status: string;
  time: string;
  telegram: {
    configured: boolean;
    connected: boolean;
    lastMessageSentAt: string | null;
  };
}

export interface AgentRunSummary {
  id?: string | number;
  agent?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  duration_ms?: number | null;
  error?: string | null;
  summary?: Record<string, unknown> | string | null;
}

export interface AgentRunsResponse {
  lastRun: AgentRunSummary | null;
  fallback: boolean;
}

export interface SoDexMarket {
  symbol: string;
  lastPrice: number | null;
  change24h: number | null;
  volume: number | null;
  status: string;
  raw?: Record<string, unknown>;
}

export interface SoDexMarketsResponse {
  markets: SoDexMarket[];
  updatedAt: string;
}

export interface OrderbookLevel {
  price: number;
  size: number;
  total: number;
}

export interface SoDexOrderbook {
  symbol: string;
  asks: OrderbookLevel[];
  bids: OrderbookLevel[];
  spread: number | null;
  updatedAt: string;
  raw?: Record<string, unknown> | null;
}

export interface KlinePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SoDexKlinesResponse {
  symbol: string;
  interval: string;
  points: KlinePoint[];
  updatedAt: string;
  raw?: unknown;
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

export interface ETFResponse {
  success: boolean;
  flows: unknown;
  summary: Record<string, unknown>;
  error?: string;
}

export interface MacroResponse {
  success: boolean;
  events: MacroEvent[];
  error?: string;
}

export interface TriggerCycleResponse {
  success?: boolean;
  skipped?: boolean;
  error?: string;
  narrativeResult?: {
    success?: boolean;
  };
  shieldResult?: {
    success?: boolean;
    positionsMonitored?: number;
  };
  message?: string;
}
