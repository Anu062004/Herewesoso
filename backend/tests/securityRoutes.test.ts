import test = require('node:test');
import assert = require('node:assert/strict');
import type { AddressInfo } from 'node:net';
import { ethers } from 'ethers';

import app from '../app';
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

  for (const path of ['/api/health', '/api/executions', '/api/agent-runs', '/api/performance', '/api/alerts', '/api/memos', '/api/sodex/smoke', '/api/sodex/account', '/api/automation/config']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 401, `${path} should require operator authentication`);
  }

  for (const path of [
    '/api/trigger',
    '/api/daily-summary',
    '/api/test-telegram',
    '/api/analyze',
    '/api/actions/simulate',
    '/api/actions/prepare',
    '/api/actions/confirm',
    '/api/actions/confirm-wallet'
  ]) {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 401, `${path} should require authenticated authorization`);
  }

  const rejectedOrigin = await fetch(`${base}/health`, { headers: { Origin: 'https://attacker.example' } });
  assert.equal(rejectedOrigin.status, 403);
});

test('connected-wallet action submission is disabled even for an authenticated wallet', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { port } = server.address() as AddressInfo;
  const wallet = ethers.Wallet.createRandom();
  const { token } = walletAuth.createSession(wallet.address, 'testnet');
  const cookie = `gold_grith_wallet_session=${token}`;
  const base = `http://127.0.0.1:${port}/api/actions/confirm-wallet`;

  const response = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: '{}'
  });
  assert.equal(response.status, 409);
  const disabled = await response.json() as { code?: string };
  assert.equal(disabled.code, 'CONNECTED_WALLET_EXECUTION_UNSUPPORTED');
});
