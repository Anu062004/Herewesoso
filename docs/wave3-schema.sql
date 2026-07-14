-- Gold & Grith Wave 3 evidence and execution schema
-- Run this after the base README database setup.

CREATE TABLE IF NOT EXISTS signal_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  signal_at TIMESTAMPTZ NOT NULL,
  sector TEXT NOT NULL,
  signal TEXT NOT NULL,
  combined_score INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  score_breakdown JSONB DEFAULT '{}',
  proxy_symbol TEXT,
  benchmark_symbol TEXT DEFAULT 'BTC-USD',
  entry_price NUMERIC,
  benchmark_entry_price NUMERIC,
  forward_return_1h NUMERIC,
  forward_return_6h NUMERIC,
  forward_return_24h NUMERIC,
  forward_return_7d NUMERIC,
  benchmark_return_24h NUMERIC,
  alpha_24h NUMERIC,
  max_drawdown_24h NUMERIC,
  directional_hit BOOLEAN,
  resolved_horizons JSONB DEFAULT '{}',
  outcome_status TEXT NOT NULL DEFAULT 'PENDING',
  source_snapshot JSONB DEFAULT '{}',
  resolved_at TIMESTAMPTZ
);

ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS proxy_symbol TEXT;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS benchmark_symbol TEXT DEFAULT 'BTC-USD';
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS entry_price NUMERIC;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS benchmark_entry_price NUMERIC;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS directional_hit BOOLEAN;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS resolved_horizons JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  metric_date DATE NOT NULL,
  summary JSONB DEFAULT '{}',
  data JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  wallet_address TEXT NOT NULL,
  account_value NUMERIC NOT NULL DEFAULT 0,
  available_margin NUMERIC NOT NULL DEFAULT 0,
  position_count INTEGER NOT NULL DEFAULT 0,
  gross_notional NUMERIC NOT NULL DEFAULT 0,
  net_exposure NUMERIC NOT NULL DEFAULT 0,
  max_risk_score INTEGER NOT NULL DEFAULT 0,
  liquidation_cluster_count INTEGER NOT NULL DEFAULT 0,
  recommended_action TEXT NOT NULL,
  data JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS execution_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  action_type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  network TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_by TEXT,
  idempotency_key TEXT NOT NULL,
  policy_snapshot JSONB DEFAULT '{}',
  request_payload JSONB DEFAULT '{}',
  signed_payload_hash TEXT,
  signer_address TEXT,
  sodex_response JSONB,
  error TEXT
);

CREATE TABLE IF NOT EXISTS model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  model_version TEXT NOT NULL UNIQUE,
  weights JSONB DEFAULT '{}',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_signal_outcomes_signal_at ON signal_outcomes (signal_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_signal ON signal_outcomes (signal, outcome_status);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_proxy ON signal_outcomes (proxy_symbol, signal_at DESC);
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_created ON performance_snapshots (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_created ON portfolio_snapshots (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_actions_created ON execution_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_actions_idempotency ON execution_actions (idempotency_key);
