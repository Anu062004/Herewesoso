import test = require('node:test');
import assert = require('node:assert/strict');
import { ethers } from 'ethers';

import nonceManager = require('../services/sodexNonceManager');
import sodexSigner = require('../services/sodexSigner');

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

test('computePayloadHash hashes compact SoDEX action JSON', () => {
  const params = sampleOrderRequest();
  const expected = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify({ type: 'newOrder', params }))
  );

  assert.equal(sodexSigner.computePayloadHash('newOrder', params), expected);
});

test('signSodexAction creates recoverable EIP-712 signature with SoDEX prefix', async () => {
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
  assert.equal(signed.typedSignature, `0x01${signed.rawSignature.slice(2)}`);
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

export {};
