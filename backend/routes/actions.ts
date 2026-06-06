import type { Request, Response } from 'express';

import express from 'express';
import sodexTrader = require('../services/sodexTrader');

type DashboardAction = 'QUEUE_ACTION' | 'REDUCE_LEVERAGE' | 'CLOSE_POSITION' | 'CANCEL_ORDER';

const router = express.Router();

function isDashboardAction(value: unknown): value is DashboardAction {
  return (
    value === 'QUEUE_ACTION' ||
    value === 'REDUCE_LEVERAGE' ||
    value === 'CLOSE_POSITION' ||
    value === 'CANCEL_ORDER'
  );
}

function parseCancelItems(payload: Record<string, unknown>) {
  if (Array.isArray(payload.cancels)) {
    return payload.cancels
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .map((entry) => ({
        orderId:
          typeof entry.orderId === 'string' || typeof entry.orderId === 'number' ? entry.orderId : undefined,
        clOrdId: typeof entry.clOrdId === 'string' ? entry.clOrdId : undefined
      }));
  }

  const orderId =
    typeof payload.orderId === 'string' || typeof payload.orderId === 'number' ? payload.orderId : undefined;
  const clOrdId = typeof payload.clOrdId === 'string' ? payload.clOrdId : undefined;

  if (orderId !== undefined || clOrdId) {
    return [{ orderId, clOrdId }];
  }

  return [];
}

router.post('/', async (req: Request, res: Response) => {
  const payload = (req.body || {}) as Record<string, unknown>;
  const action = isDashboardAction(payload.action) ? payload.action : 'QUEUE_ACTION';
  const symbol = typeof payload.symbol === 'string' && payload.symbol.trim() ? payload.symbol : 'BTC-USD';
  const currentLeverage = typeof payload.currentLeverage === 'number' ? payload.currentLeverage : null;
  const targetLeverage = typeof payload.targetLeverage === 'number' ? payload.targetLeverage : null;

  if (!sodexTrader.hasKey()) {
    return res.json({
      queued: false,
      action,
      symbol,
      message: 'No SoDEX API signing key configured. Set SODEX_API_PRIVATE_KEY or use /setkey in Telegram before executing trades.'
    });
  }

  if (action === 'CLOSE_POSITION') {
    try {
      const result = await sodexTrader.closePosition(symbol);

      return res.json({
        queued: result.success,
        action,
        symbol,
        message: result.message
      });
    } catch (error: any) {
      console.error('[Actions Route] Close Error:', error.message);
      return res.json({
        queued: false,
        action,
        symbol,
        message: `Failed to close position: ${error.message}`
      });
    }
  }

  if (action === 'REDUCE_LEVERAGE' && targetLeverage) {
    const result = await sodexTrader.reduceLeverage(symbol, targetLeverage);
    return res.json({
      queued: result.success,
      action,
      symbol,
      message: result.success
        ? `Leverage reduced to ${targetLeverage}x for ${symbol}`
        : result.message
    });
  }

  if (action === 'CANCEL_ORDER') {
    const cancels = parseCancelItems(payload);

    if (cancels.length === 0) {
      return res.json({
        queued: false,
        action,
        symbol,
        message: 'Provide orderId, clOrdId, or a cancels array to cancel an order.'
      });
    }

    try {
      const result = await sodexTrader.cancelOrders({ symbol, cancels });

      return res.json({
        queued: result.success,
        action,
        symbol,
        message: result.message
      });
    } catch (error: any) {
      console.error('[Actions Route] Cancel Error:', error.message);
      return res.json({
        queued: false,
        action,
        symbol,
        message: `Failed to cancel order: ${error.message}`
      });
    }
  }

  return res.json({
    queued: true,
    action,
    symbol,
    message: 'Action queued.'
  });
});

export = router;
