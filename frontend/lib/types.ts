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
  lifecycle_stage?: 'EMERGING' | 'ACCELERATING' | 'ESTABLISHED' | 'CROWDED' | 'FADING' | 'REVERSING';
  sub_narrative?: string;
  confidence?: number;
  velocity_score?: number;
  acceleration_score?: number;
  source_breadth_score?: number;
  source_quality_score?: number;
  catalyst_score?: number;
  sentiment_score?: number;
  novelty_score?: number;
  market_confirmation_score?: number;
  crowding_score?: number;
  contradiction_score?: number;
  global_context?: Record<string, unknown>;
  evidence?: {
    matchedHeadlines?: Array<{ title: string; source: string; publishedAt: string | null; catalyst: string; sentiment: number; clusterId?: string }>;
    uniqueSources?: string[];
    leadingAssets?: string[];
    primaryCatalyst?: string;
    invalidation?: string;
    counts?: { hour1: number; hours6: number; hours24: number };
    modelVersion?: string;
    baseline?: { averageHourly: number; standardDeviation: number; sampleHours: number };
    marketRegime?: string;
    marketBreadth?: number;
    portfolioRelevance?: Record<string, unknown>;
  };
  model_version?: string;
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
  network?: 'testnet' | 'mainnet';
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
  sodex?: {
    tradingKeyConfigured: boolean;
    walletAddress: string | null;
    accountAddress: string | null;
    keyStatus?: {
      configured: boolean;
      provider: string;
      source: string;
      runtimeWritable: boolean;
      mainnetSafe: boolean;
      message: string;
    };
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


export interface SignalOutcomeRow {
  id?: string;
  created_at?: string;
  signal_at: string;
  sector: string;
  signal: SignalType;
  combined_score: number;
  model_version: string;
  score_breakdown?: Record<string, number>;
  forward_return_1h: number | null;
  forward_return_6h: number | null;
  forward_return_24h: number | null;
  forward_return_7d: number | null;
  benchmark_return_24h: number | null;
  alpha_24h: number | null;
  max_drawdown_24h: number | null;
  outcome_status: 'PENDING' | 'READY' | 'INSUFFICIENT_DATA' | 'FAILED';
  source_snapshot?: Record<string, unknown> | null;
  resolved_at?: string | null;
}

export interface PortfolioSnapshotRow {
  id?: string;
  created_at?: string;
  wallet_address: string;
  account_value: number;
  available_margin: number;
  position_count: number;
  gross_notional: number;
  net_exposure: number;
  max_risk_score: number;
  liquidation_cluster_count: number;
  recommended_action: string;
  data?: Record<string, unknown> | null;
}

export interface ExecutionActionRow {
  id?: string;
  action_id: string;
  created_at?: string;
  updated_at?: string;
  action_type: string;
  symbol: string;
  network: 'testnet' | 'mainnet';
  execution_mode: 'dry_run' | 'testnet' | 'mainnet_canary';
  status: 'SIMULATED' | 'CONFIRMED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED' | 'REJECTED' | 'DRY_RUN';
  requested_by?: string | null;
  idempotency_key: string;
  policy_snapshot?: Record<string, unknown>;
  request_payload?: Record<string, unknown>;
  signed_payload_hash?: string | null;
  signer_address?: string | null;
  sodex_response?: unknown;
  error?: string | null;
}

export interface PerformanceResponse {
  generatedAt: string;
  summary: {
    totalSignals: number;
    validatedSignals: number;
    pendingSignals: number;
    winRate: number | null;
    avgReturn24h: number | null;
    benchmarkReturn24h: number | null;
    alpha24h: number | null;
    maxDrawdown24h: number | null;
    modelVersions: string[];
    readiness: { status: string; message: string };
  };
  bySignal: Array<{
    signal: SignalType;
    count: number;
    validated: number;
    hitRate: number | null;
    avgReturn24h: number | null;
    avgAlpha24h: number | null;
  }>;
  horizons: Array<{ horizon: string; avgReturn: number | null; sampleSize: number }>;
  alertValidation: {
    totalAlerts: number;
    liquidationAlerts: number;
    criticalAlerts: number;
    avgRiskScore: number | null;
    medianAlertLatencyMs: number | null;
  };
  execution: {
    total: number;
    submitted: number;
    succeeded: number;
    rejected: number;
    successRate: number | null;
  };
  portfolio: PortfolioSnapshotRow | null;
  recentOutcomes: SignalOutcomeRow[];
  performanceSnapshots: Array<Record<string, unknown>>;
  recentExecutions: ExecutionActionRow[];
}

export interface ExecutionSimulationResponse {
  action: string;
  symbol: string;
  network: 'testnet' | 'mainnet';
  allowed: boolean;
  executionMode: string;
  idempotencyKey: string;
  checks: Array<{ name: string; passed: boolean; message: string }>;
  keyStatus: Record<string, unknown>;
  preview: Record<string, unknown>;
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
