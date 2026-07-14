import type { Request, Response } from 'express';
import type { NarrativeScoreRow } from '../types/domain';

import express from 'express';
import supabaseService = require('../services/supabase');
import memoryStore = require('../services/memoryStore');
import walletAuth = require('../services/walletAuth');
import sodex = require('../services/sodex');
import { assetsForSector } from '../services/narrativeEngine';
import { isProduction } from '../config/env';

const { safeSelect } = supabaseService;

const router = express.Router();

function withPortfolioRelevance(rows: NarrativeScoreRow[], positions: any[]): NarrativeScoreRow[] {
  const exposures = positions.map((position) => ({
    symbol: String(position.symbol || '').toUpperCase(),
    notional: Math.abs(Number(position.positionSize || 0)) * Number(position.markPrice || position.entryPrice || 0)
  }));
  const total = exposures.reduce((sum, position) => sum + position.notional, 0);

  return rows.map((row) => {
    const assets = assetsForSector(row.sector);
    const matched = exposures.filter((position) => assets.includes(position.symbol));
    const currentNotional = matched.reduce((sum, position) => sum + position.notional, 0);
    const exposurePct = total > 0 ? (currentNotional / total) * 100 : 0;
    const confidence = row.confidence || 0;
    const crowding = row.crowding_score || 0;
    const suggestedMaxPct = Math.max(0, Math.min(15, (confidence / 100) * 12 - (crowding / 100) * 7));

    return {
      ...row,
      evidence: {
        ...(row.evidence || {}),
        portfolioRelevance: {
          exposurePct: Math.round(exposurePct * 100) / 100,
          currentNotional: Math.round(currentNotional * 100) / 100,
          matchedAssets: matched.map((position) => position.symbol),
          suggestedMaxPct: Math.round(suggestedMaxPct * 100) / 100,
          overexposed: exposurePct > suggestedMaxPct && currentNotional > 0
        }
      }
    };
  });
}

router.get('/', async (req: Request, res: Response) => {
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });
  const { data, error } = await safeSelect<NarrativeScoreRow>('narrative_scores', (query: any) =>
    query.order('created_at', { ascending: false }).limit(16)
  );

  if (isProduction() && error) return res.status(503).json({ error: 'Signal storage is temporarily unavailable.' });
  const rows = isProduction()
    ? data
    : (!error && data && data.length > 0 ? data : memoryStore.getSignals() as NarrativeScoreRow[]);
  try {
    const enriched = await sodex.getEnrichedPositions(session.address, session.network);
    return res.json(withPortfolioRelevance(rows, enriched.positions || []));
  } catch {
    return res.json(withPortfolioRelevance(rows, []));
  }

});

export = router;
