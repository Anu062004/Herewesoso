import type { Request, Response } from 'express';

import express from 'express';

type DashboardAction = 'QUEUE_ACTION' | 'REDUCE_LEVERAGE' | 'CLOSE_POSITION';

const router = express.Router();

function isDashboardAction(value: unknown): value is DashboardAction {
  return value === 'QUEUE_ACTION' || value === 'REDUCE_LEVERAGE' || value === 'CLOSE_POSITION';
}

router.post('/', async (req: Request, res: Response) => {
  const payload = (req.body || {}) as Record<string, unknown>;
  const action = isDashboardAction(payload.action) ? payload.action : 'QUEUE_ACTION';
  const symbol = typeof payload.symbol === 'string' && payload.symbol.trim() ? payload.symbol : 'BTC-USD';
  const currentLeverage = typeof payload.currentLeverage === 'number' ? payload.currentLeverage : null;
  const targetLeverage = typeof payload.targetLeverage === 'number' ? payload.targetLeverage : null;

  const baseMessage =
    action === 'REDUCE_LEVERAGE' && currentLeverage && targetLeverage
      ? `Action queued - this will reduce your ${symbol} position from ${currentLeverage}x to ${targetLeverage}x. EIP-712 execution coming in Wave 2.`
      : action === 'CLOSE_POSITION'
        ? `Action queued - ${symbol} close request acknowledged. EIP-712 execution coming in Wave 2.`
        : 'Action queued - EIP-712 execution coming in Wave 2.';

  return res.json({
    queued: true,
    action,
    symbol,
    message: baseMessage
  });
});

export = router;
