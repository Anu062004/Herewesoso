import test = require('node:test');
import assert = require('node:assert/strict');

import orchestrator = require('../agents/orchestrator');

const { describeCycleOutcome } = orchestrator;

test('orchestrator reports a complete two-module cycle', () => {
  const result = describeCycleOutcome({ success: true }, { success: true });

  assert.equal(result.success, true);
  assert.equal(result.partial, false);
  assert.equal(result.message, 'Narrative Scanner and Liquidation Shield completed.');
});

test('orchestrator keeps a successful module and identifies a partial failure', () => {
  const result = describeCycleOutcome(
    { success: true },
    { success: false, error: 'SoDEX account monitoring is temporarily unavailable.' }
  );

  assert.equal(result.success, true);
  assert.equal(result.partial, true);
  assert.match(String(result.message), /Narrative Scanner completed/);
  assert.match(String(result.message), /Liquidation Shield: SoDEX account monitoring/);
});

test('orchestrator reports successful degraded inputs without claiming full data', () => {
  const result = describeCycleOutcome(
    { success: true, degraded: true, warnings: ['Limited market intelligence: SoSoValue news unavailable.'] },
    { success: true }
  );

  assert.equal(result.success, true);
  assert.equal(result.partial, false);
  assert.equal(result.degraded, true);
  assert.match(String(result.message), /completed with limited data/);
  assert.match(String(result.message), /SoSoValue news unavailable/);
});

test('orchestrator returns actionable module errors when both modules fail', () => {
  const result = describeCycleOutcome(
    { success: false, error: 'Market intelligence is unavailable.' },
    { success: false, error: 'No monitored wallet is configured.' }
  );

  assert.equal(result.success, false);
  assert.equal(result.partial, false);
  assert.match(String(result.error), /Narrative Scanner: Market intelligence is unavailable/);
  assert.match(String(result.error), /Liquidation Shield: No monitored wallet is configured/);
});
