import type { Request, Response } from 'express';
import type { ExecutionActionRow, ExecutionMode, ExecutionStatus } from '../types/domain';

import express from 'express';
import { ethers } from 'ethers';
import sodexTrader = require('../services/sodexTrader');
import sodexSigner = require('../services/sodexSigner');
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

function keyCheck(payload: ParsedActionPayload, mode: ExecutionMode, _keyStatus: ReturnType<typeof sodexTrader.getKeyStatus>) {
  if (payload.action === 'QUEUE_ACTION' || mode === 'dry_run') {
    return { passed: true, message: 'No signing key required for this action mode.' };
  }

  return { passed: true, message: 'The authenticated wallet must approve an EIP-712 signature.' };
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

type WalletExecutionIntent = {
  version: 1;
  wallet: string;
  network: Network;
  idempotencyKey: string;
  payload: ParsedActionPayload;
  prepared: sodexTrader.WalletPreparedAction;
};

function parseWalletExecutionIntent(value: Record<string, unknown> | null): WalletExecutionIntent | null {
  if (!value || value.version !== 1) return null;
  if (typeof value.wallet !== 'string' || !['testnet', 'mainnet'].includes(String(value.network))) return null;
  if (typeof value.idempotencyKey !== 'string' || !value.idempotencyKey) return null;
  if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) return null;
  if (!value.prepared || typeof value.prepared !== 'object' || Array.isArray(value.prepared)) return null;

  const payload = value.payload as ParsedActionPayload;
  const prepared = value.prepared as sodexTrader.WalletPreparedAction;
  if (!isDashboardAction(payload.action) || payload.action === 'QUEUE_ACTION') return null;
  if (typeof payload.symbol !== 'string' || !payload.raw || typeof payload.raw !== 'object') return null;
  if (!['newOrder', 'cancelOrder', 'updateLeverage'].includes(prepared.actionType)) return null;
  if (!['/trade/orders', '/trade/leverage'].includes(prepared.endpoint)) return null;
  if (!['POST', 'DELETE'].includes(prepared.method)) return null;
  if (!prepared.body || typeof prepared.body !== 'object') return null;
  if (!/^\d+$/.test(String(prepared.nonce))) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(prepared.payloadHash))) return null;

  return value as unknown as WalletExecutionIntent;
}

function preparedTransportMatchesAction(intent: WalletExecutionIntent): boolean {
  const prepared = intent.prepared;
  if (intent.payload.action === 'CLOSE_POSITION') {
    return prepared.actionType === 'newOrder' && prepared.endpoint === '/trade/orders' && prepared.method === 'POST';
  }
  if (intent.payload.action === 'REDUCE_LEVERAGE') {
    return prepared.actionType === 'updateLeverage' && prepared.endpoint === '/trade/leverage' && prepared.method === 'POST';
  }
  return prepared.actionType === 'cancelOrder' && prepared.endpoint === '/trade/orders' && prepared.method === 'DELETE';
}

async function prepareWalletTrade(payload: ParsedActionPayload, address: string) {
  if (payload.action === 'CLOSE_POSITION') {
    return sodexTrader.prepareWalletClosePosition(address, payload.symbol, payload.network);
  }
  if (payload.action === 'REDUCE_LEVERAGE' && payload.targetLeverage !== null) {
    return sodexTrader.prepareWalletLeverageUpdate(address, payload.symbol, payload.targetLeverage, payload.network);
  }
  if (payload.action === 'CANCEL_ORDER') {
    return sodexTrader.prepareWalletCancelOrders(address, {
      symbol: payload.symbol,
      cancels: payload.cancels
    }, payload.network);
  }
  throw new Error('This action does not require a SoDEX wallet signature.');
}

function browserTypedData(prepared: sodexTrader.WalletPreparedAction) {
  return {
    domain: prepared.domain,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' }
      ],
      ExchangeAction: prepared.typedData.types.ExchangeAction
    },
    primaryType: prepared.typedData.primaryType,
    message: prepared.typedData.message
  };
}

router.post('/prepare', asyncHandler(async (req: Request, res: Response) => {
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });

  let payload: ParsedActionPayload;
  try {
    payload = parsePayload(req.body);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid action payload.' });
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
    return res.status(403).json({
      error: firstFailure?.message || 'Policy rejected action.',
      checks: simulation.checks
    });
  }

  if (simulation.policy.executionMode === 'dry_run' || payload.action === 'QUEUE_ACTION') {
    return res.json({
      requiresSignature: false,
      executionMode: simulation.policy.executionMode
    });
  }

  let prepared: sodexTrader.WalletPreparedAction;
  try {
    prepared = await prepareWalletTrade(payload, session.address);
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Could not prepare the SoDEX action.' });
  }

  const intentToken = walletAuth.createActionIntentToken({
    version: 1,
    wallet: session.address.toLowerCase(),
    network: session.network,
    idempotencyKey: simulation.policy.idempotencyKey,
    payload,
    prepared
  });

  return res.json({
    requiresSignature: true,
    action: payload.action,
    symbol: payload.symbol,
    network: payload.network,
    executionMode: simulation.policy.executionMode,
    intentToken,
    typedData: browserTypedData(prepared)
  });
}));

router.post('/simulate', asyncHandler(async (req: Request, res: Response) => {
  let payload: ParsedActionPayload;
  try {
    payload = parsePayload(req.body);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid action payload.' });
  }
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });
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

function sodexResponseFailure(response: unknown): string | null {
  if (!response || typeof response !== 'object') return 'SoDEX returned an invalid response.';
  const envelope = response as { code?: unknown; error?: unknown; data?: unknown };
  if (envelope.code !== 0) {
    return typeof envelope.error === 'string' && envelope.error.trim()
      ? envelope.error.trim()
      : 'SoDEX rejected the signed action.';
  }
  if (Array.isArray(envelope.data)) {
    const failed = envelope.data.find((entry) =>
      entry && typeof entry === 'object' && typeof (entry as { code?: unknown }).code === 'number' && (entry as { code: number }).code !== 0
    ) as { error?: unknown } | undefined;
    if (failed) return typeof failed.error === 'string' ? failed.error : 'SoDEX rejected part of the signed action.';
  }
  return null;
}

function walletActionSuccessMessage(payload: ParsedActionPayload): string {
  if (payload.action === 'REDUCE_LEVERAGE') {
    return `Leverage reduced to ${payload.targetLeverage}x for ${payload.symbol}.`;
  }
  if (payload.action === 'CANCEL_ORDER') {
    return payload.cancels.length === 1
      ? `Cancel submitted for 1 ${payload.symbol} order.`
      : `Cancel submitted for ${payload.cancels.length} ${payload.symbol} orders.`;
  }
  return `Reduce-only close submitted for ${payload.symbol}.`;
}

router.post('/confirm-wallet', asyncHandler(async (req: Request, res: Response) => {
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });

  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const signature = typeof body.signature === 'string' ? body.signature.trim() : '';
  const intent = parseWalletExecutionIntent(
    walletAuth.verifyActionIntentToken(typeof body.intentToken === 'string' ? body.intentToken : undefined)
  );

  if (!intent) return res.status(401).json({ error: 'The wallet action expired or was modified. Prepare it again.' });
  if (!signature) return res.status(400).json({ error: 'A wallet EIP-712 signature is required.' });
  if (intent.wallet !== session.address.toLowerCase() || intent.network !== session.network) {
    return res.status(403).json({ error: 'The prepared action belongs to a different wallet or network.' });
  }
  if (!preparedTransportMatchesAction(intent)) {
    return res.status(400).json({ error: 'The prepared SoDEX transport does not match the requested action.' });
  }

  let expectedSigning: ReturnType<typeof sodexSigner.prepareSodexAction>;
  try {
    expectedSigning = sodexSigner.prepareSodexAction({
      signerAddress: session.address,
      marketType: 'perps',
      actionType: intent.prepared.actionType,
      params: intent.prepared.body,
      baseUrl: intent.network,
      nonce: BigInt(intent.prepared.nonce)
    });
  } catch {
    return res.status(400).json({ error: 'The prepared SoDEX signing payload is invalid.' });
  }

  const signingPayloadMatches =
    expectedSigning.payloadHash === intent.prepared.payloadHash &&
    expectedSigning.nonce === intent.prepared.nonce &&
    expectedSigning.domain.name === intent.prepared.domain?.name &&
    expectedSigning.domain.chainId === intent.prepared.domain?.chainId &&
    expectedSigning.domain.verifyingContract.toLowerCase() === intent.prepared.domain?.verifyingContract?.toLowerCase();
  if (!signingPayloadMatches) {
    return res.status(400).json({ error: 'The prepared SoDEX signing payload failed verification.' });
  }

  try {
    const recovered = ethers.verifyTypedData(
      expectedSigning.domain,
      expectedSigning.typedData.types,
      expectedSigning.typedData.message,
      signature
    );
    if (ethers.getAddress(recovered) !== ethers.getAddress(session.address)) {
      return res.status(401).json({ error: 'The trade signature does not match the authenticated wallet.' });
    }
  } catch {
    return res.status(401).json({ error: 'Could not verify the wallet trade signature.' });
  }

  const payload: ParsedActionPayload = {
    ...intent.payload,
    wallet: session.address.toLowerCase(),
    network: session.network
  };
  try {
    await hydrateExecutionContext(payload, session.address);
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Could not revalidate execution context.' });
  }

  const simulation = buildSimulation(payload, session.address);
  const firstFailure = simulation.checks.find((check) => !check.passed);
  if (simulation.policy.executionMode === 'dry_run') {
    return res.status(409).json({ error: 'Execution mode changed. Prepare the action again.' });
  }
  if (!simulation.allowed) {
    return res.status(403).json({ error: firstFailure?.message || 'Policy rejected action.', checks: simulation.checks });
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
      idempotency_key: intent.idempotencyKey,
      policy_snapshot: policySnapshot(simulation.policy, simulation.keyStatus),
      request_payload: payload.raw,
      signed_payload_hash: intent.prepared.payloadHash,
      signer_address: session.address,
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
      message: 'This signed action was already received.',
      existingActionId: claim.row.action_id,
      existingStatus: claim.row.status
    });
  }

  try {
    await executionLedger.updateExecutionAction(actionId, { status: 'SUBMITTED' });
    const sodexResponse = await sodexTrader.submitWalletPreparedAction(intent.prepared, signature, session.address);
    const failure = sodexResponseFailure(sodexResponse);
    const signedMetadata = executionLedger.extractSignedMetadata(sodexResponse);
    await executionLedger.updateExecutionAction(actionId, {
      status: failure ? 'FAILED' : 'SUCCEEDED',
      signed_payload_hash: signedMetadata.payloadHash,
      signer_address: signedMetadata.signerAddress,
      sodex_response: sodexResponse,
      error: failure
    });

    return res.status(failure ? 502 : 200).json({
      queued: !failure,
      action: payload.action,
      symbol: payload.symbol,
      message: failure || walletActionSuccessMessage(payload),
      signedPayloadHash: signedMetadata.payloadHash,
      executionMode: simulation.policy.executionMode
    });
  } catch (error: any) {
    const message = typeof error?.message === 'string' && error.message.trim()
      ? error.message.trim().slice(0, 300)
      : 'SoDEX rejected the signed action.';
    try {
      await executionLedger.updateExecutionAction(actionId, {
        status: 'FAILED',
        signed_payload_hash: intent.prepared.payloadHash,
        signer_address: session.address,
        sodex_response: error?.response?.data,
        error: message
      });
    } catch {}
    return res.status(502).json({
      queued: false,
      action: payload.action,
      symbol: payload.symbol,
      message
    });
  }
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

  if (simulation.policy.executionMode !== 'dry_run' && payload.action !== 'QUEUE_ACTION') {
    return res.status(400).json({
      error: 'This SoDEX action requires approval from the connected wallet.'
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
