const sosovalue = require('../services/sosovalue');
const claude = require('../services/ai');
const telegram = require('../services/telegram');
const narrativeScorer = require('../utils/narrativeScorer');
const { delay } = require('../utils/delay');
const {
  safeInsert,
  createAgentRun,
  completeAgentRun,
  failAgentRun
} = require('../services/supabase');

const SECTORS = ['DeFi', 'AI', 'RWA', 'L1', 'L2', 'GameFi', 'DePIN', 'Meme'];

async function fetchNarrativeInputs() {
  const news = await sosovalue.getNews(50);
  await delay(500);
  const etfHistory = await sosovalue.getETFSummaryHistory(7);
  await delay(500);
  const macroEvents = await sosovalue.getMacroEvents();

  return { news, etfHistory, macroEvents };
}

async function runNarrativeAgent() {
  console.log('[NarrativeAgent] Starting cycle...');
  const startTime = Date.now();
  const runRecord = await createAgentRun('narrative');

  try {
    const { news, etfHistory, macroEvents } = await fetchNarrativeInputs();

    const headlines = news?.data || [];
    const etfNetFlow = etfHistory?.data?.netFlow7Day ?? etfHistory?.data?.netFlow ?? 0;
    const upcoming = macroEvents?.data || [];

    const sectorScores = SECTORS.map((sector) => {
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
        top_headlines: headlines.slice(0, 3).map((headline) => headline.title)
      };
    });

    const strongSignals = sectorScores
      .filter((score) => score.signal === 'STRONG_BUY' || score.signal === 'BUY')
      .sort((left, right) => right.combined_score - left.combined_score);

    let topSignal = null;
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
        topHeadline: headlines[0]?.title || 'No headline available',
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
        reasoning: score.sector === topSignal?.sector ? topSignal.reasoning : null
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
    await failAgentRun(runRecord?.id, error.message, {
      duration_ms: Date.now() - startTime
    });

    console.error('[NarrativeAgent] Error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { runNarrativeAgent };
