import type { Request, Response } from 'express';
import express from 'express';
import walletAuth = require('../services/walletAuth');
import supabaseService = require('../services/supabase');
import { boundedNumber } from '../utils/validation';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();
const { safeInsert, safeSelect, safeUpdate } = supabaseService;
const VALID_STAGES = new Set(['EMERGING', 'ACCELERATING', 'ESTABLISHED', 'CROWDED', 'FADING', 'REVERSING']);

const defaults = {
  stages: ['EMERGING', 'ACCELERATING'],
  minConfidence: 60,
  maxCrowding: 65
};

router.get('/', async (req: Request, res: Response) => {
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });
  const { data, error } = await safeSelect<any>('narrative_preferences', (query: any) =>
    query.eq('wallet_address', session.address.toLowerCase()).limit(1)
  );
  if (error) return res.status(503).json({ error: 'Narrative preferences are temporarily unavailable.' });
  const row = data[0];
  return res.json(row ? {
    stages: row.stages || defaults.stages,
    minConfidence: Number(row.min_confidence ?? defaults.minConfidence),
    maxCrowding: Number(row.max_crowding ?? defaults.maxCrowding)
  } : defaults);
});

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });
  const body = (req.body || {}) as Record<string, unknown>;
  const stages = Array.isArray(body.stages)
    ? body.stages.map(String).filter((stage) => VALID_STAGES.has(stage))
    : defaults.stages;
  const minConfidence = boundedNumber(body.minConfidence, defaults.minConfidence, 0, 100);
  const maxCrowding = boundedNumber(body.maxCrowding, defaults.maxCrowding, 0, 100);
  const wallet = session.address.toLowerCase();
  const { data } = await safeSelect<any>('narrative_preferences', (query: any) => query.eq('wallet_address', wallet).limit(1));
  const values = { stages, min_confidence: minConfidence, max_crowding: maxCrowding, updated_at: new Date().toISOString() };
  if (data[0]) await safeUpdate('narrative_preferences', values, { wallet_address: wallet });
  else await safeInsert('narrative_preferences', { wallet_address: wallet, ...values });
  return res.json({ stages, minConfidence, maxCrowding });
}));

export = router;
