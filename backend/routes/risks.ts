import type { Request, Response } from 'express';
import type { PositionRiskSnapshot } from '../types/domain';

import express from 'express';
import supabaseService = require('../services/supabase');
import walletAuth = require('../services/walletAuth');
import riskCalculator = require('../utils/riskCalculator');

const { safeSelect } = supabaseService;

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.', data: [] });
  const { data, error } = await safeSelect<PositionRiskSnapshot>('position_risks', (query: any) =>
    query.eq('wallet_address', session.address).order('created_at', { ascending: false }).limit(100)
  );

  if (error) {
    return res.status(500).json({ error: error.message, data: [] });
  }

  return res.json(data || []);
});

router.get('/backtest', async (req: Request, res: Response) => {
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });
  const { data, error } = await safeSelect<PositionRiskSnapshot & { created_at?: string }>('position_risks', (query: any) =>
    query.eq('wallet_address', session.address).order('created_at', { ascending: true }).limit(2000)
  );
  if (error) return res.status(500).json({ error: error.message });

  const rows = data || [];
  const samples = rows.map((row, index) => {
    const start = new Date(row.created_at || 0).getTime();
    const future = rows.slice(index + 1).filter((candidate) =>
      candidate.symbol === row.symbol && new Date(candidate.created_at || 0).getTime() - start <= 24 * 3600000
    );
    return {
      score: row.risk_score,
      liquidated: future.some((candidate) => candidate.distance_to_liquidation_pct <= 0.5)
    };
  }).filter((_sample, index) => index < rows.length - 1);
  const calibration = riskCalculator.calibrateThresholds(samples);
  const warning = samples.some((sample) => sample.liquidated)
    ? null
    : 'No confirmed near-liquidation outcomes exist yet; keep the default threshold until more history is collected.';
  return res.json({ modelVersion: 'shield-v2.0', samples: samples.length, calibration, warning });
});

export = router;
