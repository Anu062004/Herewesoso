import test = require('node:test');
import assert = require('node:assert/strict');
import riskCalculator = require('../utils/riskCalculator');

test('calculateLiquidationDistance handles long positions', () => {
  const distance = riskCalculator.calculateLiquidationDistance(100, 85, 'LONG');
  assert.equal(distance, 15);
});

test('calculateLiquidationDistance handles short positions', () => {
  const distance = riskCalculator.calculateLiquidationDistance(100, 112, 'SHORT');
  assert.equal(distance, 12);
});

test('calculateLiquidationDistance infers BOTH direction from signed size', () => {
  assert.equal(riskCalculator.calculateLiquidationDistance(100, 85, 'BOTH', 10, 1), 15);
  assert.equal(riskCalculator.calculateLiquidationDistance(100, 112, 'BOTH', 10, -1), 12);
});

test('distanceToRiskScore maps narrow distance to high risk', () => {
  assert.ok(riskCalculator.distanceToRiskScore(4.9) > riskCalculator.distanceToRiskScore(8));
});

test('calculateCombinedRisk applies macro and ETF penalties', () => {
  const score = riskCalculator.calculateCombinedRisk(70, 40, true);
  assert.equal(score, 69);
  assert.equal(riskCalculator.scoreToRiskLevel(score), 'DANGER');
});

test('analyzePosition produces exact rescue actions and stress scenarios', () => {
  const analysis = riskCalculator.analyzePosition({
    markPrice: 100,
    liquidationPrice: 94,
    entryPrice: 105,
    leverage: 20,
    positionSize: 10,
    positionSide: 'LONG',
    accountValue: 500,
    availableMargin: 100,
    initialMargin: 400,
    volatilityPct: 4,
    liquidityScore: 25
  });
  assert.equal(analysis.direction, 'LONG');
  assert.equal(analysis.liquidationPriceSource, 'ACTUAL');
  assert.ok(analysis.rescue.targetLeverage < 20);
  assert.ok(analysis.rescue.quantityToClose > 0);
  assert.equal(analysis.stressScenarios.length, 3);
  assert.equal(analysis.stressScenarios[2].liquidationBreached, true);
});

test('missing liquidation price is explicitly estimated with low confidence', () => {
  const analysis = riskCalculator.analyzePosition({ markPrice: 100, leverage: 10, positionSize: -2, positionSide: 'BOTH' });
  assert.equal(analysis.direction, 'SHORT');
  assert.equal(analysis.liquidationPrice, 110);
  assert.equal(analysis.liquidationPriceSource, 'ESTIMATED');
  assert.equal(analysis.confidence, 'LOW');
});

test('calibration selects a threshold when enough labelled outcomes exist', () => {
  const samples = Array.from({ length: 20 }, (_, index) => ({ score: index * 5, liquidated: index >= 13 }));
  const result = riskCalculator.calibrateThresholds(samples);
  assert.equal(result.calibrated, true);
  assert.ok(result.threshold >= 35);
});

export {};
