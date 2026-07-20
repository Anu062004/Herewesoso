-- Narrative Scanner v2 evidence columns.
-- Apply after docs/base-schema.sql.

ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT;
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS sub_narrative TEXT;
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS confidence INTEGER;
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS velocity_score INTEGER;
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS acceleration_score INTEGER;
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS source_breadth_score INTEGER;
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS source_quality_score INTEGER;
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS catalyst_score INTEGER;
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS sentiment_score INTEGER;
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS novelty_score INTEGER;
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS market_confirmation_score INTEGER;
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS crowding_score INTEGER;
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS contradiction_score INTEGER;
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS global_context JSONB DEFAULT '{}';
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}';
ALTER TABLE narrative_scores ADD COLUMN IF NOT EXISTS model_version TEXT DEFAULT 'narrative-v2.0.0';

CREATE INDEX IF NOT EXISTS idx_narrative_scores_lifecycle
  ON narrative_scores (lifecycle_stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_scores_model
  ON narrative_scores (model_version, created_at DESC);

CREATE TABLE IF NOT EXISTS narrative_preferences (
  wallet_address TEXT PRIMARY KEY,
  stages JSONB NOT NULL DEFAULT '["EMERGING", "ACCELERATING"]',
  min_confidence INTEGER NOT NULL DEFAULT 60,
  max_crowding INTEGER NOT NULL DEFAULT 65,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS narrative_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ NOT NULL,
  sector TEXT NOT NULL,
  sub_narrative TEXT,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  cluster_id TEXT NOT NULL,
  sentiment NUMERIC NOT NULL DEFAULT 0,
  catalyst TEXT,
  model_version TEXT NOT NULL,
  UNIQUE (sector, cluster_id)
);

CREATE TABLE IF NOT EXISTS narrative_stage_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sector TEXT NOT NULL,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  opportunity_score INTEGER NOT NULL,
  invalidated BOOLEAN NOT NULL DEFAULT false,
  evidence JSONB DEFAULT '{}',
  model_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS narrative_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  wallet_address TEXT NOT NULL,
  signal_id TEXT,
  sector TEXT NOT NULL,
  useful BOOLEAN NOT NULL,
  reason TEXT,
  UNIQUE (wallet_address, signal_id)
);

CREATE TABLE IF NOT EXISTS narrative_source_performance (
  source TEXT PRIMARY KEY,
  sample_count INTEGER NOT NULL DEFAULT 0,
  relevance_rate NUMERIC,
  average_alpha_24h NUMERIC,
  contradiction_rate NUMERIC,
  reliability_score NUMERIC NOT NULL DEFAULT 50,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_narrative_events_sector_time ON narrative_events (sector, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_transitions_sector_time ON narrative_stage_transitions (sector, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_feedback_wallet ON narrative_feedback (wallet_address, created_at DESC);

CREATE TABLE IF NOT EXISTS narrative_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  wallet_address TEXT NOT NULL,
  question TEXT NOT NULL,
  intent TEXT NOT NULL,
  sector TEXT NOT NULL,
  answer TEXT NOT NULL,
  evidence JSONB DEFAULT '[]',
  metrics JSONB DEFAULT '{}',
  scenario JSONB,
  risk_mode TEXT NOT NULL,
  investable_amount NUMERIC NOT NULL DEFAULT 0,
  data_snapshot JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS narrative_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  wallet_address TEXT NOT NULL,
  conversation_id UUID REFERENCES narrative_conversations(id) ON DELETE SET NULL,
  sector TEXT NOT NULL,
  risk_mode TEXT NOT NULL,
  investable_amount NUMERIC NOT NULL,
  low_amount NUMERIC NOT NULL,
  high_amount NUMERIC NOT NULL,
  allocation JSONB DEFAULT '[]',
  rationale TEXT NOT NULL,
  evidence JSONB DEFAULT '[]',
  invalidation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SHOWN',
  data_timestamp TIMESTAMPTZ NOT NULL,
  feedback_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_narrative_conversations_wallet ON narrative_conversations (wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_recommendations_wallet ON narrative_recommendations (wallet_address, created_at DESC);
