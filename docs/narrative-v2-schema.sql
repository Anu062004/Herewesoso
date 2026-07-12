-- Narrative Scanner v2 evidence columns.
-- Apply after the base narrative_scores table from README.md.

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
