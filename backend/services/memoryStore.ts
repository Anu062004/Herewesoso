// In-memory fallback store — used when Supabase is not configured.
// Agents write here each cycle; routes read from here if Supabase returns nothing.

export interface MemoEntry {
  memo_type: string;
  content: string;
  related_symbol?: string;
  data?: Record<string, unknown>;
  created_at: string;
}

export interface AlertEntry {
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  telegram_sent: boolean;
  data?: Record<string, unknown>;
  created_at: string;
}

export interface SignalEntry {
  sector: string;
  score_narrative: number;
  score_etf_flow: number;
  score_macro: number;
  combined_score: number;
  signal: string;
  reasoning?: string | null;
  top_headlines?: string[];
  created_at: string;
}

export interface PositionRiskEntry {
  wallet_address?: string | null;
  symbol: string;
  entry_price: number;
  mark_price: number;
  liquidation_price: number;
  leverage: number;
  position_size: number;
  distance_to_liquidation_pct: number;
  risk_score: number;
  risk_level: string;
  macro_threats?: Record<string, unknown> | null;
  created_at: string;
}

const memos: MemoEntry[] = [];
const alerts: AlertEntry[] = [];
const signals: SignalEntry[] = [];
const positionRisks: PositionRiskEntry[] = [];

function now() { return new Date().toISOString(); }

export function pushMemo(entry: Omit<MemoEntry, 'created_at'>) {
  memos.unshift({ ...entry, created_at: now() });
  memos.splice(5);
}

export function pushAlert(entry: Omit<AlertEntry, 'created_at'>) {
  alerts.unshift({ ...entry, created_at: now() });
  alerts.splice(20);
}

export function pushSignals(entries: Omit<SignalEntry, 'created_at'>[]) {
  const stamped = entries.map(e => ({ ...e, created_at: now() }));
  signals.splice(0, signals.length, ...stamped);
}

export function pushPositionRisks(entries: Omit<PositionRiskEntry, 'created_at'>[]) {
  const stamped = entries.map(e => ({ ...e, created_at: now() }));
  positionRisks.unshift(...stamped);
  positionRisks.splice(20);
}

export function getMemos(): MemoEntry[] { return memos; }
export function getAlerts(): AlertEntry[] { return alerts; }
export function getSignals(): SignalEntry[] { return signals; }
export function getPositionRisks(): PositionRiskEntry[] { return positionRisks; }
