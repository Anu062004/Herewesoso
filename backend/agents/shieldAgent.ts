import type { MacroEvent, PositionRiskSnapshot, ShieldState } from '../types/domain';

import sodex = require('../services/sodex');
import sosovalue = require('../services/sosovalue');
import claude = require('../services/claude');
import telegram = require('../services/telegram');
import riskCalculator = require('../utils/riskCalculator');
import supabaseService = require('../services/supabase');
import errorUtils = require('../utils/error');

const { safeInsert, createAgentRun, completeAgentRun, failAgentRun } = supabaseService;
const { getErrorMessage } = errorUtils;

interface ShieldAgentResult {
  success: boolean;
  positionsMonitored?: number;
  snapshots?: PositionRiskSnapshot[];
  error?: string;
}

interface MacroHistoryEntry {
  priceChangePct?: string | number | null;
}

const WALLET = process.env.USER_WALLET_ADDRESS;
const ALERT_THRESHOLD = Number.parseInt(process.env.RISK_ALERT_THRESHOLD || '65', 10);
const HIGH_IMPACT_EVENTS = ['CPI', 'FOMC', 'Federal Reserve', 'GDP', 'NFP', 'Jobs', 'PCE'];

function buildDemoShieldState(walletAddress?: string): ShieldState {
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
      walletAddress: walletAddress || WALLET || null,
      accountId: null,
      accountValue: 0,
      availableMargin: 0,
      initialMargin: 0,
      crossMargin: 0,
      positions: [],
      balances: []
    }
  };
}

function toDateParts(daysFromNow = 0): string {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString().split('T')[0];
}

function getEventTimestamp(event: MacroEvent): string | null {
  return event?.eventTime || event?.releaseDate || event?.date || event?.time || null;
}

function getEventName(event: MacroEvent): string {
  return event.name || 'Unknown event';
}

function getNearestDangerousEvent(events: MacroEvent[]) {
  let nearestEvent: MacroEvent | null = null;
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

function parseNumber(value: unknown): number {
  return Number.parseFloat(String(value ?? '0')) || 0;
}

async function runShieldAgent(): Promise<ShieldAgentResult> {
  console.log('[ShieldAgent] Starting cycle...');
  const startTime = Date.now();
  const runRecord = await createAgentRun('shield');

  try {
    if (!WALLET) {
      throw new Error('USER_WALLET_ADDRESS is not configured.');
    }

    let shieldState: ShieldState;

    try {
      shieldState = await sodex.getEnrichedPositions(WALLET);
    } catch (error) {
      console.warn(`[ShieldAgent] Falling back to demo BTC position: ${getErrorMessage(error)}`);
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
    const allEvents = [
      ...((todayEvents?.data || []) as MacroEvent[]),
      ...((tomorrowEvents?.data || []) as MacroEvent[])
    ];
    const dangerousEvents = allEvents.filter((event) =>
      HIGH_IMPACT_EVENTS.some((marker) => event?.name?.includes(marker))
    );
    const etfSummary = (etfData?.data || {}) as Record<string, unknown>;
    const etfNetFlow = parseNumber(etfSummary.netFlow ?? etfSummary.netFlow1Day);
    const etfOutflow = etfNetFlow < -50000000;
    const historicalImpactCache = new Map<string, number>();
    const riskSnapshots: PositionRiskSnapshot[] = [];
    const { nearestEvent, hoursUntilEvent } = getNearestDangerousEvent(dangerousEvents);

    let historicalMove = 5;

    if (nearestEvent) {
      try {
        const history = await sosovalue.getMacroEventHistory(getEventName(nearestEvent));
        const moves = ((history?.data || []) as MacroHistoryEntry[])
          .map((entry) => Math.abs(Number(entry.priceChangePct) || 0))
          .filter(Boolean);

        if (moves.length > 0) {
          historicalMove = moves.reduce((sum, value) => sum + value, 0) / moves.length;
        }
      } catch {
        historicalMove = 5;
      }

      historicalImpactCache.set(getEventName(nearestEvent), historicalMove);
    }

    for (const position of positions) {
      const symbol = position.symbol;
      const parsedMarkPrice = parseNumber(position.markPrice || position.entryPrice);
      const parsedLiquidationPrice = parseNumber(position.liquidationPrice);
      const parsedLeverage = parseNumber(position.leverage);
      const parsedPositionSize = parseNumber(position.positionSize);
      const entryPrice = parseNumber(position.entryPrice);
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
            ? [{ name: getEventName(nearestEvent), hoursUntil: hoursUntilEvent }]
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

      const snapshot: PositionRiskSnapshot = {
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
              event: getEventName(nearestEvent),
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
            ? `${getEventName(nearestEvent)} in ${hoursUntilEvent.toFixed(1)}h`
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
        const leftTime = new Date(getEventTimestamp(left) || 0).getTime();
        const rightTime = new Date(getEventTimestamp(right) || 0).getTime();
        return leftTime - rightTime;
      })[0];

      const hoursUntil =
        (new Date(getEventTimestamp(nearestImminent) || 0).getTime() - Date.now()) / 3600000;
      const eventName = getEventName(nearestImminent);
      const historicalAvgMove = historicalImpactCache.get(eventName) || historicalMove || 5;
      const alertResult = await telegram.sendMacroWarning({
        eventName,
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
          eventName,
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
    await failAgentRun(runRecord?.id, getErrorMessage(error), {
      duration_ms: Date.now() - startTime
    });

    console.error('[ShieldAgent] Error:', getErrorMessage(error));
    return { success: false, error: getErrorMessage(error) };
  }
}

export = { runShieldAgent };
