import test = require('node:test');
import assert = require('node:assert/strict');
import { ethers } from 'ethers';

import nonceManager = require('../services/sodexNonceManager');
import sodexSigner = require('../services/sodexSigner');
import sodexTrader = require('../services/sodexTrader');
import walletAuth = require('../services/walletAuth');

const PRIVATE_KEY = '0x2222222222222222222222222222222222222222222222222222222222222222';

async function withEnv(
  values: Record<string, string | undefined>,
  fn: () => void | Promise<void>
): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

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

test('perps order builder preserves the official SoDEX Go struct field order', () => {
  const order = sodexTrader.buildOrderPayload({
    symbol: 'BTC-USD',
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'IOC',
    price: '100000.0',
    quantity: '0.001',
    reduceOnly: true
  });

  assert.deepEqual(Object.keys(order), [
    'clOrdID',
    'modifier',
    'side',
    'type',
    'timeInForce',
    'price',
    'quantity',
    'reduceOnly',
    'positionSide'
  ]);
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

test('signSodexAction rejects a configured chain ID that mismatches the endpoint', async () => {
  await withEnv({ SODEX_CHAIN_ID: '138565' }, async () => {
    await assert.rejects(
      sodexSigner.signSodexAction({
        privateKey: PRIVATE_KEY,
        marketType: 'perps',
        actionType: 'newOrder',
        params: sampleOrderRequest(),
        baseUrl: 'https://mainnet-gw.sodex.dev/api/v1/perps',
        nonce: 1760373925003n
      }),
      /does not match the selected SoDEX mainnet endpoint/
    );
  });
});

test('execution readiness rejects using the master account key for trading', async () => {
  const masterAddress = sodexSigner.createWallet(PRIVATE_KEY).address;
  await withEnv({
    EXECUTION_MODE: 'mainnet_canary',
    SODEX_NETWORK: 'mainnet',
    SODEX_CHAIN_ID: '286623',
    KEY_PROVIDER: 'managed',
    SODEX_MANAGED_PRIVATE_KEY: PRIVATE_KEY,
    SODEX_API_PRIVATE_KEY: undefined,
    SODEX_ACCOUNT_ADDRESS: masterAddress,
    SODEX_API_KEY_NAME: 'mainnet-trader'
  }, () => {
    const readiness = sodexTrader.getExecutionReadiness('mainnet');
    assert.equal(readiness.ready, false);
    assert.match(readiness.message, /registered API key, not the SoDEX master account wallet/);
  });
});

test('prepareSodexAction creates a verifiable EIP-712 envelope for the selected signer', async () => {
  const wallet = ethers.Wallet.createRandom();
  const prepared = sodexSigner.prepareSodexAction({
    signerAddress: wallet.address,
    marketType: 'perps',
    actionType: 'newOrder',
    params: sampleOrderRequest(),
    baseUrl: 'https://testnet-gw.sodex.dev/api/v1/perps',
    nonce: 1760373925010n
  });
  const signature = await wallet.signTypedData(
    prepared.domain,
    prepared.typedData.types,
    prepared.typedData.message
  );

  assert.equal(prepared.domain.name, 'futures');
  assert.equal(prepared.domain.chainId, 138565);
  assert.equal(prepared.nonce, '1760373925010');
  assert.equal(
    ethers.verifyTypedData(prepared.domain, prepared.typedData.types, prepared.typedData.message, signature),
    wallet.address
  );
  assert.equal((sodexSigner.toSodexHeaderSignature(signature).length - 2) / 2, 66);
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

test('dry-run nonce allocation remains monotonic without durable persistence', async () => {
  await withEnv({ EXECUTION_MODE: 'dry_run' }, async () => {
    nonceManager.resetNonceState();
    const first = await nonceManager.allocateNonce('0x1111111111111111111111111111111111111111', 2000n);
    const second = await nonceManager.allocateNonce('0x1111111111111111111111111111111111111111', 2000n);
    assert.equal(first, 2000n);
    assert.equal(second, 2001n);
  });
});

test('wallet login challenges are one-time and bound to wallet and network', async () => {
  const wallet = sodexSigner.createWallet(PRIVATE_KEY);
  const challenge = await walletAuth.createChallenge(wallet.address, 'mainnet');

  assert.match(challenge.message, /wants you to sign in with your Ethereum account:/);
  assert.match(challenge.message, /Version: 1/);
  assert.match(challenge.message, /Chain ID: 286623/);
  assert.match(challenge.message, /Resources:\n- urn:gold-and-grith:network:mainnet/);
  assert.match(challenge.message, /Nonce: [0-9a-f]+/);
  assert.equal(await walletAuth.consumeChallenge(challenge.id, wallet.address, 'testnet'), null);
  assert.ok(await walletAuth.consumeChallenge(challenge.id, wallet.address, 'mainnet'));
  assert.equal(await walletAuth.consumeChallenge(challenge.id, wallet.address, 'mainnet'), null);
});

test('SIWE challenge is domain-bound and produces a recoverable EIP-4361 signature', async () => {
  const wallet = sodexSigner.createWallet(PRIVATE_KEY);
  const challenge = await walletAuth.createChallenge(wallet.address, 'testnet', {
    domain: 'app.goldandgrith.example',
    uri: 'https://app.goldandgrith.example'
  });
  const signature = await wallet.signMessage(challenge.message);
  assert.equal(ethers.verifyMessage(walletAuth.buildLoginMessage(challenge), signature), wallet.address);
  assert.match(challenge.message, /^app\.goldandgrith\.example wants you to sign in/);
  assert.match(challenge.message, /Expiration Time:/);
  assert.match(challenge.message, /Request ID:/);
});

test('wallet sessions reject tampering and preserve authenticated identity', () => {
  const wallet = sodexSigner.createWallet(PRIVATE_KEY);
  const { token } = walletAuth.createSession(wallet.address, 'testnet');
  const session = walletAuth.verifySessionToken(token);

  assert.equal(session?.address, wallet.address);
  assert.equal(session?.network, 'testnet');
  assert.equal(walletAuth.verifySessionToken(`${token}tampered`), null);
});

test('wallet sessions are independently scoped and revoked on logout', async () => {
  const first = sodexSigner.createWallet(PRIVATE_KEY);
  const second = ethers.Wallet.createRandom();
  const firstSession = walletAuth.createSession(first.address, 'testnet');
  const secondSession = walletAuth.createSession(second.address, 'mainnet');
  const request = (token: string) => ({ headers: { cookie: `gold_grith_wallet_session=${token}` } }) as any;

  assert.equal((await walletAuth.validateSession(request(firstSession.token)))?.address, first.address);
  assert.equal((await walletAuth.validateSession(request(secondSession.token)))?.address, second.address);
  await walletAuth.revokeSession(firstSession.session);
  assert.equal(await walletAuth.validateSession(request(firstSession.token)), null);
  assert.equal((await walletAuth.validateSession(request(secondSession.token)))?.network, 'mainnet');
});

export {};
