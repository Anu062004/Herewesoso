import type { Headline, MacroEvent, NarrativeScoreRow } from '../types/domain';

import sosovalue = require('../services/sosovalue');
import claude = require('../services/ai');
import telegram = require('../services/telegram');
import narrativeScorer = require('../utils/narrativeScorer');
import delayUtils = require('../utils/delay');
import supabaseService = require('../services/supabase');
import memoryStore = require('../services/memoryStore');
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

    const SECTOR_KEYS: Record<string, string[]> = {
      DeFi: ['defi','yield','liquidity','amm','tvl','lending','swap','dex'],
      AI:   ['ai','artificial intelligence','agent','llm','machine learning','gpt','openai'],
      RWA:  ['rwa','real world asset','tokenized','treasury','bond','real estate'],
      L1:   ['layer 1','bitcoin','ethereum','solana','avalanche','consensus','validator'],
      L2:   ['layer 2','rollup','optimism','arbitrum','base','scaling','zk','polygon'],
      GameFi:['gaming','gamefi','play to earn','nft game','metaverse','game'],
      DePIN: ['depin','physical infrastructure','helium','render','iot','mining'],
      Meme:  ['meme','doge','shib','pepe','community','viral','pump']
    };

    function sectorHeadlines(hl: Headline[], sector: string): Headline[] {
      const keys = SECTOR_KEYS[sector] || [sector.toLowerCase()];
      const rel = hl.filter(h => {
        const t = [h?.title,h?.summary].filter(Boolean).join(' ').toLowerCase();
        return keys.some(k => t.includes(k));
      });
      return [...rel, ...hl.filter(h => !rel.includes(h))].slice(0, 5);
    }

    const sectorScores: NarrativeScoreRow[] = SECTORS.map((sector) => {
      const narrativeScore = narrativeScorer.scoreNarrativeLayer(headlines, sector);
      const etfScore = narrativeScorer.scoreETFLayer(etfNetFlow);
      const macroScore = narrativeScorer.scoreMacroLayer(upcoming);
      const { combined, signal } = narrativeScorer.generateSignal(narrativeScore, etfScore, macroScore);
      const relevant = sectorHeadlines(headlines, sector);

      return {
        sector,
        score_narrative: narrativeScore,
        score_etf_flow: etfScore,
        score_macro: macroScore,
        combined_score: combined,
        signal,
        top_headlines: relevant
          .map(h => String(h.title || '').trim())
          .filter(t => t.length > 5)
          .slice(0, 3)
      };
    });

    const strongSignals = sectorScores
      .filter((score) => score.signal === 'STRONG_BUY' || score.signal === 'BUY')
      .sort((left, right) => right.combined_score - left.combined_score);

    // Generate reasoning for top signal + any BUY signals (up to 3)
    const signalsToReason = strongSignals.slice(0, 3);
    const reasoningMap = new Map<string, string>();

    for (const sig of signalsToReason) {
      try {
        const reasoning = await claude.generateNarrativeMemo({
          sector: sig.sector,
          headlines: sectorHeadlines(headlines, sig.sector),
          etfFlow: etfNetFlow,
          macroEvents: upcoming,
          scores: { combined: sig.combined_score, signal: sig.signal }
        });
        reasoningMap.set(sig.sector, reasoning);
        await delay(300);
      } catch { /* use fallback */ }
    }

    let topSignal: NarrativeScoreRow | null = strongSignals[0] || null;
    if (topSignal) {
      const reasoning = reasoningMap.get(topSignal.sector) || '';
      topSignal.reasoning = reasoning;

      memoryStore.pushMemo({
        memo_type: 'ENTRY_SIGNAL',
        content: reasoning,
        related_symbol: topSignal.sector,
        data: { sector: topSignal.sector, combinedScore: topSignal.combined_score, signal: topSignal.signal }
      });

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

      memoryStore.pushAlert({
        alert_type: alertResult.alertType,
        severity: alertResult.severity,
        title: alertResult.title,
        message: alertResult.message,
        telegram_sent: Boolean(alertResult.telegramSent),
        data: { sector: topSignal.sector, signal: topSignal.signal, combinedScore: topSignal.combined_score }
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

    const scoresToStore = sectorScores.map((score) => ({
      ...score,
      reasoning: reasoningMap.get(score.sector) || null
    }));

    memoryStore.pushSignals(scoresToStore);
    await safeInsert('narrative_scores', scoresToStore);

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
