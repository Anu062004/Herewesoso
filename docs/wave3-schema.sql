-- Gold & Grith Wave 3 evidence and execution schema
-- Apply after docs/narrative-v2-schema.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

-- EIP-4361 identities and independently revocable multi-user sessions.
CREATE TABLE IF NOT EXISTS wallet_users (
  wallet_address TEXT PRIMARY KEY CHECK (wallet_address ~ '^0x[0-9a-f]{40}$'),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sign_in_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_sessions (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES wallet_users(wallet_address) ON DELETE CASCADE,
  network TEXT NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wallet_sessions_owner ON wallet_sessions (wallet_address, expires_at DESC);

-- Marketplace content is immutable after publication; edits create a new version.
CREATE TABLE IF NOT EXISTS strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_address TEXT NOT NULL CHECK (owner_address ~ '^0x[0-9a-f]{40}$'),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  supported_exchanges JSONB NOT NULL DEFAULT '["sodex"]',
  configuration_schema JSONB NOT NULL DEFAULT '{}',
  execution_template JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  current_version INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  install_count INTEGER NOT NULL DEFAULT 0 CHECK (install_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_strategies_catalog ON strategies (status, category, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategies_owner ON strategies (owner_address, updated_at DESC);
ALTER TABLE strategies ALTER COLUMN supported_exchanges SET DEFAULT '["sodex"]'::jsonb;
UPDATE strategies SET supported_exchanges = '["sodex"]'::jsonb;

CREATE TABLE IF NOT EXISTS strategy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  content_hash TEXT NOT NULL,
  manifest JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, version)
);
UPDATE strategy_versions
SET manifest = jsonb_set(manifest, '{supportedExchanges}', '["sodex"]'::jsonb, true);

-- Honest starter catalog: installable SoDEX templates with no performance claims.
-- ON CONFLICT keeps this block safe to re-run and never overwrites user content.
WITH starter_strategies (
  id, owner_address, slug, name, summary, description, category, risk_level,
  configuration_schema, execution_template
) AS (
  VALUES
    (
      '11111111-1111-4111-8111-111111111111'::uuid,
      '0x0000000000000000000000000000000000000001',
      'sodex-liquidation-buffer',
      'SoDEX Liquidation Buffer',
      'Flags shrinking liquidation distance and prepares a bounded reduce-leverage response.',
      'A SoDEX-only risk template that records a reduce-leverage recommendation when position pressure crosses the configured Shield boundary.',
      'Risk',
      'LOW',
      '{}'::jsonb,
      '{"mode":"advisory","action":"REDUCE_LEVERAGE","venue":"sodex"}'::jsonb
    ),
    (
      '22222222-2222-4222-8222-222222222222'::uuid,
      '0x0000000000000000000000000000000000000001',
      'sodex-volatility-cooldown',
      'SoDEX Volatility Cooldown',
      'Pauses new exposure when SoDEX volatility and liquidity pressure exceed the risk limit.',
      'A SoDEX-only advisory template that records a no-new-exposure decision during unstable volatility and liquidity conditions.',
      'Risk',
      'MEDIUM',
      '{}'::jsonb,
      '{"mode":"advisory","action":"PAUSE_NEW_EXPOSURE","venue":"sodex"}'::jsonb
    )
)
INSERT INTO strategies (
  id, owner_address, slug, name, summary, description, category, risk_level,
  supported_exchanges, configuration_schema, execution_template, status,
  current_version, install_count, published_at
)
SELECT
  id, owner_address, slug, name, summary, description, category, risk_level,
  '["sodex"]'::jsonb, configuration_schema, execution_template, 'PUBLISHED',
  1, 0, now()
FROM starter_strategies
ON CONFLICT DO NOTHING;

WITH manifests AS (
  SELECT
    id AS strategy_id,
    jsonb_build_object(
      'name', name,
      'summary', summary,
      'description', description,
      'category', category,
      'riskLevel', risk_level,
      'supportedExchanges', '["sodex"]'::jsonb,
      'configurationSchema', configuration_schema,
      'executionTemplate', execution_template
    ) AS manifest
  FROM strategies
  WHERE id IN (
    '11111111-1111-4111-8111-111111111111'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid
  )
)
INSERT INTO strategy_versions (strategy_id, version, content_hash, manifest)
SELECT strategy_id, 1, 'sha256:' || encode(digest(manifest::text, 'sha256'), 'hex'), manifest
FROM manifests
ON CONFLICT (strategy_id, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS strategy_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL CHECK (wallet_address ~ '^0x[0-9a-f]{40}$'),
  version INTEGER NOT NULL CHECK (version > 0),
  configuration JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, wallet_address)
);
CREATE INDEX IF NOT EXISTS idx_strategy_installations_owner ON strategy_installations (wallet_address, installed_at DESC);

CREATE TABLE IF NOT EXISTS strategy_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, wallet_address)
);

CREATE TABLE IF NOT EXISTS strategy_performance_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  owner_address TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  sample_size INTEGER NOT NULL CHECK (sample_size > 0),
  metrics JSONB NOT NULL,
  evidence_hash TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Off-chain index of rules created in the ShieldAutomationExecutor contract.
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL CHECK (wallet_address ~ '^0x[0-9a-f]{40}$'),
  chain_id BIGINT NOT NULL,
  contract_address TEXT NOT NULL,
  onchain_rule_id TEXT NOT NULL,
  creation_tx_hash TEXT NOT NULL,
  adapter_address TEXT NOT NULL,
  checker_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'CANCELLED', 'EXHAUSTED')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, contract_address, onchain_rule_id)
);
CREATE INDEX IF NOT EXISTS idx_automation_rules_owner ON automation_rules (wallet_address, created_at DESC);
