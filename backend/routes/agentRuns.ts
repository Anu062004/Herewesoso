import type { Request, Response } from 'express';

import express from 'express';
import supabaseService = require('../services/supabase');
import runtimeStatus = require('../services/runtimeStatus');

const { safeSelect } = supabaseService;
const { getLastAgentRun } = runtimeStatus;

const router = express.Router();

router.get('/', async (_req: Request, res: Response) => {
  const { data } = await safeSelect<Record<string, unknown>>('agent_runs', (query: any) =>
    query.eq('agent', 'orchestrator').order('created_at', { ascending: false }).limit(1)
  );

  if (data && data.length > 0) {
    return res.json({
      lastRun: data[0],
      fallback: false
    });
  }

  return res.json({
    lastRun: getLastAgentRun(),
    fallback: true
  });
});

export = router;
