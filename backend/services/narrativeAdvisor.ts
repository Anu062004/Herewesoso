import type { NarrativeScoreRow } from '../types/domain';
import { assetsForSector, NARRATIVE_TAXONOMY } from './narrativeEngine';

export type AdvisorIntent = 'EXPLAIN' | 'COMPARE' | 'ALLOCATION' | 'INVALIDATION' | 'PORTFOLIO' | 'RANKING';
export type AdvisorRiskMode = 'conservative' | 'balanced' | 'aggressive';

export interface AdvisorPosition { symbol: string; notional: number; }
export interface AllocationScenario {
  eligible: boolean;
  lowAmount: number;
  highAmount: number;
  capacityPct: number;
  currentExposurePct: number;
  reasons: string[];
  allocations: Array<{ symbol: string; percentage: number; lowAmount: number; highAmount: number }>;
}

export interface AdvisorAnswer {
  intent: AdvisorIntent;
  sector: string;
  answer: string;
  evidence: string[];
  metrics: Record<string, number | string | boolean>;
  invalidation: string;
  scenario: AllocationScenario | null;
  dataTimestamp: string;
}

const RISK_FACTORS: Record<AdvisorRiskMode, number> = { conservative: 0.45, balanced: 0.7, aggressive: 1 };

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function parseAdvisorIntent(question: string): AdvisorIntent {
  const text = question.toLowerCase();
  if (/how much|allocate|allocation|invest|buy|amount|distribute/.test(text)) return 'ALLOCATION';
  if (/compare|versus|\bvs\b|better than/.test(text)) return 'COMPARE';
  if (/invalid|avoid|exit|stop|wrong|risk/.test(text)) return 'INVALIDATION';
  if (/my wallet|my portfolio|my exposure|fit my/.test(text)) return 'PORTFOLIO';
  if (/top|best|strongest|rank|leading/.test(text)) return 'RANKING';
  return 'EXPLAIN';
}

export function detectSector(question: string, signals: NarrativeScoreRow[]): string {
  const text = question.toLowerCase();
  for (const [sector, entry] of Object.entries(NARRATIVE_TAXONOMY)) {
    if (text.includes(sector.toLowerCase()) || entry.terms.some((term) => text.includes(term))) return sector;
    for (const name of Object.keys(entry.subNarratives)) if (text.includes(name.toLowerCase())) return sector;
    if (entry.assets.some((asset) => text.includes(asset.replace('-USD', '').toLowerCase()))) return sector;
  }
  return [...signals].sort((a, b) => b.combined_score - a.combined_score)[0]?.sector || 'Market';
}

function portfolioExposure(sector: string, positions: AdvisorPosition[]): { currentPct: number; matched: string[] } {
  const assets = assetsForSector(sector);
  const total = positions.reduce((sum, position) => sum + Math.max(0, position.notional), 0);
  const matched = positions.filter((position) => assets.includes(position.symbol));
  const exposure = matched.reduce((sum, position) => sum + Math.max(0, position.notional), 0);
  return { currentPct: total > 0 ? (exposure / total) * 100 : 0, matched: matched.map((position) => position.symbol) };
}

export function calculateAllocationScenario({
  signal,
  positions,
  investableAmount,
  riskMode
}: {
  signal: NarrativeScoreRow;
  positions: AdvisorPosition[];
  investableAmount: number;
  riskMode: AdvisorRiskMode;
}): AllocationScenario {
  const evidence = (signal.evidence || {}) as { leadingAssets?: string[]; portfolioRelevance?: { suggestedMaxPct?: number } };
  const { currentPct } = portfolioExposure(signal.sector, positions);
  const suggestedMax = Number(evidence.portfolioRelevance?.suggestedMaxPct ?? Math.max(0, Math.min(12, (signal.confidence || 0) * 0.12 - (signal.crowding_score || 0) * 0.07)));
  const capacityPct = Math.max(0, suggestedMax - currentPct);
  const reasons: string[] = [];
  const lifecycleEligible = ['EMERGING', 'ACCELERATING', 'ESTABLISHED'].includes(signal.lifecycle_stage || '');
  if (!lifecycleEligible) reasons.push(`Lifecycle is ${signal.lifecycle_stage || 'unconfirmed'}.`);
  if ((signal.confidence || 0) < 55) reasons.push('Confidence is below 55.');
  if ((signal.market_confirmation_score || 0) < 45) reasons.push('Market confirmation is below 45.');
  if ((signal.crowding_score || 0) > 70) reasons.push('Crowding is above 70.');
  if (capacityPct <= 0) reasons.push('The wallet is already at or above suggested narrative exposure.');
  const eligible = reasons.length === 0 && investableAmount > 0;
  const highAmount = eligible ? investableAmount * (capacityPct / 100) * RISK_FACTORS[riskMode] : 0;
  const lowAmount = highAmount * 0.6;
  const assets = evidence.leadingAssets?.length ? evidence.leadingAssets : assetsForSector(signal.sector);
  const perAsset = assets.length ? 100 / assets.length : 0;
  return {
    eligible,
    lowAmount: round(lowAmount),
    highAmount: round(highAmount),
    capacityPct: round(capacityPct),
    currentExposurePct: round(currentPct),
    reasons,
    allocations: assets.map((symbol) => ({
      symbol,
      percentage: round(perAsset),
      lowAmount: round(lowAmount / Math.max(assets.length, 1)),
      highAmount: round(highAmount / Math.max(assets.length, 1))
    }))
  };
}

export function answerNarrativeQuestion({
  question,
  signals,
  positions,
  investableAmount = 0,
  riskMode = 'balanced'
}: {
  question: string;
  signals: NarrativeScoreRow[];
  positions: AdvisorPosition[];
  investableAmount?: number;
  riskMode?: AdvisorRiskMode;
}): AdvisorAnswer {
  const intent = parseAdvisorIntent(question);
  const sector = detectSector(question, signals);
  const signal = signals.find((row) => row.sector === sector) || signals[0];
  if (!signal) throw new Error('No current narrative data is available. Run the scanner first.');
  const evidenceData = (signal.evidence || {}) as {
    matchedHeadlines?: Array<{ title?: string; source?: string }>;
    primaryCatalyst?: string;
    invalidation?: string;
    marketRegime?: string;
    marketBreadth?: number;
  };
  const scenario = intent === 'ALLOCATION'
    ? calculateAllocationScenario({ signal, positions, investableAmount: Math.max(0, investableAmount), riskMode })
    : null;
  const evidence = (evidenceData.matchedHeadlines || []).slice(0, 4).map((item) =>
    `${item.title || 'Untitled evidence'}${item.source ? ` — ${item.source}` : ''}`
  );
  const base = `${signal.sector}${signal.sub_narrative ? ` / ${signal.sub_narrative}` : ''} is ${signal.lifecycle_stage || signal.signal} with opportunity ${signal.combined_score}/100, confidence ${signal.confidence || 0}/100, and market confirmation ${signal.market_confirmation_score || 0}/100.`;
  let answer = `${base} The primary catalyst is ${evidenceData.primaryCatalyst || 'organic attention'}, while crowding is ${signal.crowding_score || 0}/100.`;
  if (intent === 'ALLOCATION' && scenario) {
    answer = scenario.eligible
      ? `${base} For the entered $${round(investableAmount).toLocaleString()} and ${riskMode} mode, the rules-based scenario limits additional exposure to approximately $${scenario.lowAmount.toLocaleString()}–$${scenario.highAmount.toLocaleString()}.`
      : `${base} No additional allocation is suggested from the entered amount because ${scenario.reasons.join(' ')}`;
  } else if (intent === 'INVALIDATION') {
    answer = `${base} The thesis should be treated as invalid if ${evidenceData.invalidation || 'velocity falls below baseline or confirmation drops below 35'}`;
  } else if (intent === 'PORTFOLIO') {
    const exposure = portfolioExposure(signal.sector, positions);
    answer = `${base} This wallet currently has ${round(exposure.currentPct)}% direct mapped exposure through ${exposure.matched.join(', ') || 'no matched assets'}.`;
  } else if (intent === 'RANKING') {
    answer = `The highest-ranked narratives are ${[...signals].sort((a, b) => b.combined_score - a.combined_score).slice(0, 3).map((row) => `${row.sector} (${row.combined_score})`).join(', ')}. Rankings combine evidence momentum, source breadth, catalysts, market confirmation, crowding, and regime.`;
  } else if (intent === 'COMPARE') {
    const compared = [...signals].sort((a, b) => b.combined_score - a.combined_score).slice(0, 3);
    answer = `Current comparison: ${compared.map((row) => `${row.sector} ${row.combined_score}/100 (${row.lifecycle_stage || row.signal}, confidence ${row.confidence || 0})`).join('; ')}.`;
  }
  return {
    intent,
    sector: signal.sector,
    answer,
    evidence,
    metrics: {
      opportunity: signal.combined_score,
      confidence: signal.confidence || 0,
      velocity: signal.velocity_score || 0,
      marketConfirmation: signal.market_confirmation_score || 0,
      crowding: signal.crowding_score || 0,
      marketBreadth: evidenceData.marketBreadth || 0,
      marketRegime: evidenceData.marketRegime || 'UNKNOWN'
    },
    invalidation: evidenceData.invalidation || 'Velocity below baseline for 6 hours or market confirmation below 35.',
    scenario,
    dataTimestamp: String((signal as NarrativeScoreRow & { created_at?: string }).created_at || new Date().toISOString())
  };
}
