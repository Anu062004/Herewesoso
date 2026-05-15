import axios from 'axios';
import type { Headline, MacroEvent } from '../types/domain';
import errorUtils = require('../utils/error');

const { getErrorMessage } = errorUtils;

const XAI_BASE = 'https://api.x.ai/v1';
const MODEL = process.env.XAI_MODEL || 'grok-3';

interface NarrativeMemoInput {
  sector: string;
  headlines: Headline[];
  etfFlow: number;
  macroEvents: MacroEvent[];
  scores: { combined: number; signal: string };
}

interface RiskMemoInput {
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
}

interface DailySummaryInput {
  narrativeScores: Array<{ sector: string; combined_score?: number; combined?: number; signal: string }>;
  alerts: unknown[];
  positions: unknown[];
}

function fallbackNarrativeMemo({ sector, scores, etfFlow, macroEvents }: { sector: string; scores: { combined: number; signal: string }; etfFlow: number; macroEvents: MacroEvent[] }): string {
  const macro = macroEvents.length ? `${macroEvents[0].name} is on the calendar.` : 'Macro is calm in the next 48h.';
  const flow = etfFlow >= 0 ? 'Institutional flows are supportive.' : 'Institutional flows are defensive.';
  return `${sector} shows ${scores.signal} with a combined score of ${scores.combined}/100. ${flow} ${macro}`;
}

function fallbackRiskMemo({ symbol, riskLevel, distancePct }: { symbol: string; riskLevel: string; distancePct: number }): string {
  return `${symbol} is at ${riskLevel} risk — liquidation is ${distancePct.toFixed(2)}% away. Reduce leverage or add margin immediately.`;
}

function fallbackDailySummary({ narrativeScores, alerts, positions }: DailySummaryInput): string {
  const top = narrativeScores[0];
  const signalLine = top ? `Top signal: ${top.sector} at ${top.combined_score ?? top.combined}/100.` : 'No dominant narrative today.';
  return `${signalLine} ${alerts.length} alerts fired. ${positions.length} positions monitored. Stay cautious ahead of the next macro window.`;
}

async function generate(prompt: string, maxTokens: number): Promise<string | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await axios.post(
      `${XAI_BASE}/chat/completions`,
      {
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.65
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    return res.data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.warn(`[Grok/xAI] Falling back to local memo: ${getErrorMessage(error)}`);
    return null;
  }
}

const grok = {
  async generateNarrativeMemo({ sector, headlines, etfFlow, macroEvents, scores }: NarrativeMemoInput): Promise<string> {
    const prompt = `You are Sentinel Finance's AI analyst. Write a 2-sentence trading memo.

Sector: ${sector}
Signal: ${scores.signal} (Score: ${scores.combined}/100)
ETF 7-day Net Flow: $${Number(etfFlow || 0).toLocaleString()}
Upcoming Macro Events: ${macroEvents.map(e => e.name).join(', ') || 'None in next 48h'}

Top Headlines:
${headlines.slice(0, 4).map(h => `- ${h.title}`).join('\n')}

Instructions:
- Write exactly 2 sentences
- Sentence 1: Why this specific sector shows this signal right now, using actual data above
- Sentence 2: Precise action the trader should take
- Be direct, concise, hedge-fund style — no filler phrases
- Do not repeat generic market commentary that would apply to multiple sectors`;

    return (await generate(prompt, 200)) || fallbackNarrativeMemo({ sector, scores, etfFlow, macroEvents });
  },

  async generateRiskMemo(input: RiskMemoInput): Promise<string> {
    const {
      symbol, side, leverage, entryPrice, markPrice, positionSize, positionValue,
      distancePct, macroEvents, riskScore, riskLevel,
      accountValue, availableMargin, etfOutflow
    } = input;

    const direction = side === 'SHORT' ? 'SHORT' : 'LONG';
    const liqApprox = markPrice && distancePct
      ? (direction === 'SHORT'
          ? markPrice * (1 + distancePct / 100)
          : markPrice * (1 - distancePct / 100))
      : null;
    const marginNeededToHalveDist = availableMargin && positionValue
      ? Math.min(availableMargin * 0.5, positionValue * 0.05)
      : null;

    const prompt = `You are Sentinel Finance's risk officer analyzing a leveraged perp position. Output EXACTLY 4 numbered lines — no headers, no labels, no extra text.

POSITION DATA:
Symbol: ${symbol} ${direction} at ${leverage}x leverage
Entry Price: ${entryPrice ? `$${entryPrice.toLocaleString()}` : 'unknown'}
Mark Price: ${markPrice ? `$${markPrice.toLocaleString()}` : 'unknown'}
Position Size: ${positionSize ?? 'unknown'} ${symbol.split('-')[0]}
Position Value: ${positionValue ? `$${positionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'unknown'}
Distance to Liquidation: ${distancePct.toFixed(2)}%${liqApprox ? ` (approx liq at $${liqApprox.toLocaleString(undefined, { maximumFractionDigits: 0 })})` : ''}
Risk Score: ${riskScore}/100 — ${riskLevel}
Account Value: ${accountValue ? `$${accountValue.toLocaleString()}` : 'unknown'}
Available Margin: ${availableMargin ? `$${availableMargin.toLocaleString()}` : 'unknown'}
ETF Outflows Active: ${etfOutflow ? 'YES — institutional selling pressure' : 'No'}
Upcoming Events: ${macroEvents.map(e => `${e.name} in ${e.hoursUntil.toFixed(1)}h`).join(', ') || 'None imminent'}

Rules:
1. [Assessment] One sentence: why THIS specific position is at risk right now, using the actual numbers above.
2. [Do this first] The single most effective immediate action with a SPECIFIC dollar amount or price — e.g. "Add $${marginNeededToHalveDist ? marginNeededToHalveDist.toFixed(0) : '500'} margin to push liquidation from $${liqApprox ? liqApprox.toFixed(0) : '...'} to a safer level" or "Close 30% of position to drop leverage from ${leverage}x to ${Math.round(leverage * 0.7)}x".
3. [Stop-loss] A specific price level to exit if the move goes against you, with one-line reasoning.
4. [If no action] What happens at current trajectory — specific price and rough timeframe.

Be blunt. Use the actual numbers. Sound like a hedge fund risk desk.`;

    return (await generate(prompt, 320)) || fallbackRiskMemo(input);
  },

  async generateDailySummary({ narrativeScores, alerts, positions }: DailySummaryInput): Promise<string> {
    const top3 = narrativeScores.slice(0, 3);
    const prompt = `You are Sentinel Finance's AI. Write a 3-sentence daily market brief.

Top Signals: ${top3.map(s => `${s.sector}: ${s.combined_score ?? s.combined}/100 (${s.signal})`).join(', ') || 'No strong signals'}
Alerts Fired: ${alerts.length}
Positions Monitored: ${positions.length}

Instructions:
- Write exactly 3 sentences
- Sentence 1: Overall market narrative today (specific, not generic)
- Sentence 2: The single biggest risk or opportunity identified
- Sentence 3: What to watch in the next 24h
- Sound like a hedge fund morning note — professional and direct`;

    return (await generate(prompt, 240)) || fallbackDailySummary({ narrativeScores, alerts, positions });
  }
};

export = grok;
