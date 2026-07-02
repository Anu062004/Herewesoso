export type SignalType = 'STRONG_BUY' | 'BUY' | 'WATCH' | 'NEUTRAL' | 'AVOID';
export type RiskLevel = 'SAFE' | 'CAUTION' | 'DANGER' | 'CRITICAL';
export type AlertSeverity = 'INFO' | 'WARNING' | 'DANGER' | 'CRITICAL';
export type SignalOutcomeStatus = 'PENDING' | 'READY' | 'INSUFFICIENT_DATA' | 'FAILED';
export type ExecutionMode = 'dry_run' | 'testnet' | 'mainnet_canary';
export type ExecutionStatus =
  | 'SIMULATED'
  | 'CONFIRMED'
  | 'SUBMITTED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REJECTED'
  | 'DRY_RUN';

export interface Headline {
  title?: string;
  summary?: string;
  content?: string;
  [key: string]: unknown;
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

export interface ScoreBucket {
  combined: number;
  signal: SignalType;
}

export interface NarrativeScoreRow {
  sector: string;
  score_narrative: number;
  score_etf_flow: number;
  score_macro: number;
  combined_score: number;
  signal: SignalType;
  top_headlines: string[];
  reasoning?: string | null;
}

export interface SosoResponse<T> {
  code?: number;
  message?: string;
  data: T;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MacroThreat {
  event: string;
  hoursUntil: number;
  historicalMove: number;
}

export interface PositionRiskSnapshot {
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
  macro_threats: MacroThreat | null;
}


export interface SignalOutcomeRow {
  id?: string;
  created_at?: string;
  signal_at: string;
  sector: string;
  signal: SignalType;
  combined_score: number;
  model_version: string;
  score_breakdown: Record<string, number>;
  forward_return_1h: number | null;
  forward_return_6h: number | null;
  forward_return_24h: number | null;
  forward_return_7d: number | null;
  benchmark_return_24h: number | null;
  alpha_24h: number | null;
  max_drawdown_24h: number | null;
  outcome_status: SignalOutcomeStatus;
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
  execution_mode: ExecutionMode;
  status: ExecutionStatus;
  requested_by?: string | null;
  idempotency_key: string;
  policy_snapshot: Record<string, unknown>;
  request_payload: Record<string, unknown>;
  signed_payload_hash?: string | null;
  signer_address?: string | null;
  sodex_response?: unknown;
  error?: string | null;
}
export interface EnrichedPosition {
  id?: string | number | null;
  symbol: string;
  marginMode?: string | null;
  positionSide?: string | null;
  side?: string | null;
  positionSize?: string | number | null;
  entryPrice?: string | number | null;
  markPrice?: string | number | null;
  liquidationPrice?: string | number | null;
  leverage?: string | number | null;
  realizedPnL?: string | number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  active?: boolean;
}

export interface AccountPosition {
  id?: string | number | null;
  symbol: string;
  marginMode?: string | null;
  positionSide?: string | null;
  size?: string | number | null;
  entryPrice?: string | number | null;
  liquidationPrice?: string | number | null;
  leverage?: string | number | null;
  unrealizedPnL?: string | number | null;
  realizedPnL?: string | number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AccountBalance {
  coin: string;
  walletBalance?: string | number | null;
  availableBalance?: string | number | null;
  availableWithdraw?: string | number | null;
}

export interface AccountState {
  user?: string | null;
  accountId?: string | number | null;
  accountValue: number;
  availableMargin: number;
  initialMargin: number;
  crossMargin: number;
  walletAddress?: string | null;
  positions: AccountPosition[];
  balances: AccountBalance[];
  raw?: unknown;
}

export interface ShieldState {
  positions: EnrichedPosition[];
  accountState: AccountState | null;
}

export interface TelegramPayload {
  title: string;
  message: string;
}

export interface TelegramAlertResult extends TelegramPayload {
  alertType: string;
  severity: string;
  telegramSent?: boolean;
}
