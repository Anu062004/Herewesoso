import test = require('node:test');
import assert = require('node:assert/strict');
import type { AddressInfo } from 'node:net';
import { ethers } from 'ethers';

import app from '../app';
import sodexSigner = require('../services/sodexSigner');
import walletAuth = require('../services/walletAuth');

test('public health exposes liveness only and protected operational routes require auth', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const publicHealth = await fetch(`${base}/health`);
  assert.equal(publicHealth.status, 200);
  const liveness = await publicHealth.json() as Record<string, unknown>;
  assert.equal(liveness.status, 'ok');
  assert.equal('sodex' in liveness, false);
  assert.equal('telegram' in liveness, false);
  assert.equal(publicHealth.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(publicHealth.headers.get('x-request-id'));

  for (const path of ['/api/health', '/api/executions', '/api/agent-runs', '/api/performance', '/api/alerts', '/api/memos', '/api/sodex/smoke']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 401, `${path} should require operator authentication`);
  }

  for (const path of [
    '/api/trigger',
    '/api/daily-summary',
    '/api/test-telegram',
    '/api/analyze',
    '/api/actions/prepare',
    '/api/actions/confirm-wallet'
  ]) {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 401, `${path} should require authenticated authorization`);
  }

  const rejectedOrigin = await fetch(`${base}/health`, { headers: { Origin: 'https://attacker.example' } });
  assert.equal(rejectedOrigin.status, 403);
});

test('wallet action confirmation rejects cross-wallet intents and signatures', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { port } = server.address() as AddressInfo;
  const wallet = ethers.Wallet.createRandom();
  const otherWallet = ethers.Wallet.createRandom();
  const { token } = walletAuth.createSession(wallet.address, 'testnet');
  const requestBody = {
    accountID: 12345,
    symbolID: 1,
    orders: [{
      clOrdID: 'wallet-security-test',
      modifier: 1,
      side: 2,
      type: 1,
      timeInForce: 3,
      price: '100000.0',
      quantity: '0.001',
      reduceOnly: true,
      positionSide: 1
    }]
  };
  const signing = sodexSigner.prepareSodexAction({
    signerAddress: wallet.address,
    marketType: 'perps',
    actionType: 'newOrder',
    params: requestBody,
    baseUrl: 'testnet',
    nonce: BigInt(Date.now())
  });
  const prepared = {
    actionType: 'newOrder',
    endpoint: '/trade/orders',
    method: 'POST',
    body: requestBody,
    ...signing
  };
  const payload = {
    action: 'CLOSE_POSITION',
    network: 'testnet',
    symbol: 'BTC-USD',
    currentLeverage: 10,
    targetLeverage: null,
    notionalUsd: 100,
    wallet: wallet.address.toLowerCase(),
    cancels: [],
    raw: { action: 'CLOSE_POSITION', symbol: 'BTC-USD' }
  };
  const cookie = `gold_grith_wallet_session=${token}`;
  const base = `http://127.0.0.1:${port}/api/actions/confirm-wallet`;

  const crossWalletIntent = walletAuth.createActionIntentToken({
    version: 1,
    wallet: otherWallet.address.toLowerCase(),
    network: 'testnet',
    idempotencyKey: 'cross-wallet-test',
    payload,
    prepared
  });
  const crossWalletResponse = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ intentToken: crossWalletIntent, signature: '0x01' })
  });
  assert.equal(crossWalletResponse.status, 403);

  const matchingIntent = walletAuth.createActionIntentToken({
    version: 1,
    wallet: wallet.address.toLowerCase(),
    network: 'testnet',
    idempotencyKey: 'mismatched-signature-test',
    payload,
    prepared
  });
  const wrongSignature = await otherWallet.signTypedData(
    signing.domain,
    signing.typedData.types,
    signing.typedData.message
  );
  const wrongSignatureResponse = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ intentToken: matchingIntent, signature: wrongSignature })
  });
  assert.equal(wrongSignatureResponse.status, 401);
});
