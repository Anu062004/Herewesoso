import test = require('node:test');
import assert = require('node:assert/strict');
import narrativeScorer = require('../utils/narrativeScorer');

test('scoreNarrativeLayer returns zero when there are no headlines', () => {
  assert.equal(narrativeScorer.scoreNarrativeLayer([], 'AI'), 0);
});

test('scoreNarrativeLayer finds relevant AI headlines', () => {
  const headlines = [
    { title: 'AI agents are dominating new crypto launches' },
    { title: 'Layer 2 network ships new upgrade' },
    { title: 'Machine learning tokens rally after funding round' }
  ];

  assert.equal(narrativeScorer.scoreNarrativeLayer(headlines, 'AI'), 100);
});

test('scoreMacroLayer penalizes multiple high-impact events', () => {
  const score = narrativeScorer.scoreMacroLayer([
    { name: 'CPI Release' },
    { name: 'FOMC Minutes' }
  ]);

  assert.equal(score, 20);
});

test('generateSignal returns BUY buckets at the expected thresholds', () => {
  const watch = narrativeScorer.generateSignal(50, 50, 40);
  const buy = narrativeScorer.generateSignal(80, 65, 60);

  assert.equal(watch.signal, 'WATCH');
  assert.equal(buy.signal, 'BUY');
});

export {};
