import Groq from 'groq-sdk';
import type { Headline, MacroEvent } from '../types/domain';
import errorUtils = require('../utils/error');

const { getErrorMessage } = errorUtils;

const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const client = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

interface NarrativeMemoInput {
  sector: string;
  headlines: Headline[];
  etfFlow: number;
  macroEvents: MacroEvent[];
  scores: { combined: number; signal: string };
}

interface RiskMemoInput {
  symbol: string;
  leverage: number;
  distancePct: number;
  macroEvents: Array<{ name: string; hoursUntil: number }>;
  riskScore: number;
  riskLevel: string;
}

interface DailySummaryInput {
  narrativeScores: Array<{ sector: string; combined_score?: number; combined?: number; signal: string }>;
  alerts: unknown[];
  positions: unknown[];
}

function fallbackNarrativeMemo({ sector, scores, etfFlow, macroEvents }: { sector: string; scores: { combined: number; signal: string }; etfFlow: number; macroEvents: MacroEvent[] }): string {
  const macro = macroEvents.length ? `Macro is not clear because ${macroEvents[0].name} is on deck.` : 'Macro is relatively calm in the next 48 hours.';
  const flow = etfFlow >= 0 ? 'Institutional flows are supportive.' : 'Institutional flows are defensive.';
  return `${sector} is showing ${scores.signal} because headline density is building and the combined score is ${scores.combined}/100. ${flow} ${macro}`;
}

function fallbackRiskMemo({ symbol, riskLevel, distancePct }: { symbol: string; riskLevel: string; distancePct: number }): string {
  return `${symbol} is ${riskLevel} because liquidation is only ${distancePct.toFixed(2)}% away and the margin buffer is thin. Reduce leverage or add margin now.`;
}

function fallbackDailySummary({ narrativeScores, alerts, positions }: DailySummaryInput): string {
  const top = narrativeScores[0];
  const signalLine = top ? `Top narrative was ${top.sector} at ${top.combined_score ?? top.combined}/100.` : 'No strong narrative signal printed today.';
  return `Market tone was mixed across the latest cycle set. ${signalLine} ${alerts.length} alerts fired while ${positions.length} position snapshots were monitored. Watch the next macro window before adding new risk.`;
}

async function generate(prompt: string, maxTokens: number): Promise<string | null> {
  if (!client) return null;
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.warn(`[Groq] Falling back to local memo: ${getErrorMessage(error)}`);
    return null;
  }
}

const groq = {
  async generateNarrativeMemo({ sector, headlines, etfFlow, macroEvents, scores }: NarrativeMemoInput): Promise<string> {
    const prompt = `You are Sentinel Finance's AI analyst. Write a 2-sentence trading memo.

Sector: ${sector}
Signal: ${scores.signal} (Score: ${scores.combined}/100)
ETF 7-day Net Flow: $${Number(etfFlow || 0).toLocaleString()}
Upcoming Macro Events: ${macroEvents.map(e => e.name).join(', ') || 'None in next 48h'}

Top Headlines:
${headlines.slice(0, 4).map(h => `- ${h.title}`).join('\n')}

Write exactly 2 sentences:
1. Why this sector is showing this signal right now using the actual data
2. What the trader should watch or do

Be direct. Sound like a hedge fund analyst. No fluff.`;

    return (await generate(prompt, 180)) || fallbackNarrativeMemo({ sector, scores, etfFlow, macroEvents });
  },

  async generateRiskMemo({ symbol, leverage, distancePct, macroEvents, riskScore, riskLevel }: RiskMemoInput): Promise<string> {
    const prompt = `You are Sentinel Finance's risk officer. Write a 2-sentence risk warning.

Position: ${symbol} at ${leverage}x leverage
Distance to Liquidation: ${distancePct.toFixed(2)}%
Risk Score: ${riskScore}/100 - ${riskLevel}
Upcoming Events: ${macroEvents.map(e => `${e.name} in ${e.hoursUntil.toFixed(1)}h`).join(', ') || 'None imminent'}

Write exactly 2 sentences:
1. What specifically makes this position dangerous right now
2. The single most important action to take

Be blunt. This person could lose real money. No hedging.`;

    return (await generate(prompt, 160)) || fallbackRiskMemo({ symbol, riskLevel, distancePct });
  },

  async generateDailySummary({ narrativeScores, alerts, positions }: DailySummaryInput): Promise<string> {
    const prompt = `You are Sentinel Finance's AI. Write a 3-sentence daily market brief.

Top Signals Today: ${narrativeScores.slice(0, 3).map(s => `${s.sector}: ${s.combined_score ?? s.combined}/100 (${s.signal})`).join(', ') || 'No strong signals'}
Alerts Fired: ${alerts.length}
Positions Monitored: ${positions.length}

Write 3 sentences covering:
1. Overall market narrative today
2. Biggest risk or opportunity
3. What to watch tomorrow

Sound like a hedge fund morning note. Professional and direct.`;

    return (await generate(prompt, 220)) || fallbackDailySummary({ narrativeScores, alerts, positions });
  }
};

export = groq;
