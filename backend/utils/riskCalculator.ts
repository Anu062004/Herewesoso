import type { RiskLevel } from '../types/domain';

type RiskLevelActions = Record<RiskLevel, string>;

const riskCalculator = {
  calculateLiquidationDistance(markPrice: number, liquidationPrice: number, side: string): number {
    if (!liquidationPrice || Number(liquidationPrice) === 0 || !markPrice) {
      return 100;
    }

    const mark = Number(markPrice);
    const liq = Number(liquidationPrice);

    if (side === 'LONG' || side === 'BOTH') {
      return ((mark - liq) / mark) * 100;
    }

    return ((liq - mark) / mark) * 100;
  },

  distanceToRiskScore(distancePct: number): number {
    if (distancePct > 50) return 5;
    if (distancePct > 30) return 20;
    if (distancePct > 20) return 35;
    if (distancePct > 15) return 50;
    if (distancePct > 10) return 65;
    if (distancePct > 7) return 78;
    if (distancePct > 5) return 88;
    if (distancePct > 3) return 95;
    return 100;
  },

  assessMacroThreat(hoursUntilEvent: number, historicalAvgMovePct: number): number {
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

    return Math.min(score, 100);
  },

  calculateCombinedRisk(positionRisk: number, macroThreat: number, etfOutflow: boolean): number {
    const etfPenalty = etfOutflow ? 15 : 0;
    const combined = positionRisk * 0.5 + macroThreat * 0.35 + etfPenalty;
    return Math.min(Math.round(combined), 100);
  },

  scoreToRiskLevel(score: number): RiskLevel {
    if (score < 30) return 'SAFE';
    if (score < 55) return 'CAUTION';
    if (score < 75) return 'DANGER';
    return 'CRITICAL';
  },

  suggestAction(riskLevel: RiskLevel, leverage: number, distancePct: number): string {
    const safeTarget = Math.max(Math.floor(leverage / 2), 1);
    const actions: RiskLevelActions = {
      SAFE: 'Position is healthy. No action needed.',
      CAUTION: `Monitor closely. Consider reducing leverage from ${leverage}x to ${Math.max(leverage - 2, 1)}x to create more buffer.`,
      DANGER: `Reduce leverage to ${safeTarget}x immediately or add margin. Liquidation is ${distancePct.toFixed(1)}% away.`,
      CRITICAL: `URGENT: Exit or reduce position NOW. Liquidation is only ${distancePct.toFixed(1)}% away with a high-impact macro event incoming.`
    };

    return actions[riskLevel];
  }
};

export = riskCalculator;
