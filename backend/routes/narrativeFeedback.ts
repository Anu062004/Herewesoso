import type { Request, Response } from 'express';
import express from 'express';
import walletAuth = require('../services/walletAuth');
import supabaseService = require('../services/supabase');
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();
const { safeInsert, safeSelect, safeUpdate } = supabaseService;
const VALID_SECTORS = new Set(['DeFi', 'AI', 'RWA', 'L1', 'L2', 'GameFi', 'DePIN', 'Meme']);

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });
  const body = (req.body || {}) as Record<string, unknown>;
  const sector = typeof body.sector === 'string' ? body.sector.trim() : '';
  const signalId = typeof body.signalId === 'string' ? body.signalId.trim() : '';
  if (!VALID_SECTORS.has(sector) || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(signalId) || typeof body.useful !== 'boolean') {
    return res.status(400).json({ error: 'signalId, sector, and useful are required.' });
  }
  const wallet = session.address.toLowerCase();
  const { data } = await safeSelect<any>('narrative_feedback', (query: any) =>
    query.eq('wallet_address', wallet).eq('signal_id', signalId).limit(1)
  );
  const values = { sector, useful: body.useful, reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 240) : null };
  if (data[0]) await safeUpdate('narrative_feedback', values, { wallet_address: wallet, signal_id: signalId });
  else await safeInsert('narrative_feedback', { wallet_address: wallet, signal_id: signalId, ...values });
  return res.json({ saved: true, signalId, useful: body.useful });
}));

export = router;
