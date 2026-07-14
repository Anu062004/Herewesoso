import type { Request, Response } from 'express';

import express from 'express';
import performanceService = require('../services/performance');
import outcomeResolver = require('../services/outcomeResolver');
import { rateLimit, requireOperator, requireOperatorOrCron } from '../middleware/security';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

router.get('/', requireOperator, asyncHandler(async (_req: Request, res: Response) => {
  const report = await performanceService.getPerformanceReport(res.locals.walletSession.address);
  return res.json(report);
}));

router.get('/signals', requireOperator, asyncHandler(async (_req: Request, res: Response) => {
  const report = await performanceService.getPerformanceReport(res.locals.walletSession.address);
  return res.json(report.recentOutcomes);
}));

router.post('/resolve', rateLimit({ name: 'outcome-resolve', windowMs: 60_000, max: 3, distributed: true }), requireOperatorOrCron, asyncHandler(async (_req: Request, res: Response) => {
  const result = await outcomeResolver.resolvePendingSignalOutcomes();
  await performanceService.recordPerformanceSnapshot(res.locals.walletSession?.address);
  return res.json(result);
}));

export = router;
