import type { Request, Response } from 'express';

import express from 'express';
import sodexTrader = require('../services/sodexTrader');

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

  if (!sodexTrader.hasKey()) {
    return res.json({
      queued: false,
      action,
      symbol,
      message: 'No private key configured. Use /setkey in Telegram to add your wallet key before executing trades.'
    });
  }

  if (action === 'CLOSE_POSITION') {
    try {
      const wallet = sodexTrader.getWalletAddress();
      if (!wallet) {
        throw new Error('Could not derive wallet address from private key.');
      }

      // Fetch current positions to find the exact size and side
      const sodex = require('../services/sodex');
      const enriched = await sodex.getEnrichedPositions(wallet);
      const position = (enriched.positions || []).find((p: any) => p.symbol === symbol);

      if (!position || !position.positionSize || Number(position.positionSize) === 0) {
        return res.json({
          queued: false,
          action,
          symbol,
          message: `No open position found for ${symbol} on SoDEX.`
        });
      }

      // If it's a SHORT position (negative size or side='SHORT'), we need to BUY to close.
      // If it's a LONG position, we SELL to close.
      const size = String(Math.abs(Number(position.positionSize)));
      const side = (position.side === 'SHORT' || Number(position.positionSize) < 0) ? 'BUY' : 'SELL';

      const result = await sodexTrader.placeOrder({
        symbol,
        side,
        type: 'MARKET',
        quantity: size,
        reduceOnly: true
      });

      return res.json({
        queued: result.success,
        action,
        symbol,
        message: result.success ? `Successfully closed ${symbol} position (${size})` : result.message
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

  return res.json({
    queued: true,
    action,
    symbol,
    message: 'Action queued.'
  });
});

export = router;
