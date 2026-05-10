export type SignalType = 'STRONG_BUY' | 'BUY' | 'WATCH' | 'NEUTRAL' | 'AVOID';
export type RiskLevel = 'SAFE' | 'CAUTION' | 'DANGER' | 'CRITICAL';
export type AlertSeverity = 'INFO' | 'WARNING' | 'DANGER' | 'CRITICAL';

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
  macro_threats?: {
    event?: string;
    hoursUntil?: number;
    historicalMove?: number;
  } | null;
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
