import type { Headline, SignalType } from '../types/domain';

export type NarrativeStage = 'EMERGING' | 'ACCELERATING' | 'ESTABLISHED' | 'CROWDED' | 'FADING' | 'REVERSING';

export interface MarketConfirmation {
  score: number;
  return6h: number;
  return24h: number;
  volumeRatio: number;
  available: boolean;
  fundingRate?: number;
}

export interface NarrativeEvidence {
  matchedHeadlines: Array<{ title: string; source: string; publishedAt: string | null; catalyst: string; sentiment: number }>;
  uniqueSources: string[];
  leadingAssets: string[];
  primaryCatalyst: string;
  invalidation: string;
  counts: { hour1: number; hours6: number; hours24: number };
  modelVersion: string;
}

export interface NarrativeAnalysis {
  sector: string;
  subNarrative: string;
  lifecycleStage: NarrativeStage;
  opportunityScore: number;
  confidence: number;
  attentionScore: number;
  velocityScore: number;
  accelerationScore: number;
  sourceBreadthScore: number;
  sourceQualityScore: number;
  catalystScore: number;
  sentimentScore: number;
  noveltyScore: number;
  marketConfirmationScore: number;
  crowdingScore: number;
  contradictionScore: number;
  legacySignal: SignalType;
  evidence: NarrativeEvidence;
}

interface TaxonomyEntry {
  terms: string[];
  subNarratives: Record<string, string[]>;
  assets: string[];
}

export const NARRATIVE_MODEL_VERSION = 'narrative-v2.0.0';

export const NARRATIVE_TAXONOMY: Record<string, TaxonomyEntry> = {
  DeFi: {
    terms: ['defi', 'decentralized finance', 'dex', 'lending', 'liquidity', 'yield', 'restaking', 'stablecoin'],
    subNarratives: { Lending: ['lending', 'borrow'], DEX: ['dex', 'amm', 'swap'], Restaking: ['restaking'], Stablecoins: ['stablecoin'] },
    assets: ['UNI-USD', 'AAVE-USD', 'LDO-USD']
  },
  AI: {
    terms: ['crypto ai', 'ai token', 'artificial intelligence', 'ai agent', 'decentralized compute', 'machine learning'],
    subNarratives: { 'AI Agents': ['ai agent', 'agentic'], Compute: ['decentralized compute', 'gpu', 'render'], Data: ['ai data', 'data network'] },
    assets: ['RENDER-USD', 'FET-USD', 'TAO-USD']
  },
  RWA: {
    terms: ['rwa', 'real world asset', 'tokenized asset', 'tokenized treasury', 'tokenized bond'],
    subNarratives: { Treasuries: ['treasury', 'bond'], 'Tokenized Assets': ['tokenized asset', 'real world asset'] },
    assets: ['ONDO-USD', 'MKR-USD', 'LINK-USD']
  },
  L1: {
    terms: ['layer 1', 'bitcoin', 'ethereum', 'solana', 'avalanche', 'validator', 'mainnet upgrade'],
    subNarratives: { Bitcoin: ['bitcoin'], Ethereum: ['ethereum'], Solana: ['solana'], 'New L1': ['layer 1', 'mainnet'] },
    assets: ['BTC-USD', 'ETH-USD', 'SOL-USD']
  },
  L2: {
    terms: ['layer 2', 'rollup', 'arbitrum', 'optimism', 'base network', 'zk rollup', 'polygon scaling'],
    subNarratives: { Optimistic: ['arbitrum', 'optimism'], ZK: ['zk rollup', 'zero knowledge'], Base: ['base network'] },
    assets: ['ARB-USD', 'OP-USD', 'POL-USD']
  },
  GameFi: {
    terms: ['gamefi', 'blockchain game', 'web3 game', 'play to earn', 'gaming token', 'gaming nft'],
    subNarratives: { Gaming: ['blockchain game', 'web3 game'], Metaverse: ['metaverse'], 'Play to Earn': ['play to earn'] },
    assets: ['IMX-USD', 'GALA-USD', 'RON-USD']
  },
  DePIN: {
    terms: ['depin', 'decentralized physical infrastructure', 'physical infrastructure network', 'wireless network token'],
    subNarratives: { Compute: ['decentralized compute', 'gpu network'], Wireless: ['wireless network', 'helium'], Storage: ['decentralized storage'] },
    assets: ['FIL-USD', 'HNT-USD', 'RENDER-USD']
  },
  Meme: {
    terms: ['meme coin', 'memecoin', 'dogecoin', 'shiba inu', 'pepe token', 'viral token'],
    subNarratives: { Established: ['dogecoin', 'shiba inu'], Emerging: ['new memecoin', 'viral token'] },
    assets: ['DOGE-USD', 'SHIB-USD', 'PEPE-USD']
  }
};

const POSITIVE = ['launch', 'approval', 'adoption', 'partnership', 'integration', 'upgrade', 'growth', 'record', 'funding', 'listing', 'inflow', 'surge'];
const NEGATIVE = ['hack', 'exploit', 'lawsuit', 'ban', 'outflow', 'decline', 'collapse', 'delay', 'fraud', 'selloff', 'breach'];
const QUALITY_SOURCES = ['reuters', 'bloomberg', 'coindesk', 'the block', 'cointelegraph', 'sosovalue', 'official', 'foundation', 'blog'];
const CATALYSTS: Array<[string, string[], number]> = [
  ['Security incident', ['hack', 'exploit', 'breach'], 85],
  ['Regulation', ['sec', 'regulation', 'approval', 'lawsuit'], 90],
  ['Protocol launch', ['launch', 'mainnet', 'upgrade'], 85],
  ['Listing', ['listing', 'listed'], 70],
  ['Partnership', ['partnership', 'integration'], 65],
  ['Funding', ['funding round', 'raises', 'investment'], 60],
  ['Adoption', ['adoption', 'institutional', 'users'], 75]
];

function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }

function textOf(headline: Headline): string {
  return [headline.title, headline.summary, headline.content].filter(Boolean).join(' ').toLowerCase();
}

function titleOf(headline: Headline): string { return String(headline.title || headline.summary || '').trim(); }

function sourceOf(headline: Headline): string {
  const row = headline as Record<string, unknown>;
  return String(row.source || row.author || row.publisher || row.nick_name || 'Unknown').trim();
}

function timestampOf(headline: Headline): number {
  const row = headline as Record<string, unknown>;
  const raw = row.publishedAt || row.published_at || row.publish_time || row.created_at || row.timestamp || row.time;
  if (typeof raw === 'number') return raw < 10_000_000_000 ? raw * 1000 : raw;
  const parsed = new Date(String(raw || '')).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function fingerprint(headline: Headline): string {
  return titleOf(headline).toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((word) => word.length > 2).slice(0, 12).sort().join(' ');
}

export function deduplicateHeadlines(headlines: Headline[]): Headline[] {
  const seen = new Set<string>();
  return headlines.filter((headline) => {
    const key = fingerprint(headline);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sentiment(text: string): number {
  const positive = POSITIVE.filter((term) => text.includes(term)).length;
  const negative = NEGATIVE.filter((term) => text.includes(term)).length;
  if (!positive && !negative) return 0;
  return (positive - negative) / (positive + negative);
}

function catalyst(text: string): { label: string; score: number } {
  for (const [label, terms, score] of CATALYSTS) if (terms.some((term) => text.includes(term))) return { label, score };
  return { label: 'Organic attention', score: 40 };
}

function matchingSubNarrative(text: string, entry: TaxonomyEntry): string {
  let best = 'General';
  let matches = 0;
  for (const [name, terms] of Object.entries(entry.subNarratives)) {
    const count = terms.filter((term) => text.includes(term)).length;
    if (count > matches) { matches = count; best = name; }
  }
  return best;
}

function legacySignal(score: number, stage: NarrativeStage): SignalType {
  if (stage === 'REVERSING') return 'AVOID';
  if (stage === 'FADING') return 'NEUTRAL';
  if (score >= 78 && stage !== 'CROWDED') return 'STRONG_BUY';
  if (score >= 62 && stage !== 'CROWDED') return 'BUY';
  if (score >= 45) return 'WATCH';
  return 'NEUTRAL';
}

export function analyzeNarrative(
  headlines: Headline[],
  sector: string,
  market: MarketConfirmation = { score: 50, return6h: 0, return24h: 0, volumeRatio: 1, available: false },
  now = Date.now()
): NarrativeAnalysis {
  const entry = NARRATIVE_TAXONOMY[sector] || { terms: [sector.toLowerCase()], subNarratives: {}, assets: [] };
  const unique = deduplicateHeadlines(headlines);
  const relevant = unique.filter((headline) => entry.terms.some((term) => textOf(headline).includes(term)));
  const hour = 60 * 60 * 1000;
  const count = (hours: number) => relevant.filter((headline) => now - timestampOf(headline) <= hours * hour).length;
  const hour1 = count(1);
  const hours6 = count(6);
  const hours24 = count(24);
  const previousHourly = Math.max((hours6 - hour1) / 5, 0.25);
  const baselineHourly = Math.max((hours24 - hours6) / 18, 0.25);
  const velocityScore = clamp(50 + ((hour1 / baselineHourly) - 1) * 25);
  const accelerationScore = clamp(50 + ((hour1 / previousHourly) - 1) * 25);
  const attentionScore = clamp((hours24 / Math.max(unique.length, 1)) * 260);
  const sources = [...new Set(relevant.map(sourceOf).filter(Boolean))];
  const sourceBreadthScore = clamp(sources.length * 14);
  const sourceQualityScore = relevant.length
    ? clamp(relevant.reduce((sum, headline) => sum + (QUALITY_SOURCES.some((source) => sourceOf(headline).toLowerCase().includes(source)) ? 90 : 55), 0) / relevant.length)
    : 0;
  const sentiments = relevant.map((headline) => sentiment(textOf(headline)));
  const averageSentiment = sentiments.length ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length : 0;
  const sentimentScore = clamp(50 + averageSentiment * 50);
  const contradictionScore = clamp((sentiments.filter((value) => value < 0).length / Math.max(sentiments.length, 1)) * 100);
  const catalysts = relevant.map((headline) => catalyst(textOf(headline)));
  const strongestCatalyst = catalysts.sort((a, b) => b.score - a.score)[0] || { label: 'No catalyst', score: 0 };
  const catalystScore = strongestCatalyst.score;
  const subNarrativeCounts = relevant.map((headline) => matchingSubNarrative(textOf(headline), entry));
  const subNarrative = [...new Set(subNarrativeCounts)].sort((a, b) => subNarrativeCounts.filter((x) => x === b).length - subNarrativeCounts.filter((x) => x === a).length)[0] || 'General';
  const noveltyScore = clamp(100 - Math.max(0, hours24 - sources.length) * 7);
  const crowdingScore = clamp(Math.max(0, velocityScore - 65) * 0.7 + Math.max(0, market.return24h - 5) * 5 + Math.max(0, market.volumeRatio - 2) * 12 + Math.abs(market.fundingRate || 0) * 1000);
  const freshness = relevant.length ? relevant.reduce((sum, headline) => sum + Math.exp(-Math.max(0, now - timestampOf(headline)) / (6 * hour)), 0) / relevant.length : 0;
  const confidence = clamp(relevant.length * 8 + sources.length * 7 + freshness * 25 + (market.available ? 15 : 0) - contradictionScore * 0.25);
  const opportunityScore = clamp(
    velocityScore * 0.2 + accelerationScore * 0.15 + sourceBreadthScore * 0.15 + sourceQualityScore * 0.1 +
    catalystScore * 0.1 + sentimentScore * 0.1 + market.score * 0.2 - crowdingScore * 0.18 - contradictionScore * 0.15
  );
  let lifecycleStage: NarrativeStage = 'ESTABLISHED';
  if (averageSentiment < -0.3 && accelerationScore < 45) lifecycleStage = 'REVERSING';
  else if (crowdingScore >= 65) lifecycleStage = 'CROWDED';
  else if (velocityScore >= 65 && accelerationScore >= 65) lifecycleStage = hours24 <= 4 ? 'EMERGING' : 'ACCELERATING';
  else if (velocityScore < 40 || accelerationScore < 35) lifecycleStage = 'FADING';
  else if (hours24 <= 3 && accelerationScore >= 55) lifecycleStage = 'EMERGING';

  return {
    sector, subNarrative, lifecycleStage, opportunityScore, confidence, attentionScore, velocityScore, accelerationScore,
    sourceBreadthScore, sourceQualityScore, catalystScore, sentimentScore, noveltyScore,
    marketConfirmationScore: market.score, crowdingScore, contradictionScore,
    legacySignal: legacySignal(opportunityScore, lifecycleStage),
    evidence: {
      matchedHeadlines: relevant.slice(0, 10).map((headline) => ({
        title: titleOf(headline), source: sourceOf(headline),
        publishedAt: new Date(timestampOf(headline)).toISOString(), catalyst: catalyst(textOf(headline)).label,
        sentiment: sentiment(textOf(headline))
      })),
      uniqueSources: sources, leadingAssets: entry.assets, primaryCatalyst: strongestCatalyst.label,
      invalidation: 'Velocity below baseline for 6 hours or market confirmation below 35.',
      counts: { hour1, hours6, hours24 }, modelVersion: NARRATIVE_MODEL_VERSION
    }
  };
}

export function assetsForSector(sector: string): string[] { return NARRATIVE_TAXONOMY[sector]?.assets || []; }
