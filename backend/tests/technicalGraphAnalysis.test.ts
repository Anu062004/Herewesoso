import test = require('node:test');
import assert = require('node:assert/strict');
import analysis = require('../services/technicalGraphAnalysis');

function candles(direction: 1 | -1, count = 80) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + direction * index * 0.8;
    return { time: 1700000000000 + index * 3600000, open: close - direction * 0.3, high: close + 1, low: close - 1, close, volume: 1000 + index * 20 };
  });
}

test('technical graph skill identifies aligned bullish structure', () => {
  const result = analysis.analyzeTechnicalGraph({ symbol: 'BTC-USD', interval: '1h', points: candles(1) });
  assert.equal(result.trend, 'BULLISH');
  assert.equal(result.momentum, 'BULLISH');
  assert.ok(result.confidence >= 60);
  assert.ok(result.support! < result.resistance!);
  assert.equal(result.version, 'technical-graph-analysis-v1.0');
});

test('technical graph skill identifies aligned bearish structure', () => {
  const result = analysis.analyzeTechnicalGraph({ symbol: 'BTC-USD', interval: '1h', points: candles(-1) });
  assert.equal(result.trend, 'BEARISH');
  assert.equal(result.momentum, 'BEARISH');
});

test('technical graph skill refuses insufficient evidence', () => {
  assert.throws(() => analysis.analyzeTechnicalGraph({ symbol: 'BTC-USD', interval: '1h', points: candles(1, 10) }), /At least 20/);
});

export {};
