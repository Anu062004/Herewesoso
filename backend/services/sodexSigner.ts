import { ethers } from 'ethers';

import nonceManager = require('./sodexNonceManager');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const TESTNET_CHAIN_ID = 138565;
const MAINNET_CHAIN_ID = 286623;

type SodexMarketType = 'spot' | 'perps';

type SodexActionType =
  | 'newOrder'
  | 'cancelOrder'
  | 'updateLeverage'
  | 'updateMargin'
  | 'updateCollateral'
  | 'transferAsset'
  | 'scheduleCancel'
  | 'revokeAPIKey';

interface SodexSigningPreparation {
  nonce: string;
  payloadHash: string;
  domain: {
    name: 'spot' | 'futures';
    version: '1';
    chainId: number;
    verifyingContract: string;
  };
  typedData: {
    types: {
      ExchangeAction: Array<{ name: 'payloadHash' | 'nonce'; type: 'bytes32' | 'uint64' }>;
    };
    primaryType: 'ExchangeAction';
    message: {
      payloadHash: string;
      nonce: string;
    };
  };
}

interface SodexSigningResult extends SodexSigningPreparation {
  rawSignature: string;
  compactSignature: string;
  typedSignature: string;
}

function resolveChainId(baseUrl = ''): number {
  const configured = Number(process.env.SODEX_CHAIN_ID);
  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  return baseUrl.includes('mainnet') ? MAINNET_CHAIN_ID : TESTNET_CHAIN_ID;
}

function domainName(marketType: SodexMarketType): 'spot' | 'futures' {
  return marketType === 'spot' ? 'spot' : 'futures';
}

function normalizePrivateKey(privateKey: string): string {
  const trimmed = privateKey.trim();
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

function toCompactJson(value: unknown): string {
  return JSON.stringify(value);
}

function getSodexDomain(marketType: SodexMarketType, baseUrl = '') {
  return {
    name: domainName(marketType),
    version: '1' as const,
    chainId: resolveChainId(baseUrl),
    verifyingContract: ZERO_ADDRESS
  };
}

function buildSigningEnvelope(actionType: SodexActionType, params: unknown) {
  return {
    type: actionType,
    params
  };
}

function computePayloadHash(actionType: SodexActionType, params: unknown): string {
  return ethers.keccak256(ethers.toUtf8Bytes(toCompactJson(buildSigningEnvelope(actionType, params))));
}

function createWallet(privateKey: string): ethers.Wallet {
  return new ethers.Wallet(normalizePrivateKey(privateKey));
}

function toCompactRecoverySignature(signature: string): string {
  const parsed = ethers.Signature.from(signature);
  const recoveryId = parsed.yParity.toString(16).padStart(2, '0');
  return `0x${parsed.r.slice(2)}${parsed.s.slice(2)}${recoveryId}`;
}

function toSodexHeaderSignature(signature: string): string {
  return `0x01${toCompactRecoverySignature(signature).slice(2)}`;
}

function prepareSodexAction({
  signerAddress,
  marketType,
  actionType,
  params,
  baseUrl = '',
  nonce
}: {
  signerAddress: string;
  marketType: SodexMarketType;
  actionType: SodexActionType;
  params: unknown;
  baseUrl?: string;
  nonce?: bigint;
}): SodexSigningPreparation {
  const nextNonce = nonce ?? nonceManager.nextNonce(signerAddress);
  const payloadHash = computePayloadHash(actionType, params);
  const domain = getSodexDomain(marketType, baseUrl);
  const types = {
    ExchangeAction: [
      { name: 'payloadHash' as const, type: 'bytes32' as const },
      { name: 'nonce' as const, type: 'uint64' as const }
    ]
  };
  const message = {
    payloadHash,
    nonce: nextNonce.toString()
  };

  return {
    nonce: nextNonce.toString(),
    payloadHash,
    domain,
    typedData: {
      types,
      primaryType: 'ExchangeAction',
      message
    }
  };
}

async function signSodexAction({
  privateKey,
  marketType,
  actionType,
  params,
  baseUrl = '',
  nonce
}: {
  privateKey: string;
  marketType: SodexMarketType;
  actionType: SodexActionType;
  params: unknown;
  baseUrl?: string;
  nonce?: bigint;
}): Promise<SodexSigningResult> {
  const wallet = createWallet(privateKey);
  const prepared = prepareSodexAction({
    signerAddress: wallet.address,
    marketType,
    actionType,
    params,
    baseUrl,
    nonce
  });
  const rawSignature = await wallet.signTypedData(
    prepared.domain,
    prepared.typedData.types,
    prepared.typedData.message
  );
  const compactSignature = toCompactRecoverySignature(rawSignature);

  return {
    ...prepared,
    rawSignature,
    compactSignature,
    typedSignature: `0x01${compactSignature.slice(2)}`
  };
}

function recoverSodexSigner(result: Pick<SodexSigningResult, 'domain' | 'typedData' | 'rawSignature'>): string {
  return ethers.verifyTypedData(
    result.domain,
    result.typedData.types,
    result.typedData.message,
    result.rawSignature
  );
}

export = {
  buildSigningEnvelope,
  computePayloadHash,
  createWallet,
  getSodexDomain,
  prepareSodexAction,
  recoverSodexSigner,
  signSodexAction,
  toCompactRecoverySignature,
  toSodexHeaderSignature
};
