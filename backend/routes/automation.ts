import type { Request, Response } from 'express';

import express from 'express';

import onchainAutomation from '../services/onchainAutomation';
import { rateLimit, requireWallet } from '../middleware/security';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();
router.use(requireWallet);
router.use(rateLimit({ name: 'onchain-automation', windowMs: 60_000, max: 60, distributed: true }));

function identity(res: Response) {
  return res.locals.walletSession as { address: string; network: 'testnet' | 'mainnet' };
}

function body(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
}

function prepared(handler: (req: Request, res: Response) => unknown | Promise<unknown>) {
  return asyncHandler(async (req: Request, res: Response) => {
    try {
      return res.json(await handler(req, res));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Automation request failed.';
      return res.status(message.includes('not deployed') ? 503 : 422).json({ error: message });
    }
  });
}

router.get('/config', (req: Request, res: Response) => {
  const session = identity(res);
  return res.json(onchainAutomation.config(session.network));
});

router.get('/rules', prepared(async (_req, res) => {
  const session = identity(res);
  return onchainAutomation.listRules(session.network, session.address);
}));

router.post('/rules/prepare', prepared((req, res) => {
  const session = identity(res);
  return onchainAutomation.prepareCreateRule(session.network, session.address, body(req));
}));

router.post('/rules/register', prepared((req, res) => {
  const session = identity(res);
  return onchainAutomation.registerRule(session.network, session.address, body(req));
}));

router.post('/rules/:ruleId/cancel/prepare', prepared((req, res) => {
  const session = identity(res);
  return onchainAutomation.prepareCancelRule(session.network, session.address, req.params.ruleId);
}));

router.post('/rules/:ruleId/cancel/confirm', prepared(async (req, res) => {
  const session = identity(res);
  const updated = await onchainAutomation.confirmRuleCancelled(
    session.network,
    session.address,
    req.params.ruleId,
    body(req).transactionHash
  );
  if (!updated) return { updated: false };
  return { updated: true };
}));

router.post('/executions/prepare', prepared((req, res) => {
  const session = identity(res);
  return onchainAutomation.prepareExecuteRule(session.network, session.address, body(req));
}));

export = router;
