import crypto from 'crypto';

function csv(name: string): string[] {
  return String(process.env[name] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizedOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function allowedOrigins(): string[] {
  const configured = csv('ALLOWED_ORIGINS');
  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || '').trim();
  const origins = [...new Set([...configured, ...(appUrl ? [appUrl] : [])].map(normalizedOrigin).filter((value): value is string => Boolean(value)))];
  return origins.length === 0 && !isProduction() ? ['http://localhost:3000'] : origins;
}

export function operatorWallets(): string[] {
  const configured = csv('OPERATOR_WALLET_ADDRESSES');
  const executionAccount = String(
    process.env.SODEX_ACCOUNT_ADDRESS || process.env.SODEX_WALLET_ADDRESS || ''
  ).trim();
  return [...new Set([...configured, ...(executionAccount ? [executionAccount] : [])].map((value) => value.toLowerCase()))];
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

export function aiConfiguration(): { provider: string; configured: boolean } {
  const provider = String(process.env.AI_SERVICE || 'groq').trim().toLowerCase();
  const keyByProvider: Record<string, string | undefined> = {
    groq: process.env.GROQ_API_KEY,
    grok: process.env.XAI_API_KEY,
    xai: process.env.XAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    claude: process.env.ANTHROPIC_API_KEY,
    skillmint: process.env.SKILLMINT_AGENT_KEY
  };
  return { provider, configured: Boolean(keyByProvider[provider]?.trim()) };
}

export function assertProductionEnvironment(): void {
  if (!isProduction()) return;

  const errors: string[] = [];
  const sessionSecret = process.env.SODEX_SESSION_SECRET || process.env.SESSION_SECRET || '';
  const cronSecret = process.env.CRON_SECRET || '';
  const keyProvider = String(process.env.KEY_PROVIDER || process.env.SODEX_KEY_PROVIDER || 'disabled').toLowerCase();
  const executionMode = String(process.env.EXECUTION_MODE || 'dry_run').toLowerCase();
  const origins = allowedOrigins();
  const operators = operatorWallets();
  const schedulerEnabled = process.env.ENABLE_BACKGROUND_SCHEDULER !== 'false';
  const telegramBotEnabled = process.env.ENABLE_TELEGRAM_BOT === 'true';
  const ai = aiConfiguration();

  for (const name of ['ENABLE_BACKGROUND_SCHEDULER', 'ENABLE_TELEGRAM_BOT']) {
    const value = process.env[name];
    if (value !== undefined && !['true', 'false'].includes(value)) errors.push(`${name} must be true or false.`);
  }

  if (sessionSecret.length < 32) errors.push('SODEX_SESSION_SECRET must contain at least 32 characters.');
  if (cronSecret.length < 32) errors.push('CRON_SECRET must contain at least 32 characters.');
  if (sessionSecret && cronSecret && sessionSecret === cronSecret) errors.push('CRON_SECRET must be independent from SODEX_SESSION_SECRET.');
  if (origins.length === 0) errors.push('ALLOWED_ORIGINS or NEXT_PUBLIC_APP_URL must contain a valid origin.');
  if (origins.some((origin) => !origin.startsWith('https://'))) errors.push('Production origins must use HTTPS.');
  if (operators.length === 0) errors.push('OPERATOR_WALLET_ADDRESSES or SODEX_ACCOUNT_ADDRESS must be configured.');
  if (operators.some((wallet) => !/^0x[0-9a-f]{40}$/.test(wallet) || /^0x0{40}$/.test(wallet))) {
    errors.push('Every operator wallet must be a valid non-zero EVM address.');
  }
  if (!process.env.SUPABASE_URL) errors.push('SUPABASE_URL must be configured.');
  else {
    try {
      if (new URL(process.env.SUPABASE_URL).protocol !== 'https:') errors.push('SUPABASE_URL must use HTTPS.');
    } catch { errors.push('SUPABASE_URL must be a valid HTTPS URL.'); }
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) errors.push('SUPABASE_SERVICE_ROLE_KEY must be configured.');
  if (!['env', 'local_file', 'managed', 'disabled'].includes(keyProvider)) errors.push('KEY_PROVIDER must be env, managed, disabled, or local_file.');
  if (keyProvider === 'local_file') errors.push('KEY_PROVIDER=local_file is not permitted in production. Use managed, env, or disabled.');
  if (!['dry_run', 'testnet', 'mainnet_canary'].includes(executionMode)) errors.push('EXECUTION_MODE must be dry_run, testnet, or mainnet_canary.');
  if (executionMode === 'mainnet_canary' && !['managed', 'disabled'].includes(keyProvider)) {
    errors.push('Mainnet server signing requires KEY_PROVIDER=managed; use KEY_PROVIDER=disabled for connected-wallet signing only.');
  }
  if (executionMode === 'mainnet_canary' && keyProvider === 'managed' && !(process.env.SODEX_MANAGED_PRIVATE_KEY || process.env.SODEX_API_PRIVATE_KEY)) {
    errors.push('Mainnet managed signing requires a deployment-managed signing key.');
  }
  if (!['testnet', 'mainnet'].includes(String(process.env.SODEX_NETWORK || 'testnet'))) errors.push('SODEX_NETWORK must be testnet or mainnet.');
  if (schedulerEnabled) {
    const monitoredWallet = String(process.env.USER_WALLET_ADDRESS || process.env.SODEX_ACCOUNT_ADDRESS || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(monitoredWallet) || /^0x0{40}$/.test(monitoredWallet)) {
      errors.push('An enabled background scheduler requires USER_WALLET_ADDRESS or SODEX_ACCOUNT_ADDRESS.');
    }
  }
  if (telegramBotEnabled && !(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)) {
    errors.push('ENABLE_TELEGRAM_BOT=true requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.');
  }
  if (!['groq', 'grok', 'xai', 'gemini', 'claude', 'skillmint'].includes(ai.provider)) {
    errors.push('AI_SERVICE must be groq, grok, xai, gemini, claude, or skillmint.');
  } else if (!ai.configured) {
    errors.push(`AI_SERVICE=${ai.provider} requires its provider credential in production.`);
  }
  if (ai.provider === 'skillmint') {
    const agentKey = String(process.env.SKILLMINT_AGENT_KEY || '').trim();
    const network = String(process.env.SKILLMINT_NETWORK || 'mainnet').trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(agentKey) || /^0x0{64}$/.test(agentKey)) {
      errors.push('SKILLMINT_AGENT_KEY must be a valid non-zero EVM private key.');
    }
    if (!['testnet', 'mainnet'].includes(network)) errors.push('SKILLMINT_NETWORK must be testnet or mainnet.');
    for (const name of ['SKILLMINT_NARRATIVE_SKILL_ID', 'SKILLMINT_RISK_SKILL_ID', 'SKILLMINT_SUMMARY_SKILL_ID']) {
      const value = process.env[name];
      if (value !== undefined && (!Number.isSafeInteger(Number(value)) || Number(value) <= 0)) {
        errors.push(`${name} must be a positive integer.`);
      }
    }
  }

  for (const name of ['SOSOVALUE_BASE_URL', 'SODEX_TESTNET_PERPS', 'SODEX_MAINNET_PERPS', 'SODEX_TESTNET_SPOT', 'SODEX_MAINNET_SPOT', 'SKILLMINT_X402_URL']) {
    const value = process.env[name];
    if (value) {
      try {
        if (new URL(value).protocol !== 'https:') errors.push(`${name} must use HTTPS in production.`);
      } catch {
        errors.push(`${name} must be a valid HTTPS URL.`);
      }
    }
  }

  const cycleMs = Number(process.env.CYCLE_INTERVAL_MS || 1_800_000);
  if (!Number.isFinite(cycleMs) || cycleMs < 60_000) errors.push('CYCLE_INTERVAL_MS must be at least 60000.');
  const dailyHour = Number(process.env.DAILY_SUMMARY_UTC_HOUR || 8);
  if (!Number.isInteger(dailyHour) || dailyHour < 0 || dailyHour > 23) errors.push('DAILY_SUMMARY_UTC_HOUR must be an integer from 0 to 23.');

  const apiBase = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
  if (apiBase) {
    try {
      if (new URL(apiBase).protocol !== 'https:') errors.push('The production API base URL must use HTTPS.');
    } catch { errors.push('The production API base URL must be a valid HTTPS URL.'); }
  }

  const sessionTtlMs = Number(process.env.SODEX_SESSION_TTL_MS || 24 * 60 * 60 * 1000);
  if (!Number.isFinite(sessionTtlMs) || sessionTtlMs < 5 * 60 * 1000 || sessionTtlMs > 7 * 24 * 60 * 60 * 1000) {
    errors.push('SODEX_SESSION_TTL_MS must be between 300000 and 604800000.');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production configuration:\n- ${errors.join('\n- ')}`);
  }
}

export function timingSafeSecretMatch(actual: string, expected: string): boolean {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
