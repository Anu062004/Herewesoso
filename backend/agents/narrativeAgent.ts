import type { Headline, MacroEvent, NarrativeScoreRow } from '../types/domain';

import sosovalue = require('../services/sosovalue');
import ai = require('../services/ai');
import telegram = require('../services/telegram');
import narrativeScorer = require('../utils/narrativeScorer');
import delayUtils = require('../utils/delay');
import supabaseService = require('../services/supabase');
import memoryStore = require('../services/memoryStore');
import errorUtils = require('../utils/error');
import performanceService = require('../services/performance');
import sodex = require('../services/sodex');
import { analyzeNarrative, assetsForSector, NARRATIVE_MODEL_VERSION, type MarketConfirmation } from '../services/narrativeEngine';
import { isProduction } from '../config/env';
import { loadCalibratedWeights, loadNarrativeBaselines, loadSourceReliability } from '../services/narrativeLearning';

const { delay } = delayUtils;
const { safeInsert, safeSelect, createAgentRun, completeAgentRun, failAgentRun } = supabaseService;
const { getErrorMessage } = errorUtils;

interface NarrativeAgentResult {
  success: boolean;
  degraded?: boolean;
  warnings?: string[];
  scores?: NarrativeScoreRow[];
  strongSignals?: NarrativeScoreRow[];
  error?: string;
}

interface NarrativeInputs {
  news: Awaited<ReturnType<typeof sosovalue.getNews>>;
  etfHistory: Awaited<ReturnType<typeof sosovalue.getETFSummaryHistory>>;
  macroEvents: Awaited<ReturnType<typeof sosovalue.getMacroEvents>>;
  unavailableSources: string[];
}

const SECTORS = ['DeFi', 'AI', 'RWA', 'L1', 'L2', 'GameFi', 'DePIN', 'Meme'] as const;

function getNumericValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value || 0);
}

async function fetchNarrativeInputs(): Promise<NarrativeInputs> {
  const unavailableSources: string[] = [];
  const load = async <T>(name: string, request: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await request();
    } catch (error) {
      unavailableSources.push(name);
      console.error(`[NarrativeAgent] ${name} unavailable: ${getErrorMessage(error)}`);
      return fallback;
    }
  };

  const news = await load(
    'SoSoValue news',
    () => sosovalue.getNews(100),
    { code: -1, message: 'News unavailable.', data: [] }
  );
  await delay(500);
  const etfHistory = await load(
    'SoSoValue ETF flows',
    () => sosovalue.getETFSummaryHistory(7),
    { code: -1, message: 'ETF flows unavailable.', data: { netFlow7Day: 0, netFlow: 0, unavailable: true } }
  );
  await delay(500);
  const macroEvents = await load(
    'SoSoValue macro events',
    () => sosovalue.getMacroEvents(),
    { code: -1, message: 'Macro events unavailable.', data: [] }
  );

  return { news, etfHistory, macroEvents, unavailableSources };
}

function marketPoints(input: unknown): Array<{ close: number; volume: number }> {
  const source = Array.isArray(input)
    ? input
    : Array.isArray((input as { data?: unknown })?.data)
      ? (input as { data: unknown[] }).data
      : [];
  return source.map((entry) => {
    if (Array.isArray(entry)) return { close: Number(entry[4] || 0), volume: Number(entry[5] || 0) };
    const row = (entry || {}) as Record<string, unknown>;
    return { close: Number(row.close ?? row.c ?? 0), volume: Number(row.volume ?? row.v ?? 0) };
  }).filter((point) => point.close > 0);
}

async function getSymbolMarket(symbol: string): Promise<Omit<MarketConfirmation, 'regime' | 'breadth'>> {
  try {
    const network = process.env.SIGNAL_OUTCOME_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
    const raw = await sodex.getKlines(symbol, '1h', 30, network);
    const points = marketPoints(raw);
    if (points.length < 7) return { score: 50, return6h: 0, return24h: 0, volumeRatio: 1, available: false };
    const latest = points[points.length - 1];
    const sixHour = points[Math.max(0, points.length - 7)];
    const day = points[Math.max(0, points.length - 25)];
    const return6h = ((latest.close - sixHour.close) / sixHour.close) * 100;
    const return24h = ((latest.close - day.close) / day.close) * 100;
    const previousVolumes = points.slice(-25, -1).map((point) => point.volume).filter((value) => value > 0);
    const averageVolume = previousVolumes.length ? previousVolumes.reduce((a, b) => a + b, 0) / previousVolumes.length : latest.volume;
    const volumeRatio = averageVolume > 0 ? latest.volume / averageVolume : 1;
    const score = Math.max(0, Math.min(100, Math.round(50 + return6h * 4 + return24h * 2 + (volumeRatio - 1) * 12)));
    return { score, return6h, return24h, volumeRatio, available: true };
  } catch {
    return { score: 50, return6h: 0, return24h: 0, volumeRatio: 1, available: false };
  }
}

async function getMarketRegime(): Promise<NonNullable<MarketConfirmation['regime']>> {
  const market = await getSymbolMarket('BTC-USD');
  if (!market.available) return 'SIDEWAYS';
  if (Math.abs(market.return24h) >= 6) return 'HIGH_VOLATILITY';
  if (market.return24h >= 2 && market.return6h > 0) return 'RISK_ON';
  if (market.return24h <= -2 && market.return6h < 0) return 'RISK_OFF';
  if (Math.abs(market.return24h) >= 1.5) return 'TRENDING';
  return 'SIDEWAYS';
}

async function getMarketConfirmation(sector: string, regime: NonNullable<MarketConfirmation['regime']>): Promise<MarketConfirmation> {
  const assets = assetsForSector(sector);
  if (!assets.length) return { score: 50, return6h: 0, return24h: 0, volumeRatio: 1, available: false, breadth: 0, regime };
  const markets = await Promise.all(assets.map(getSymbolMarket));
  const available = markets.filter((market) => market.available);
  if (!available.length) return { score: 50, return6h: 0, return24h: 0, volumeRatio: 1, available: false, breadth: 0, regime };
  const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const breadth = (available.filter((market) => market.return6h > 0).length / available.length) * 100;
  return {
    score: Math.round(average(available.map((market) => market.score)) * 0.7 + breadth * 0.3),
    return6h: average(available.map((market) => market.return6h)),
    return24h: average(available.map((market) => market.return24h)),
    volumeRatio: average(available.map((market) => market.volumeRatio)),
    available: true,
    breadth,
    regime
  };
}

async function persistNarrativeEvidence(scores: NarrativeScoreRow[]) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await safeSelect<any>('narrative_events', (query: any) => query.gte('published_at', since).limit(5000));
  const known = new Set(existing.map((row: any) => `${row.sector}:${row.cluster_id}`));
  const rows = scores.flatMap((score) => {
    const evidence = (score.evidence || {}) as { matchedHeadlines?: Array<Record<string, unknown>> };
    return (evidence.matchedHeadlines || []).map((headline) => ({
      sector: score.sector,
      sub_narrative: score.sub_narrative || 'General',
      title: String(headline.title || ''),
      source: String(headline.source || 'Unknown'),
      cluster_id: String(headline.clusterId || ''),
      published_at: String(headline.publishedAt || new Date().toISOString()),
      sentiment: Number(headline.sentiment || 0),
      catalyst: String(headline.catalyst || 'Organic attention'),
      model_version: score.model_version || NARRATIVE_MODEL_VERSION
    })).filter((row) => row.cluster_id && !known.has(`${row.sector}:${row.cluster_id}`));
  });
  if (rows.length) await safeInsert('narrative_events', rows);
}

async function persistLifecycleTransitions(scores: NarrativeScoreRow[]) {
  const { data: previous } = await safeSelect<NarrativeScoreRow>('narrative_scores', (query: any) =>
    query.order('created_at', { ascending: false }).limit(64)
  );
  const latest = new Map<string, NarrativeScoreRow>();
  previous.forEach((row) => { if (!latest.has(row.sector)) latest.set(row.sector, row); });
  const transitions = scores.flatMap((score) => {
    const prior = latest.get(score.sector);
    if (!prior?.lifecycle_stage || !score.lifecycle_stage || prior.lifecycle_stage === score.lifecycle_stage) return [];
    return [{
      sector: score.sector, from_stage: prior.lifecycle_stage, to_stage: score.lifecycle_stage,
      confidence: score.confidence || 0, opportunity_score: score.combined_score,
      invalidated: score.lifecycle_stage === 'FADING' || score.lifecycle_stage === 'REVERSING',
      evidence: score.evidence || {}, model_version: score.model_version || NARRATIVE_MODEL_VERSION
    }];
  });
  if (transitions.length) await safeInsert('narrative_stage_transitions', transitions);
}

async function alertAllowed(score: NarrativeScoreRow): Promise<boolean> {
  const wallet = String(process.env.USER_WALLET_ADDRESS || process.env.SODEX_ACCOUNT_ADDRESS || '').toLowerCase();
  if (!wallet) return true;
  const { data } = await safeSelect<any>('narrative_preferences', (query: any) =>
    query.eq('wallet_address', wallet).limit(1)
  );
  const preference = data[0];
  if (!preference) return true;
  const stages = Array.isArray(preference.stages) ? preference.stages : ['EMERGING', 'ACCELERATING'];
  return stages.includes(score.lifecycle_stage) &&
    (score.confidence || 0) >= Number(preference.min_confidence ?? 60) &&
    (score.crowding_score || 0) <= Number(preference.max_crowding ?? 65);
}

async function runNarrativeAgent(walletOverride?: string): Promise<NarrativeAgentResult> {
  console.log('[NarrativeAgent] Starting cycle...');
  const startTime = Date.now();
  let runRecord: Awaited<ReturnType<typeof createAgentRun>> = null;
  const walletAddress = String(walletOverride || process.env.USER_WALLET_ADDRESS || process.env.SODEX_ACCOUNT_ADDRESS || '').toLowerCase() || null;

  try {
    try {
      runRecord = await createAgentRun('narrative');
    } catch (error) {
      console.error('[NarrativeAgent] Run tracking unavailable:', getErrorMessage(error));
    }

    const { news, etfHistory, macroEvents, unavailableSources } = await fetchNarrativeInputs();

    const headlines = (Array.isArray(news?.data) ? news.data : []) as Headline[];
    const etfSummary = etfHistory?.data || {};
    const etfNetFlow = getNumericValue(
      (etfSummary as Record<string, unknown>).netFlow7Day ??
        (etfSummary as Record<string, unknown>).netFlow
    );
    const upcoming = (Array.isArray(macroEvents?.data) ? macroEvents.data : []) as MacroEvent[];

    const macroScore = narrativeScorer.scoreMacroLayer(upcoming);
    const [regime, baselines, calibration, sourceReliability] = await Promise.all([
      getMarketRegime(), loadNarrativeBaselines(SECTORS), loadCalibratedWeights(), loadSourceReliability()
    ]);
    const marketConfirmations = await Promise.all(SECTORS.map((sector) => getMarketConfirmation(sector, regime)));
    const sectorScores: NarrativeScoreRow[] = SECTORS.map((sector, index) => {
      const analysis = analyzeNarrative(headlines, sector, marketConfirmations[index], Date.now(), baselines[sector], calibration.weights, sourceReliability);
      const narrativeScore = analysis.attentionScore;
      const etfScore = narrativeScorer.scoreETFLayer(etfNetFlow);

      return {
        sector,
        score_narrative: narrativeScore,
        score_etf_flow: etfScore,
        score_macro: macroScore,
        combined_score: analysis.opportunityScore,
        signal: analysis.legacySignal,
        top_headlines: analysis.evidence.matchedHeadlines.map((headline) => headline.title).slice(0, 3),
        lifecycle_stage: analysis.lifecycleStage,
        sub_narrative: analysis.subNarrative,
        confidence: analysis.confidence,
        velocity_score: analysis.velocityScore,
        acceleration_score: analysis.accelerationScore,
        source_breadth_score: analysis.sourceBreadthScore,
        source_quality_score: analysis.sourceQualityScore,
        catalyst_score: analysis.catalystScore,
        sentiment_score: analysis.sentimentScore,
        novelty_score: analysis.noveltyScore,
        market_confirmation_score: analysis.marketConfirmationScore,
        crowding_score: analysis.crowdingScore,
        contradiction_score: analysis.contradictionScore,
        global_context: {
          etfFlow7Day: etfNetFlow,
          etfScore,
          macroScore,
          upcomingEventCount: upcoming.length,
          marketRegime: regime,
          calibrationSamples: calibration.samples,
          calibratedWeights: calibration.calibrated,
          dataAvailability: unavailableSources.length
            ? { status: 'degraded', unavailableSources }
            : { status: 'ready', unavailableSources: [] }
        },
        evidence: analysis.evidence as unknown as Record<string, unknown>,
        model_version: NARRATIVE_MODEL_VERSION
      };
    });

    const strongSignals = sectorScores
      .filter((score) =>
        score.signal === 'STRONG_BUY' ||
        score.signal === 'BUY' ||
        ((score.lifecycle_stage === 'EMERGING' || score.lifecycle_stage === 'ACCELERATING') && (score.confidence || 0) >= 55)
      )
      .sort((left, right) => right.combined_score - left.combined_score);

    // Generate reasoning for top signal + any BUY signals (up to 3)
    const signalsToReason = strongSignals.slice(0, 3);
    const reasoningMap = new Map<string, string>();
    // Per-sector receipt metadata. Populated only when the active AI adapter
    // exposes `getLastReceipt` (currently just the SkillMint adapter does).
    // Other adapters return undefined via optional chaining and we leave the
    // map empty — the rest of the agent works exactly the same.
    const receiptMap = new Map<string, unknown>();

    for (const sig of signalsToReason) {
      try {
        const reasoning = await ai.generateNarrativeMemo({
          sector: sig.sector,
          headlines: headlines.filter((headline) => sig.top_headlines.includes(String(headline.title || '').trim())).slice(0, 5),
          etfFlow: etfNetFlow,
          macroEvents: upcoming,
          scores: { combined: sig.combined_score, signal: sig.signal }
        });
        reasoningMap.set(sig.sector, reasoning);

        // SkillMint side-channel: if the adapter just ran a TEE-attested skill
        // it stored a receipt rootHash under "narrative:<sector>". Grab it
        // and remember it so we can persist it alongside the memo in Supabase.
        // Optional chaining + cast keeps us compatible with groq/gemini/claude
        // adapters that don't expose this method.
        const receipt = ai.getLastReceipt?.(`narrative:${sig.sector}`);
        if (receipt) receiptMap.set(sig.sector, receipt);

        await delay(300);
      } catch (error) {
        if (isProduction()) throw error;
      }
    }

    let topSignal: NarrativeScoreRow | null = strongSignals[0] || null;
    if (topSignal) {
      const reasoning = reasoningMap.get(topSignal.sector) || '';
      topSignal.reasoning = reasoning;
      // Pull the receipt for the top signal so we can write it to the DB. If
      // there is no receipt (groq/gemini/claude in use), this is just null and
      // the downstream Supabase row keeps its existing shape.
      const topReceipt = receiptMap.get(topSignal.sector) || null;

      memoryStore.pushMemo({
        memo_type: 'ENTRY_SIGNAL',
        content: reasoning,
        related_symbol: topSignal.sector,
        data: { sector: topSignal.sector, combinedScore: topSignal.combined_score, signal: topSignal.signal, skillmint_receipt: topReceipt }
      });

      await safeInsert('trade_memos', {
        wallet_address: walletAddress,
        memo_type: 'ENTRY_SIGNAL',
        content: reasoning,
        related_symbol: topSignal.sector,
        data: {
          sector: topSignal.sector,
          combinedScore: topSignal.combined_score,
          signal: topSignal.signal,
          // skillmint_receipt is null when AI_SERVICE != "skillmint" — leaving
          // the field present-but-null lets downstream queries always look for
          // it without branching. When SkillMint is the active adapter this
          // contains { receiptRootHash, settlementTx, skillId, paidUSDC, capturedAt }.
          // The receiptRootHash is the audit primary key — anyone can fetch
          // the signed receipt from 0G Storage with it forever.
          skillmint_receipt: topReceipt
        }
      });

      const alertInput = {
        sector: topSignal.sector,
        signal: topSignal.signal,
        combinedScore: topSignal.combined_score,
        narrativeScore: topSignal.score_narrative,
        etfScore: topSignal.score_etf_flow,
        macroScore: topSignal.score_macro,
        topHeadline: topSignal.top_headlines[0] || 'No matched headline available',
        reasoning,
        lifecycleStage: topSignal.lifecycle_stage,
        confidence: topSignal.confidence,
        velocityScore: topSignal.velocity_score,
        crowdingScore: topSignal.crowding_score,
        marketConfirmationScore: topSignal.market_confirmation_score,
        catalyst: String((topSignal.evidence as Record<string, unknown> | undefined)?.primaryCatalyst || 'Organic attention')
      };
      const alertResult = await alertAllowed(topSignal)
        ? await telegram.sendNarrativeSignal(alertInput)
        : telegram.buildNarrativeSignal(alertInput);

      memoryStore.pushAlert({
        alert_type: alertResult.alertType,
        severity: alertResult.severity,
        title: alertResult.title,
        message: alertResult.message,
        telegram_sent: Boolean(alertResult.telegramSent),
        data: { sector: topSignal.sector, signal: topSignal.signal, combinedScore: topSignal.combined_score }
      });

      await safeInsert('alerts', {
        wallet_address: walletAddress,
        alert_type: alertResult.alertType,
        severity: alertResult.severity,
        title: alertResult.title,
        message: alertResult.message,
        telegram_sent: Boolean(alertResult.telegramSent),
        data: {
          sector: topSignal.sector,
          signal: topSignal.signal,
          combinedScore: topSignal.combined_score
        }
      });
    }

    const scoresToStore = sectorScores.map((score) => ({
      ...score,
      reasoning: reasoningMap.get(score.sector) || null
    }));

    await persistLifecycleTransitions(scoresToStore);
    await persistNarrativeEvidence(scoresToStore);
    memoryStore.pushSignals(scoresToStore);
    await safeInsert('narrative_scores', scoresToStore);
    await performanceService.recordSignalOutcomes(scoresToStore);

    const duration = Date.now() - startTime;
    try {
      await completeAgentRun(runRecord?.id, {
        duration_ms: duration,
        summary: {
          topSignal: topSignal?.sector || null,
          strongSignalCount: strongSignals.length
        }
      });
    } catch (trackingError) {
      console.error('[NarrativeAgent] Failed to complete run tracking:', getErrorMessage(trackingError));
    }

    console.log(
      `[NarrativeAgent] Completed in ${duration}ms. Top signal: ${topSignal?.sector || 'None'}`
    );

    return {
      success: true,
      degraded: unavailableSources.length > 0,
      warnings: unavailableSources.length > 0
        ? [`Limited market intelligence: ${unavailableSources.join(', ')} unavailable.`]
        : [],
      scores: sectorScores,
      strongSignals
    };
  } catch (error) {
    try {
      await failAgentRun(runRecord?.id, getErrorMessage(error), {
        duration_ms: Date.now() - startTime
      });
    } catch (trackingError) {
      console.error('[NarrativeAgent] Failed to update run tracking:', getErrorMessage(trackingError));
    }

    console.error('[NarrativeAgent] Error:', getErrorMessage(error));
    return { success: false, error: getErrorMessage(error) };
  }
}

export = { runNarrativeAgent };
