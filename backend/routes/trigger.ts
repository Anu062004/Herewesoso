import type { Request, Response } from 'express';

import express from 'express';
import orchestrator = require('../agents/orchestrator');

const { runFullCycle } = orchestrator;

const router = express.Router();

router.post('/', async (_req: Request, res: Response) => {
  res.json({ message: 'Cycle triggered' });
  void runFullCycle();
});

export = router;
