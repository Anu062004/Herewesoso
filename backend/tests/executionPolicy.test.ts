import test = require('node:test');
import assert = require('node:assert/strict');
import executionPolicy = require('../services/executionPolicy');

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

export {};
