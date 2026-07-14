import type { Request, Response } from 'express';

import express from 'express';
import executionLedger = require('../services/executionLedger');
import { requireOperator } from '../middleware/security';
import { boundedInteger } from '../utils/validation';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();
router.use(requireOperator);

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const limit = boundedInteger(req.query.limit, 100, 1, 250);
  const rows = await executionLedger.listExecutionActions(limit);
  return res.json(rows);
}));

export = router;
