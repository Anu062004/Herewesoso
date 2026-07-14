import test = require('node:test');
import assert = require('node:assert/strict');

import outcomeResolver = require('../services/outcomeResolver');

test('normalizeKlinePoints supports object and array candle shapes', () => {
  const points = outcomeResolver.normalizeKlinePoints({
    data: [
      { time: 1760000000000, open: '100', high: '110', low: '95', close: '105', volume: '10' },
      [1760003600, '105', '112', '101', '110', '8']
    ]
  });

  assert.equal(points.length, 2);
  assert.equal(points[0].close, 105);
  assert.equal(points[1].time, 1760003600000);
});

test('calculateReturnPct computes percentage returns', () => {
  assert.equal(outcomeResolver.calculateReturnPct(100, 108), 8);
  assert.equal(outcomeResolver.calculateReturnPct(100, 92), -8);
  assert.equal(outcomeResolver.calculateReturnPct(0, 92), null);
});

test('determineDirectionalHit handles BUY and AVOID signals', () => {
  assert.equal(outcomeResolver.determineDirectionalHit('BUY', 4, 7), true);
  assert.equal(outcomeResolver.determineDirectionalHit('STRONG_BUY', -1, 2), false);
  assert.equal(outcomeResolver.determineDirectionalHit('AVOID', -3, -1), true);
  assert.equal(outcomeResolver.determineDirectionalHit('WATCH', 5, 5), null);
});

test('resolveProxySymbol returns default sector proxy', () => {
  assert.equal(outcomeResolver.resolveProxySymbol('L1'), 'SOL-USD');
});

test('outcomes remain partial at 24h and complete only after 7d', () => {
  assert.equal(outcomeResolver.determineOutcomeStatus({
    has24h: true, has7d: false, elapsedHorizonCount: 3, resolvedHorizonCount: 3
  }), 'PARTIAL');
  assert.equal(outcomeResolver.determineOutcomeStatus({
    has24h: true, has7d: true, elapsedHorizonCount: 4, resolvedHorizonCount: 4
  }), 'READY');
});

test('max adverse move respects long and avoid direction', () => {
  const start = 1760000000000;
  const points = [
    { time: start, open: 100, high: 102, low: 98, close: 101, volume: 1 },
    { time: start + 3600000, open: 101, high: 110, low: 90, close: 103, volume: 1 }
  ];
  assert.equal(outcomeResolver.calculateMaxAdverseMove24h('BUY', 100, points, start), 10);
  assert.equal(outcomeResolver.calculateMaxAdverseMove24h('AVOID', 100, points, start), 10);
  assert.equal(outcomeResolver.calculateMaxAdverseMove24h('WATCH', 100, points, start), null);
});

export {};
