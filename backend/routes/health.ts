import express, { type Request, type Response } from 'express';
import sodexTrader = require('../services/sodexTrader');
import runtimeStatus = require('../services/runtimeStatus');

const { getTelegramRuntimeStatus } = runtimeStatus;

const router = express.Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    telegram: getTelegramRuntimeStatus(),
    sodex: {
      tradingKeyConfigured: sodexTrader.hasKey(),
      walletAddress: sodexTrader.getWalletAddress(),
      accountAddress: sodexTrader.getAccountAddress()
    }
  });
});

export = router;
