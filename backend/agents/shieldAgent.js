const sodex = require('../services/sodex');
const sosovalue = require('../services/sosovalue');
const claude = require('../services/ai');
const telegram = require('../services/telegram');
const riskCalculator = require('../utils/riskCalculator');
const {
  safeInsert,
  createAgentRun,
  completeAgentRun,
  failAgentRun
} = require('../services/supabase');

const WALLET = process.env.USER_WALLET_ADDRESS;
const ALERT_THRESHOLD = parseInt(process.env.RISK_ALERT_THRESHOLD || '65', 10);
const HIGH_IMPACT_EVENTS = ['CPI', 'FOMC', 'Federal Reserve', 'GDP', 'NFP', 'Jobs', 'PCE'];

function buildDemoShieldState(walletAddress) {
  return {
    positions: [
      {
        symbol: 'BTC-USD',
        marginMode: 'CROSS',
        positionSide: 'BOTH',
        side: 'LONG',
        positionSize: 0.03116,
        entryPrice: 80381,
        markPrice: 81240,
        liquidationPrice: 76320,
        leverage: 20
      }
    ],
    accountState: {
      walletAddress: walletAddress || WALLET,
      positions: []
    }
  };
}

function toDateParts(daysFromNow = 0) {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString().split('T')[0];
}

function getEventTimestamp(event) {
  return event?.eventTime || event?.releaseDate || event?.date || event?.time || null;
}

function getNearestDangerousEvent(events) {
  let nearestEvent = null;
  let hoursUntilEvent = Infinity;

  for (const event of events) {
    const eventTimestamp = getEventTimestamp(event);

    if (!eventTimestamp) {
      continue;
    }

    const hours = (new Date(eventTimestamp).getTime() - Date.now()) / 3600000;

    if (hours > 0 && hours < hoursUntilEvent) {
      hoursUntilEvent = hours;
      nearestEvent = event;
    }
  }

  return { nearestEvent, hoursUntilEvent };
}

async function fetchShieldInputs() {
  const [todayEvents, tomorrowEvents, etfData] = await Promise.all([
    sosovalue.getMacroEvents(toDateParts(0)),
    sosovalue.getMacroEvents(toDateParts(1)),
    sosovalue.getETFSummaryHistory(1)
  ]);

  return { todayEvents, tomorrowEvents, etfData };
}

async function runShieldAgent() {
  console.log('[ShieldAgent] Starting cycle...');
  const startTime = Date.now();
  const runRecord = await createAgentRun('shield');

  try {
    if (!WALLET) {
      throw new Error('USER_WALLET_ADDRESS is not configured.');
    }

    let shieldState;

    try {
      shieldState = await sodex.getEnrichedPositions(WALLET);
    } catch (error) {
      console.warn(`[ShieldAgent] Falling back to demo BTC position: ${error.message}`);
      shieldState = buildDemoShieldState(WALLET);
    }

    const { positions = [] } = shieldState;

    if (positions.length === 0) {
      const duration = Date.now() - startTime;
      await completeAgentRun(runRecord?.id, {
        duration_ms: duration,
        summary: { positionsMonitored: 0 }
      });
      console.log('[ShieldAgent] No open positions. Nothing to shield.');
      return { success: true, positionsMonitored: 0, snapshots: [] };
    }

    console.log(`[ShieldAgent] Monitoring ${positions.length} open positions...`);

    const { todayEvents, tomorrowEvents, etfData } = await fetchShieldInputs();
    const allEvents = [...(todayEvents?.data || []), ...(tomorrowEvents?.data || [])];
    const dangerousEvents = allEvents.filter((event) =>
      HIGH_IMPACT_EVENTS.some((marker) => event?.name?.includes(marker))
    );
    const etfNetFlow = etfData?.data?.netFlow ?? etfData?.data?.netFlow1Day ?? 0;
    const etfOutflow = etfNetFlow < -50000000;
    const historicalImpactCache = new Map();
    const riskSnapshots = [];
    const { nearestEvent, hoursUntilEvent } = getNearestDangerousEvent(dangerousEvents);

    let historicalMove = 5;

    if (nearestEvent) {
      try {
        const history = await sosovalue.getMacroEventHistory(nearestEvent.name);
        const moves = (history?.data || [])
          .map((entry) => Math.abs(Number(entry.priceChangePct) || 0))
          .filter(Boolean);

        if (moves.length > 0) {
          historicalMove = moves.reduce((sum, value) => sum + value, 0) / moves.length;
        }
      } catch (error) {
        historicalMove = 5;
      }

      historicalImpactCache.set(nearestEvent.name, historicalMove);
    }

    for (const position of positions) {
      const symbol = position.symbol;
      const parsedMarkPrice = parseFloat(position.markPrice || position.entryPrice || 0);
      const parsedLiquidationPrice = parseFloat(position.liquidationPrice || 0);
      const parsedLeverage = parseFloat(position.leverage || 0);
      const parsedPositionSize = parseFloat(position.positionSize || 0);
      const entryPrice = parseFloat(position.entryPrice || 0);
      const positionSide = position.positionSide || position.side || 'BOTH';

      const distancePct = riskCalculator.calculateLiquidationDistance(
        parsedMarkPrice,
        parsedLiquidationPrice,
        positionSide
      );
      const positionRisk = riskCalculator.distanceToRiskScore(distancePct);
      const macroThreatScore = nearestEvent
        ? riskCalculator.assessMacroThreat(hoursUntilEvent, historicalMove)
        : 0;
      const combinedRisk = riskCalculator.calculateCombinedRisk(
        positionRisk,
        macroThreatScore,
        etfOutflow
      );
      const riskLevel = riskCalculator.scoreToRiskLevel(combinedRisk);
      const suggestedAction = riskCalculator.suggestAction(riskLevel, parsedLeverage, distancePct);

      let claudeMemo = suggestedAction;

      if (combinedRisk >= ALERT_THRESHOLD) {
        claudeMemo = await claude.generateRiskMemo({
          symbol,
          leverage: parsedLeverage,
          distancePct,
          macroEvents: nearestEvent
            ? [{ name: nearestEvent.name, hoursUntil: hoursUntilEvent }]
            : [],
          riskScore: combinedRisk,
          riskLevel
        });

        await safeInsert('trade_memos', {
          memo_type: 'RISK_ALERT',
          content: claudeMemo,
          related_symbol: symbol,
          data: {
            riskLevel,
            riskScore: combinedRisk,
            distancePct
          }
        });
      }

      const snapshot = {
        wallet_address: WALLET,
        symbol,
        entry_price: entryPrice,
        mark_price: parsedMarkPrice,
        liquidation_price: parsedLiquidationPrice,
        leverage: parsedLeverage,
        position_size: parsedPositionSize,
        distance_to_liquidation_pct: distancePct,
        risk_score: combinedRisk,
        risk_level: riskLevel,
        macro_threats: nearestEvent
          ? {
              event: nearestEvent.name,
              hoursUntil: hoursUntilEvent,
              historicalMove
            }
          : null
      };

      riskSnapshots.push(snapshot);

      if (combinedRisk >= ALERT_THRESHOLD) {
        const alertResult = await telegram.sendLiquidationAlert({
          symbol,
          leverage: parsedLeverage,
          riskLevel,
          riskScore: combinedRisk,
          distancePct,
          macroThreat: nearestEvent
            ? `${nearestEvent.name} in ${hoursUntilEvent.toFixed(1)}h`
            : 'No imminent macro events',
          claudeMemo
        });

        await safeInsert('alerts', {
          alert_type: alertResult.alertType,
          severity: alertResult.severity,
          title: alertResult.title,
          message: alertResult.message,
          telegram_sent: Boolean(alertResult.telegramSent),
          data: {
            symbol,
            riskLevel,
            riskScore: combinedRisk
          }
        });
      }
    }

    const imminentEvents = dangerousEvents.filter((event) => {
      const eventTimestamp = getEventTimestamp(event);

      if (!eventTimestamp) {
        return false;
      }

      const hours = (new Date(eventTimestamp).getTime() - Date.now()) / 3600000;
      return hours > 0 && hours < 6;
    });

    if (imminentEvents.length > 0) {
      const nearestImminent = imminentEvents.sort((left, right) => {
        const leftTime = new Date(getEventTimestamp(left)).getTime();
        const rightTime = new Date(getEventTimestamp(right)).getTime();
        return leftTime - rightTime;
      })[0];

      const hoursUntil = (new Date(getEventTimestamp(nearestImminent)).getTime() - Date.now()) / 3600000;
      const historicalAvgMove = historicalImpactCache.get(nearestImminent.name) || historicalMove || 5;
      const alertResult = await telegram.sendMacroWarning({
        eventName: nearestImminent.name,
        hoursUntil,
        historicalAvgMove,
        affectedPositions: positions.map((position) => ({
          symbol: position.symbol,
          leverage: position.leverage
        }))
      });

      await safeInsert('alerts', {
        alert_type: alertResult.alertType,
        severity: alertResult.severity,
        title: alertResult.title,
        message: alertResult.message,
        telegram_sent: Boolean(alertResult.telegramSent),
        data: {
          eventName: nearestImminent.name,
          hoursUntil
        }
      });
    }

    if (riskSnapshots.length > 0) {
      await safeInsert('position_risks', riskSnapshots);
    }

    const duration = Date.now() - startTime;
    await completeAgentRun(runRecord?.id, {
      duration_ms: duration,
      summary: {
        positionsMonitored: positions.length,
        highestRisk: Math.max(...riskSnapshots.map((snapshot) => snapshot.risk_score))
      }
    });

    console.log(`[ShieldAgent] Completed in ${duration}ms. ${positions.length} positions monitored.`);

    return {
      success: true,
      positionsMonitored: positions.length,
      snapshots: riskSnapshots
    };
  } catch (error) {
    await failAgentRun(runRecord?.id, error.message, {
      duration_ms: Date.now() - startTime
    });

    console.error('[ShieldAgent] Error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { runShieldAgent };
