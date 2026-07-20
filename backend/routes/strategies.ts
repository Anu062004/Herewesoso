import type { Request, Response } from 'express';

import express from 'express';

import strategyMarketplace from '../services/strategyMarketplace';
import walletAuth = require('../services/walletAuth');
import { rateLimit, requireWallet } from '../middleware/security';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();
router.use(rateLimit({ name: 'strategy-marketplace', windowMs: 60_000, max: 120, distributed: true }));

function identity(res: Response) {
  return res.locals.walletSession as { address: string } | null;
}

async function optionalIdentity(req: Request) {
  try {
    return await walletAuth.validateSession(req);
  } catch {
    return null;
  }
}

function payload(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
}

function mutation(handler: (req: Request, res: Response, address: string) => Promise<Response>) {
  return [requireWallet, asyncHandler(async (req: Request, res: Response) => {
    const address = identity(res)!.address;
    try {
      return await handler(req, res, address);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Marketplace request failed.';
      const notFound = message === 'Strategy was not found.' || message === 'Published strategy was not found.';
      return res.status(notFound ? 404 : 422).json({ error: message });
    }
  })] as const;
}

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const session = await optionalIdentity(req);
  const rows = await strategyMarketplace.listCatalog({
    viewer: session?.address,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    mine: req.query.mine === 'true' && Boolean(session)
  });
  return res.json(rows);
}));

router.get('/installations/mine', ...mutation(async (_req, res, address) => {
  return res.json(await strategyMarketplace.listInstallations(address));
}));

router.post('/', ...mutation(async (req, res, address) => {
  return res.status(201).json(await strategyMarketplace.createStrategy(address, payload(req)));
}));

router.patch('/:id', ...mutation(async (req, res, address) => {
  return res.json(await strategyMarketplace.updateDraft(address, req.params.id, payload(req)));
}));

router.post('/:id/publish', ...mutation(async (req, res, address) => {
  return res.json(await strategyMarketplace.publishStrategy(address, req.params.id));
}));

router.post('/:id/install', ...mutation(async (req, res, address) => {
  return res.status(201).json(await strategyMarketplace.installStrategy(address, req.params.id, payload(req).configuration));
}));

router.delete('/:id/install', ...mutation(async (req, res, address) => {
  const deleted = await strategyMarketplace.uninstallStrategy(address, req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Strategy installation was not found.' });
  return res.json({ deleted: true });
}));

router.post('/:id/reviews', ...mutation(async (req, res, address) => {
  const body = payload(req);
  return res.status(201).json(await strategyMarketplace.reviewStrategy(address, req.params.id, body.rating, body.review));
}));

router.post('/:id/performance-claims', ...mutation(async (req, res, address) => {
  return res.status(201).json(await strategyMarketplace.submitPerformanceClaim(address, req.params.id, payload(req)));
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const row = await strategyMarketplace.getStrategy(req.params.id, (await optionalIdentity(req))?.address);
  if (!row) return res.status(404).json({ error: 'Strategy was not found.' });
  return res.json(row);
}));

export = router;
