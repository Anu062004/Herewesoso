import type {
  AlertSeverity,
  ExecutionActionRow,
  NarrativeScoreRow,
  PortfolioSnapshotRow,
  PositionRiskSnapshot,
  ShieldState,
  SignalOutcomeRow,
  SignalType
} from '../types/domain';

import supabaseService = require('./supabase');

const { safeInsert, safeSelect } = supabaseService;

const DEFAULT_MODEL_VERSION = process.env.NARRATIVE_MODEL_VERSION || 'narrative-v1.0.0';
const OUTCOME_LIMIT = 250;

type HorizonKey = 'forward_return_1h' | 'forward_return_6h' | 'forward_return_24h' | 'forward_return_7d';
type AlertRow = {
  created_at?: string;
  alert_type?: string;
  severity?: AlertSeverity | string;
  data?: Record<string, unknown> | null;
};
type PerformanceSnapshotRow = {
  id?: string;
  created_at?: string;
  metric_date?: string;
  summary?: Record<string, unknown> | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function average(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function round(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function calculateMaxDrawdown(outcomes: SignalOutcomeRow[]): number | null {
  const ordered = [...outcomes]
    .filter((row) => typeof row.forward_return_24h === 'number')
    .sort((left, right) => {
      const leftTime = new Date(left.resolved_at || left.created_at || left.signal_at).getTime();
      const rightTime = new Date(right.resolved_at || right.created_at || right.signal_at).getTime();
      return leftTime - rightTime;
    });

  if (ordered.length === 0) return null;

  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;

  for (const row of ordered) {
    equity *= 1 + Number(row.forward_return_24h || 0) / 100;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
  }

  return round(maxDrawdown * 100, 2);
}

function hitRate(outcomes: SignalOutcomeRow[]): number | null {
  const resolved = outcomes.filter((row) => typeof row.forward_return_24h === 'number');
  if (resolved.length === 0) return null;
  const wins = resolved.filter((row) => Number(row.forward_return_24h) > 0).length;
  return round((wins / resolved.length) * 100, 1);
}

function summarizeBySignal(outcomes: SignalOutcomeRow[]) {
  const buckets: SignalType[] = ['STRONG_BUY', 'BUY', 'WATCH', 'NEUTRAL', 'AVOID'];

  return buckets.map((signal) => {
    const rows = outcomes.filter((row) => row.signal === signal);
    const resolved = rows.filter((row) => typeof row.forward_return_24h === 'number');
    const avg24h = average(resolved.map((row) => row.forward_return_24h));
    const avgAlpha = average(resolved.map((row) => row.alpha_24h));

    return {
      signal,
      count: rows.length,
      validated: resolved.length,
      hitRate: hitRate(rows),
      avgReturn24h: round(avg24h, 2),
      avgAlpha24h: round(avgAlpha, 2)
    };
  });
}

function summarizeHorizons(outcomes: SignalOutcomeRow[]) {
  const horizonKeys: Array<{ key: HorizonKey; label: '1h' | '6h' | '24h' | '7d' }> = [
    { key: 'forward_return_1h', label: '1h' },
    { key: 'forward_return_6h', label: '6h' },
    { key: 'forward_return_24h', label: '24h' },
    { key: 'forward_return_7d', label: '7d' }
  ];

  return horizonKeys.map(({ key, label }) => ({
    horizon: label,
    avgReturn: round(average(outcomes.map((row) => row[key])), 2),
    sampleSize: outcomes.filter((row) => typeof row[key] === 'number').length
  }));
}

function summarizeAlerts(alerts: AlertRow[], risks: PositionRiskSnapshot[]) {
  const liquidationAlerts = alerts.filter((alert) => alert.alert_type === 'LIQUIDATION_RISK');
  const criticalAlerts = alerts.filter((alert) => alert.severity === 'CRITICAL');
  const riskScores = risks.map((risk) => toNumber(risk.risk_score)).filter((value): value is number => value !== null);
  const latencies = alerts
    .map((alert) => {
      const sentAt = new Date(alert.created_at || '').getTime();
      const triggeredAt = new Date(String(alert.data?.triggeredAt || alert.data?.triggered_at || '')).getTime();
      return Number.isFinite(sentAt) && Number.isFinite(triggeredAt) ? sentAt - triggeredAt : null;
    })
    .filter((value): value is number => typeof value === 'number' && value >= 0)
    .sort((left, right) => left - right);
  const medianLatency = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : null;

  return {
    totalAlerts: alerts.length,
    liquidationAlerts: liquidationAlerts.length,
    criticalAlerts: criticalAlerts.length,
    avgRiskScore: round(average(riskScores), 1),
    medianAlertLatencyMs: medianLatency
  };
}

function summarizeExecutions(executions: ExecutionActionRow[]) {
  const submitted = executions.filter((execution) =>
    ['SUBMITTED', 'SUCCEEDED', 'FAILED'].includes(execution.status)
  );
  const succeeded = executions.filter((execution) => execution.status === 'SUCCEEDED');
  const rejected = executions.filter((execution) => execution.status === 'REJECTED');

  return {
    total: executions.length,
    submitted: submitted.length,
    succeeded: succeeded.length,
    rejected: rejected.length,
    successRate: submitted.length > 0 ? round((succeeded.length / submitted.length) * 100, 1) : null
  };
}

function latestModelVersions(outcomes: SignalOutcomeRow[], signals: NarrativeScoreRow[]) {
  const versions = new Set<string>();
  outcomes.forEach((outcome) => versions.add(outcome.model_version || DEFAULT_MODEL_VERSION));
  if (signals.length > 0) versions.add(DEFAULT_MODEL_VERSION);
  return [...versions].slice(0, 5);
}

function readiness(validatedSignals: number, pendingSignals: number) {
  if (validatedSignals >= 100) {
    return {
      status: 'production_evidence',
      message: 'Enough resolved samples exist to discuss signal behavior by bucket.'
    };
  }

  if (validatedSignals >= 30) {
    return {
      status: 'early_evidence',
      message: 'Outcome validation has a meaningful early sample, but needs more cycles.'
    };
  }

  if (pendingSignals > 0) {
    return {
      status: 'collecting',
      message: 'Signals are being logged for forward-return validation.'
    };
  }

  return {
    status: 'insufficient_data',
    message: 'No resolved signal outcomes are available yet.'
  };
}

async function recordSignalOutcomes(scores: NarrativeScoreRow[]) {
  if (scores.length === 0) return null;

  const signalAt = new Date().toISOString();
  const rows: Omit<SignalOutcomeRow, 'id' | 'created_at'>[] = scores.map((score) => ({
    signal_at: signalAt,
    sector: score.sector,
    signal: score.signal,
    combined_score: score.combined_score,
    model_version: score.model_version || DEFAULT_MODEL_VERSION,
    score_breakdown: {
      narrative: score.score_narrative,
      etfFlow: score.score_etf_flow,
      macro: score.score_macro,
      velocity: score.velocity_score || 0,
      acceleration: score.acceleration_score || 0,
      confidence: score.confidence || 0,
      marketConfirmation: score.market_confirmation_score || 0,
      crowding: score.crowding_score || 0
    },
    forward_return_1h: null,
    forward_return_6h: null,
    forward_return_24h: null,
    forward_return_7d: null,
    benchmark_return_24h: null,
    alpha_24h: null,
    max_drawdown_24h: null,
    outcome_status: 'PENDING',
    source_snapshot: {
      topHeadlines: score.top_headlines || [],
      reasoningPresent: Boolean(score.reasoning),
      lifecycleStage: score.lifecycle_stage || null,
      evidence: score.evidence || null,
      globalContext: score.global_context || null
    },
    resolved_at: null
  }));

  return safeInsert('signal_outcomes', rows);
}

async function recordPortfolioSnapshot(
  walletAddress: string,
  shieldState: ShieldState,
  riskSnapshots: PositionRiskSnapshot[]
) {
  const positions = shieldState.positions || [];
  const account = shieldState.accountState;
  const grossNotional = positions.reduce((sum, position) => {
    const mark = toNumber(position.markPrice) || toNumber(position.entryPrice) || 0;
    const size = Math.abs(toNumber(position.positionSize) || 0);
    return sum + mark * size;
  }, 0);
  const netExposure = positions.reduce((sum, position) => {
    const mark = toNumber(position.markPrice) || toNumber(position.entryPrice) || 0;
    const size = toNumber(position.positionSize) || 0;
    const side = String(position.side || position.positionSide || '').toUpperCase();
    const signedSize = side === 'SHORT' ? -Math.abs(size) : size;
    return sum + mark * signedSize;
  }, 0);
  const maxRiskScore = Math.max(0, ...riskSnapshots.map((snapshot) => snapshot.risk_score));
  const liquidationClusterCount = riskSnapshots.filter(
    (snapshot) => snapshot.risk_score >= 75 || snapshot.distance_to_liquidation_pct <= 10
  ).length;
  const recommendedAction =
    liquidationClusterCount > 1
      ? 'Reduce correlated exposure before the next macro event.'
      : maxRiskScore >= 75
        ? 'Reduce leverage or close the highest-risk position.'
        : maxRiskScore >= 55
          ? 'Monitor margin buffer and prepare a hedge.'
          : 'No portfolio-level action required.';

  const row: Omit<PortfolioSnapshotRow, 'id' | 'created_at'> = {
    wallet_address: walletAddress,
    account_value: account?.accountValue || 0,
    available_margin: account?.availableMargin || 0,
    position_count: positions.length,
    gross_notional: grossNotional,
    net_exposure: netExposure,
    max_risk_score: maxRiskScore,
    liquidation_cluster_count: liquidationClusterCount,
    recommended_action: recommendedAction,
    data: {
      symbols: positions.map((position) => position.symbol),
      riskLevels: riskSnapshots.map((snapshot) => ({
        symbol: snapshot.symbol,
        riskLevel: snapshot.risk_level,
        riskScore: snapshot.risk_score
      }))
    }
  };

  return safeInsert('portfolio_snapshots', row);
}

async function getPerformanceReport() {
  const [
    { data: outcomes },
    { data: snapshots },
    { data: alerts },
    { data: risks },
    { data: executions },
    { data: signals },
    { data: portfolios }
  ] = await Promise.all([
    safeSelect<SignalOutcomeRow>('signal_outcomes', (query: any) =>
      query.order('signal_at', { ascending: false }).limit(OUTCOME_LIMIT)
    ),
    safeSelect<PerformanceSnapshotRow>('performance_snapshots', (query: any) =>
      query.order('created_at', { ascending: false }).limit(30)
    ),
    safeSelect<AlertRow>('alerts', (query: any) => query.order('created_at', { ascending: false }).limit(250)),
    safeSelect<PositionRiskSnapshot>('position_risks', (query: any) =>
      query.order('created_at', { ascending: false }).limit(250)
    ),
    safeSelect<ExecutionActionRow>('execution_actions', (query: any) =>
      query.order('created_at', { ascending: false }).limit(100)
    ),
    safeSelect<NarrativeScoreRow>('narrative_scores', (query: any) =>
      query.order('created_at', { ascending: false }).limit(64)
    ),
    safeSelect<PortfolioSnapshotRow>('portfolio_snapshots', (query: any) =>
      query.order('created_at', { ascending: false }).limit(20)
    )
  ]);

  const resolvedOutcomes = outcomes.filter((outcome) => typeof outcome.forward_return_24h === 'number');
  const pendingSignals = outcomes.filter((outcome) => outcome.outcome_status === 'PENDING').length;
  const avg24h = average(resolvedOutcomes.map((outcome) => outcome.forward_return_24h));
  const avgBenchmark24h = average(resolvedOutcomes.map((outcome) => outcome.benchmark_return_24h));
  const avgAlpha24h = average(resolvedOutcomes.map((outcome) => outcome.alpha_24h));
  const latestPortfolio = portfolios[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalSignals: outcomes.length,
      validatedSignals: resolvedOutcomes.length,
      pendingSignals,
      winRate: hitRate(outcomes),
      avgReturn24h: round(avg24h, 2),
      benchmarkReturn24h: round(avgBenchmark24h, 2),
      alpha24h: round(avgAlpha24h, 2),
      maxDrawdown24h: calculateMaxDrawdown(outcomes),
      modelVersions: latestModelVersions(outcomes, signals),
      readiness: readiness(resolvedOutcomes.length, pendingSignals)
    },
    bySignal: summarizeBySignal(outcomes),
    horizons: summarizeHorizons(outcomes),
    alertValidation: summarizeAlerts(alerts, risks),
    execution: summarizeExecutions(executions),
    portfolio: latestPortfolio,
    recentOutcomes: outcomes.slice(0, 40),
    performanceSnapshots: snapshots,
    recentExecutions: executions.slice(0, 15)
  };
}

async function recordPerformanceSnapshot() {
  const report = await getPerformanceReport();

  return safeInsert('performance_snapshots', {
    metric_date: new Date().toISOString().split('T')[0],
    summary: report.summary,
    data: {
      bySignal: report.bySignal,
      horizons: report.horizons,
      alertValidation: report.alertValidation,
      execution: report.execution
    }
  });
}

export = {
  getPerformanceReport,
  recordPerformanceSnapshot,
  recordPortfolioSnapshot,
  recordSignalOutcomes
};
