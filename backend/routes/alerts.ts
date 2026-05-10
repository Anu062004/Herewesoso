import type { Request, Response } from 'express';

import express from 'express';
import supabaseService = require('../services/supabase');
import memoryStore = require('../services/memoryStore');

const { safeSelect } = supabaseService;

const router = express.Router();

router.get('/', async (_req: Request, res: Response) => {
  const { data, error } = await safeSelect('alerts', (query: any) =>
    query.order('created_at', { ascending: false }).limit(20)
  );

  if (!error && data && data.length > 0) {
    return res.json(data);
  }

  return res.json(memoryStore.getAlerts());
});

export = router;
