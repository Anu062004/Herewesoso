import type { Request, Response } from 'express';

import express from 'express';
import orchestrator = require('../agents/orchestrator');
import errorUtils = require('../utils/error');

const { runFullCycle } = orchestrator;
const { getErrorMessage } = errorUtils;

const router = express.Router();

router.post('/', async (_req: Request, res: Response) => {
  try {
    const result = await runFullCycle();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export = router;
