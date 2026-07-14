import type { Request, Response } from 'express';
import type { ExecutionActionRow, ExecutionMode, ExecutionStatus } from '../types/domain';

import express from 'express';
import sodexTrader = require('../services/sodexTrader');
import executionLedger = require('../services/executionLedger');
import executionPolicy = require('../services/executionPolicy');
import walletAuth = require('../services/walletAuth');
import { rateLimit } from '../middleware/security';
import sodex = require('../services/sodex');
import { finiteNumber, requiredString } from '../utils/validation';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();
router.use(rateLimit({ name: 'execution', windowMs: 60_000, max: 10, distributed: true }));

type DashboardAction = 'QUEUE_ACTION' | 'REDUCE_LEVERAGE' | 'CLOSE_POSITION' | 'CANCEL_ORDER';
type Network = 'testnet' | 'mainnet';

type ParsedActionPayload = {
  action: DashboardAction;
  network: Network;
  symbol: string;
  currentLeverage: number | null;
  targetLeverage: number | null;
  notionalUsd: number | null;
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
      .slice(0, 50)
      .map((entry) => ({
        orderId:
          typeof entry.orderId === 'string' || typeof entry.orderId === 'number' ? entry.orderId : undefined,
        clOrdId: typeof entry.clOrdId === 'string' ? entry.clOrdId : undefined
      }))
      .filter((entry) => entry.orderId !== undefined || Boolean(entry.clOrdId));
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
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A JSON action payload is required.');
  const payload = input as Record<string, unknown>;
  if (!isDashboardAction(payload.action)) throw new Error('A valid action is required.');
  const action = payload.action;
  const network: Network = payload.network === 'mainnet' ? 'mainnet' : 'testnet';
  const symbol = requiredString(payload.symbol, 32)?.toUpperCase() || null;
  if (!symbol || !/^[A-Z0-9]{2,20}-[A-Z0-9]{2,10}$/.test(symbol)) {
    throw new Error('A valid market symbol such as BTC-USD is required.');
  }
  const currentLeverage = finiteNumber(payload.currentLeverage);
  const targetLeverage = finiteNumber(payload.targetLeverage);
  if (action === 'REDUCE_LEVERAGE' && (targetLeverage === null || targetLeverage < 1)) {
    throw new Error('REDUCE_LEVERAGE requires a finite targetLeverage of at least 1.');
  }
  const wallet = requiredString(payload.wallet, 128);
  const cancels = parseCancelItems(payload);
  if (action === 'CANCEL_ORDER' && cancels.length === 0) {
    throw new Error('CANCEL_ORDER requires orderId, clOrdId, or a non-empty cancels array.');
  }

  return {
    action,
    network,
    symbol,
    currentLeverage,
    targetLeverage,
    notionalUsd: null,
    wallet,
    cancels,
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
    idempotency_key: values.idempotency_key || policy.idempotencyKey,
    policy_snapshot: policySnapshot(policy, keyStatus),
    request_payload: payload.raw,
    signed_payload_hash: values.signed_payload_hash || null,
    signer_address: values.signer_address || null,
    sodex_response: values.sodex_response,
    error: values.error || null
  });
}

function idempotencyScope(payload: ParsedActionPayload): string {
  return payload.action === 'CANCEL_ORDER' ? JSON.stringify(payload.cancels) : payload.symbol;
}

async function hydrateExecutionContext(payload: ParsedActionPayload, address: string): Promise<void> {
  if (payload.action !== 'CLOSE_POSITION' && payload.action !== 'REDUCE_LEVERAGE') return;
  const state = await sodex.getEnrichedPositions(address, payload.network);
  const position = (state.positions || []).find((entry) =>
    String(entry.symbol || '').toUpperCase() === payload.symbol && Math.abs(Number(entry.positionSize || 0)) > 0
  );
  if (!position) throw new Error(`No open ${payload.symbol} position exists for the authenticated execution account.`);

  const size = Math.abs(Number(position.positionSize || 0));
  const markPrice = Number(position.markPrice || position.entryPrice || 0);
  const leverage = Number(position.leverage || 0);
  if (!Number.isFinite(size) || !Number.isFinite(markPrice) || size <= 0 || markPrice <= 0) {
    throw new Error(`Could not verify the live notional for ${payload.symbol}.`);
  }

  payload.notionalUsd = size * markPrice;
  payload.currentLeverage = Number.isFinite(leverage) && leverage > 0 ? leverage : null;
  if (
    payload.action === 'REDUCE_LEVERAGE' &&
    payload.currentLeverage !== null &&
    payload.targetLeverage !== null &&
    payload.targetLeverage >= payload.currentLeverage
  ) {
    throw new Error(`Target leverage must be below the current ${payload.currentLeverage}x leverage.`);
  }
}

function buildSimulation(payload: ParsedActionPayload, requestedByAddress: string) {
  const policy = executionPolicy.evaluateExecutionPolicy({
    action: payload.action,
    symbol: payload.symbol,
    network: payload.network,
    currentLeverage: payload.currentLeverage,
    targetLeverage: payload.targetLeverage,
    notionalUsd: payload.notionalUsd,
    idempotencyScope: idempotencyScope(payload),
    requestedBy: requestedByAddress
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

router.post('/simulate', asyncHandler(async (req: Request, res: Response) => {
  let payload: ParsedActionPayload;
  try {
    payload = parsePayload(req.body);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid action payload.' });
  }
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });
  if (!sessionOwnsExecutionAccount(session.address)) {
    return res.status(403).json({ error: 'This wallet is not authorized to use the configured execution account.' });
  }
  payload.wallet = session.address.toLowerCase();
  payload.network = session.network;
  try {
    await hydrateExecutionContext(payload, session.address);
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Could not verify execution context.' });
  }
  const simulation = buildSimulation(payload, session.address);

  await recordAction(
    payload,
    req,
    simulation.allowed ? 'SIMULATED' : 'REJECTED',
    simulation.policy,
    simulation.keyStatus,
    {
      idempotency_key: `simulation:${executionLedger.createActionId()}`,
      error: simulation.allowed ? null : simulation.checks.find((check) => !check.passed)?.message || 'Policy rejected action.'
    }
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
      notionalUsd: payload.notionalUsd,
      cancels: payload.cancels
    }
  });
}));

async function executePayload(req: Request, res: Response) {
  let payload: ParsedActionPayload;
  try {
    payload = parsePayload(req.body);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid action payload.' });
  }
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });
  if (!sessionOwnsExecutionAccount(session.address)) {
    return res.status(403).json({ error: 'This wallet is not authorized to use the configured execution account.' });
  }
  payload.wallet = session.address.toLowerCase();
  payload.network = session.network;
  try {
    await hydrateExecutionContext(payload, session.address);
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Could not verify execution context.' });
  }
  const simulation = buildSimulation(payload, session.address);
  const firstFailure = simulation.checks.find((check) => !check.passed);

  if (!simulation.allowed) {
    await recordAction(payload, req, 'REJECTED', simulation.policy, simulation.keyStatus, {
      idempotency_key: `rejected:${executionLedger.createActionId()}`,
      error: firstFailure?.message || 'Policy rejected action.'
    });

    return res.status(403).json({
      queued: false,
      action: payload.action,
      symbol: payload.symbol,
      message: firstFailure?.message || 'Policy rejected action.',
      checks: simulation.checks
    });
  }

  const cooldownSince = new Date(Date.now() - simulation.policy.policy.actionCooldownMs).toISOString();
  try {
    const staleBefore = new Date(Date.now() - Math.max(5 * 60_000, simulation.policy.policy.actionCooldownMs * 5)).toISOString();
    await executionLedger.expireStaleExecutionActions(staleBefore);
    const recent = await executionLedger.findRecentExecution({
      requestedBy: session.address.toLowerCase(),
      actionType: payload.action,
      symbol: payload.symbol,
      network: payload.network,
      since: cooldownSince
    });
    if (recent) {
      return res.status(409).json({
        queued: false,
        action: payload.action,
        symbol: payload.symbol,
        message: 'An equivalent action is already active or inside the configured cooldown.',
        existingActionId: recent.action_id,
        existingStatus: recent.status
      });
    }
  } catch {
    return res.status(503).json({ error: 'Execution safety checks are temporarily unavailable.' });
  }

  const actionId = executionLedger.createActionId();
  let claim: Awaited<ReturnType<typeof executionLedger.claimExecutionAction>>;
  try {
    claim = await executionLedger.claimExecutionAction({
      action_id: actionId,
      action_type: payload.action,
      symbol: payload.symbol,
      network: payload.network,
      execution_mode: simulation.policy.executionMode,
      status: 'PENDING',
      requested_by: session.address.toLowerCase(),
      idempotency_key: simulation.policy.idempotencyKey,
      policy_snapshot: policySnapshot(simulation.policy, simulation.keyStatus),
      request_payload: payload.raw,
      signed_payload_hash: null,
      signer_address: null,
      error: null
    });
  } catch {
    return res.status(503).json({ error: 'A durable execution audit record could not be created. No action was submitted.' });
  }

  if (!claim.claimed) {
    return res.status(409).json({
      queued: false,
      action: payload.action,
      symbol: payload.symbol,
      message: 'This action was already received.',
      existingActionId: claim.row.action_id,
      existingStatus: claim.row.status
    });
  }

  if (simulation.policy.executionMode === 'dry_run') {
    await executionLedger.updateExecutionAction(actionId, { status: 'DRY_RUN' });
    return res.json({
      queued: true,
      action: payload.action,
      symbol: payload.symbol,
      message: `Dry run accepted for ${payload.action} on ${payload.symbol}.`,
      executionMode: simulation.policy.executionMode
    });
  }

  if (payload.action === 'QUEUE_ACTION') {
    await executionLedger.updateExecutionAction(actionId, { status: 'CONFIRMED' });
    return res.json({
      queued: true,
      action: payload.action,
      symbol: payload.symbol,
      message: 'Action queued.'
    });
  }

  try {
    await executionLedger.updateExecutionAction(actionId, { status: 'SUBMITTED' });
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
    try {
      await executionLedger.updateExecutionAction(actionId, {
        status: result.success ? 'SUCCEEDED' : 'FAILED',
        signed_payload_hash: signedMetadata.payloadHash,
        signer_address: signedMetadata.signerAddress,
        sodex_response: result.raw,
        error: result.success ? null : result.message
      });
    } catch (auditError) {
      console.error('[Actions Route] Audit finalization failed:', auditError instanceof Error ? auditError.message : auditError);
      if (result.success) {
        return res.status(202).json({
          queued: true,
          action: payload.action,
          symbol: payload.symbol,
          message: 'SoDEX accepted the action, but audit finalization failed. Verify the live SoDEX account before retrying.',
          signedPayloadHash: signedMetadata.payloadHash,
          executionMode: simulation.policy.executionMode,
          executionState: 'UNKNOWN'
        });
      }
      throw auditError;
    }

    return res.status(result.success ? 200 : 502).json({
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
    try {
      await executionLedger.updateExecutionAction(actionId, { status: 'FAILED', error: message });
    } catch {}
    console.error('[Actions Route] Execution Error:', message);
    return res.status(502).json({
      queued: false,
      action: payload.action,
      symbol: payload.symbol,
      message: 'Action execution failed. Verify the live SoDEX account and server logs before retrying.'
    });
  }
}

router.post('/confirm', asyncHandler(executePayload));
router.post('/', asyncHandler(executePayload));

export = router;
