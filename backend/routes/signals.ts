import type { Request, Response } from 'express';
import type { NarrativeScoreRow } from '../types/domain';

import express from 'express';
import supabaseService = require('../services/supabase');

const { safeSelect } = supabaseService;

const router = express.Router();

router.get('/', async (_req: Request, res: Response) => {
  const { data, error } = await safeSelect<NarrativeScoreRow>('narrative_scores', (query: any) =>
    query.order('created_at', { ascending: false }).limit(16)
  );

  if (error) {
    return res.status(500).json({ error: error.message, data: [] });
  }

  return res.json(data);
});

export = router;
