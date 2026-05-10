const { runNarrativeAgent } = require('./narrativeAgent');
const { runShieldAgent } = require('./shieldAgent');
const claude = require('../services/claude');
const telegram = require('../services/telegram');
const {
  safeSelect,
  createAgentRun,
  completeAgentRun,
  failAgentRun
} = require('../services/supabase');

const CYCLE_MS = parseInt(process.env.CYCLE_INTERVAL_MS || '1800000', 10);

let cycleInFlight = false;
let lastDailySummaryKey = null;

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
    // Run sequentially to reduce pressure on rate-limited SoSoValue endpoints.
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
    await failAgentRun(runRecord?.id, error.message, {
      duration_ms: Date.now() - cycleStart
    });

    console.error('[Orchestrator] Fatal cycle error:', error.message);
    return { success: false, error: error.message };
  } finally {
    cycleInFlight = false;
  }
}

function shouldSendDailySummary(now) {
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
      safeSelect('narrative_scores', (query) =>
        query.gte('created_at', yesterday).order('combined_score', { ascending: false }).limit(3)
      ),
      safeSelect('alerts', (query) => query.gte('created_at', yesterday)),
      safeSelect('position_risks', (query) => query.gte('created_at', yesterday))
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
    console.error('[Orchestrator] Daily summary error:', error.message);
    return { success: false, error: error.message };
  }
}

function startScheduler() {
  console.log(`[Orchestrator] Starting. Cycle interval: ${CYCLE_MS / 60000} minutes`);
  runFullCycle();
  setInterval(runFullCycle, CYCLE_MS);
  setInterval(runDailySummary, 5 * 60 * 1000);
}

module.exports = { startScheduler, runFullCycle, runDailySummary };
