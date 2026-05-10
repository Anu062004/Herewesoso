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

test('calculateLiquidationDistance treats BOTH as long exposure', () => {
  const distance = riskCalculator.calculateLiquidationDistance(100, 85, 'BOTH');
  assert.equal(distance, 15);
});

test('distanceToRiskScore maps narrow distance to high risk', () => {
  assert.equal(riskCalculator.distanceToRiskScore(4.9), 95);
  assert.equal(riskCalculator.distanceToRiskScore(8), 78);
});

test('calculateCombinedRisk applies macro and ETF penalties', () => {
  const score = riskCalculator.calculateCombinedRisk(70, 40, true);
  assert.equal(score, 64);
  assert.equal(riskCalculator.scoreToRiskLevel(score), 'DANGER');
});

export {};
