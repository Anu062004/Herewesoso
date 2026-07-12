import type { RiskLevel } from '../types/domain';

type PositionDirection = 'LONG' | 'SHORT';
type DataConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

interface RiskEngineInput {
  markPrice: number;
  liquidationPrice?: number | null;
  entryPrice?: number | null;
  leverage: number;
  positionSize: number;
  positionSide?: string | null;
  accountValue?: number;
  availableMargin?: number;
  initialMargin?: number;
  unrealizedPnl?: number;
  fundingRate?: number;
  volatilityPct?: number;
  liquidityScore?: number;
  macroThreat?: number;
  flowThreat?: number;
  targetBufferPct?: number;
}

interface StressScenario {
  movePct: number;
  stressedPrice: number;
  estimatedPnl: number;
  accountEquityAfter: number;
  marginUtilizationPct: number;
  liquidationBreached: boolean;
}

const clamp = (value: number, min = 0, max = 100) => Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function resolveDirection(side?: string | null, positionSize = 0): PositionDirection {
  const normalized = String(side || '').toUpperCase();
  if (normalized === 'SHORT') return 'SHORT';
  if (normalized === 'LONG') return 'LONG';
  return positionSize < 0 ? 'SHORT' : 'LONG';
}

function estimateLiquidationPrice(markPrice: number, leverage: number, direction: PositionDirection): number {
  if (markPrice <= 0 || leverage <= 0) return 0;
  const distance = Math.min(0.95, 1 / leverage);
  return direction === 'LONG' ? markPrice * (1 - distance) : markPrice * (1 + distance);
}

function calculateLiquidationDistance(
  markPrice: number,
  liquidationPrice: number,
  side: string,
  leverage?: number,
  positionSize = 0
): number {
  if (markPrice <= 0) return 0;
  const direction = resolveDirection(side, positionSize);
  const liquidation = liquidationPrice > 0
    ? liquidationPrice
    : estimateLiquidationPrice(markPrice, leverage || 0, direction);
  if (!liquidation) return 0;
  const distance = direction === 'LONG'
    ? ((markPrice - liquidation) / markPrice) * 100
    : ((liquidation - markPrice) / markPrice) * 100;
  return round(Math.max(0, distance));
}

function distanceToRiskScore(distancePct: number): number {
  if (distancePct <= 0) return 100;
  // Smooth curve avoids large score jumps around arbitrary threshold boundaries.
  return Math.round(clamp(108 - 23 * Math.log(Math.max(distancePct, 1))));
}

function marginHealthScore(accountValue = 0, availableMargin = 0, initialMargin = 0): number {
  if (accountValue <= 0) return 50;
  const utilization = initialMargin > 0
    ? (initialMargin / accountValue) * 100
    : (1 - clamp(availableMargin / accountValue, 0, 1)) * 100;
  return Math.round(clamp((utilization - 30) * 1.45));
}

function assessMacroThreat(hoursUntilEvent: number, historicalAvgMovePct: number): number {
  let score = 0;
  if (hoursUntilEvent < 1) score += 45;
  else if (hoursUntilEvent < 3) score += 35;
  else if (hoursUntilEvent < 6) score += 25;
  else if (hoursUntilEvent < 12) score += 15;
  else if (hoursUntilEvent < 24) score += 8;
  if (historicalAvgMovePct > 8) score += 40;
  else if (historicalAvgMovePct > 5) score += 28;
  else if (historicalAvgMovePct > 3) score += 18;
  else score += 7;
  return Math.round(clamp(score));
}

function calculateCombinedRisk(positionRisk: number, macroThreat: number, etfOutflow: boolean): number {
  return Math.round(clamp(positionRisk * 0.65 + macroThreat * 0.2 + (etfOutflow ? 15 : 0)));
}

function scoreToRiskLevel(score: number): RiskLevel {
  if (score < 30) return 'SAFE';
  if (score < 55) return 'CAUTION';
  if (score < 75) return 'DANGER';
  return 'CRITICAL';
}

function calculateRescueActions(input: RiskEngineInput, direction: PositionDirection, distancePct: number) {
  const size = Math.abs(input.positionSize);
  const notional = size * input.markPrice;
  const leverage = Math.max(input.leverage, 1);
  const currentMargin = notional / leverage;
  const targetLeverage = Math.max(1, Math.min(leverage - 1, Math.ceil(leverage * (distancePct < 5 ? 0.4 : distancePct < 10 ? 0.6 : 0.8))));
  const marginForTargetLeverage = notional / targetLeverage;
  const addMargin = Math.max(0, marginForTargetLeverage - currentMargin);
  const targetBuffer = Math.max(input.targetBufferPct || 15, distancePct);
  const bufferMargin = notional * Math.max(0, targetBuffer - distancePct) / 100;
  const quantityToClose = leverage > targetLeverage
    ? size * (1 - targetLeverage / leverage)
    : 0;
  const stopDistancePct = Math.max(1, Math.min(distancePct * 0.55, targetBuffer * 0.5));
  const suggestedStopPrice = direction === 'LONG'
    ? input.markPrice * (1 - stopDistancePct / 100)
    : input.markPrice * (1 + stopDistancePct / 100);

  return {
    targetLeverage,
    addMargin: round(Math.max(addMargin, bufferMargin)),
    quantityToClose: round(quantityToClose, 8),
    notional: round(notional),
    suggestedStopPrice: round(suggestedStopPrice),
    targetBufferPct: targetBuffer,
    disclaimer: 'Estimates only. Confirm fees, maintenance margin, and execution price on SoDEX before acting.'
  };
}

function buildStressScenarios(input: RiskEngineInput, direction: PositionDirection): StressScenario[] {
  const accountValue = Math.max(input.accountValue || 0, 0);
  const initialMargin = Math.max(input.initialMargin || 0, 0);
  const size = Math.abs(input.positionSize);
  const liquidation = input.liquidationPrice && input.liquidationPrice > 0
    ? input.liquidationPrice
    : estimateLiquidationPrice(input.markPrice, input.leverage, direction);

  return [-2, -5, -10].map((adverseMove) => {
    const signedMove = direction === 'LONG' ? adverseMove : Math.abs(adverseMove);
    const stressedPrice = input.markPrice * (1 + signedMove / 100);
    const estimatedPnl = direction === 'LONG'
      ? (stressedPrice - input.markPrice) * size
      : (input.markPrice - stressedPrice) * size;
    const equityAfter = accountValue + estimatedPnl;
    return {
      movePct: adverseMove,
      stressedPrice: round(stressedPrice),
      estimatedPnl: round(estimatedPnl),
      accountEquityAfter: round(equityAfter),
      marginUtilizationPct: equityAfter > 0 ? round(clamp(initialMargin / equityAfter * 100)) : 100,
      liquidationBreached: direction === 'LONG' ? stressedPrice <= liquidation : stressedPrice >= liquidation
    };
  });
}

function analyzePosition(input: RiskEngineInput) {
  const direction = resolveDirection(input.positionSide, input.positionSize);
  const actualLiquidation = Number(input.liquidationPrice || 0) > 0;
  const liquidationPrice = actualLiquidation
    ? Number(input.liquidationPrice)
    : estimateLiquidationPrice(input.markPrice, input.leverage, direction);
  const distancePct = calculateLiquidationDistance(input.markPrice, liquidationPrice, direction, input.leverage, input.positionSize);
  const liquidationProximity = distanceToRiskScore(distancePct);
  const marginHealth = marginHealthScore(input.accountValue, input.availableMargin, input.initialMargin);
  const volatility = Math.round(clamp((input.volatilityPct || 0) * 8));
  const liquidity = Math.round(clamp(input.liquidityScore || 0));
  const crowding = Math.round(clamp(Math.abs(input.fundingRate || 0) * 100000));
  const macro = Math.round(clamp(input.macroThreat || 0));
  const flow = Math.round(clamp(input.flowThreat || 0));
  const score = Math.round(clamp(
    liquidationProximity * 0.35 + marginHealth * 0.2 + volatility * 0.15 +
    liquidity * 0.1 + crowding * 0.1 + macro * 0.07 + flow * 0.03
  ));
  const riskLevel = scoreToRiskLevel(score);
  const accountValue = Math.max(input.accountValue || 0, 0);

  return {
    direction,
    liquidationPrice: round(liquidationPrice),
    liquidationPriceSource: actualLiquidation ? 'ACTUAL' as const : 'ESTIMATED' as const,
    confidence: (actualLiquidation && accountValue > 0 ? 'HIGH' : actualLiquidation ? 'MEDIUM' : 'LOW') as DataConfidence,
    distancePct,
    notional: round(Math.abs(input.positionSize) * input.markPrice),
    unrealizedPnl: round(input.unrealizedPnl ?? ((input.markPrice - (input.entryPrice || input.markPrice)) * Math.abs(input.positionSize) * (direction === 'LONG' ? 1 : -1))),
    marginUtilizationPct: accountValue > 0
      ? round(clamp((input.initialMargin || Math.max(0, accountValue - (input.availableMargin || 0))) / accountValue * 100))
      : null,
    score,
    riskLevel,
    breakdown: { liquidationProximity, marginHealth, volatility, liquidity, crowding, macro, flow },
    rescue: calculateRescueActions(input, direction, distancePct),
    stressScenarios: buildStressScenarios(input, direction),
    calculatedAt: new Date().toISOString(),
    modelVersion: 'shield-v2.0'
  };
}

function suggestAction(riskLevel: RiskLevel, leverage: number, distancePct: number): string {
  const target = Math.max(1, Math.min(leverage - 1, Math.ceil(leverage * 0.6)));
  if (riskLevel === 'SAFE') return 'Position buffer is currently healthy. Keep monitoring market conditions.';
  if (riskLevel === 'CAUTION') return `Monitor closely and consider reducing leverage below ${target}x.`;
  if (riskLevel === 'DANGER') return `Reduce toward ${target}x or add margin; liquidation is ${distancePct.toFixed(1)}% away.`;
  return `Urgent: reduce or close exposure. Liquidation is only ${distancePct.toFixed(1)}% away.`;
}

function calibrateThresholds(samples: Array<{ score: number; liquidated: boolean }>) {
  if (samples.length < 10) return { threshold: 65, sampleSize: samples.length, calibrated: false };
  let best = { threshold: 65, f1: 0 };
  for (let threshold = 35; threshold <= 90; threshold += 5) {
    let tp = 0; let fp = 0; let fn = 0;
    for (const sample of samples) {
      if (sample.score >= threshold && sample.liquidated) tp++;
      else if (sample.score >= threshold) fp++;
      else if (sample.liquidated) fn++;
    }
    const precision = tp / Math.max(tp + fp, 1);
    const recall = tp / Math.max(tp + fn, 1);
    const f1 = 2 * precision * recall / Math.max(precision + recall, 0.0001);
    if (f1 > best.f1) best = { threshold, f1 };
  }
  return { threshold: best.threshold, sampleSize: samples.length, calibrated: true, f1: round(best.f1, 3) };
}

export = {
  resolveDirection,
  estimateLiquidationPrice,
  calculateLiquidationDistance,
  distanceToRiskScore,
  marginHealthScore,
  assessMacroThreat,
  calculateCombinedRisk,
  scoreToRiskLevel,
  suggestAction,
  analyzePosition,
  calibrateThresholds
};
