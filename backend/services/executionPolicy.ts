import crypto from 'crypto';

import type { ExecutionMode } from '../types/domain';

type Network = 'testnet' | 'mainnet';
type ActionType = 'QUEUE_ACTION' | 'REDUCE_LEVERAGE' | 'CLOSE_POSITION' | 'CANCEL_ORDER';

interface ExecutionPolicyInput {
  action: ActionType;
  symbol: string;
  network: Network;
  currentLeverage?: number | null;
  targetLeverage?: number | null;
  notionalUsd?: number | null;
  idempotencyScope?: string | null;
  requestedBy?: string | null;
}

interface ExecutionPolicyCheck {
  name: string;
  passed: boolean;
  message: string;
}

interface ExecutionPolicyResult {
  allowed: boolean;
  executionMode: ExecutionMode;
  idempotencyKey: string;
  checks: ExecutionPolicyCheck[];
  policy: {
    maxLeverage: number;
    maxNotionalUsd: number;
    allowedSymbols: string[];
    actionCooldownMs: number;
  };
}

function parseExecutionMode(): ExecutionMode {
  const value = String(process.env.EXECUTION_MODE || '').toLowerCase();
  if (value === 'dry_run' || value === 'testnet' || value === 'mainnet_canary') return value;
  return 'dry_run';
}

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function allowedSymbols(): string[] {
  const raw = process.env.ALLOWED_SYMBOLS || 'BTC-USD,ETH-USD,SOL-USD';
  return raw
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

function buildIdempotencyKey(input: ExecutionPolicyInput) {
  const bucket = Math.floor(Date.now() / 60000);
  const stable = JSON.stringify({
    action: input.action,
    symbol: input.symbol,
    network: input.network,
    currentLeverage: input.currentLeverage ?? null,
    targetLeverage: input.targetLeverage ?? null,
    notionalUsd: input.notionalUsd ?? null,
    idempotencyScope: input.idempotencyScope ?? null,
    requestedBy: input.requestedBy?.toLowerCase() || null,
    bucket
  });

  return crypto.createHash('sha256').update(stable).digest('hex');
}

function evaluateExecutionPolicy(input: ExecutionPolicyInput): ExecutionPolicyResult {
  const executionMode = parseExecutionMode();
  const symbols = allowedSymbols();
  const maxLeverage = numberFromEnv('MAX_LEVERAGE', 25);
  const maxNotionalUsd = numberFromEnv('MAX_NOTIONAL_USD', 10000);
  const actionCooldownMs = numberFromEnv('ACTION_COOLDOWN_MS', 60000);
  const symbol = input.symbol.toUpperCase();
  const targetLeverage = typeof input.targetLeverage === 'number' ? input.targetLeverage : null;
  const notionalUsd = typeof input.notionalUsd === 'number' ? input.notionalUsd : null;

  const checks: ExecutionPolicyCheck[] = [
    {
      name: 'network_mode',
      passed:
        input.network === 'testnet' ||
        (input.network === 'mainnet' && executionMode === 'mainnet_canary'),
      message:
        input.network === 'mainnet' && executionMode !== 'mainnet_canary'
          ? 'Mainnet writes require EXECUTION_MODE=mainnet_canary.'
          : 'Network is allowed for the selected execution mode.'
    },
    {
      name: 'symbol_allowlist',
      passed: symbols.length === 0 || symbols.includes(symbol),
      message:
        symbols.length === 0 || symbols.includes(symbol)
          ? 'Symbol is inside the execution allowlist.'
          : `Symbol ${symbol} is not in ALLOWED_SYMBOLS.`
    },
    {
      name: 'leverage_cap',
      passed: targetLeverage === null || (Number.isFinite(targetLeverage) && targetLeverage >= 1 && targetLeverage <= maxLeverage),
      message:
        targetLeverage === null || (Number.isFinite(targetLeverage) && targetLeverage >= 1 && targetLeverage <= maxLeverage)
          ? 'Target leverage is inside the policy cap.'
          : `Target leverage ${targetLeverage}x exceeds MAX_LEVERAGE=${maxLeverage}.`
    },
    {
      name: 'notional_cap',
      passed: notionalUsd === null || (Number.isFinite(notionalUsd) && notionalUsd >= 0 && notionalUsd <= maxNotionalUsd),
      message:
        notionalUsd === null || (Number.isFinite(notionalUsd) && notionalUsd >= 0 && notionalUsd <= maxNotionalUsd)
          ? 'Requested notional is inside the policy cap.'
          : `Requested notional ${notionalUsd} exceeds MAX_NOTIONAL_USD=${maxNotionalUsd}.`
    }
  ];

  return {
    allowed: checks.every((check) => check.passed),
    executionMode,
    idempotencyKey: buildIdempotencyKey(input),
    checks,
    policy: {
      maxLeverage,
      maxNotionalUsd,
      allowedSymbols: symbols,
      actionCooldownMs
    }
  };
}

export = {
  evaluateExecutionPolicy
};
