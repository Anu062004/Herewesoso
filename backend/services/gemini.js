const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const client = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

function fallbackNarrativeMemo({ sector, scores, etfFlow, macroEvents }) {
  const macroSummary = macroEvents.length
    ? `Macro is not clear because ${macroEvents[0].name} is on deck.`
    : 'Macro is relatively calm in the next 48 hours.';
  const flowDirection = etfFlow >= 0 ? 'Institutional flows are supportive.' : 'Institutional flows are defensive.';
  return `${sector} is showing ${scores.signal} because headline density is building and the combined score is ${scores.combined}/100. ${flowDirection} ${macroSummary}`;
}

function fallbackRiskMemo({ symbol, riskLevel, distancePct }) {
  return `${symbol} is ${riskLevel} because liquidation is only ${distancePct.toFixed(2)}% away and the margin buffer is thin. Reduce leverage or add margin now.`;
}

function fallbackDailySummary({ narrativeScores, alerts, positions }) {
  const topSignal = narrativeScores[0];
  const signalLine = topSignal
    ? `Top narrative was ${topSignal.sector} at ${topSignal.combined_score || topSignal.combined}/100.`
    : 'No strong narrative signal printed today.';
  return `Market tone was mixed across the latest cycle set. ${signalLine} ${alerts.length} alerts fired while ${positions.length} position snapshots were monitored. Watch the next macro window before adding new risk.`;
}

async function generate(prompt, maxTokens) {
  if (!client) return null;
  try {
    const model = client.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens }
    });
    return result.response.text().trim() || null;
  } catch (error) {
    console.warn(`[Gemini] Falling back to local memo: ${error.message}`);
    return null;
  }
}

const gemini = {
  async generateNarrativeMemo({ sector, headlines, etfFlow, macroEvents, scores }) {
    const prompt = `You are Sentinel Finance's AI analyst. Write a 2-sentence trading memo.

Sector: ${sector}
Signal: ${scores.signal} (Score: ${scores.combined}/100)
ETF 7-day Net Flow: $${Number(etfFlow || 0).toLocaleString()}
Upcoming Macro Events: ${macroEvents.map((e) => e.name).join(', ') || 'None in next 48h'}

Top Headlines:
${headlines.slice(0, 4).map((h) => `- ${h.title}`).join('\n')}

Write exactly 2 sentences:
1. Why this sector is showing this signal right now using the actual data
2. What the trader should watch or do

Be direct. Sound like a hedge fund analyst. No fluff.`;

    return (
      (await generate(prompt, 180)) ||
      fallbackNarrativeMemo({ sector, scores, etfFlow, macroEvents })
    );
  },

  async generateRiskMemo({ symbol, leverage, distancePct, macroEvents, riskScore, riskLevel }) {
    const prompt = `You are Sentinel Finance's risk officer. Write a 2-sentence risk warning.

Position: ${symbol} at ${leverage}x leverage
Distance to Liquidation: ${distancePct.toFixed(2)}%
Risk Score: ${riskScore}/100 - ${riskLevel}
Upcoming Events: ${macroEvents.map((e) => `${e.name} in ${e.hoursUntil.toFixed(1)}h`).join(', ') || 'None imminent'}

Write exactly 2 sentences:
1. What specifically makes this position dangerous right now
2. The single most important action to take

Be blunt. This person could lose real money. No hedging.`;

    return (
      (await generate(prompt, 160)) ||
      fallbackRiskMemo({ symbol, riskLevel, distancePct })
    );
  },

  async generateDailySummary({ narrativeScores, alerts, positions }) {
    const prompt = `You are Sentinel Finance's AI. Write a 3-sentence daily market brief.

Top Signals Today: ${narrativeScores.slice(0, 3).map((s) => `${s.sector}: ${(s.combined_score ?? s.combined)}/100 (${s.signal})`).join(', ') || 'No strong signals'}
Alerts Fired: ${alerts.length}
Positions Monitored: ${positions.length}

Write 3 sentences covering:
1. Overall market narrative today
2. Biggest risk or opportunity
3. What to watch tomorrow

Sound like a hedge fund morning note. Professional and direct.`;

    return (
      (await generate(prompt, 220)) ||
      fallbackDailySummary({ narrativeScores, alerts, positions })
    );
  }
};

module.exports = gemini;
