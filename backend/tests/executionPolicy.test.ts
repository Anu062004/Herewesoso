import test = require('node:test');
import assert = require('node:assert/strict');
import executionPolicy = require('../services/executionPolicy');
import executionLedger = require('../services/executionLedger');

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }

  try {
    fn();
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('execution policy rejects mainnet writes unless canary mode is explicit', () => {
  withEnv({ EXECUTION_MODE: undefined }, () => {
    const result = executionPolicy.evaluateExecutionPolicy({
      action: 'CLOSE_POSITION',
      symbol: 'BTC-USD',
      network: 'mainnet'
    });

    assert.equal(result.allowed, false);
    assert.equal(result.checks.find((check) => check.name === 'network_mode')?.passed, false);
  });
});

test('execution policy allows mainnet only in mainnet_canary mode', () => {
  withEnv({ EXECUTION_MODE: 'mainnet_canary' }, () => {
    const result = executionPolicy.evaluateExecutionPolicy({
      action: 'CLOSE_POSITION',
      symbol: 'BTC-USD',
      network: 'mainnet'
    });

    assert.equal(result.allowed, true);
    assert.equal(result.executionMode, 'mainnet_canary');
  });
});

test('execution policy enforces leverage and symbol caps', () => {
  withEnv({ EXECUTION_MODE: 'testnet', MAX_LEVERAGE: '10', ALLOWED_SYMBOLS: 'BTC-USD' }, () => {
    const leverageResult = executionPolicy.evaluateExecutionPolicy({
      action: 'REDUCE_LEVERAGE',
      symbol: 'BTC-USD',
      network: 'testnet',
      targetLeverage: 12
    });
    const symbolResult = executionPolicy.evaluateExecutionPolicy({
      action: 'CLOSE_POSITION',
      symbol: 'DOGE-USD',
      network: 'testnet'
    });

    assert.equal(leverageResult.allowed, false);
    assert.equal(leverageResult.checks.find((check) => check.name === 'leverage_cap')?.passed, false);
    assert.equal(symbolResult.allowed, false);
    assert.equal(symbolResult.checks.find((check) => check.name === 'symbol_allowlist')?.passed, false);
  });
});

test('execution policy defaults to dry run and rejects invalid leverage or notional', () => {
  withEnv({ EXECUTION_MODE: undefined, MAX_NOTIONAL_USD: '1000' }, () => {
    const result = executionPolicy.evaluateExecutionPolicy({
      action: 'REDUCE_LEVERAGE',
      symbol: 'BTC-USD',
      network: 'testnet',
      targetLeverage: -2,
      notionalUsd: 1500
    });
    assert.equal(result.executionMode, 'dry_run');
    assert.equal(result.allowed, false);
    assert.equal(result.checks.find((check) => check.name === 'leverage_cap')?.passed, false);
    assert.equal(result.checks.find((check) => check.name === 'notional_cap')?.passed, false);
  });
});

test('execution idempotency is scoped to the authenticated wallet and target resource', () => {
  const base = {
    action: 'CANCEL_ORDER' as const,
    symbol: 'BTC-USD',
    network: 'testnet' as const,
    idempotencyScope: 'order-1'
  };
  const first = executionPolicy.evaluateExecutionPolicy({ ...base, requestedBy: '0xabc' });
  const same = executionPolicy.evaluateExecutionPolicy({ ...base, requestedBy: '0xabc' });
  const otherWallet = executionPolicy.evaluateExecutionPolicy({ ...base, requestedBy: '0xdef' });
  assert.equal(first.idempotencyKey, same.idempotencyKey);
  assert.notEqual(first.idempotencyKey, otherWallet.idempotencyKey);
});

test('stale pending executions are marked unknown before a retry is allowed', async () => {
  const actionId = executionLedger.createActionId();
  const claim = await executionLedger.claimExecutionAction({
    action_id: actionId,
    action_type: 'CLOSE_POSITION',
    symbol: 'BTC-USD',
    network: 'testnet',
    execution_mode: 'dry_run',
    status: 'PENDING',
    requested_by: '0x1111111111111111111111111111111111111111',
    idempotency_key: `test:${actionId}`,
    policy_snapshot: {},
    request_payload: {},
    signed_payload_hash: null,
    signer_address: null,
    error: null
  });
  assert.equal(claim.claimed, true);
  await executionLedger.expireStaleExecutionActions(new Date(Date.now() + 1000).toISOString());
  const stored = (await executionLedger.listExecutionActions(100)).find((row) => row.action_id === actionId);
  assert.equal(stored?.status, 'UNKNOWN');
});

export {};
