import type { Request, Response } from 'express';

import express from 'express';
import performanceService = require('../services/performance');

const router = express.Router();

router.get('/', async (_req: Request, res: Response) => {
  const report = await performanceService.getPerformanceReport();
  return res.json(report);
});

router.get('/signals', async (_req: Request, res: Response) => {
  const report = await performanceService.getPerformanceReport();
  return res.json(report.recentOutcomes);
});

export = router;
