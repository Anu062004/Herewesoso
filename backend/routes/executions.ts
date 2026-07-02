import type { Request, Response } from 'express';

import express from 'express';
import executionLedger = require('../services/executionLedger');

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 100, 250);
  const rows = await executionLedger.listExecutionActions(limit);
  return res.json(rows);
});

export = router;
