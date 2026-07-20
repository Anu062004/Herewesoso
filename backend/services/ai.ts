import type { Headline, MacroEvent } from '../types/domain';
import claude = require('./claude');
import gemini = require('./gemini');
import groq = require('./groq');
import grok = require('./grok');
import skillmint = require('./skillmint');

interface AiService {
  generateNarrativeMemo(input: {
    sector: string;
    headlines: Headline[];
    etfFlow: number;
    macroEvents: MacroEvent[];
    scores: { combined: number; signal: string };
  }): Promise<string>;
  generateRiskMemo(input: {
    symbol: string;
    side?: string;
    leverage: number;
    entryPrice?: number;
    markPrice?: number;
    positionSize?: number;
    positionValue?: number;
    distancePct: number;
    macroEvents: Array<{ name: string; hoursUntil: number }>;
    riskScore: number;
    riskLevel: string;
    accountValue?: number;
    availableMargin?: number;
    etfOutflow?: boolean;
  }): Promise<string>;
  generateDailySummary(input: {
    narrativeScores: Array<{ sector: string; combined_score?: number; combined?: number; signal: string }>;
    alerts: unknown[];
    positions: unknown[];
  }): Promise<string>;
  getLastReceipt?(key: string): unknown;
  isReady?(): Promise<boolean>;
}

const service = (process.env.AI_SERVICE || 'groq').trim().toLowerCase();

// Pick the adapter for the current AI_SERVICE setting.
// 'grok' and 'xai' both map to the xAI Grok service.
// Set AI_SERVICE=skillmint to flip onto verifiable TEE execution on 0G.
const ai: AiService = (
  service === 'gemini' ? gemini :
  service === 'groq' ? groq :
  (service === 'grok' || service === 'xai') ? grok :
  service === 'skillmint' ? skillmint :
  claude
) as AiService;

console.log(`[AI] Using ${service.charAt(0).toUpperCase() + service.slice(1)}`);

export = ai;
