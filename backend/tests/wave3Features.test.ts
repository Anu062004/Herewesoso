import test = require('node:test');
import assert = require('node:assert/strict');
import { ethers } from 'ethers';

import strategyMarketplace = require('../services/strategyMarketplace');
import onchainAutomation = require('../services/onchainAutomation');

test('strategy marketplace publishes immutable versions and scopes installations to a wallet', async () => {
  const owner = ethers.Wallet.createRandom().address;
  const installer = ethers.Wallet.createRandom().address;
  const suffix = Date.now().toString(36);
  const draft = await strategyMarketplace.createStrategy(owner, {
    slug: `shield-${suffix}`,
    name: 'Liquidation Buffer',
    summary: 'Reduces risk when liquidation distance crosses a configured threshold.',
    description: 'A deterministic advisory strategy with explicit liquidation distance and leverage boundaries.',
    category: 'Risk',
    riskLevel: 'LOW',
    supportedExchanges: ['sodex'],
    configurationSchema: { required: ['distance'], properties: { distance: { type: 'number' } } },
    executionTemplate: { action: 'REDUCE_LEVERAGE' }
  });
  const published = await strategyMarketplace.publishStrategy(owner, draft.id);
  assert.equal(published.strategy.current_version, 1);
  assert.match(published.version.content_hash, /^sha256:[0-9a-f]{64}$/);
  await assert.rejects(() => strategyMarketplace.updateDraft(owner, draft.id, { name: 'Changed after publication' }), /immutable/);
  await assert.rejects(() => strategyMarketplace.installStrategy(installer, draft.id, {}), /missing required field/);
  await strategyMarketplace.installStrategy(installer, draft.id, { distance: 12 });
  const installed = await strategyMarketplace.listInstallations(installer);
  assert.equal(installed[0]?.strategy?.id, draft.id);
  const review = await strategyMarketplace.reviewStrategy(installer, draft.id, 5, 'Clear boundaries.');
  assert.equal(review.rating, 5);
});

test('automation preparation commits exact calldata and binds the transaction to the SIWE wallet', () => {
  const original = process.env.SHIELD_AUTOMATION_TESTNET_CONTRACT_ADDRESS;
  process.env.SHIELD_AUTOMATION_TESTNET_CONTRACT_ADDRESS = '0x1111111111111111111111111111111111111111';
  try {
    const wallet = ethers.Wallet.createRandom().address;
    const prepared = onchainAutomation.prepareCreateRule('testnet', wallet, {
      adapter: '0x2222222222222222222222222222222222222222',
      checker: '0x3333333333333333333333333333333333333333',
      validAfter: 0,
      validUntil: 0,
      minInterval: 300,
      maxExecutions: 2,
      maxGasPriceGwei: 25,
      executionData: '0x1234',
      checkData: '0xabcd'
    });
    assert.equal(prepared.transaction.from, wallet);
    assert.equal(prepared.transaction.to, ethers.getAddress(process.env.SHIELD_AUTOMATION_TESTNET_CONTRACT_ADDRESS));
    assert.equal(prepared.commitment.executionDataHash, ethers.keccak256('0x1234'));
    assert.equal(prepared.commitment.checkDataHash, ethers.keccak256('0xabcd'));
    assert.ok(prepared.transaction.data.startsWith('0x'));
  } finally {
    if (original === undefined) delete process.env.SHIELD_AUTOMATION_TESTNET_CONTRACT_ADDRESS;
    else process.env.SHIELD_AUTOMATION_TESTNET_CONTRACT_ADDRESS = original;
  }
});

export {};
