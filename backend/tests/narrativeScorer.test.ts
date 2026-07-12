import test = require('node:test');
import assert = require('node:assert/strict');
import narrativeScorer = require('../utils/narrativeScorer');
import { analyzeNarrative, deduplicateHeadlines } from '../services/narrativeEngine';

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

test('narrative v2 deduplicates syndicated headlines', () => {
  const rows = deduplicateHeadlines([
    { title: 'AI agent protocol launches on mainnet' },
    { title: 'AI agent protocol launches on mainnet!' },
    { title: 'RWA treasury adoption expands' }
  ]);
  assert.equal(rows.length, 2);
});

test('narrative v2 scores fresh multi-source acceleration and preserves evidence', () => {
  const now = Date.now();
  const developments = ['payments', 'identity', 'compute', 'trading', 'storage', 'governance'];
  const headlines = developments.map((development, index) => ({
    title: `AI agent ${development} protocol launch partnership`,
    source: `Source ${index}`,
    published_at: new Date(now - index * 5 * 60 * 1000).toISOString()
  }));
  const result = analyzeNarrative(
    headlines,
    'AI',
    { score: 75, return6h: 3, return24h: 4, volumeRatio: 1.8, available: true },
    now
  );

  assert.ok(result.velocityScore >= 65);
  assert.ok(result.confidence >= 70);
  assert.equal(result.evidence.uniqueSources.length, 6);
  assert.equal(result.evidence.primaryCatalyst, 'Protocol launch');
  assert.ok(['EMERGING', 'ACCELERATING', 'CROWDED'].includes(result.lifecycleStage));
});

test('narrative v2 treats negative contradictory evidence as risk', () => {
  const now = Date.now();
  const result = analyzeNarrative([
    { title: 'DeFi lending protocol hacked after exploit', source: 'Reuters', published_at: new Date(now).toISOString() },
    { title: 'DeFi liquidity collapses after security breach', source: 'The Block', published_at: new Date(now).toISOString() }
  ], 'DeFi', undefined, now);

  assert.ok(result.contradictionScore > 50);
  assert.ok(result.sentimentScore < 50);
});

export {};
