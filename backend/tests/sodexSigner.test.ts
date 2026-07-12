import test = require('node:test');
import assert = require('node:assert/strict');
import { ethers } from 'ethers';

import nonceManager = require('../services/sodexNonceManager');
import sodexSigner = require('../services/sodexSigner');
import walletAuth = require('../services/walletAuth');

const PRIVATE_KEY = '0x2222222222222222222222222222222222222222222222222222222222222222';

function sampleOrderRequest() {
  return {
    accountID: 12345,
    symbolID: 1,
    orders: [
      {
        clOrdID: 'sentinel-btc-1',
        modifier: 1,
        side: 2,
        type: 1,
        timeInForce: 3,
        price: '100000.0',
        quantity: '0.001',
        reduceOnly: true,
        positionSide: 1
      }
    ]
  };
}

function sampleCancelRequest() {
  return {
    accountID: 12345,
    cancels: [{ symbolID: 1, orderID: 67890 }]
  };
}

test('computePayloadHash hashes compact SoDEX action JSON', () => {
  const params = sampleOrderRequest();
  const expected = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify({ type: 'newOrder', params }))
  );

  assert.equal(sodexSigner.computePayloadHash('newOrder', params), expected);
});

test('computePayloadHash hashes compact cancelOrder action JSON', () => {
  const params = sampleCancelRequest();
  const expected = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify({ type: 'cancelOrder', params }))
  );

  assert.equal(sodexSigner.computePayloadHash('cancelOrder', params), expected);
});

test('signSodexAction signs cancelOrder actions for DELETE /trade/orders', async () => {
  const wallet = sodexSigner.createWallet(PRIVATE_KEY);
  const signed = await sodexSigner.signSodexAction({
    privateKey: PRIVATE_KEY,
    marketType: 'perps',
    actionType: 'cancelOrder',
    params: sampleCancelRequest(),
    baseUrl: 'https://testnet-gw.sodex.dev/api/v1/perps',
    nonce: 1760373925001n
  });

  assert.equal(signed.domain.name, 'futures');
  assert.equal(sodexSigner.recoverSodexSigner(signed), wallet.address);
});

test('signSodexAction creates recoverable EIP-712 signature with SoDEX header prefix', async () => {
  const wallet = sodexSigner.createWallet(PRIVATE_KEY);
  const signed = await sodexSigner.signSodexAction({
    privateKey: PRIVATE_KEY,
    marketType: 'perps',
    actionType: 'newOrder',
    params: sampleOrderRequest(),
    baseUrl: 'https://testnet-gw.sodex.dev/api/v1/perps',
    nonce: 1760373925000n
  });

  assert.equal(signed.domain.name, 'futures');
  assert.equal(signed.domain.chainId, 138565);
  assert.equal(signed.nonce, '1760373925000');
  assert.match(signed.rawSignature, /^0x[0-9a-fA-F]{130}$/);
  assert.match(signed.compactSignature, /^0x[0-9a-fA-F]{130}$/);
  assert.equal((signed.typedSignature.length - 2) / 2, 66);
  assert.equal(signed.typedSignature, sodexSigner.toSodexHeaderSignature(signed.rawSignature));
  assert.match(signed.typedSignature.slice(-2), /^(00|01)$/);
  assert.equal(sodexSigner.recoverSodexSigner(signed), wallet.address);
  assert.equal(
    ethers.verifyTypedData(signed.domain, signed.typedData.types, signed.typedData.message, signed.compactSignature),
    wallet.address
  );
});

test('signSodexAction uses the SoDEX mainnet domain for mainnet requests', async () => {
  const wallet = sodexSigner.createWallet(PRIVATE_KEY);
  const signed = await sodexSigner.signSodexAction({
    privateKey: PRIVATE_KEY,
    marketType: 'perps',
    actionType: 'newOrder',
    params: sampleOrderRequest(),
    baseUrl: 'https://mainnet-gw.sodex.dev/api/v1/perps',
    nonce: 1760373925002n
  });

  assert.equal(signed.domain.chainId, 286623);
  assert.equal(sodexSigner.recoverSodexSigner(signed), wallet.address);
});

test('nonce manager increases monotonically per signer', () => {
  nonceManager.resetNonceState();

  const first = nonceManager.nextNonce('0x1111111111111111111111111111111111111111', 1000n);
  const second = nonceManager.nextNonce('0x1111111111111111111111111111111111111111', 1000n);
  const otherSigner = nonceManager.nextNonce('0x2222222222222222222222222222222222222222', 1000n);

  assert.equal(first, 1000n);
  assert.equal(second, 1001n);
  assert.equal(otherSigner, 1000n);
});

test('wallet login challenges are one-time and bound to wallet and network', () => {
  const wallet = sodexSigner.createWallet(PRIVATE_KEY);
  const challenge = walletAuth.createChallenge(wallet.address, 'mainnet');

  assert.match(challenge.message, /Environment: mainnet/);
  assert.match(challenge.message, /Nonce: [0-9a-f]+/);
  assert.equal(walletAuth.consumeChallenge(challenge.id, wallet.address, 'testnet'), null);
  assert.ok(walletAuth.consumeChallenge(challenge.id, wallet.address, 'mainnet'));
  assert.equal(walletAuth.consumeChallenge(challenge.id, wallet.address, 'mainnet'), null);
});

test('wallet sessions reject tampering and preserve authenticated identity', () => {
  const wallet = sodexSigner.createWallet(PRIVATE_KEY);
  const { token } = walletAuth.createSession(wallet.address, 'testnet');
  const session = walletAuth.verifySessionToken(token);

  assert.equal(session?.address, wallet.address);
  assert.equal(session?.network, 'testnet');
  assert.equal(walletAuth.verifySessionToken(`${token}tampered`), null);
});

export {};
