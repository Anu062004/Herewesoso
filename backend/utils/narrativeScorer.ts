import type { Headline, MacroEvent, ScoreBucket, SignalType } from '../types/domain';

const SECTOR_KEYWORDS: Record<string, string[]> = {
  DeFi: ['defi', 'yield', 'liquidity', 'amm', 'protocol', 'tvl'],
  AI: ['ai', 'artificial intelligence', 'agent', 'llm', 'machine learning'],
  RWA: ['rwa', 'real world asset', 'tokenized', 'treasury', 'bond'],
  L1: ['layer 1', 'blockchain', 'consensus', 'validator', 'mainnet'],
  L2: ['layer 2', 'rollup', 'optimism', 'arbitrum', 'scaling'],
  GameFi: ['gaming', 'gamefi', 'play to earn', 'nft game', 'metaverse'],
  DePIN: ['depin', 'physical infrastructure', 'network', 'iot', 'mining'],
  Meme: ['meme', 'dog', 'community', 'viral', 'pump']
};

const HIGH_IMPACT_EVENTS = ['CPI', 'FOMC', 'Fed Rate', 'GDP', 'Jobs', 'NFP'] as const;

const narrativeScorer = {
  scoreNarrativeLayer(headlines: Headline[], sector: string): number {
    if (!Array.isArray(headlines) || headlines.length === 0) {
      return 0;
    }

    const keywords = SECTOR_KEYWORDS[sector] || [sector.toLowerCase()];
    const relevantHeadlines = headlines.filter((headline) => {
      const haystack = [headline?.title, headline?.summary, headline?.content]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return keywords.some((keyword) => haystack.includes(keyword));
    });

    const frequency = Math.min((relevantHeadlines.length / headlines.length) * 100 * 3, 100);
    return Math.round(frequency);
  },

  scoreETFLayer(netInflow7Day: number): number {
    if (netInflow7Day > 500000000) return 95;
    if (netInflow7Day > 100000000) return 80;
    if (netInflow7Day > 10000000) return 65;
    if (netInflow7Day > 0) return 50;
    if (netInflow7Day > -10000000) return 35;
    if (netInflow7Day > -100000000) return 20;
    return 5;
  },

  scoreMacroLayer(upcomingEvents: MacroEvent[]): number {
    const dangerousEvents = (upcomingEvents || []).filter((event) =>
      HIGH_IMPACT_EVENTS.some((marker) => event?.name?.includes(marker))
    );

    if (dangerousEvents.length === 0) return 80;
    if (dangerousEvents.length === 1) return 50;
    return 20;
  },

  generateSignal(narrativeScore: number, etfScore: number, macroScore: number): ScoreBucket {
    const combined = narrativeScore * 0.35 + etfScore * 0.35 + macroScore * 0.3;

    let signal: SignalType = 'AVOID';
    if (combined >= 75) signal = 'STRONG_BUY';
    else if (combined >= 60) signal = 'BUY';
    else if (combined >= 45) signal = 'WATCH';
    else if (combined >= 30) signal = 'NEUTRAL';

    return { combined: Math.round(combined), signal };
  }
};

export = narrativeScorer;
