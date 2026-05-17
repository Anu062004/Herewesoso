import type { Request, Response } from 'express';
import type { MacroEvent } from '../types/domain';

import express from 'express';
import sosovalue = require('../services/sosovalue');
import errorUtils = require('../utils/error');

const { getErrorMessage } = errorUtils;

const router = express.Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const upcoming = await sosovalue.getMacroEvents();
    const data = ((upcoming?.data || []) as MacroEvent[]).slice(0, 24);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error), data: [] });
  }
});

export = router;
