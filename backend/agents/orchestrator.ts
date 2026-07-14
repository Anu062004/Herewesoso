import type { NarrativeScoreRow, PositionRiskSnapshot } from '../types/domain';

import narrativeAgent = require('./narrativeAgent');
import shieldAgent = require('./shieldAgent');
import ai = require('../services/ai');
import telegram = require('../services/telegram');
import supabaseService = require('../services/supabase');
import runtimeStatus = require('../services/runtimeStatus');
import errorUtils = require('../utils/error');
import performanceService = require('../services/performance');
import outcomeResolver = require('../services/outcomeResolver');
import systemLease = require('../services/systemLease');

const { runNarrativeAgent } = narrativeAgent;
const { runShieldAgent } = shieldAgent;
const { safeSelect, createAgentRun, completeAgentRun, failAgentRun } = supabaseService;
const { recordAgentRun, updateAgentRun } = runtimeStatus;
const { getErrorMessage } = errorUtils;

const configuredCycleMs = Number.parseInt(process.env.CYCLE_INTERVAL_MS || '1800000', 10);
const CYCLE_MS = Number.isFinite(configuredCycleMs) && configuredCycleMs >= 60_000 ? configuredCycleMs : 1_800_000;

let cycleInFlight = false;
let lastDailySummaryKey: string | null = null;
let cycleTimer: ReturnType<typeof setInterval> | null = null;
let dailyTimer: ReturnType<typeof setInterval> | null = null;

async function runFullCycle() {
  if (cycleInFlight) {
    console.log('[Orchestrator] Cycle skipped because a previous cycle is still running.');
    return { success: false, skipped: true };
  }

  let leaseOwner: string | null = null;
  try {
    leaseOwner = await systemLease.acquireLease('orchestrator-cycle', Math.max(CYCLE_MS, 10 * 60 * 1000));
  } catch (error) {
    console.error('[Orchestrator] Could not acquire cycle lease:', getErrorMessage(error));
    return { success: false, skipped: true, error: 'Cycle coordination is temporarily unavailable.' };
  }
  if (!leaseOwner) return { success: false, skipped: true };

  cycleInFlight = true;
  const cycleStart = Date.now();
  let runRecord: Awaited<ReturnType<typeof createAgentRun>> = null;

  try {
    runRecord = await createAgentRun('orchestrator');
    recordAgentRun({
      id: runRecord?.id,
      agent: 'orchestrator',
      status: 'running',
      created_at: new Date(cycleStart).toISOString()
    });
    console.log(`\n[Orchestrator] ===== CYCLE START ${new Date().toISOString()} =====`);
    const [narrativeResult, shieldResult] = await Promise.all([runNarrativeAgent(), runShieldAgent()]);
    if (!narrativeResult.success || !shieldResult.success) {
      throw new Error(`Agent cycle failed: narrative=${narrativeResult.error || narrativeResult.success}, shield=${shieldResult.error || shieldResult.success}`);
    }
    const outcomeResult = await outcomeResolver.resolvePendingSignalOutcomes();
    await performanceService.recordPerformanceSnapshot();
    const duration = Date.now() - cycleStart;

    await completeAgentRun(runRecord?.id, {
      duration_ms: duration,
      summary: {
        narrativeSuccess: narrativeResult.success,
        shieldSuccess: shieldResult.success,
        outcomesReady: outcomeResult.ready,
        outcomesUpdated: outcomeResult.updated,
        topSignal: narrativeResult.strongSignals?.[0]?.sector || null,
        positionsMonitored: shieldResult.positionsMonitored || 0
      }
    });
    updateAgentRun({
      id: runRecord?.id,
      status: 'completed',
      duration_ms: duration,
      summary: {
        narrativeSuccess: narrativeResult.success,
        shieldSuccess: shieldResult.success,
        outcomesReady: outcomeResult.ready,
        outcomesUpdated: outcomeResult.updated,
        topSignal: narrativeResult.strongSignals?.[0]?.sector || null,
        positionsMonitored: shieldResult.positionsMonitored || 0
      }
    });

    console.log(`[Orchestrator] ===== CYCLE DONE in ${duration}ms =====\n`);

    return {
      success: true,
      narrativeResult,
      shieldResult,
      outcomeResult
    };
  } catch (error) {
    await failAgentRun(runRecord?.id, getErrorMessage(error), {
      duration_ms: Date.now() - cycleStart
    });
    updateAgentRun({
      id: runRecord?.id,
      status: 'failed',
      duration_ms: Date.now() - cycleStart,
      error: getErrorMessage(error)
    });

    console.error('[Orchestrator] Fatal cycle error:', getErrorMessage(error));
    return { success: false, error: 'The agent cycle failed. Check the server logs for the request details.' };
  } finally {
    cycleInFlight = false;
    if (leaseOwner) {
      try { await systemLease.releaseLease('orchestrator-cycle', leaseOwner); } catch (error) {
        console.error('[Orchestrator] Could not release cycle lease:', getErrorMessage(error));
      }
    }
  }
}

function shouldSendDailySummary(now: Date): boolean {
  const key = now.toISOString().split('T')[0];
  const hour = Number.parseInt(process.env.DAILY_SUMMARY_UTC_HOUR || '8', 10);
  const withinWindow = now.getUTCHours() === hour && now.getUTCMinutes() <= 5;
  return withinWindow && lastDailySummaryKey !== key;
}

async function runDailySummary(force = false) {
  const now = new Date();
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    return { skipped: true, reason: 'Telegram is not configured.' };
  }
  if (!force && !shouldSendDailySummary(now)) {
    return { skipped: true };
  }

  const summaryKey = now.toISOString().split('T')[0];
  let leaseOwner: string | null = null;
  try {
    leaseOwner = await systemLease.acquireLease(`daily-summary:${summaryKey}`, 36 * 60 * 60 * 1000);
    if (!leaseOwner) return { skipped: true };
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    const [scoreResult, alertResult, positionResult] = await Promise.all([
      safeSelect<NarrativeScoreRow>('narrative_scores', (query: any) =>
        query.gte('created_at', yesterday).order('combined_score', { ascending: false }).limit(3)
      ),
      safeSelect('alerts', (query: any) => query.gte('created_at', yesterday)),
      safeSelect<PositionRiskSnapshot>('position_risks', (query: any) => query.gte('created_at', yesterday))
    ]);
    if (scoreResult.error || alertResult.error || positionResult.error) {
      throw new Error('Daily summary storage query failed.');
    }
    const scores = scoreResult.data;
    const alerts = alertResult.data;
    const positions = positionResult.data;

    const memo = await ai.generateDailySummary({
      narrativeScores: scores || [],
      alerts: alerts || [],
      positions: positions || []
    });

    const delivery = await telegram.sendDailySummary({
      topSignal: scores?.[0] ? `${scores[0].sector} (${scores[0].signal})` : 'No strong signals',
      positionsMonitored: new Set((positions || []).map((position) => position.symbol)).size,
      alertsSent: alerts?.length || 0,
      claudeMemo: memo
    });
    if (!delivery.telegramSent) throw new Error('Telegram did not accept the daily summary.');

    lastDailySummaryKey = now.toISOString().split('T')[0];
    console.log('[Orchestrator] Daily summary sent.');
    return { success: true };
  } catch (error) {
    if (leaseOwner) {
      try { await systemLease.releaseLease(`daily-summary:${summaryKey}`, leaseOwner); } catch {}
    }
    console.error('[Orchestrator] Daily summary error:', getErrorMessage(error));
    return { success: false, error: 'The daily summary failed. Check the server logs for details.' };
  }
}

function startScheduler() {
  if (cycleTimer || dailyTimer) return;
  console.log(`[Orchestrator] Starting. Cycle interval: ${CYCLE_MS / 60000} minutes`);
  void runFullCycle();
  cycleTimer = setInterval(() => void runFullCycle(), CYCLE_MS);
  dailyTimer = setInterval(() => void runDailySummary(), 5 * 60 * 1000);
}

function stopScheduler() {
  if (cycleTimer) clearInterval(cycleTimer);
  if (dailyTimer) clearInterval(dailyTimer);
  cycleTimer = null;
  dailyTimer = null;
}

export = { startScheduler, stopScheduler, runFullCycle, runDailySummary };
