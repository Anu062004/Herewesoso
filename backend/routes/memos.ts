import type { Request, Response } from 'express';

import express from 'express';
import supabaseService = require('../services/supabase');

const { safeSelect } = supabaseService;

const router = express.Router();

router.get('/', async (_req: Request, res: Response) => {
  const { data, error } = await safeSelect('trade_memos', (query: any) =>
    query.order('created_at', { ascending: false }).limit(5)
  );

  if (error) {
    return res.status(500).json({ error: error.message, data: [] });
  }

  return res.json(data);
});

export = router;
