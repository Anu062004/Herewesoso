import express, { type Request, type Response } from 'express';
import sodexTrader = require('../services/sodexTrader');
import runtimeStatus = require('../services/runtimeStatus');
import { requireOperator } from '../middleware/security';
import supabaseService = require('../services/supabase');
import { aiConfiguration, isProduction } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';

const { getTelegramRuntimeStatus } = runtimeStatus;
const { isSupabaseConfigured, safeCount } = supabaseService;

const router = express.Router();

router.get('/', (req: Request, res: Response, next) => {
  if (req.baseUrl === '/health') {
    return res.json({ status: 'ok', time: new Date().toISOString() });
  }

  return requireOperator(req, res, next);
}, asyncHandler(async (_req: Request, res: Response) => {
  const persistenceProbe = isSupabaseConfigured ? await safeCount('agent_runs') : null;
  const persistenceReachable = persistenceProbe !== null;
  const healthy = !isProduction() || persistenceReachable;
  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    persistence: { configured: isSupabaseConfigured, reachable: persistenceReachable },
    ai: aiConfiguration(),
    telegram: getTelegramRuntimeStatus(),
    sodex: {
      tradingKeyConfigured: sodexTrader.hasKey(),
      walletAddress: sodexTrader.getWalletAddress(),
      accountAddress: sodexTrader.getAccountAddress(),
      keyStatus: sodexTrader.getKeyStatus()
    }
  });
}));

export = router;
