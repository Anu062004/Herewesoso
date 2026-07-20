import type { Request, Response } from 'express';

import express from 'express';

import crossExchangeShield, { type SupportedExchange } from '../services/crossExchangeShield';
import { rateLimit, requireWallet } from '../middleware/security';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();
router.use(requireWallet);
router.use(rateLimit({ name: 'cross-exchange-shield', windowMs: 60_000, max: 30, distributed: true }));

function session(res: Response) {
  return res.locals.walletSession as { address: string; network: 'testnet' | 'mainnet' };
}

router.get('/connections', asyncHandler(async (_req: Request, res: Response) => {
  const identity = session(res);
  return res.json(await crossExchangeShield.listConnections(identity.address));
}));

router.post('/connections', asyncHandler(async (req: Request, res: Response) => {
  const identity = session(res);
  const payload = (req.body || {}) as Record<string, unknown>;
  const exchange = String(payload.exchange || '').toLowerCase() as SupportedExchange;
  const label = typeof payload.label === 'string' ? payload.label : '';
  const credentials = payload.credentials && typeof payload.credentials === 'object' && !Array.isArray(payload.credentials)
    ? payload.credentials as Record<string, unknown>
    : {};
  try {
    const connection = await crossExchangeShield.createConnection({
      walletAddress: identity.address,
      exchange,
      label,
      credentials
    });
    return res.status(201).json(connection);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not connect the exchange.';
    const configurationError = message.includes('EXCHANGE_CREDENTIALS_KEY');
    return res.status(configurationError ? 503 : 422).json({ error: message });
  }
}));

router.delete('/connections/:id', asyncHandler(async (req: Request, res: Response) => {
  const identity = session(res);
  const deleted = await crossExchangeShield.deleteConnection(identity.address, req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Exchange connection was not found.' });
  return res.json({ deleted: true });
}));

router.get('/scan', asyncHandler(async (_req: Request, res: Response) => {
  const identity = session(res);
  return res.json(await crossExchangeShield.scan(identity.address, identity.network));
}));

router.post('/scan', asyncHandler(async (_req: Request, res: Response) => {
  const identity = session(res);
  return res.json(await crossExchangeShield.scan(identity.address, identity.network));
}));

export = router;
