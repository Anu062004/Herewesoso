import type { Headline, MacroEvent, NarrativeScoreRow } from '../types/domain';

import sosovalue = require('../services/sosovalue');
import claude = require('../services/claude');
import telegram = require('../services/telegram');
import narrativeScorer = require('../utils/narrativeScorer');
import delayUtils = require('../utils/delay');
import supabaseService = require('../services/supabase');
import errorUtils = require('../utils/error');

const { delay } = delayUtils;
const { safeInsert, createAgentRun, completeAgentRun, failAgentRun } = supabaseService;
const { getErrorMessage } = errorUtils;

interface NarrativeAgentResult {
  success: boolean;
  scores?: NarrativeScoreRow[];
  strongSignals?: NarrativeScoreRow[];
  error?: string;
}

const SECTORS = ['DeFi', 'AI', 'RWA', 'L1', 'L2', 'GameFi', 'DePIN', 'Meme'] as const;

function getNumericValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value || 0);
}

async function fetchNarrativeInputs() {
  const news = await sosovalue.getNews(50);
  await delay(500);
  const etfHistory = await sosovalue.getETFSummaryHistory(7);
  await delay(500);
  const macroEvents = await sosovalue.getMacroEvents();

  return { news, etfHistory, macroEvents };
}

async function runNarrativeAgent(): Promise<NarrativeAgentResult> {
  console.log('[NarrativeAgent] Starting cycle...');
  const startTime = Date.now();
  const runRecord = await createAgentRun('narrative');

  try {
    const { news, etfHistory, macroEvents } = await fetchNarrativeInputs();

    const headlines = (Array.isArray(news?.data) ? news.data : []) as Headline[];
    const etfSummary = etfHistory?.data || {};
    const etfNetFlow = getNumericValue(
      (etfSummary as Record<string, unknown>).netFlow7Day ??
        (etfSummary as Record<string, unknown>).netFlow
    );
    const upcoming = (Array.isArray(macroEvents?.data) ? macroEvents.data : []) as MacroEvent[];

    const sectorScores: NarrativeScoreRow[] = SECTORS.map((sector) => {
      const narrativeScore = narrativeScorer.scoreNarrativeLayer(headlines, sector);
      const etfScore = narrativeScorer.scoreETFLayer(etfNetFlow);
      const macroScore = narrativeScorer.scoreMacroLayer(upcoming);
      const { combined, signal } = narrativeScorer.generateSignal(narrativeScore, etfScore, macroScore);

      return {
        sector,
        score_narrative: narrativeScore,
        score_etf_flow: etfScore,
        score_macro: macroScore,
        combined_score: combined,
        signal,
        top_headlines: headlines.slice(0, 3).map((headline) => String(headline.title || 'Untitled headline'))
      };
    });

    const strongSignals = sectorScores
      .filter((score) => score.signal === 'STRONG_BUY' || score.signal === 'BUY')
      .sort((left, right) => right.combined_score - left.combined_score);

    let topSignal: NarrativeScoreRow | null = null;
    if (strongSignals.length > 0) {
      topSignal = strongSignals[0];
      const reasoning = await claude.generateNarrativeMemo({
        sector: topSignal.sector,
        headlines,
        etfFlow: etfNetFlow,
        macroEvents: upcoming,
        scores: {
          combined: topSignal.combined_score,
          signal: topSignal.signal
        }
      });

      topSignal.reasoning = reasoning;

      await safeInsert('trade_memos', {
        memo_type: 'ENTRY_SIGNAL',
        content: reasoning,
        related_symbol: topSignal.sector,
        data: {
          sector: topSignal.sector,
          combinedScore: topSignal.combined_score,
          signal: topSignal.signal
        }
      });

      const alertResult = await telegram.sendNarrativeSignal({
        sector: topSignal.sector,
        signal: topSignal.signal,
        combinedScore: topSignal.combined_score,
        narrativeScore: topSignal.score_narrative,
        etfScore: topSignal.score_etf_flow,
        macroScore: topSignal.score_macro,
        topHeadline: String(headlines[0]?.title || 'No headline available'),
        reasoning
      });

      await safeInsert('alerts', {
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

    await safeInsert(
      'narrative_scores',
      sectorScores.map((score) => ({
        ...score,
        reasoning: score.sector === topSignal?.sector ? topSignal.reasoning || null : null
      }))
    );

    const duration = Date.now() - startTime;
    await completeAgentRun(runRecord?.id, {
      duration_ms: duration,
      summary: {
        topSignal: topSignal?.sector || null,
        strongSignalCount: strongSignals.length
      }
    });

    console.log(
      `[NarrativeAgent] Completed in ${duration}ms. Top signal: ${topSignal?.sector || 'None'}`
    );

    return { success: true, scores: sectorScores, strongSignals };
  } catch (error) {
    await failAgentRun(runRecord?.id, getErrorMessage(error), {
      duration_ms: Date.now() - startTime
    });

    console.error('[NarrativeAgent] Error:', getErrorMessage(error));
    return { success: false, error: getErrorMessage(error) };
  }
}

export = { runNarrativeAgent };
