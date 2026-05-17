import type { Request, Response } from 'express';
import type { MacroEvent } from '../types/domain';

import express from 'express';
import sosovalue = require('../services/sosovalue');
import errorUtils = require('../utils/error');

const { getErrorMessage } = errorUtils;

const router = express.Router();
const cache = new Map<string, { data: MacroEvent[]; expiresAt: number }>();

router.get('/', async (_req: Request, res: Response) => {
  const cacheKey = 'macro_upcoming';

  try {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return res.json(cached.data);
    }

    const upcoming = await sosovalue.getMacroEvents();
    const data = ((upcoming?.data || []) as MacroEvent[]).slice(0, 24);
    cache.set(cacheKey, { data, expiresAt: Date.now() + 5 * 60 * 1000 });
    return res.json(data);
  } catch (error) {
    const stale = cache.get(cacheKey);
    if (stale?.data?.length) {
      return res.json(stale.data);
    }

    return res.status(500).json({ error: getErrorMessage(error), data: [] });
  }
});

export = router;
