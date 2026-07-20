-- Gold & Grith base schema.
-- Apply this file first, before the other migrations in docs/README.md.

CREATE TABLE IF NOT EXISTS narrative_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sector TEXT NOT NULL,
  score_narrative INTEGER NOT NULL,
  score_etf_flow INTEGER NOT NULL,
  score_macro INTEGER NOT NULL,
  combined_score INTEGER NOT NULL,
  signal TEXT NOT NULL,
  top_headlines JSONB NOT NULL DEFAULT '[]',
  reasoning TEXT
);

CREATE TABLE IF NOT EXISTS position_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  wallet_address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  entry_price NUMERIC NOT NULL,
  mark_price NUMERIC NOT NULL,
  liquidation_price NUMERIC NOT NULL,
  leverage NUMERIC NOT NULL,
  position_size NUMERIC NOT NULL,
  distance_to_liquidation_pct NUMERIC NOT NULL,
  risk_score INTEGER NOT NULL,
  risk_level TEXT NOT NULL,
  macro_threats JSONB
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  wallet_address TEXT,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  telegram_sent BOOLEAN NOT NULL DEFAULT false,
  data JSONB
);

CREATE TABLE IF NOT EXISTS trade_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  wallet_address TEXT,
  memo_type TEXT NOT NULL,
  content TEXT NOT NULL,
  related_symbol TEXT,
  data JSONB
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  agent TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  duration_ms INTEGER,
  error TEXT,
  summary JSONB
);

CREATE INDEX IF NOT EXISTS idx_narrative_scores_created ON narrative_scores (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_position_risks_created ON position_risks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_memos_created ON trade_memos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created ON agent_runs (created_at DESC);
