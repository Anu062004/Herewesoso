import type { Request, Response } from 'express';
import type { ExecutionActionRow, ExecutionMode, ExecutionStatus } from '../types/domain';

import express from 'express';
import sodexTrader = require('../services/sodexTrader');
import executionLedger = require('../services/executionLedger');
import executionPolicy = require('../services/executionPolicy');
import walletAuth = require('../services/walletAuth');

const router = express.Router();

type DashboardAction = 'QUEUE_ACTION' | 'REDUCE_LEVERAGE' | 'CLOSE_POSITION' | 'CANCEL_ORDER';
type Network = 'testnet' | 'mainnet';

type ParsedActionPayload = {
  action: DashboardAction;
  network: Network;
  symbol: string;
  currentLeverage: number | null;
  targetLeverage: number | null;
  wallet: string | null;
  cancels: Array<{ orderId?: string | number; clOrdId?: string }>;
  raw: Record<string, unknown>;
};

function isDashboardAction(value: unknown): value is DashboardAction {
  return (
    value === 'QUEUE_ACTION' ||
    value === 'REDUCE_LEVERAGE' ||
    value === 'CLOSE_POSITION' ||
    value === 'CANCEL_ORDER'
  );
}

function parseCancelItems(payload: Record<string, unknown>) {
  if (Array.isArray(payload.cancels)) {
    return payload.cancels
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .map((entry) => ({
        orderId:
          typeof entry.orderId === 'string' || typeof entry.orderId === 'number' ? entry.orderId : undefined,
        clOrdId: typeof entry.clOrdId === 'string' ? entry.clOrdId : undefined
      }));
  }

  const orderId =
    typeof payload.orderId === 'string' || typeof payload.orderId === 'number' ? payload.orderId : undefined;
  const clOrdId = typeof payload.clOrdId === 'string' ? payload.clOrdId : undefined;

  if (orderId !== undefined || clOrdId) {
    return [{ orderId, clOrdId }];
  }

  return [];
}

function parsePayload(input: unknown): ParsedActionPayload {
  const payload = (input || {}) as Record<string, unknown>;
  const action = isDashboardAction(payload.action) ? payload.action : 'QUEUE_ACTION';
  const network: Network = payload.network === 'mainnet' ? 'mainnet' : 'testnet';
  const symbol = typeof payload.symbol === 'string' && payload.symbol.trim() ? payload.symbol.trim().toUpperCase() : 'BTC-USD';
  const currentLeverage = typeof payload.currentLeverage === 'number' ? payload.currentLeverage : null;
  const targetLeverage = typeof payload.targetLeverage === 'number' ? payload.targetLeverage : null;
  const wallet = typeof payload.wallet === 'string' && payload.wallet.trim() ? payload.wallet.trim() : null;

  return {
    action,
    network,
    symbol,
    currentLeverage,
    targetLeverage,
    wallet,
    cancels: parseCancelItems(payload),
    raw: payload
  };
}

function requestedBy(req: Request, payload: ParsedActionPayload) {
  return payload.wallet || req.ip || null;
}

function sessionOwnsExecutionAccount(address: string): boolean {
  const executionAccount = sodexTrader.getAccountAddress();
  return Boolean(executionAccount && executionAccount.toLowerCase() === address.toLowerCase());
}

function policySnapshot(policy: ReturnType<typeof executionPolicy.evaluateExecutionPolicy>, keyStatus: ReturnType<typeof sodexTrader.getKeyStatus>) {
  return {
    executionMode: policy.executionMode,
    checks: policy.checks,
    policy: policy.policy,
    keyStatus: {
      configured: keyStatus.configured,
      provider: keyStatus.provider,
      source: keyStatus.source,
      mainnetSafe: keyStatus.mainnetSafe
    }
  };
}

function keyCheck(payload: ParsedActionPayload, mode: ExecutionMode, keyStatus: ReturnType<typeof sodexTrader.getKeyStatus>) {
  if (payload.action === 'QUEUE_ACTION' || mode === 'dry_run') {
    return { passed: true, message: 'No signing key required for this action mode.' };
  }

  if (!keyStatus.configured) {
    return { passed: false, message: 'No SoDEX signing key configured.' };
  }

  if (payload.network === 'mainnet' && !keyStatus.mainnetSafe) {
    return { passed: false, message: 'Mainnet canary execution requires KEY_PROVIDER=managed.' };
  }

  return { passed: true, message: 'Signing key policy passed.' };
}

async function recordAction(
  payload: ParsedActionPayload,
  req: Request,
  status: ExecutionStatus,
  policy: ReturnType<typeof executionPolicy.evaluateExecutionPolicy>,
  keyStatus: ReturnType<typeof sodexTrader.getKeyStatus>,
  values: Partial<ExecutionActionRow> = {}
) {
  return executionLedger.recordExecutionAction({
    action_id: values.action_id || executionLedger.createActionId(),
    action_type: payload.action,
    symbol: payload.symbol,
    network: payload.network,
    execution_mode: policy.executionMode,
    status,
    requested_by: requestedBy(req, payload),
    idempotency_key: policy.idempotencyKey,
    policy_snapshot: policySnapshot(policy, keyStatus),
    request_payload: payload.raw,
    signed_payload_hash: values.signed_payload_hash || null,
    signer_address: values.signer_address || null,
    sodex_response: values.sodex_response,
    error: values.error || null
  });
}

function buildSimulation(payload: ParsedActionPayload) {
  const policy = executionPolicy.evaluateExecutionPolicy({
    action: payload.action,
    symbol: payload.symbol,
    network: payload.network,
    currentLeverage: payload.currentLeverage,
    targetLeverage: payload.targetLeverage
  });
  const keyStatus = sodexTrader.getKeyStatus();
  const signerCheck = keyCheck(payload, policy.executionMode, keyStatus);
  const checks = [
    ...policy.checks,
    {
      name: 'signing_key',
      passed: signerCheck.passed,
      message: signerCheck.message
    }
  ];
  const allowed = policy.allowed && signerCheck.passed;

  return { policy, keyStatus, checks, allowed };
}

router.post('/simulate', async (req: Request, res: Response) => {
  const payload = parsePayload(req.body);
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });
  if (!sessionOwnsExecutionAccount(session.address)) {
    return res.status(403).json({ error: 'This wallet is not authorized to use the configured execution account.' });
  }
  payload.wallet = session.address;
  payload.network = session.network;
  const simulation = buildSimulation(payload);

  await recordAction(
    payload,
    req,
    simulation.allowed ? 'SIMULATED' : 'REJECTED',
    simulation.policy,
    simulation.keyStatus,
    { error: simulation.allowed ? null : simulation.checks.find((check) => !check.passed)?.message || 'Policy rejected action.' }
  );

  return res.json({
    action: payload.action,
    symbol: payload.symbol,
    network: payload.network,
    allowed: simulation.allowed,
    executionMode: simulation.policy.executionMode,
    idempotencyKey: simulation.policy.idempotencyKey,
    checks: simulation.checks,
    keyStatus: simulation.keyStatus,
    preview: {
      currentLeverage: payload.currentLeverage,
      targetLeverage: payload.targetLeverage,
      cancels: payload.cancels
    }
  });
});

async function executePayload(req: Request, res: Response) {
  const payload = parsePayload(req.body);
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });
  if (!sessionOwnsExecutionAccount(session.address)) {
    return res.status(403).json({ error: 'This wallet is not authorized to use the configured execution account.' });
  }
  payload.wallet = session.address;
  payload.network = session.network;
  const simulation = buildSimulation(payload);
  const firstFailure = simulation.checks.find((check) => !check.passed);

  if (!simulation.allowed) {
    await recordAction(payload, req, 'REJECTED', simulation.policy, simulation.keyStatus, {
      error: firstFailure?.message || 'Policy rejected action.'
    });

    return res.status(payload.network === 'mainnet' ? 403 : 200).json({
      queued: false,
      action: payload.action,
      symbol: payload.symbol,
      message: firstFailure?.message || 'Policy rejected action.',
      checks: simulation.checks
    });
  }

  if (simulation.policy.executionMode === 'dry_run') {
    await recordAction(payload, req, 'DRY_RUN', simulation.policy, simulation.keyStatus);
    return res.json({
      queued: true,
      action: payload.action,
      symbol: payload.symbol,
      message: `Dry run accepted for ${payload.action} on ${payload.symbol}.`,
      executionMode: simulation.policy.executionMode
    });
  }

  if (payload.action === 'QUEUE_ACTION') {
    await recordAction(payload, req, 'CONFIRMED', simulation.policy, simulation.keyStatus);
    return res.json({
      queued: true,
      action: payload.action,
      symbol: payload.symbol,
      message: 'Action queued.'
    });
  }

  try {
    let result: sodexTrader.OrderResult;

    if (payload.action === 'CLOSE_POSITION') {
      result = await sodexTrader.closePosition(payload.symbol, '', payload.network);
    } else if (payload.action === 'REDUCE_LEVERAGE' && payload.targetLeverage) {
      result = await sodexTrader.reduceLeverage(payload.symbol, payload.targetLeverage, payload.network);
    } else if (payload.action === 'CANCEL_ORDER') {
      if (payload.cancels.length === 0) {
        result = {
          success: false,
          message: 'Provide orderId, clOrdId, or a cancels array to cancel an order.'
        };
      } else {
        result = await sodexTrader.cancelOrders({ symbol: payload.symbol, cancels: payload.cancels }, payload.network);
      }
    } else {
      result = { success: false, message: 'Unsupported or incomplete action payload.' };
    }

    const signedMetadata = executionLedger.extractSignedMetadata(result.raw);
    await recordAction(payload, req, result.success ? 'SUCCEEDED' : 'FAILED', simulation.policy, simulation.keyStatus, {
      signed_payload_hash: signedMetadata.payloadHash,
      signer_address: signedMetadata.signerAddress,
      sodex_response: result.raw,
      error: result.success ? null : result.message
    });

    return res.json({
      queued: result.success,
      action: payload.action,
      symbol: payload.symbol,
      message: result.success && payload.action === 'REDUCE_LEVERAGE' && payload.targetLeverage
        ? `Leverage reduced to ${payload.targetLeverage}x for ${payload.symbol}`
        : result.message,
      signedPayloadHash: signedMetadata.payloadHash,
      executionMode: simulation.policy.executionMode
    });
  } catch (error: any) {
    const message = error?.message || 'Unexpected execution error.';
    await recordAction(payload, req, 'FAILED', simulation.policy, simulation.keyStatus, { error: message });
    console.error('[Actions Route] Execution Error:', message);
    return res.json({
      queued: false,
      action: payload.action,
      symbol: payload.symbol,
      message: `Failed to execute action: ${message}`
    });
  }
}

router.post('/confirm', executePayload);
router.post('/', executePayload);

export = router;
