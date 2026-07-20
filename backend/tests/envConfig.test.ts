import test = require('node:test');
import assert = require('node:assert/strict');
import { ethers } from 'ethers';

import { allowedOrigins, assertProductionEnvironment } from '../config/env';

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { fn(); } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const productionEnv = {
  NODE_ENV: 'production',
  VERCEL: undefined,
  SODEX_SESSION_SECRET: 'session-secret-that-is-longer-than-32-characters',
  CRON_SECRET: 'cron-secret-that-is-independent-and-over-32-characters',
  ALLOWED_ORIGINS: 'https://app.example.com/dashboard',
  NEXT_PUBLIC_APP_URL: undefined,
  OPERATOR_WALLET_ADDRESSES: '0x1111111111111111111111111111111111111111',
  SODEX_ACCOUNT_ADDRESS: undefined,
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  KEY_PROVIDER: 'disabled',
  EXECUTION_MODE: 'dry_run',
  API_BASE_URL: 'https://api.example.com',
  CYCLE_INTERVAL_MS: '1800000',
  DAILY_SUMMARY_UTC_HOUR: '8',
  ENABLE_BACKGROUND_SCHEDULER: 'false',
  ENABLE_TELEGRAM_BOT: 'false',
  SHIELD_AUTOMATION_CONTRACT_ADDRESS: undefined,
  SHIELD_AUTOMATION_TESTNET_CONTRACT_ADDRESS: undefined,
  SHIELD_AUTOMATION_MAINNET_CONTRACT_ADDRESS: undefined,
  AUTOMATION_EVIDENCE_NETWORK: undefined,
  AUTOMATION_ADAPTER_ADDRESS: undefined,
  AUTOMATION_CHECKER_ADDRESS: undefined,
  AUTOMATION_ADAPTER_APPROVAL_TX_HASH: undefined,
  AUTOMATION_RULE_CREATION_TX_HASH: undefined,
  AUTOMATION_RULE_EXECUTION_TX_HASH: undefined,
  APP_COMMIT_SHA: undefined,
  EVIDENCE_DEMO_URL: undefined,
  SODEX_TESTNET_EXPLORER_URL: undefined,
  SODEX_MAINNET_EXPLORER_URL: undefined,
  SODEX_MANAGED_PRIVATE_KEY: undefined,
  SODEX_API_PRIVATE_KEY: undefined,
  SODEX_NETWORK: 'testnet',
  SODEX_SESSION_TTL_MS: '86400000',
  SOSOVALUE_BASE_URL: undefined,
  SODEX_TESTNET_PERPS: undefined,
  SODEX_MAINNET_PERPS: undefined,
  SODEX_TESTNET_SPOT: undefined,
  SODEX_MAINNET_SPOT: undefined,
  AI_SERVICE: 'groq',
  GROQ_API_KEY: 'test-groq-key',
  SKILLMINT_AGENT_KEY: undefined,
  SKILLMINT_NETWORK: undefined,
  SKILLMINT_NARRATIVE_SKILL_ID: undefined,
  SKILLMINT_RISK_SKILL_ID: undefined,
  SKILLMINT_SUMMARY_SKILL_ID: undefined,
  SKILLMINT_X402_URL: undefined
} as const;

test('production environment accepts a hardened read-only configuration', () => {
  withEnv(productionEnv, () => assert.doesNotThrow(assertProductionEnvironment));
});

test('production environment rejects insecure origins, wallets, and shared secrets', () => {
  withEnv({
    ...productionEnv,
    CRON_SECRET: productionEnv.SODEX_SESSION_SECRET,
    ALLOWED_ORIGINS: 'http://app.example.com',
    OPERATOR_WALLET_ADDRESSES: '0x0000000000000000000000000000000000000000'
  }, () => {
    assert.throws(assertProductionEnvironment, /independent|HTTPS|non-zero/);
  });
});

test('mainnet canary rejects connected-wallet signing without a managed API key', () => {
  withEnv({ ...productionEnv, EXECUTION_MODE: 'mainnet_canary', KEY_PROVIDER: 'disabled' }, () => {
    assert.throws(assertProductionEnvironment, /KEY_PROVIDER=managed/);
  });
});

test('mainnet server signing requires a managed provider and signing key', () => {
  withEnv({ ...productionEnv, EXECUTION_MODE: 'mainnet_canary', KEY_PROVIDER: 'env' }, () => {
    assert.throws(assertProductionEnvironment, /KEY_PROVIDER=managed/);
  });
  withEnv({ ...productionEnv, EXECUTION_MODE: 'mainnet_canary', KEY_PROVIDER: 'managed' }, () => {
    assert.throws(assertProductionEnvironment, /deployment-managed API signing key/);
  });
});

test('production accepts a fully configured managed mainnet canary', () => {
  withEnv({
    ...productionEnv,
    EXECUTION_MODE: 'mainnet_canary',
    KEY_PROVIDER: 'managed',
    SODEX_NETWORK: 'mainnet',
    SODEX_CHAIN_ID: '286623',
    SODEX_ACCOUNT_ADDRESS: '0x3333333333333333333333333333333333333333',
    SODEX_API_KEY_NAME: 'gold-grith-mainnet',
    SODEX_MANAGED_PRIVATE_KEY: '0x2222222222222222222222222222222222222222222222222222222222222222'
  }, () => {
    assert.doesNotThrow(assertProductionEnvironment);
  });
});

test('mainnet canary rejects testnet network and chain settings', () => {
  withEnv({
    ...productionEnv,
    EXECUTION_MODE: 'mainnet_canary',
    KEY_PROVIDER: 'managed',
    SODEX_ACCOUNT_ADDRESS: '0x3333333333333333333333333333333333333333',
    SODEX_API_KEY_NAME: 'gold-grith-mainnet',
    SODEX_MANAGED_PRIVATE_KEY: '0x2222222222222222222222222222222222222222222222222222222222222222'
  }, () => {
    assert.throws(assertProductionEnvironment, /SODEX_NETWORK=mainnet|SODEX_CHAIN_ID=286623/);
  });
});

test('live execution requires an operator identity distinct from the master account', () => {
  withEnv({
    ...productionEnv,
    EXECUTION_MODE: 'mainnet_canary',
    KEY_PROVIDER: 'managed',
    SODEX_NETWORK: 'mainnet',
    SODEX_CHAIN_ID: '286623',
    OPERATOR_WALLET_ADDRESSES: '0x3333333333333333333333333333333333333333',
    SODEX_ACCOUNT_ADDRESS: '0x3333333333333333333333333333333333333333',
    SODEX_API_KEY_NAME: 'gold-grith-mainnet',
    SODEX_MANAGED_PRIVATE_KEY: '0x2222222222222222222222222222222222222222222222222222222222222222'
  }, () => {
    assert.throws(assertProductionEnvironment, /operator identity distinct from SODEX_ACCOUNT_ADDRESS/);
  });
});

test('live execution rejects the master wallet private key as its managed signer', () => {
  const masterKey = '0x2222222222222222222222222222222222222222222222222222222222222222';
  withEnv({
    ...productionEnv,
    EXECUTION_MODE: 'mainnet_canary',
    KEY_PROVIDER: 'managed',
    SODEX_NETWORK: 'mainnet',
    SODEX_CHAIN_ID: '286623',
    SODEX_ACCOUNT_ADDRESS: new ethers.Wallet(masterKey).address,
    SODEX_API_KEY_NAME: 'gold-grith-mainnet',
    SODEX_MANAGED_PRIVATE_KEY: masterKey
  }, () => {
    assert.throws(assertProductionEnvironment, /not the SoDEX master wallet key/);
  });
});

test('production environment rejects invalid feature flags', () => {
  withEnv({ ...productionEnv, ENABLE_TELEGRAM_BOT: 'sometimes' }, () => {
    assert.throws(assertProductionEnvironment, /ENABLE_TELEGRAM_BOT must be true or false/);
  });
});

test('production environment rejects malformed public automation evidence', () => {
  withEnv({
    ...productionEnv,
    AUTOMATION_EVIDENCE_NETWORK: 'staging',
    AUTOMATION_ADAPTER_ADDRESS: 'not-an-address',
    AUTOMATION_RULE_EXECUTION_TX_HASH: '0x1234',
    APP_COMMIT_SHA: 'release-latest'
  }, () => {
    assert.throws(assertProductionEnvironment, /AUTOMATION_EVIDENCE_NETWORK|AUTOMATION_ADAPTER_ADDRESS|AUTOMATION_RULE_EXECUTION_TX_HASH|APP_COMMIT_SHA/);
  });
});

test('SkillMint production configuration validates its key, network, and skill ids', () => {
  withEnv({
    ...productionEnv,
    AI_SERVICE: 'skillmint',
    GROQ_API_KEY: undefined,
    SKILLMINT_AGENT_KEY: 'not-a-private-key',
    SKILLMINT_NETWORK: 'unknown',
    SKILLMINT_NARRATIVE_SKILL_ID: '0'
  }, () => {
    assert.throws(assertProductionEnvironment, /non-zero EVM private key|SKILLMINT_NETWORK|positive integer/);
  });
});

test('allowed origins are normalized to scheme and host', () => {
  withEnv({ ALLOWED_ORIGINS: 'https://app.example.com/path,not-a-url', NEXT_PUBLIC_APP_URL: 'https://app.example.com/' }, () => {
    assert.deepEqual(allowedOrigins(), ['https://app.example.com']);
  });
});

export {};
