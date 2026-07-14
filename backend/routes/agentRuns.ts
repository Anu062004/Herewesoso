import type { Request, Response } from 'express';

import express from 'express';
import supabaseService = require('../services/supabase');
import runtimeStatus = require('../services/runtimeStatus');
import { requireOperator } from '../middleware/security';
import { isProduction } from '../config/env';

const { safeSelect } = supabaseService;
const { getLastAgentRun } = runtimeStatus;

const router = express.Router();
router.use(requireOperator);

router.get('/', async (_req: Request, res: Response) => {
  const { data, error } = await safeSelect<Record<string, unknown>>('agent_runs', (query: any) =>
    query.eq('agent', 'orchestrator').order('created_at', { ascending: false }).limit(1)
  );
  if (isProduction() && error) return res.status(503).json({ error: 'Agent-run storage is temporarily unavailable.' });

  if (data && data.length > 0) {
    return res.json({
      lastRun: data[0],
      fallback: false
    });
  }

  if (isProduction()) return res.json({ lastRun: null, fallback: false });
  return res.json({
    lastRun: getLastAgentRun(),
    fallback: true
  });
});

export = router;
