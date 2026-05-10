import type { NarrativeScoreRow, PositionRiskSnapshot } from '../types/domain';

import narrativeAgent = require('./narrativeAgent');
import shieldAgent = require('./shieldAgent');
import claude = require('../services/ai');
import telegram = require('../services/telegram');
import supabaseService = require('../services/supabase');
import errorUtils = require('../utils/error');

const { runNarrativeAgent } = narrativeAgent;
const { runShieldAgent } = shieldAgent;
const { safeSelect, createAgentRun, completeAgentRun, failAgentRun } = supabaseService;
const { getErrorMessage } = errorUtils;

const CYCLE_MS = Number.parseInt(process.env.CYCLE_INTERVAL_MS || '1800000', 10);

let cycleInFlight = false;
let lastDailySummaryKey: string | null = null;

async function runFullCycle() {
  if (cycleInFlight) {
    console.log('[Orchestrator] Cycle skipped because a previous cycle is still running.');
    return { success: false, skipped: true };
  }

  cycleInFlight = true;
  const cycleStart = Date.now();
  const runRecord = await createAgentRun('orchestrator');

  console.log(`\n[Orchestrator] ===== CYCLE START ${new Date().toISOString()} =====`);

  try {
    const narrativeResult = await runNarrativeAgent();
    const shieldResult = await runShieldAgent();
    const duration = Date.now() - cycleStart;

    await completeAgentRun(runRecord?.id, {
      duration_ms: duration,
      summary: {
        narrativeSuccess: narrativeResult.success,
        shieldSuccess: shieldResult.success,
        topSignal: narrativeResult.strongSignals?.[0]?.sector || null,
        positionsMonitored: shieldResult.positionsMonitored || 0
      }
    });

    console.log(`[Orchestrator] ===== CYCLE DONE in ${duration}ms =====\n`);

    return {
      success: true,
      narrativeResult,
      shieldResult
    };
  } catch (error) {
    await failAgentRun(runRecord?.id, getErrorMessage(error), {
      duration_ms: Date.now() - cycleStart
    });

    console.error('[Orchestrator] Fatal cycle error:', getErrorMessage(error));
    return { success: false, error: getErrorMessage(error) };
  } finally {
    cycleInFlight = false;
  }
}

function shouldSendDailySummary(now: Date): boolean {
  const key = now.toISOString().split('T')[0];
  const withinWindow = now.getHours() === 8 && now.getMinutes() <= 5;
  return withinWindow && lastDailySummaryKey !== key;
}

async function runDailySummary() {
  const now = new Date();
  if (!shouldSendDailySummary(now)) {
    return { skipped: true };
  }

  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    const [{ data: scores }, { data: alerts }, { data: positions }] = await Promise.all([
      safeSelect<NarrativeScoreRow>('narrative_scores', (query: any) =>
        query.gte('created_at', yesterday).order('combined_score', { ascending: false }).limit(3)
      ),
      safeSelect('alerts', (query: any) => query.gte('created_at', yesterday)),
      safeSelect<PositionRiskSnapshot>('position_risks', (query: any) => query.gte('created_at', yesterday))
    ]);

    const memo = await claude.generateDailySummary({
      narrativeScores: scores || [],
      alerts: alerts || [],
      positions: positions || []
    });

    await telegram.sendDailySummary({
      topSignal: scores?.[0] ? `${scores[0].sector} (${scores[0].signal})` : 'No strong signals',
      positionsMonitored: new Set((positions || []).map((position) => position.symbol)).size,
      alertsSent: alerts?.length || 0,
      claudeMemo: memo
    });

    lastDailySummaryKey = now.toISOString().split('T')[0];
    console.log('[Orchestrator] Daily summary sent.');
    return { success: true };
  } catch (error) {
    console.error('[Orchestrator] Daily summary error:', getErrorMessage(error));
    return { success: false, error: getErrorMessage(error) };
  }
}

function startScheduler() {
  console.log(`[Orchestrator] Starting. Cycle interval: ${CYCLE_MS / 60000} minutes`);
  void runFullCycle();
  setInterval(() => void runFullCycle(), CYCLE_MS);
  setInterval(() => void runDailySummary(), 5 * 60 * 1000);
}

export = { startScheduler, runFullCycle, runDailySummary };
