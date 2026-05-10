import type { Request, Response } from 'express';
import type { Headline, MacroEvent } from '../types/domain';

import express from 'express';
import sosovalue = require('../services/sosovalue');
import claude = require('../services/ai');
import narrativeScorer = require('../utils/narrativeScorer');
import delayUtils = require('../utils/delay');

const { delay } = delayUtils;

const SECTORS = ['DeFi', 'AI', 'RWA', 'L1', 'L2', 'GameFi', 'DePIN', 'Meme'] as const;

const SECTOR_KEYWORDS: Record<string, string[]> = {
  DeFi:    ['defi', 'yield', 'liquidity', 'amm', 'tvl', 'lending', 'swap', 'dex', 'vault', 'protocol'],
  AI:      ['ai', 'artificial intelligence', 'agent', 'llm', 'machine learning', 'gpt', 'neural', 'openai', 'model'],
  RWA:     ['rwa', 'real world asset', 'tokenized', 'treasury', 'bond', 'real estate', 'commodity', 'tokenisation'],
  L1:      ['layer 1', 'bitcoin', 'ethereum', 'solana', 'avalanche', 'consensus', 'validator', 'mainnet', 'blockchain'],
  L2:      ['layer 2', 'rollup', 'optimism', 'arbitrum', 'base', 'scaling', 'zk', 'polygon', 'starknet'],
  GameFi:  ['gaming', 'gamefi', 'play to earn', 'nft game', 'metaverse', 'immutable', 'axie', 'game'],
  DePIN:   ['depin', 'physical infrastructure', 'helium', 'render', 'iot', 'mining', 'network node', 'compute'],
  Meme:    ['meme', 'doge', 'shib', 'pepe', 'community', 'viral', 'pump', 'wojak', 'bonk']
};

function getNumericValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value || 0);
}

function sectorHeadlines(headlines: Headline[], sector: string): Headline[] {
  const keywords = SECTOR_KEYWORDS[sector] || [sector.toLowerCase()];
  const relevant = headlines.filter(h => {
    const text = [h?.title, h?.summary, h?.content].filter(Boolean).join(' ').toLowerCase();
    return keywords.some(k => text.includes(k));
  });
  // Return sector-relevant first, then top general headlines to fill
  const general = headlines.filter(h => !relevant.includes(h));
  return [...relevant, ...general].slice(0, 5);
}

const router = express.Router();

router.post('/', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Fetch all inputs in parallel
    const [newsResult, etfResult, macroResult] = await Promise.allSettled([
      sosovalue.getNews(100),
      sosovalue.getETFSummaryHistory(7),
      sosovalue.getMacroEvents()
    ]);

    const headlines = (newsResult.status === 'fulfilled'
      ? (newsResult.value?.data || []) as Headline[]
      : []);

    const etfSummary = (etfResult.status === 'fulfilled'
      ? (etfResult.value?.data || {}) as Record<string, unknown>
      : {});

    const etfNetFlow = getNumericValue(
      etfSummary.netFlow7Day ?? etfSummary.netFlow ?? 0
    );

    const macroEvents = (macroResult.status === 'fulfilled'
      ? (macroResult.value?.data || []) as MacroEvent[]
      : []);

    // Score all sectors
    const sectorScores = SECTORS.map(sector => {
      const narrativeScore = narrativeScorer.scoreNarrativeLayer(headlines, sector);
      const etfScore = narrativeScorer.scoreETFLayer(etfNetFlow);
      const macroScore = narrativeScorer.scoreMacroLayer(macroEvents);
      const { combined, signal } = narrativeScorer.generateSignal(narrativeScore, etfScore, macroScore);
      const topHeadlines = sectorHeadlines(headlines, sector)
        .map(h => String(h.title || '').trim())
        .filter(t => t.length > 5);

      return { sector, score_narrative: narrativeScore, score_etf_flow: etfScore, score_macro: macroScore, combined_score: combined, signal, top_headlines: topHeadlines };
    });

    // Generate AI reasoning for ALL sectors in parallel (rate-limited)
    const reasoningResults = await Promise.all(
      sectorScores.map(async (s, i) => {
        await delay(i * 300); // stagger to avoid Groq rate limits
        try {
          const sectorNews = sectorHeadlines(headlines, s.sector);
          const reasoning = await claude.generateNarrativeMemo({
            sector: s.sector,
            headlines: sectorNews,
            etfFlow: etfNetFlow,
            macroEvents,
            scores: { combined: s.combined_score, signal: s.signal }
          });
          return reasoning;
        } catch {
          return `${s.sector} scored ${s.combined_score}/100 (${s.signal}). ETF flow: $${etfNetFlow.toLocaleString()}. Macro context: ${macroEvents.length} upcoming events.`;
        }
      })
    );

    const results = sectorScores.map((s, i) => ({
      ...s,
      reasoning: reasoningResults[i]
    }));

    // Build a top-level summary
    const topSectors = [...results].sort((a, b) => b.combined_score - a.combined_score).slice(0, 3);
    const summary = await claude.generateDailySummary({
      narrativeScores: results,
      alerts: [],
      positions: []
    }).catch(() => `Top sectors: ${topSectors.map(s => `${s.sector} (${s.signal} ${s.combined_score}/100)`).join(', ')}.`);

    const duration = Date.now() - startTime;

    return res.json({
      success: true,
      duration_ms: duration,
      summary,
      sectors: results,
      news_count: headlines.length,
      etf_net_flow: etfNetFlow,
      macro_events_count: macroEvents.length,
      analyzed_at: new Date().toISOString()
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export = router;
