import test = require('node:test');
import assert = require('node:assert/strict');

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

test('mainnet canary permits connected-wallet signing without a backend key', () => {
  withEnv({ ...productionEnv, EXECUTION_MODE: 'mainnet_canary', KEY_PROVIDER: 'disabled' }, () => {
    assert.doesNotThrow(assertProductionEnvironment);
  });
});

test('mainnet server signing requires a managed provider and signing key', () => {
  withEnv({ ...productionEnv, EXECUTION_MODE: 'mainnet_canary', KEY_PROVIDER: 'env' }, () => {
    assert.throws(assertProductionEnvironment, /KEY_PROVIDER=managed/);
  });
  withEnv({ ...productionEnv, EXECUTION_MODE: 'mainnet_canary', KEY_PROVIDER: 'managed' }, () => {
    assert.throws(assertProductionEnvironment, /deployment-managed signing key/);
  });
});

test('production environment rejects invalid feature flags', () => {
  withEnv({ ...productionEnv, ENABLE_TELEGRAM_BOT: 'sometimes' }, () => {
    assert.throws(assertProductionEnvironment, /ENABLE_TELEGRAM_BOT must be true or false/);
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
