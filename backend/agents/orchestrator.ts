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

interface AgentOutcome {
  success: boolean;
  degraded?: boolean;
  warnings?: string[];
  error?: string;
}

interface CycleOptions {
  walletAddress?: string;
  network?: 'testnet' | 'mainnet';
}

function describeCycleOutcome(narrativeResult: AgentOutcome, shieldResult: AgentOutcome) {
  const modules = [
    { name: 'Narrative Scanner', result: narrativeResult },
    { name: 'Liquidation Shield', result: shieldResult }
  ];
  const completed = modules.filter((module) => module.result.success);
  const failed = modules.filter((module) => !module.result.success);
  const warnings = completed.flatMap((module) => module.result.warnings || []);
  const degraded = completed.some((module) => module.result.degraded) || warnings.length > 0;
  const failureText = failed
    .map((module) => `${module.name}: ${module.result.error || 'No error detail was returned.'}`)
    .join(' ');

  if (failed.length === 0) {
    return {
      success: true,
      partial: false,
      degraded,
      message: degraded
        ? `Narrative Scanner and Liquidation Shield completed with limited data. ${warnings.join(' ')}`
        : 'Narrative Scanner and Liquidation Shield completed.'
    };
  }

  if (completed.length > 0) {
    return {
      success: true,
      partial: true,
      degraded,
      message: `${completed.map((module) => module.name).join(' and ')} completed. ${warnings.join(' ')} ${failureText}`.replace(/\s+/g, ' ').trim()
    };
  }

  return {
    success: false,
    partial: false,
    degraded: false,
    error: `The manual run could not complete. ${failureText}`
  };
}

async function runFullCycle(options: CycleOptions = {}) {
  if (cycleInFlight) {
    console.log('[Orchestrator] Cycle skipped because a previous cycle is still running.');
    return { success: false, skipped: true, message: 'A cycle is already running. Refresh the run status shortly.' };
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
    try {
      runRecord = await createAgentRun('orchestrator');
    } catch (error) {
      console.error('[Orchestrator] Run tracking unavailable:', getErrorMessage(error));
    }
    recordAgentRun({
      id: runRecord?.id,
      agent: 'orchestrator',
      status: 'running',
      created_at: new Date(cycleStart).toISOString()
    });
    console.log(`\n[Orchestrator] ===== CYCLE START ${new Date().toISOString()} =====`);
    const [narrativeSettlement, shieldSettlement] = await Promise.allSettled([
      runNarrativeAgent(options.walletAddress),
      runShieldAgent(options.walletAddress, options.network)
    ]);
    const narrativeResult = narrativeSettlement.status === 'fulfilled'
      ? narrativeSettlement.value
      : { success: false, error: getErrorMessage(narrativeSettlement.reason) };
    const shieldResult = shieldSettlement.status === 'fulfilled'
      ? shieldSettlement.value
      : { success: false, error: getErrorMessage(shieldSettlement.reason) };
    const cycleOutcome = describeCycleOutcome(narrativeResult, shieldResult);
    const moduleDuration = Date.now() - cycleStart;

    if (!cycleOutcome.success) {
      try {
        await failAgentRun(runRecord?.id, cycleOutcome.error || 'Both agent modules failed.', {
          duration_ms: moduleDuration,
          summary: {
            narrativeSuccess: false,
            shieldSuccess: false,
            narrativeError: narrativeResult.error || null,
            shieldError: shieldResult.error || null
          }
        });
      } catch (trackingError) {
        console.error('[Orchestrator] Failed to update run tracking:', getErrorMessage(trackingError));
      }
      updateAgentRun({
        id: runRecord?.id,
        status: 'failed',
        duration_ms: moduleDuration,
        error: cycleOutcome.error
      });
      console.error('[Orchestrator] Cycle failed:', cycleOutcome.error);
      return { ...cycleOutcome, narrativeResult, shieldResult };
    }

    const outcomeResult = await outcomeResolver.resolvePendingSignalOutcomes();
    await performanceService.recordPerformanceSnapshot(options.walletAddress);
    const duration = Date.now() - cycleStart;
    const summary = {
      narrativeSuccess: narrativeResult.success,
      shieldSuccess: shieldResult.success,
      narrativeError: narrativeResult.error || null,
      shieldError: shieldResult.error || null,
      dataDegraded: cycleOutcome.degraded,
      outcomesReady: outcomeResult.ready,
      outcomesUpdated: outcomeResult.updated,
      topSignal: narrativeResult.strongSignals?.[0]?.sector || null,
      positionsMonitored: shieldResult.positionsMonitored || 0
    };
    try {
      await completeAgentRun(runRecord?.id, { duration_ms: duration, summary });
    } catch (trackingError) {
      console.error('[Orchestrator] Failed to complete run tracking:', getErrorMessage(trackingError));
    }
    updateAgentRun({
      id: runRecord?.id,
      status: 'completed',
      duration_ms: duration,
      summary
    });

    console.log(`[Orchestrator] ===== CYCLE DONE in ${duration}ms =====\n`);

    return {
      ...cycleOutcome,
      narrativeResult,
      shieldResult,
      outcomeResult
    };
  } catch (error) {
    const errorMessage = `The orchestrator could not complete: ${getErrorMessage(error)}`;
    try {
      await failAgentRun(runRecord?.id, errorMessage, {
        duration_ms: Date.now() - cycleStart
      });
    } catch (trackingError) {
      console.error('[Orchestrator] Failed to update run tracking:', getErrorMessage(trackingError));
    }
    updateAgentRun({
      id: runRecord?.id,
      status: 'failed',
      duration_ms: Date.now() - cycleStart,
      error: errorMessage
    });

    console.error('[Orchestrator] Fatal cycle error:', getErrorMessage(error));
    return { success: false, error: errorMessage };
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

export = { startScheduler, stopScheduler, runFullCycle, runDailySummary, describeCycleOutcome };
