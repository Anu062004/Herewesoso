import type { Request, Response } from 'express';

import express from 'express';
import supabaseService = require('../services/supabase');
import memoryStore = require('../services/memoryStore');
import { requireOperator } from '../middleware/security';
import { isProduction } from '../config/env';

const { safeSelect } = supabaseService;

const router = express.Router();
router.use(requireOperator);

router.get('/', async (_req: Request, res: Response) => {
  const wallet = String(res.locals.walletSession.address).toLowerCase();
  const { data, error } = await safeSelect('alerts', (query: any) =>
    query.or(`wallet_address.is.null,wallet_address.eq.${wallet}`).order('created_at', { ascending: false }).limit(20)
  );
  if (isProduction()) {
    if (error) return res.status(503).json({ error: 'Alert storage is temporarily unavailable.' });
    return res.json(data || []);
  }

  if (!error && data && data.length > 0) {
    return res.json(data);
  }

  return res.json(memoryStore.getAlerts());
});

export = router;
