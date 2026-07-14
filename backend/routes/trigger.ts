import type { Request, Response } from 'express';

import express from 'express';
import orchestrator = require('../agents/orchestrator');
import errorUtils = require('../utils/error');
import { rateLimit, requireOperatorOrCron } from '../middleware/security';

const { runFullCycle } = orchestrator;
const { getErrorMessage } = errorUtils;

const router = express.Router();

router.post('/', rateLimit({ name: 'trigger', windowMs: 60_000, max: 3, distributed: true }), requireOperatorOrCron, async (_req: Request, res: Response) => {
  try {
    const result = await runFullCycle();
    return res.status(result.success === false && !result.skipped ? 500 : 200).json(result);
  } catch (error) {
    console.error('[Trigger Route]', getErrorMessage(error));
    return res.status(500).json({ success: false, error: 'The agent cycle could not be completed.' });
  }
});

export = router;
