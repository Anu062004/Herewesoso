-- Gold & Grith production hardening migration.
-- Apply after the base README schema, narrative-v2-schema.sql, and wave3-schema.sql.

CREATE TABLE IF NOT EXISTS wallet_login_challenges (
  id UUID PRIMARY KEY,
  address TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  nonce TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wallet_challenges_expiry ON wallet_login_challenges (expires_at);

CREATE TABLE IF NOT EXISTS system_leases (
  lease_key TEXT PRIMARY KEY,
  owner UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  rate_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset ON api_rate_limits (reset_at);

CREATE OR REPLACE FUNCTION consume_api_rate_limit(p_rate_key TEXT, p_window_seconds INTEGER)
RETURNS TABLE(request_count INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM api_rate_limits AS expired_limits
    WHERE expired_limits.reset_at < now() - interval '1 day';
  RETURN QUERY
  INSERT INTO api_rate_limits AS limits (rate_key, request_count, reset_at)
  VALUES (p_rate_key, 1, now() + make_interval(secs => GREATEST(1, LEAST(p_window_seconds, 86400))))
  ON CONFLICT (rate_key) DO UPDATE SET
    request_count = CASE WHEN limits.reset_at <= now() THEN 1 ELSE limits.request_count + 1 END,
    reset_at = CASE WHEN limits.reset_at <= now() THEN now() + make_interval(secs => GREATEST(1, LEAST(p_window_seconds, 86400))) ELSE limits.reset_at END
  RETURNING limits.request_count, limits.reset_at;
END;
$$;
REVOKE ALL ON FUNCTION consume_api_rate_limit(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_api_rate_limit(TEXT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION acquire_system_lease(
  p_lease_key TEXT,
  p_lease_owner UUID,
  p_lease_ttl_seconds INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE acquired_key TEXT;
BEGIN
  DELETE FROM system_leases WHERE expires_at < now() - interval '7 days';
  INSERT INTO system_leases (lease_key, owner, expires_at, updated_at)
  VALUES (p_lease_key, p_lease_owner, now() + make_interval(secs => GREATEST(1, LEAST(p_lease_ttl_seconds, 604800))), now())
  ON CONFLICT (lease_key) DO UPDATE
    SET owner = EXCLUDED.owner,
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
    WHERE system_leases.expires_at <= now()
  RETURNING system_leases.lease_key INTO acquired_key;
  RETURN acquired_key IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION acquire_system_lease(TEXT, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acquire_system_lease(TEXT, UUID, INTEGER) TO service_role;

ALTER TABLE performance_snapshots ADD COLUMN IF NOT EXISTS model_version TEXT NOT NULL DEFAULT 'narrative-v2.0.0';
ALTER TABLE performance_snapshots ADD COLUMN IF NOT EXISTS wallet_address TEXT NOT NULL DEFAULT 'global';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS wallet_address TEXT;
ALTER TABLE trade_memos ADD COLUMN IF NOT EXISTS wallet_address TEXT;

UPDATE alerts SET wallet_address = lower(data->>'wallet')
  WHERE wallet_address IS NULL AND data->>'wallet' ~* '^0x[0-9a-f]{40}$';
UPDATE position_risks SET wallet_address = lower(wallet_address);
UPDATE portfolio_snapshots SET wallet_address = lower(wallet_address);
UPDATE execution_actions SET requested_by = lower(requested_by) WHERE requested_by IS NOT NULL;
UPDATE performance_snapshots SET wallet_address = lower(wallet_address);
UPDATE narrative_preferences SET wallet_address = lower(wallet_address);
UPDATE narrative_feedback SET wallet_address = lower(wallet_address);
UPDATE narrative_conversations SET wallet_address = lower(wallet_address);
UPDATE narrative_recommendations SET wallet_address = lower(wallet_address);

CREATE INDEX IF NOT EXISTS idx_alerts_wallet_created ON alerts (wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_memos_wallet_created ON trade_memos (wallet_address, created_at DESC);

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY metric_date, model_version, wallet_address ORDER BY created_at DESC, id DESC
  ) AS position
  FROM performance_snapshots
)
DELETE FROM performance_snapshots WHERE id IN (SELECT id FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_performance_snapshot_daily
  ON performance_snapshots (metric_date, model_version, wallet_address);

WITH ranked AS (
  SELECT id, action_id, idempotency_key,
         row_number() OVER (PARTITION BY idempotency_key ORDER BY created_at, id) AS position
  FROM execution_actions
)
UPDATE execution_actions AS actions
SET idempotency_key = actions.idempotency_key || ':' || actions.action_id
FROM ranked
WHERE actions.id = ranked.id AND ranked.position > 1;

DROP INDEX IF EXISTS idx_execution_actions_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_actions_idempotency ON execution_actions (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_execution_actions_cooldown
  ON execution_actions (requested_by, action_type, symbol, network, created_at DESC);

ALTER TABLE signal_outcomes DROP CONSTRAINT IF EXISTS signal_outcomes_status_check;
ALTER TABLE signal_outcomes ADD CONSTRAINT signal_outcomes_status_check
  CHECK (outcome_status IN ('PENDING', 'PARTIAL', 'READY', 'INSUFFICIENT_DATA', 'FAILED')) NOT VALID;
UPDATE signal_outcomes SET outcome_status = 'PARTIAL'
  WHERE outcome_status = 'READY' AND forward_return_7d IS NULL;
ALTER TABLE signal_outcomes VALIDATE CONSTRAINT signal_outcomes_status_check;

ALTER TABLE execution_actions DROP CONSTRAINT IF EXISTS execution_actions_status_check;
ALTER TABLE execution_actions ADD CONSTRAINT execution_actions_status_check
  CHECK (status IN ('PENDING', 'SIMULATED', 'CONFIRMED', 'SUBMITTED', 'UNKNOWN', 'SUCCEEDED', 'FAILED', 'REJECTED', 'DRY_RUN')) NOT VALID;
ALTER TABLE execution_actions VALIDATE CONSTRAINT execution_actions_status_check;

ALTER TABLE execution_actions DROP CONSTRAINT IF EXISTS execution_actions_network_check;
ALTER TABLE execution_actions ADD CONSTRAINT execution_actions_network_check
  CHECK (network IN ('testnet', 'mainnet')) NOT VALID;
ALTER TABLE execution_actions VALIDATE CONSTRAINT execution_actions_network_check;
ALTER TABLE execution_actions DROP CONSTRAINT IF EXISTS execution_actions_mode_check;
ALTER TABLE execution_actions ADD CONSTRAINT execution_actions_mode_check
  CHECK (execution_mode IN ('dry_run', 'testnet', 'mainnet_canary')) NOT VALID;
ALTER TABLE execution_actions VALIDATE CONSTRAINT execution_actions_mode_check;
ALTER TABLE execution_actions DROP CONSTRAINT IF EXISTS execution_actions_type_check;
ALTER TABLE execution_actions ADD CONSTRAINT execution_actions_type_check
  CHECK (action_type IN ('QUEUE_ACTION', 'REDUCE_LEVERAGE', 'CLOSE_POSITION', 'CANCEL_ORDER')) NOT VALID;
ALTER TABLE execution_actions VALIDATE CONSTRAINT execution_actions_type_check;

UPDATE narrative_scores SET combined_score = GREATEST(0, LEAST(100, combined_score))
  WHERE combined_score NOT BETWEEN 0 AND 100;
UPDATE position_risks SET risk_score = GREATEST(0, LEAST(100, risk_score))
  WHERE risk_score NOT BETWEEN 0 AND 100;
UPDATE narrative_preferences SET
  min_confidence = GREATEST(0, LEAST(100, min_confidence)),
  max_crowding = GREATEST(0, LEAST(100, max_crowding))
  WHERE min_confidence NOT BETWEEN 0 AND 100 OR max_crowding NOT BETWEEN 0 AND 100;

ALTER TABLE narrative_scores DROP CONSTRAINT IF EXISTS narrative_scores_combined_range;
ALTER TABLE narrative_scores ADD CONSTRAINT narrative_scores_combined_range CHECK (combined_score BETWEEN 0 AND 100) NOT VALID;
ALTER TABLE position_risks DROP CONSTRAINT IF EXISTS position_risks_score_range;
ALTER TABLE position_risks ADD CONSTRAINT position_risks_score_range CHECK (risk_score BETWEEN 0 AND 100) NOT VALID;
ALTER TABLE narrative_preferences DROP CONSTRAINT IF EXISTS narrative_preferences_confidence_range;
ALTER TABLE narrative_preferences ADD CONSTRAINT narrative_preferences_confidence_range CHECK (min_confidence BETWEEN 0 AND 100) NOT VALID;
ALTER TABLE narrative_preferences DROP CONSTRAINT IF EXISTS narrative_preferences_crowding_range;
ALTER TABLE narrative_preferences ADD CONSTRAINT narrative_preferences_crowding_range CHECK (max_crowding BETWEEN 0 AND 100) NOT VALID;
ALTER TABLE narrative_scores VALIDATE CONSTRAINT narrative_scores_combined_range;
ALTER TABLE position_risks VALIDATE CONSTRAINT position_risks_score_range;
ALTER TABLE narrative_preferences VALIDATE CONSTRAINT narrative_preferences_confidence_range;
ALTER TABLE narrative_preferences VALIDATE CONSTRAINT narrative_preferences_crowding_range;

DO $$
DECLARE score_column TEXT;
BEGIN
  FOREACH score_column IN ARRAY ARRAY[
    'confidence', 'velocity_score', 'acceleration_score', 'source_breadth_score',
    'source_quality_score', 'catalyst_score', 'sentiment_score', 'novelty_score',
    'market_confirmation_score', 'crowding_score', 'contradiction_score'
  ] LOOP
    EXECUTE format(
      'UPDATE narrative_scores SET %1$I = GREATEST(0, LEAST(100, %1$I)) WHERE %1$I IS NOT NULL AND %1$I NOT BETWEEN 0 AND 100',
      score_column
    );
  END LOOP;
END $$;

ALTER TABLE narrative_scores DROP CONSTRAINT IF EXISTS narrative_scores_component_ranges;
ALTER TABLE narrative_scores ADD CONSTRAINT narrative_scores_component_ranges CHECK (
  (confidence IS NULL OR confidence BETWEEN 0 AND 100) AND
  (velocity_score IS NULL OR velocity_score BETWEEN 0 AND 100) AND
  (acceleration_score IS NULL OR acceleration_score BETWEEN 0 AND 100) AND
  (source_breadth_score IS NULL OR source_breadth_score BETWEEN 0 AND 100) AND
  (source_quality_score IS NULL OR source_quality_score BETWEEN 0 AND 100) AND
  (catalyst_score IS NULL OR catalyst_score BETWEEN 0 AND 100) AND
  (sentiment_score IS NULL OR sentiment_score BETWEEN 0 AND 100) AND
  (novelty_score IS NULL OR novelty_score BETWEEN 0 AND 100) AND
  (market_confirmation_score IS NULL OR market_confirmation_score BETWEEN 0 AND 100) AND
  (crowding_score IS NULL OR crowding_score BETWEEN 0 AND 100) AND
  (contradiction_score IS NULL OR contradiction_score BETWEEN 0 AND 100)
) NOT VALID;
ALTER TABLE narrative_scores VALIDATE CONSTRAINT narrative_scores_component_ranges;

ALTER TABLE signal_outcomes DROP CONSTRAINT IF EXISTS signal_outcomes_score_range;
UPDATE signal_outcomes SET combined_score = GREATEST(0, LEAST(100, combined_score))
  WHERE combined_score NOT BETWEEN 0 AND 100;
ALTER TABLE signal_outcomes ADD CONSTRAINT signal_outcomes_score_range CHECK (combined_score BETWEEN 0 AND 100) NOT VALID;
ALTER TABLE signal_outcomes VALIDATE CONSTRAINT signal_outcomes_score_range;
ALTER TABLE portfolio_snapshots DROP CONSTRAINT IF EXISTS portfolio_snapshots_ranges;
UPDATE portfolio_snapshots SET
  position_count = GREATEST(0, position_count),
  gross_notional = GREATEST(0, gross_notional),
  max_risk_score = GREATEST(0, LEAST(100, max_risk_score)),
  liquidation_cluster_count = GREATEST(0, liquidation_cluster_count)
  WHERE position_count < 0 OR gross_notional < 0 OR max_risk_score NOT BETWEEN 0 AND 100 OR liquidation_cluster_count < 0;
ALTER TABLE portfolio_snapshots ADD CONSTRAINT portfolio_snapshots_ranges CHECK (
  position_count >= 0 AND gross_notional >= 0 AND max_risk_score BETWEEN 0 AND 100 AND liquidation_cluster_count >= 0
) NOT VALID;
ALTER TABLE portfolio_snapshots VALIDATE CONSTRAINT portfolio_snapshots_ranges;

ALTER TABLE wallet_login_challenges DROP CONSTRAINT IF EXISTS wallet_login_challenges_address_check;
ALTER TABLE wallet_login_challenges ADD CONSTRAINT wallet_login_challenges_address_check
  CHECK (address ~* '^0x[0-9a-f]{40}$') NOT VALID;
ALTER TABLE wallet_login_challenges VALIDATE CONSTRAINT wallet_login_challenges_address_check;
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_wallet_address_check;
UPDATE alerts SET wallet_address = NULL
  WHERE wallet_address IS NOT NULL AND wallet_address !~ '^0x[0-9a-f]{40}$';
ALTER TABLE alerts ADD CONSTRAINT alerts_wallet_address_check
  CHECK (wallet_address IS NULL OR wallet_address ~ '^0x[0-9a-f]{40}$') NOT VALID;
ALTER TABLE alerts VALIDATE CONSTRAINT alerts_wallet_address_check;
ALTER TABLE trade_memos DROP CONSTRAINT IF EXISTS trade_memos_wallet_address_check;
UPDATE trade_memos SET wallet_address = NULL
  WHERE wallet_address IS NOT NULL AND wallet_address !~ '^0x[0-9a-f]{40}$';
ALTER TABLE trade_memos ADD CONSTRAINT trade_memos_wallet_address_check
  CHECK (wallet_address IS NULL OR wallet_address ~ '^0x[0-9a-f]{40}$') NOT VALID;
ALTER TABLE trade_memos VALIDATE CONSTRAINT trade_memos_wallet_address_check;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'narrative_scores', 'position_risks', 'alerts', 'trade_memos', 'agent_runs',
    'signal_outcomes', 'performance_snapshots', 'portfolio_snapshots', 'execution_actions',
    'model_versions', 'narrative_preferences', 'narrative_events',
    'narrative_stage_transitions', 'narrative_feedback', 'narrative_source_performance',
    'narrative_conversations', 'narrative_recommendations', 'wallet_login_challenges', 'system_leases',
    'api_rate_limits'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', table_name);
  END LOOP;
END $$;

-- Service-role access bypasses RLS. No browser role receives direct table access;
-- all wallet authorization is enforced by the backend API.
